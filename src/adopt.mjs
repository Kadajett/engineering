import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { json, safePath, save, saveJson, text } from "./files.mjs";
import { appendIgnores, integrate, installMissingTools, toolStatus } from "./integrations.mjs";
import { projectEnvironment } from "./integrations/process.mjs";
import { selectManager } from "./managers.mjs";
import { dependencySpec, packageManifest, packInto } from "./package-install.mjs";
import { projectFiles, scripts } from "./project-files.mjs";
import { available, run } from "./process.mjs";
import { requireProfileRuntime } from "./profiles.mjs";
import { run as runCommand } from "./integrations/process.mjs";
import { installProject } from "./install-state.mjs";
import { projectScripts, runScripts, verifyProject } from "./verification.mjs";
import { Stages } from "./stages.mjs";
import { setupSkills, skillPlan } from "./skills.mjs";
import { testingPlan } from "./testing.mjs";

export async function prepareTools(options) {
	if (options.installTools) await installMissingTools();
	const required = new Set([
		"lizard",
		...(options.beads ? ["bd"] : []),
		...(options.graphify ? ["graphify"] : []),
	]);
	const missing = (await toolStatus()).filter(
		(tool) =>
			required.has(tool.name) && (!tool.available || tool.version?.startsWith("unhealthy:")),
	);
	if (missing.length)
		throw new Error(
			`Missing or unhealthy tools: ${missing.map((tool) => tool.name).join(", ")}. Run engineering setup.`,
		);
	if (options.open && !available("code"))
		throw new Error("VS Code CLI 'code' is unavailable; install it before --open vscode.");
}

function assertRepository(root, options) {
	if (!options.beads && !options.graphify) return;
	if (existsSync(join(root, ".git"))) return;
	const probe = spawnSync("git", ["rev-parse", "--show-toplevel"], {
		cwd: root,
		env: projectEnvironment(root),
		encoding: "utf8",
	});
	if (probe.error) throw probe.error;
	if (probe.status === 0 && resolve(probe.stdout.trim()) !== root && !options.created) {
		throw new Error(
			"Target is inside another Git repository. Adopt its root; this command will not modify parent hooks.",
		);
	}
}

function ensureRepository(root, options) {
	if ((!options.beads && !options.graphify) || existsSync(join(root, ".git"))) return;
	run(["git", "init", "-b", "main"], { cwd: root, env: projectEnvironment(root) });
}

function mergedScripts(existing = {}) {
	const result = { ...existing };
	for (const [name, command] of Object.entries(scripts)) {
		if (result[name] && result[name] !== command)
			throw new Error(`Preserving conflicting script: ${name}`);
		result[name] = command;
	}
	return result;
}

function mergedManifest(manifest) {
	const installed =
		manifest.devDependencies?.[packageManifest.name] ??
		manifest.dependencies?.[packageManifest.name];
	if (installed && installed !== dependencySpec)
		throw new Error(`Preserving existing ${packageManifest.name} dependency: ${installed}`);
	return {
		...manifest,
		scripts: mergedScripts(manifest.scripts),
		devDependencies: { ...manifest.devDependencies, [packageManifest.name]: dependencySpec },
	};
}

function existingState(root, profile) {
	const original = text(root, ".engineering/state.json");
	if (!original) return {};
	const state = JSON.parse(original);
	if (state.version !== 1 || state.packageVersion !== packageManifest.version)
		throw new Error("Existing engineering state requires an explicit versioned upgrade");
	if (state.profile !== profile.id)
		throw new Error(`Project already adopted as ${state.profile}; do not silently change profiles`);
	return state;
}

function adoptionPlan(root, profile, options, quality) {
	safePath(root, "package.json");
	const manifest = json(root, "package.json");
	const manager = selectManager(root, manifest, options.manager);
	const state = existingState(root, profile);
	const configured = Boolean(text(root, ".engineering/config.json"));
	const config = configured ? quality.readConfig(root) : quality.makeConfig(root, profile);
	if (config.profile !== profile.id)
		throw new Error(`Existing policy profile is ${config.profile}`);
	const testing = testingPlan(root, manifest, profile, options);
	const nextManifest = mergedManifest(testing.manifest);
	const nativeScripts = projectScripts(root, profile, nextManifest, testing);
	const files = projectFiles(root, profile, manager, { ...options, nativeScripts });
	for (const [name, content] of testing.files) files.set(name, content);
	safePath(root, ".engineering/vendor");
	safePath(root, ".engineering/baseline.json");
	safePath(root, ".gitignore");
	assertRepository(root, options);
	return {
		manager,
		state,
		config,
		files,
		nextManifest,
		configured,
		testing,
		scripts: nativeScripts,
	};
}

