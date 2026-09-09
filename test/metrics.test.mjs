import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";
import { check, makeConfig } from "../src/quality.mjs";
import { collectMetrics, metricFindings } from "../src/quality/metrics.mjs";
import { fixture } from "./fixture.mjs";

function statements(count) {
	return Array.from({ length: count }, (_, index) => `console.log(${index});`).join("\n");
}

test("quoted regex data cannot merge neighboring functions or hide real length violations", async (t) => {
	const regex =
		'export function permits(value) {\nif (!/^(?:graphify|"[^"]+" -m graphify) merge-driver %O %A %B$/.test(value)) return false;\nreturn true;\n}\n';
	const source = `${regex}export function first() {\n${statements(30)}\n}\nexport function second() {\n${statements(30)}\n}\n`;
	const root = fixture(t, { "app.js": source });
	const config = makeConfig(root, "generic");
	assert.equal((await check(root, config)).regressions.length, 0);
	writeFileSync(
		join(root, "app.js"),
		`${source}export function tooLong() {\n${statements(52)}\n}\n`,
	);
	assert.ok((await check(root, config)).regressions.some((item) => item.rule === "lizard/nloc"));
});

test("object-call comparisons cannot swallow adjacent functions", (t) => {
	const first = `function first(args) {
const {values, positionals} = parseArgs({
args: separator < 0 ? args : args.slice(0, separator),
allowPositionals: true, options: {}
});
${statements(30)}
}`;
	const second = `function second() {\n${statements(30)}\n}`;
	const root = fixture(t, { "app.js": `${first}\n${second}\n` });
	const files = collectMetrics(root, ["app.js"], ts);
	assert.deepEqual(
		files[0].functions.map(({ start, end, nloc, cyclomatic }) => ({
			start,
			end,
			nloc,
			cyclomatic,
		})),
		[
			{ start: 1, end: 36, nloc: 36, cyclomatic: 2 },
			{ start: 37, end: 68, nloc: 32, cyclomatic: 1 },
		],
	);
	assert.deepEqual(metricFindings(files, makeConfig(root, "generic").limits), []);
});

test("defaults, destructured arity and nested template branches stay measurable", (t) => {
	const source = [
		"function defaults(t, { x = flag ? 1 : 2 } = {}, value = choose(flag ? 1 : 2)) {",
		'const callback = (input = flag ? 1 : 2) => `${input ? "yes" : "no"}`;',
		"return `${t ? `${x ? 1 : 2}` : value}`;",
		"}",
		"function after() { return 1; }",
	].join("\n");
	const root = fixture(t, { "app.js": source });
	const [file] = collectMetrics(root, ["app.js"], ts);
	assert.deepEqual(
		file.functions.map(({ parameters, cyclomatic, start, end }) => ({
			parameters,
			cyclomatic,
			start,
			end,
		})),
		[
			{ parameters: 3, cyclomatic: 5, start: 1, end: 4 },
			{ parameters: 1, cyclomatic: 3, start: 2, end: 2 },
			{ parameters: 0, cyclomatic: 1, start: 5, end: 5 },
		],
	);
});

test("real oversized and nested branchy functions still violate policy", (t) => {
	const branches = Array.from(
		{ length: 11 },
		(_, index) => `if (value === ${index}) return ${index};`,
	).join("\n");
	const source = `function outer() {
function branchy(value) {
${branches}
}
return branchy;
}
function tooLong() {
${statements(52)}
}`;
	const root = fixture(t, { "app.js": source });
	const files = collectMetrics(root, ["app.js"], ts);
	const findings = metricFindings(files, makeConfig(root, "generic").limits);
	assert.ok(findings.some((item) => item.rule === "lizard/cyclomatic" && item.value === 12));
	assert.ok(findings.some((item) => item.rule === "lizard/nloc" && item.value === 54));
	assert.equal(files[0].functions[0].cyclomatic, 1);
});

test("type-only signatures do not count as runtime branches", (t) => {
	const root = fixture(t, {
		"app.ts": [
			"function optional(value?: number): number | undefined { return value; }",
			"function typed<T>(value: T): T extends number ? number : string { return value as never; }",
			"function runtime(value = flag ? 1 : 2) { return value; }",
		].join("\n"),
	});
	const [file] = collectMetrics(root, ["app.ts"], ts);
	assert.deepEqual(
		file.functions.map((fn) => fn.cyclomatic),
		[1, 1, 2],
	);
});
