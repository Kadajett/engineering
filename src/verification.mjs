import { join } from "node:path";
import { json } from "./files.mjs";
import { extractGraph } from "./integrations.mjs";
import { projectEnvironment, run } from "./integrations/process.mjs";
import { packageRoot } from "./package-install.mjs";
import { testScripts } from "./testing.mjs";

function requiredScripts(profile, available) {
	const prepare = profile.prepareScripts ?? ["cf-typegen"].filter((name) => available[name]);
	const checks =
		profile.checkScripts ??
		["typecheck", "type-check", "check", "lint", "build"].filter((name) => available[name]);
	for (const name of [...prepare, ...checks]) {
		if (typeof available[name] !== "string")
			throw new Error(`Upstream profile requires missing package script: ${name}`);
	}
	return { prepare, checks };
}

export function projectScripts(root, profile, manifest = json(root, "package.json"), testing) {
	const available = manifest.scripts ?? {};
	const { prepare, checks } = requiredScripts(profile, available);
	const tests = testing?.checks ?? testScripts(available);
	return { prepare, checks: [...new Set([...checks, ...tests])] };
}

export async function runScripts(root, manager, names) {
	const env = { ...projectEnvironment(root), CI: "1", WRANGLER_SEND_METRICS: "false" };
	for (const name of names) await run(manager.name, ["run", name], root, env);
}

async function settle(jobs) {
	const results = await Promise.allSettled(jobs);
	const errors = results
		.filter((result) => result.status === "rejected")
		.map((result) => result.reason);
	if (errors.length) throw new Error(errors.map((error) => error.message).join("\n"));
}

function policy(root, options) {
	const args = [join(packageRoot, "bin/engineering.mjs")];
	if (options.baseline) args.push("check", root, "--baseline", "--reason", options.reason);
	else args.push("check", root);
	return run(process.execPath, args, root, projectEnvironment(root));
}

export async function verifyProject(root, profile, plan, options) {
	const { stages } = options;
	const native = () =>
		stages.run("Native checks", async () => {
			if (!plan.scripts.checks.length)
				console.log("No native check/lint/build or known one-shot test scripts declared.");
			await runScripts(root, plan.manager, plan.scripts.checks);
		});
	const graph = () =>
		options.graphify ? stages.run("Graph extraction", () => extractGraph(root)) : Promise.resolve();
	const quality = () =>
		stages.run(options.baseline ? "Approved baseline" : "Engineering gate", () =>
			policy(root, options),
		);
	if (!profile.checksReadOnly) {
		await native();
		await settle([graph(), quality()]);
		return;
	}
	if (options.baseline) {
		await settle([native(), graph()]);
		await quality();
		return;
	}
	await settle([native(), graph(), quality()]);
}
