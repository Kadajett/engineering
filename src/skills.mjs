import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { managedBlock, save, saveJson, text } from "./files.mjs";
import { appendIgnores } from "./integrations.mjs";
import { selectSkills, unmatchedPackages } from "./skills/catalog.mjs";
import { installSkills } from "./skills/install.mjs";

const manifestPath = ".engineering/skills.json";

function storedSkills(root) {
	const content = text(root, manifestPath);
	if (!content) return { version: 1, skills: [] };
	const stored = JSON.parse(content);
	if (stored.version !== 1 || !Array.isArray(stored.skills))
		throw new Error(`Unsupported ${manifestPath}; preserve it and review before skill setup.`);
	for (const skill of stored.skills) {
		if (!skill || typeof skill.name !== "string" || !/^[a-f0-9]{40}$/.test(skill.revision))
			throw new Error(`Invalid pinned skill in ${manifestPath}`);
	}
	return stored;
}

function pinnedSelection(manifest, profile, stored) {
	const previous = new Map(stored.skills.map((skill) => [skill.name, skill]));
	return selectSkills(manifest, profile).map((skill) => {
		const pinned = previous.get(skill.name);
		if (pinned?.repository === skill.repository && pinned.path === skill.path)
			return { ...skill, revision: pinned.revision };
		return skill;
	});
}

export function skillPlan(root, profile) {
	const manifest = JSON.parse(text(root, "package.json") || "{}");
	const stored = storedSkills(root);
	const selectedProfile =
		profile ??
		stored.profile ??
		JSON.parse(text(root, ".engineering/state.json") || "{}").profile ??
		"generic";
	return {
		profile: selectedProfile,
		skills: pinnedSelection(manifest, selectedProfile, stored),
		unmatchedPackages: unmatchedPackages(manifest),
	};
}

function skillInstructions(plan) {
	const names = plan.skills.map((skill) => `\`${skill.name}\``).join(", ");
	return `## Project skills\n\nEngineering automatically selected these skills: ${names}.\n\n- Before implementation or review, discover the skills under .agents/skills and load the SKILL.md files relevant to the task. Apply the baseline engineering guidance and the matching library guidance without waiting for a separate user request.\n- After cloning this project or changing its dependencies, run engineering skills . (or the engineering:skills package script) before coding to restore local links and select new library guidance.\n- .engineering/skills.json records the selected upstream sources and fallback revisions. Skills reused from local installations remain user-managed, not silently upgraded.\n- Skill guidance does not override explicit user instructions or this project's architecture, quality gates, security constraints, or approved workflow. Never run a skill's scripts, install plugins/MCP servers, provision resources, or deploy merely because a skill mentions them.\n- Unmatched packages are not claimed to have library-specific coverage; consult their official documentation.\n`;
}

function managedInstructions(root, plan) {
	return new Map([
		["AGENTS.md", managedBlock(text(root, "AGENTS.md"), "skills", skillInstructions(plan))],
		[
			"CLAUDE.md",
			managedBlock(
				text(root, "CLAUDE.md"),
				"skills",
				"Read the project skill guidance in AGENTS.md and discover relevant skills in .claude/skills.",
			),
		],
	]);
}

function portableSkills(plan, installed) {
	return {
		version: 1,
		profile: plan.profile,
		skills: installed.skills.map(({ name, repository, revision, path, reason, status }) => ({
			name,
			repository,
			revision,
			path,
			reason,
			resolution: ["project", "local"].includes(status) ? status : "pinned-upstream",
		})),
		unmatchedPackages: plan.unmatchedPackages,
	};
}

function reportSkills(result, unmatched) {
	console.log(`Agent skills: ${result.skills.length} available.`);
	for (const skill of result.skills) console.log(`  ${skill.name}: ${skill.status}`);
	if (unmatched.length)
		console.log(
			`No verified library-specific mapping: ${unmatched.join(", ")}. Baseline guidance still applies.`,
		);
}

export async function setupSkills(directory, profile, options = {}) {
	if (options.skills === false) return { skills: [], links: [], disabled: true };
	const root = realpathSync(resolve(directory));
	const plan = skillPlan(root, profile);
	const instructions = managedInstructions(root, plan);
	text(root, ".gitignore");
	const preview = await installSkills(root, plan.skills, { ...options, dryRun: true });
	if (options.dryRun) {
		console.log(JSON.stringify({ ...plan, installation: preview }, null, 2));
		return preview;
	}
	await appendIgnores(
		root,
		".gitignore",
		preview.links.map((path) => `/${path}`),
	);
	const installed = await installSkills(root, plan.skills, options);
	for (const [path, content] of instructions) save(root, path, content);
	saveJson(root, manifestPath, portableSkills(plan, installed));
	reportSkills(installed, plan.unmatchedPackages);
	return installed;
}
