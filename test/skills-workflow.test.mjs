import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { setupSkills } from "../src/skills.mjs";
import { fixture } from "./fixture.mjs";

function localSkills(t, names) {
	return fixture(
		t,
		Object.fromEntries(
			names.map((name) => [
				`${name}/SKILL.md`,
				`---\nname: ${name}\ndescription: Local ${name} guidance\n---\nPreserve my ${name} guidance.\n`,
			]),
		),
	);
}

const baseline = ["tdd", "codebase-design", "diagnosing-bugs"];

function contents(root, path) {
	return readFileSync(join(root, path), "utf8");
}

test("default skill setup exposes local guidance and records portable, idempotent state", async (t) => {
	const root = fixture(t, { "package.json": "{}", "AGENTS.md": "Keep my project rules.\n" });
	const local = localSkills(t, baseline);
	const options = { skillsDirs: [local] };
	await setupSkills(root, "generic", options);
	assert.match(contents(root, ".agents/skills/tdd/SKILL.md"), /Preserve my tdd guidance/);
	assert.match(contents(root, "AGENTS.md"), /^Keep my project rules/);
	const state = contents(root, ".engineering/skills.json");
	assert.equal(state.includes(local), false);
	assert.equal(state.includes(root), false);
	const ignores = contents(root, ".gitignore");
	await setupSkills(root, "generic", options);
	assert.equal(contents(root, ".engineering/skills.json"), state);
	assert.equal(contents(root, ".gitignore"), ignores);
	spawnSync("git", ["init", "-q", root]);
	const ignored = spawnSync("git", ["check-ignore", ".agents/skills/tdd"], { cwd: root });
	assert.equal(ignored.status, 0);
});

test("standalone skill refresh supports older projects without altering quality approval", async (t) => {
	const oldState = JSON.stringify({ version: 1, packageVersion: "0.1.0", profile: "workers-ai" });
	const approved = "Keep the existing baseline bytes.\n";
	const root = fixture(t, {
		"package.json": "{}",
		".engineering/state.json": oldState,
		".engineering/baseline.json": approved,
	});
	const local = localSkills(t, [...baseline, "cloudflare", "wrangler", "workers-best-practices"]);
	await setupSkills(root, undefined, { skillsDirs: [local] });
	assert.match(
		contents(root, ".claude/skills/workers-best-practices/SKILL.md"),
		/Local workers-best-practices/,
	);
	assert.equal(contents(root, ".engineering/state.json"), oldState);
	assert.equal(contents(root, ".engineering/baseline.json"), approved);
});

test("dry skill setup leaves project instructions and metadata untouched", async (t) => {
	const root = fixture(t, { "package.json": "{}", "AGENTS.md": "Unchanged\n" });
	const local = localSkills(t, baseline);
	await setupSkills(root, "generic", { dryRun: true, skillsDirs: [local] });
	assert.equal(contents(root, "AGENTS.md"), "Unchanged\n");
	assert.equal(existsSync(join(root, ".agents")), false);
	assert.equal(existsSync(join(root, ".engineering")), false);
	assert.equal(existsSync(join(root, ".gitignore")), false);
});
