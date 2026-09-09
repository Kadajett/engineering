import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { recoverTemplateInstall } from "./generation-compatibility.mjs";
import { applyProjectName, generationName, requireEmptyDestination } from "./generation-names.mjs";
import { displayCommand, run } from "./process.mjs";
import { selectSkills } from "./skills/catalog.mjs";

export function generatorCommand(profile, target, forwarded = []) {
	if (!profile.generator)
		throw new Error(`${profile.id} is adoption-only; select a generator or use adopt`);
	if (profile.generator.package.startsWith("create-cloudflare@")) {
		if (forwarded.some((arg) => /^--(?:no-)?(?:deploy|open)(?:[.=]|$)/.test(arg))) {
			throw new Error(
				"Deployment/browser-opening flags are not accepted by the Cloudflare setup wrapper",
			);
		}
		if (profile.generator.args.includes("--template")) {
			const fixed =
				/^(?:accept-defaults|category|type|template|template-mode|framework|platform|variant|existing-script|experimental|wrangler-defaults|auto-update|agents|lang|ts)$/;
			if (
				forwarded.some((arg) => {
					if (arg === "--" || /^-[^-]*[ytf]/.test(arg)) return true;
					const flag = arg
						.split(/[.=]/, 1)[0]
						.replace(/^--(?:no-)?/, "")
						.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
					return arg.startsWith("--") && fixed.test(flag);
				})
			) {
				throw new Error(
					"Fixed remote-template C3 profiles do not accept template, category, type, defaults, or configuration overrides; use the cloudflare profile for upstream selection",
				);
			}
		}
	}
	const args = profile.generator.args.map((arg) => (arg === "{target}" ? target : arg));
	return ["npx", "--yes", profile.generator.package, ...args, ...forwarded];
}

export function explainCreate(profile, target, options) {
	if (profile.id === "react-cra" && !options.allowDeprecated) {
		throw new Error(
			"Create React App is deprecated; use react-vite/next or explicitly pass --allow-deprecated",
		);
	}
	console.log(`${profile.label}: ${profile.description}`);
	for (const warning of profile.warnings) console.log(`Warning: ${warning}`);
	const name = generationName(profile, target, options.name);
	const command = generatorCommand(profile, name, options.forwarded);
	console.log(`Directory: ${dirname(target)}`);
	if (name !== basename(target))
		console.log(`Generate as ${name} in a temporary sibling directory, then move to ${target}.`);
	if (options.name !== undefined) console.log(`Display name: ${options.name}`);
	console.log(displayCommand(command));
	console.log(
		"Then: install portable engineering package, preserve app tooling, add policy config/CI and enabled local integrations.",
	);
	console.log(
		options.baseline
			? `Initial inherited baseline: ${options.reason}`
			: "No baseline captured; new violations fail.",
	);
	if (options.skills !== false)
		console.log(
			`Automatic skills: ${selectSkills({}, profile.id)
				.map((skill) => skill.name)
				.join(", ")}. Library selection is finalized from the generated dependencies.`,
		);
	return command;
}

function pinGenerator(specifier) {
	if (!/^(?:@[\w.-]+\/)?[\w.-]+(?:@[\w.+-]+)?$/.test(specifier)) {
		throw new Error(
			"Generator must be an npm package with an optional exact version or dist-tag, not a shell command/URL",
		);
	}
	if (/@\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(specifier)) return specifier;
	const version = JSON.parse(
		run(["npm", "view", specifier, "version", "--json"], { capture: true, timeout: 60000 }),
	);
	if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)) {
		throw new Error(`Could not resolve one generator version for ${specifier}`);
	}
	const packageName = specifier.replace(/@[^/@]+$/, "") || specifier;
	return `${packageName}@${version}`;
}

function runGenerator(profile, command, root, cwd) {
	const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
	if (!profile.generationCompatibility) {
		run(command, { cwd, env });
		return;
	}
	// Only this pinned, non-interactive C3 template needs a captured install diagnostic.
	const result = spawnSync(command[0], command.slice(1), {
		cwd,
		env,
		stdio: ["inherit", "pipe", "pipe"],
		encoding: "utf8",
		maxBuffer: 8 * 1024 * 1024,
	});
	if (result.status !== 0 && recoverTemplateInstall(profile, root, result)) return;
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	if (result.error) throw result.error;
	if (result.status === 0) return;
	throw new Error(`${command[0]} exited ${result.status ?? result.signal}; nothing adopted`);
}

export function generate(profile, destination, options) {
	const root = resolve(destination);
	if (basename(root).startsWith("-")) throw new Error("Project directory cannot start with a dash");
	requireEmptyDestination(root);
	const command = explainCreate(profile, root, options);
	if (options.dryRun) return { root, generator: command };
	const name = generationName(profile, root, options.name);
	command[2] = pinGenerator(command[2]);
	mkdirSync(dirname(root), { recursive: true });
	const stagingParent =
		name === basename(root) ? null : mkdtempSync(join(dirname(root), ".engineering-create-"));
	const cwd = stagingParent ?? dirname(root);
	const generatedRoot = stagingParent ? join(stagingParent, name) : root;
	try {
		console.log(`Executing in ${cwd}: ${displayCommand(command)}`);
		runGenerator(profile, command, generatedRoot, cwd);
		if (!existsSync(join(generatedRoot, "package.json"))) {
			throw new Error(`Generator did not create ${generatedRoot}/package.json; nothing adopted`);
		}
		applyProjectName(generatedRoot, profile, name, options.name);
		if (stagingParent) {
			requireEmptyDestination(root);
			// POSIX rename replaces an empty directory atomically, but refuses a nonempty one.
			renameSync(generatedRoot, root);
			rmdirSync(stagingParent);
		}
	} catch (error) {
		throw new Error(
			`${error.message}\nGenerated work was not deleted; inspect ${generatedRoot} and destination ${root}. Nothing adopted.`,
			{ cause: error },
		);
	}
	return { root, generator: command };
}
