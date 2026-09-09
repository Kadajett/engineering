import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { makeConfig } from "../src/quality.mjs";
import { Stages } from "../src/stages.mjs";
import { verifyProject } from "../src/verification.mjs";
import { fixture } from "./fixture.mjs";

test("native validation failure cannot approve an inherited baseline", async (t) => {
	const root = fixture(t, {
		"index.js": "export const valid = 1;\n",
		"package.json": JSON.stringify({ scripts: { check: 'node -e "process.exit(7)"' } }),
	});
	mkdirSync(join(root, ".engineering"));
	writeFileSync(
		join(root, ".engineering/config.json"),
		JSON.stringify(makeConfig(root, "generic")),
	);
	const plan = { manager: { name: "npm" }, scripts: { checks: ["check"] } };
	const options = {
		baseline: true,
		reason: "Approved inherited fixture only",
		graphify: false,
		stages: new Stages(),
	};
	await assert.rejects(() => verifyProject(root, { checksReadOnly: true }, plan, options));
	assert.equal(existsSync(join(root, ".engineering/baseline.json")), false);
});
