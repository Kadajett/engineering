import { resolve } from "node:path";
import { adopt } from "./adopt.mjs";
import { createProject } from "./create.mjs";
import { grill } from "./grill.mjs";
import { installMissingTools, toolStatus } from "./integrations.mjs";
import { parseOptions, usage } from "./options.mjs";
import { packageManifest } from "./package-install.mjs";
import { getProfile, profiles } from "./profiles.mjs";
import { setupSkills } from "./skills.mjs";
import { showRecommendations } from "./skills/recommend.mjs";

function showProfiles() {
	for (const profile of profiles) {
		console.log(`${profile.id.padEnd(20)} ${profile.label}`);
		console.log(`  ${profile.generator?.package ?? "adopt only"}`);
	}
}

async function qualityCommand(command, root, options) {
	const quality = await import("./quality.mjs");
	const config = quality.readConfig(root);
	if (command === "baseline") {
		if (!options.accept || !options.reason?.trim())
			throw new Error("Initial baseline requires --accept --reason; new debt must not be blessed");
		const report = await quality.captureBaseline(root, config, options.reason);
		console.log(
			`Initial inherited baseline captured: ${report.inherited.length} finding(s). Future checks are read-only.`,
		);
		return;
	}
	if (command === "prune") {
		console.log(JSON.stringify(await quality.pruneBaseline(root, config), null, 2));
		return;
	}
	const report = await quality.check(root, config);
	console.log(
		`Engineering: ${report.inherited.length} inherited; ${report.resolved.length} resolved; ${report.regressions.length} regression(s).`,
	);
	for (const finding of report.regressions)
		console.error(`${finding.file}: ${finding.rule}: ${finding.message}`);
	if (report.regressions.length) process.exitCode = 1;
}

function singleTarget(command, targets) {
	if (targets.length > 1) throw new Error(`${command} takes at most one directory`);
	return resolve(targets[0] ?? ".");
}

const creators = {
	create: createProject,
	plan: (targets, options) => createProject(targets, { ...options, dryRun: true }),
	grill,
};

async function dispatch(command, targets, options) {
	if (Object.hasOwn(creators, command)) return creators[command](targets, options);
	if (options.forwarded.length)
		throw new Error("Only create/plan accept upstream arguments after --");
	const root = singleTarget(command, targets);
	if (command === "adopt") return adopt(root, getProfile(options.profile ?? "generic"), options);
	if (command === "skills") return setupSkills(root, options.profile, options);
	if (command === "recommend") return showRecommendations(root, options);
	if (["check", "baseline", "prune"].includes(command))
		return qualityCommand(command, root, options);
	throw new Error(`Unknown command: ${command}`);
}

export async function main(args = process.argv.slice(2)) {
	const { command, targets, options } = parseOptions(args);
	if (options.version) return console.log(packageManifest.version);
	if (options.help || command === "help") return console.log(usage());
	if (options.dryRun && !["create", "adopt", "plan", "skills", "grill"].includes(command))
		throw new Error("--dry-run is supported only for create, adopt, plan, skills and grill");
	if (command === "list") return showProfiles();
	if (command === "doctor") return console.log(JSON.stringify(await toolStatus(), null, 2));
	if (command === "setup") return installMissingTools();
	await dispatch(command, targets, options);
}
