import assert from "node:assert/strict";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { captureBaseline, check, makeConfig, pruneBaseline } from "../src/quality.mjs";
import { fixture } from "./fixture.mjs";

const lines = (count) => `${"// inherited line\n".repeat(count)}export const value = 1;\n`;

test("inherited file size cannot grow or regain pruned allowances", async (t) => {
	const root = fixture(t, { "index.js": lines(12) });
	const config = makeConfig(root, "generic");
	config.limits.fileLines = 10;
	await captureBaseline(root, config, "Approved fixture debt");
	const original = readFileSync(join(root, ".engineering/baseline.json"), "utf8");
	await assert.rejects(() => captureBaseline(root, config, "Not an update"));
	assert.equal(readFileSync(join(root, ".engineering/baseline.json"), "utf8"), original);
	assert.equal((await check(root, config)).regressions.length, 0);
	writeFileSync(join(root, "index.js"), lines(13));
	assert.ok((await check(root, config)).regressions.some((item) => item.rule === "file-lines"));
	writeFileSync(join(root, "index.js"), lines(10));
	await pruneBaseline(root, config);
	writeFileSync(join(root, "index.js"), lines(12));
	assert.ok((await check(root, config)).regressions.some((item) => item.rule === "file-lines"));
});

test("extensionless Node entrypoints receive nesting and parameter gates", async (t) => {
	const root = fixture(t, {
		"bin/www":
			"#!/usr/bin/env node\nfunction run(a,b,c,d,e) { if(a) { if(b) { if(c) { if(d) { if(e) { console.log(e) } } } } } }\nrun(1,2,3,4,5);\n",
	});
	const report = await check(root, makeConfig(root, "express"));
	assert.ok(
		report.regressions.some((item) => item.file === "bin/www" && item.rule === "lizard/parameters"),
	);
	assert.ok(
		report.regressions.some((item) => item.file === "bin/www" && item.rule === "eslint(max-depth)"),
	);
});

test("parser errors cannot become inherited debt", async (t) => {
	const root = fixture(t, { "index.js": "export const broken = ;\n" });
	const config = makeConfig(root, "generic");
	await assert.rejects(() => captureBaseline(root, config, "Cannot bless invalid syntax"));
	assert.throws(() => readFileSync(join(root, ".engineering/baseline.json")));
});

test("strict referenced-project debt remains portable and original compiler errors fail", async (t) => {
	const root = fixture(t, {
		"tsconfig.json": JSON.stringify({
			files: [],
			compilerOptions: { rootDir: "." },
			references: [{ path: "./app" }],
		}),
		"app/tsconfig.json": JSON.stringify({
			compilerOptions: {
				composite: true,
				strict: true,
				noEmit: true,
				target: "ES2022",
				module: "ESNext",
				types: [],
			},
			include: ["*.ts"],
		}),
		"app/index.ts":
			"type Input = { value?: string };\nexport const input: Input = { value: undefined };\n",
	});
	const config = makeConfig(root, "generic");
	assert.ok(
		(await check(root, config)).regressions.some((item) => item.rule.startsWith("typescript/")),
	);
	await captureBaseline(root, config, "Approved strict fixture");
	const moved = fixture(t, {});
	cpSync(root, moved, { recursive: true });
	assert.equal((await check(moved, config)).regressions.length, 0);
	writeFileSync(join(moved, "app/index.ts"), 'export const invalid: number = "not a number";\n');
	await assert.rejects(() => check(moved, config));
});

test("direct runtime boundaries reject value imports but accept type-only imports", async (t) => {
	const root = fixture(t, {
		"client/view.ts":
			'import type { Secret } from "../server/secret";\nexport type View = Secret;\n',
		"server/secret.ts": 'export type Secret = string;\nexport const secret = "private";\n',
	});
	const config = makeConfig(root, "generic");
	config.boundaries = [{ from: "client", disallow: ["server"], allow: [] }];
	assert.equal((await check(root, config)).regressions.length, 0);
	writeFileSync(join(root, "client/view.ts"), 'export { secret } from "../server/secret";\n');
	assert.ok(
		(await check(root, config)).regressions.some((item) => item.rule === "boundary/runtime-import"),
	);
});
