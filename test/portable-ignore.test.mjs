import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { adopt } from "../src/adopt.mjs";
import { archiveName } from "../src/package-install.mjs";
import { getProfile } from "../src/profiles.mjs";
import { fixture } from "./fixture.mjs";

test("adoption makes its portable dependency trackable despite upstream archive ignores", async (t) => {
	const root = fixture(t, {
		"package.json": JSON.stringify({ name: "portable-fixture", private: true, type: "module" }),
		"index.js": "export const value = 1;\n",
		".gitignore": "node_modules/\n*.tgz\n",
	});
	const initialized = spawnSync("git", ["init", "-q", root], { encoding: "utf8" });
	assert.equal(initialized.status, 0, initialized.stderr);
	await adopt(root, getProfile("generic"), {
		beads: false,
		graphify: false,
		ci: true,
		skills: false,
	});
	const archive = `.engineering/vendor/${archiveName}`;
	const ignored = spawnSync("git", ["check-ignore", archive], { cwd: root, encoding: "utf8" });
	assert.equal(ignored.status, 1, ignored.stdout);
	const added = spawnSync("git", ["add", archive], { cwd: root, encoding: "utf8" });
	assert.equal(added.status, 0, added.stderr);
});
