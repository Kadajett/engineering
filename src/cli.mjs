import { resolve } from "node:path";
import { adopt } from "./adopt.mjs";
import { createProject } from "./create.mjs";
import { grill } from "./grill.mjs";
import { usage } from "./help.mjs";
import { installMissingTools, toolStatus } from "./integrations.mjs";
import { parseOptions } from "./options.mjs";
import { packageManifest } from "./package-install.mjs";
import { getProfile } from "./profiles.mjs";
import { setupSkills } from "./skills.mjs";
import { showRecommendations } from "./skills/recommend.mjs";

async function check(root, options) {
	const quality = await import("./quality.mjs");
	const config = quality.readConfig(root);
	if (options.baseline) {
		const report = await quality.captureBaseline(root, config, options.reason);
		return console.log(
			`Initial inherited baseline captured: ${report.inherited.length} finding(s). Future checks are read-only.`,
		);
	}
	if (options.prune)
		return console.log(JSON.stringify(await quality.pruneBaseline(root, config), null, 2));
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

/** Commands that take one directory (default: current). */
const inDirectory = {
	adopt: (root, options) => adopt(root, getProfile(options.profile ?? "generic"), options),
	check,
	skills: (root, options) =>
		options.suggest
			? showRecommendations(root, options)
			: setupSkills(root, options.profile, options),
};

async function dispatch(command, targets, options) {
	if (command === "create") return createProject(targets, options);
	if (options.forwarded.length) throw new Error("Only create passes arguments after -- upstream");
	if (command === "grill") return grill(targets, options);
	if (command === "doctor")
		return options.fix
			? installMissingTools()
			: console.log(JSON.stringify(await toolStatus(), null, 2));
	return inDirectory[command](singleTarget(command, targets), options);
}

export async function main(args = process.argv.slice(2)) {
	const { command, targets, options } = parseOptions(args);
	if (options.version) return console.log(packageManifest.version);
	if (command === "help") return console.log(usage(targets[0]));
	if (options.help) return console.log(usage(command));
	await dispatch(command, targets, options);
}
