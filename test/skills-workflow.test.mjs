import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { setupSkills } from "../src/skills.mjs";
import { fixture } from "./fixture.mjs";

function localSkills(t, names) {
	const previous = process.env.XDG_CACHE_HOME;
	process.env.XDG_CACHE_HOME = fixture(t, {});
	t.after(() => {
		if (previous === undefined) delete process.env.XDG_CACHE_HOME;
		else process.env.XDG_CACHE_HOME = previous;
	});
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

const baseline = ["tdd", "codebase-design", "diagnosing-bugs", "humanizer"];

function contents(root, path) {
	return readFileSync(join(root, path), "utf8");
}

test("default skill setup exposes local guidance and records portable, idempotent state", async (t) => {
	const native =
		"<!-- engineering:beads:start -->\nKeep native beads workflow.\n<!-- engineering:beads:end -->\n";
	const root = fixture(t, {
		"package.json": "{}",
		"AGENTS.md": "Keep my project rules.\n",
		".omp/AGENTS.md": native,
		".pi/AGENTS.md": native,
		".agents/skills/beads/SKILL.md": "Keep native beads skill.\n",
	});
	const local = localSkills(t, baseline);
	const options = { skillsDirs: [local] };
	await setupSkills(root, "generic", options);
	assert.match(contents(root, ".agents/skills/tdd/SKILL.md"), /Preserve my tdd guidance/);
	assert.match(contents(root, "AGENTS.md"), /^Keep my project rules/);
	for (const directory of [".omp", ".pi"]) {
		assert.equal(contents(root, `${directory}/AGENTS.md`).startsWith(native), true);
	}
	assert.equal(contents(root, ".agents/skills/beads/SKILL.md"), "Keep native beads skill.\n");
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

test("guidance refresh removes an unused provider without changing app code, config, or approvals", async (t) => {
	const manifest = JSON.stringify({
		dependencies: { wrangler: "^4", "@sentry/cloudflare": "^10" },
	});
	const root = fixture(t, {
		"package.json": manifest,
		"AGENTS.md": "Keep my custom instructions.\n",
		"src/index.ts": "export const app = true;\n",
		"wrangler.jsonc": '{ "name": "my-worker" }\n',
		".engineering/baseline.json": "Keep my approved issues.\n",
	});
	const options = {
		skillsDirs: [localSkills(t, [...baseline, "cloudflare", "wrangler", "workers-best-practices"])],
	};
	await setupSkills(root, "generic", options);
	const state = JSON.parse(contents(root, ".engineering/skills.json"));
	const sentry = state.guidance.find(({ id }) => id === "sentry-cloudflare");
	assert.ok(sentry);
	for (const [, url] of sentry.links) assert.ok(contents(root, "AGENTS.md").includes(url));
	assert.equal(contents(root, "package.json"), manifest);
	assert.equal(existsSync(join(root, "node_modules")), false);
	writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { wrangler: "^4" } }));
	await setupSkills(root, undefined, options);
	assert.equal(
		JSON.parse(contents(root, ".engineering/skills.json")).guidance.some(
			({ id }) => id === "sentry-cloudflare",
		),
		false,
	);
	for (const [, url] of sentry.links)
		assert.equal(contents(root, "AGENTS.md").includes(url), false);
	assert.match(contents(root, "AGENTS.md"), /^Keep my custom instructions/);
	assert.equal(contents(root, "src/index.ts"), "export const app = true;\n");
	assert.equal(contents(root, "wrangler.jsonc"), '{ "name": "my-worker" }\n');
	assert.equal(contents(root, ".engineering/baseline.json"), "Keep my approved issues.\n");
});
