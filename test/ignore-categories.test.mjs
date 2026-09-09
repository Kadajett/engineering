import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { appendIgnores } from "../src/integrations.mjs";
import { fixture } from "./fixture.mjs";

function ignore(root) {
	return readFileSync(join(root, ".gitignore"), "utf8");
}

test("skill migration preserves user rules and genuine Graphify exclusions", async (t) => {
	const root = fixture(t, {
		".gitignore":
			"# User rules\n/private/\n# BEGIN ENGINEERING GRAPHIFY\n/graphify-out/cache/\n/.omp/skills/tdd\n# END ENGINEERING GRAPHIFY\n",
	});
	await appendIgnores(root, ".gitignore", ["/.omp/skills/tdd"], "SKILLS");
	const migrated = ignore(root);
	assert.match(migrated, /^# User rules\n\/private\/\n/);
	assert.match(
		migrated,
		/# BEGIN ENGINEERING GRAPHIFY\n\/graphify-out\/cache\/\n# END ENGINEERING GRAPHIFY/,
	);
	assert.match(
		migrated,
		/# BEGIN ENGINEERING SKILLS\n\/\.omp\/skills\/tdd\n# END ENGINEERING SKILLS/,
	);
	await appendIgnores(root, ".gitignore", ["/.omp/skills/tdd"], "SKILLS");
	assert.equal(ignore(root), migrated);
});

test("skill-only legacy blocks retire without claiming user-owned lines", async (t) => {
	const root = fixture(t, {
		".gitignore":
			"/.pi/skills/tdd\n# BEGIN ENGINEERING GRAPHIFY\n/.omp/skills/tdd\n# END ENGINEERING GRAPHIFY\n",
	});
	await appendIgnores(root, ".gitignore", ["/.omp/skills/tdd", "/.pi/skills/tdd"], "SKILLS");
	assert.equal(ignore(root).includes("ENGINEERING GRAPHIFY"), false);
	assert.equal(ignore(root).split("/.pi/skills/tdd").length, 2);
});

test("malformed category markers fail without modifying the ignore file", async (t) => {
	const original = "# BEGIN ENGINEERING SKILLS\n/private/\n";
	const root = fixture(t, { ".gitignore": original });
	await assert.rejects(
		() => appendIgnores(root, ".gitignore", ["/.omp/skills/tdd"], "SKILLS"),
		/markers/,
	);
	assert.equal(ignore(root), original);
});
