import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchSkill } from "../skills/cache.mjs";
import { catalogSkill } from "../skills/catalog.mjs";
import { findLocalSkill, localSkillRoots, projectSkillDirectories } from "../skills/discovery.mjs";

/**
 * The humanizer skill's rules, which every grill question is written by. Taken from the workspace's
 * skills, then the user's collections, then a fetch of the catalog's pinned revision.
 */
export function writingRules(workspace, skillsDirs = []) {
	const selection = catalogSkill("humanizer");
	const roots = [
		...projectSkillDirectories.map((directory) => join(workspace, directory)),
		...localSkillRoots(skillsDirs),
	];
	const directory = findLocalSkill(selection, roots) ?? fetchSkill(selection);
	const text = readFileSync(join(directory, "SKILL.md"), "utf8");
	return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
}