function saveSetup(root, plan, profile, options) {
	packInto(root);
	saveJson(root, "package.json", plan.nextManifest);
	if (!plan.configured) saveJson(root, ".engineering/config.json", plan.config);
	for (const [name, content] of plan.files) save(root, name, content);
	saveJson(root, ".engineering/state.json", {
		...plan.state,
		version: 1,
		packageVersion: packageManifest.version,
		profile: profile.id,
		manager: plan.manager,
		generator: options.generator ?? plan.state.generator ?? null,
		integrations: {
			beads: options.beads,
			graphify: options.graphify,
			skills: options.skills !== false,
		},
		phase: "configured",
	});
}

function printPlan(root, profile, plan, options) {
	const guidance =
		options.skills === false ? { skills: [], guidance: [] } : skillPlan(root, profile.id);
	console.log(
		JSON.stringify(
			{
				root,
				profile: profile.id,
				manager: plan.manager,
				config: plan.config,
				scripts,
				files: [
					...plan.files.keys(),
					".gitignore",
					...(options.skills === false ? [] : [".engineering/skills.json"]),
				],
				dependency: dependencySpec,
				integrations: {
					beads: options.beads,
					graphify: options.graphify,
					skills: options.skills !== false,
				},
				skills: guidance.skills,
				guidance: guidance.guidance,
				baseline: Boolean(options.baseline),
				open: options.open ?? null,
				preparation: plan.scripts.prepare,
				nativeChecks: plan.scripts.checks,
				testing: { runner: plan.testing.runner, notes: plan.testing.notes },
				manifest: plan.nextManifest,
			},
			null,
			2,
		),
	);
}

async function applyPlan(root, profile, plan, options) {
	const { stages } = options;
	await stages.run("Project configuration", async () => {
		saveSetup(root, plan, profile, options);
		await appendIgnores(
			root,
			".gitignore",
			["!/.engineering/", "!/.engineering/vendor/", "!/.engineering/vendor/*.tgz"],
			"PROJECT",
		);
	});
	await stages.run("Dependencies", () => installProject(root, plan.manager));
	await stages.run("Type generation", () => runScripts(root, plan.manager, plan.scripts.prepare));
	await stages.run("Native integrations", async () => {
		ensureRepository(root, options);
		await integrate(root, { beads: options.beads, graphify: options.graphify, deferGraph: true });
	});
	const skills = await stages.run("Agent skills", () => setupSkills(root, profile.id, options));
	if (options.open)
		await stages.run("VS Code", () =>
			runCommand("code", ["--new-window", root], root, projectEnvironment(root)),
		);
	await verifyProject(root, profile, plan, options);
	const state = json(root, ".engineering/state.json");
	saveJson(root, ".engineering/state.json", { ...state, phase: "complete" });
	printNextSteps(root, plan, skills);
}

function printNextSteps(root, plan, skills) {
	console.log(`\nProject ready: ${root}`);
	if (!skills.disabled)
		console.log(`${skills.skills.length} agent skills available automatically.`);
	for (const note of plan.testing.notes) console.log(note);
	if (plan.testing.checks.length)
		console.log(`Run tests: ${plan.manager.name} run ${plan.testing.checks[0]}`);
	const available = plan.nextManifest.scripts;
	const start = available.dev ? "dev" : available.start ? "start" : null;
	if (start) console.log(`In that directory, start the app: ${plan.manager.name} run ${start}`);
	console.log(`Check your changes: ${plan.manager.name} run engineering:check`);
	if (!skills.disabled)
		console.log(`After dependency changes: ${plan.manager.name} run engineering:skills`);
}

export async function adopt(directory, profile, options) {
	if (!options.dryRun) requireProfileRuntime(profile);
	const root = realpathSync(resolve(directory));
	const quality = await import("./quality.mjs");
	const plan = adoptionPlan(root, profile, options, quality);
	if (options.dryRun) return printPlan(root, profile, plan, options);
	if (options.baseline && existsSync(join(root, ".engineering/baseline.json"))) {
		throw new Error(
			"Baseline already exists. Re-run without --baseline; use prune to ratchet resolved debt.",
		);
	}
	const stages = options.stages ?? new Stages();
	try {
		if (!options.prepared) await stages.run("Preflight", () => prepareTools(options));
		await applyPlan(root, profile, plan, { ...options, stages });
	} finally {
		if (!options.stages) stages.print();
	}
}
