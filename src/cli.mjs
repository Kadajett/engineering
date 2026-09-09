import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { adopt, prepareTools } from "./adopt.mjs";
import { generate } from "./generate.mjs";
import { installMissingTools, toolStatus } from "./integrations.mjs";
import { parseOptions, usage } from "./options.mjs";
import { packageManifest } from "./package-install.mjs";
import { getProfile, profiles } from "./profiles.mjs";
import { chooseBaseline } from "./baseline-choice.mjs";
import { Stages } from "./stages.mjs";
import { setupSkills } from "./skills.mjs";

function showProfiles() {
	for (const profile of profiles) {
		console.log(`${profile.id.padEnd(20)} ${profile.label}`);
		console.log(`  ${profile.generator?.package ?? "adopt only"}`);
	}
}

async function selectProfile() {
	const choices = profiles.filter((profile) => profile.generator);
	if (!process.stdin.isTTY || !process.stdout.isTTY)
		throw new Error("Non-interactive create requires a profile. Run engineering list.");
	choices.forEach((profile, index) => console.log(`${index + 1}. ${profile.label}`));
	const prompt = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const answer = await prompt.question("Project selection (number or profile id): ");
		const selected =
			choices.find((profile) => profile.id === answer.trim()) ?? choices[Number(answer.trim()) - 1];
		if (!selected) throw new Error("No valid project selected; nothing created");
		return selected;
	} finally {
		prompt.close();
	}
}

async function creationProfile(targets, options) {
	if (options.generator) {
		return {
			...getProfile(options.profile ?? "generic"),
			generator: { package: options.generator, args: ["{target}"] },
		};
	}
	if (targets.length === 2) return getProfile(targets[0]);
	if (options.profile) return getProfile(options.profile);
	return selectProfile();
}

async function createProject(targets, options) {
	if (targets.length < 1 || targets.length > 2)
		throw new Error("Usage: engineering create [profile] <directory>");
	const profile = await creationProfile(targets, options);
	if (options.generator && targets.length !== 1)
		throw new Error("Custom generator takes exactly one target directory");
	if (options.dryRun) return generate(profile, targets.at(-1), options);
	const approved = await chooseBaseline(options);
	const stages = new Stages();
	try {
		await stages.run("Preflight", () => prepareTools(approved));
		const generated = await stages.run("Upstream generator", () =>
			generate(profile, targets.at(-1), approved),
		);
		await adopt(generated.root, profile, {
			...approved,
			created: true,
			prepared: true,
			stages,
			generator: generated.generator,
		});
	} finally {
		stages.print();
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

async function dispatch(command, targets, options) {
	if (command === "create") return createProject(targets, options);
	if (command === "plan") return createProject(targets, { ...options, dryRun: true });
	if (options.forwarded.length)
		throw new Error("Only create/plan accept upstream arguments after --");
	const root = singleTarget(command, targets);
	if (command === "adopt") return adopt(root, getProfile(options.profile ?? "generic"), options);
	if (command === "skills") return setupSkills(root, options.profile, options);
	if (["check", "baseline", "prune"].includes(command))
		return qualityCommand(command, root, options);
	throw new Error(`Unknown command: ${command}`);
}

export async function main(args = process.argv.slice(2)) {
	const { command, targets, options } = parseOptions(args);
	if (options.version) return console.log(packageManifest.version);
	if (options.help || command === "help") return console.log(usage());
	if (options.dryRun && !["create", "adopt", "plan", "skills"].includes(command))
		throw new Error("--dry-run is supported only for create, adopt, plan and skills");
	if (command === "list") return showProfiles();
	if (command === "doctor") return console.log(JSON.stringify(await toolStatus(), null, 2));
	if (command === "setup") return installMissingTools();
	await dispatch(command, targets, options);
}
