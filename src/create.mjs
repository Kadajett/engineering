import { createInterface } from "node:readline/promises";
import { adopt, prepareTools } from "./adopt.mjs";
import { chooseBaseline } from "./baseline-choice.mjs";
import { generate } from "./generate.mjs";
import { projectSlug } from "./generation-names.mjs";
import { getProfile, profiles, requireProfileRuntime } from "./profiles.mjs";
import { Stages } from "./stages.mjs";

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

function creationInput(targets, options) {
	if (targets.length > 2)
		throw new Error("Usage: engineering create [profile] [name or directory]");
	if (options.generator && targets.length > 1)
		throw new Error("Custom generator takes at most one name or directory");
	if (targets.length === 2) return { profileId: targets[0], destination: targets[1] };
	if (
		!options.profile &&
		!options.generator &&
		profiles.some((profile) => profile.id === targets[0])
	)
		return { profileId: targets[0] };
	return { destination: targets[0] };
}

async function creationProfile(profileId, options) {
	if (options.generator) {
		return {
			...getProfile(options.profile ?? "generic"),
			generator: { package: options.generator, args: ["{target}"] },
		};
	}
	if (profileId || options.profile) return getProfile(profileId ?? options.profile);
	if (options.dryRun)
		throw new Error("Preview requires a profile. Pass --profile or run engineering list.");
	return selectProfile();
}

async function creationDestination(destination, providedName) {
	if (destination !== undefined) {
		if (!destination.trim()) throw new Error("Project name or directory cannot be empty");
		return { destination, name: providedName };
	}
	let name = providedName;
	if (name === undefined) {
		const prompt = createInterface({ input: process.stdin, output: process.stdout });
		try {
			name = (await prompt.question("Project name: ")).trim();
		} finally {
			prompt.close();
		}
	}
	return { destination: projectSlug(name), name };
}

export async function createProject(targets, options) {
	const input = creationInput(targets, options);
	if (
		input.destination === undefined &&
		options.name === undefined &&
		(options.dryRun || !process.stdin.isTTY || !process.stdout.isTTY)
	)
		throw new Error(
			"Project name required. Pass a name or directory, or use --name NAME; run create in an interactive terminal to be prompted.",
		);
	const profile = await creationProfile(input.profileId, options);
	const { destination, name } = await creationDestination(input.destination, options.name);
	const namedOptions = name === options.name ? options : { ...options, name };
	if (options.dryRun) return generate(profile, destination, namedOptions);
	requireProfileRuntime(profile);
	const approved = await chooseBaseline(namedOptions);
	const stages = new Stages();
	try {
		await stages.run("Preflight", () => prepareTools(approved));
		const generated = await stages.run("Upstream generator", () =>
			generate(profile, destination, approved),
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
