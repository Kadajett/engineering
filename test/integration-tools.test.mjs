import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fixture } from "./fixture.mjs";

function executable(root, name, body) {
	writeFileSync(join(root, name), `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
}

test("tool discovery is memoized, but installation refreshes health and availability", async (t) => {
	const root = fixture(t, {});
	const path = process.env.PATH;
	process.env.PATH = root;
	t.after(() => {
		process.env.PATH = path;
	});
	executable(root, "bd", 'console.log("bd healthy");');
	executable(root, "lizard", 'console.log("lizard healthy");');
	const graphify = `#!${process.execPath}\nconsole.log("graphify healthy");\n`;
	executable(
		root,
		"uv",
		`
if (process.argv[2] === "--version") console.log("uv healthy");
else require("node:fs").writeFileSync(${JSON.stringify(join(root, "graphify"))}, ${JSON.stringify(graphify)}, {mode: 0o755});
`,
	);
	const url = new URL("../src/integrations/tools.mjs", import.meta.url);
	url.searchParams.set("fixture", root);
	const { toolStatus, installMissingTools } = await import(url.href);
	const first = await toolStatus();
	assert.equal(first.find(({ name }) => name === "graphify").available, false);
	executable(root, "lizard", 'console.error("broken executable"); process.exitCode = 1;');
	assert.doesNotMatch(
		(await toolStatus()).find(({ name }) => name === "lizard").version,
		/^unhealthy:/,
	);
	await assert.rejects(() => installMissingTools());
	const refreshed = await toolStatus();
	assert.equal(refreshed.find(({ name }) => name === "graphify").available, true);
	const unhealthy = refreshed.find(({ name }) => name === "lizard");
	assert.equal(unhealthy.available, true);
	assert.match(unhealthy.version, /^unhealthy:/);
});
