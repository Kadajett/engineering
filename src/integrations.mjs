import { realpath, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";
import { inspect, projectEnvironment, run } from "./integrations/process.mjs";
import { entry, markers, preflight, text } from "./integrations/preflight.mjs";
import { toolStatus } from "./integrations/tools.mjs";
import { generatedExclusions } from "./quality/files.mjs";
import { safePath } from "./files.mjs";
import { projectSlug } from "./generation-names.mjs";

export { toolStatus, installMissingTools } from "./integrations/tools.mjs";

const gitHooks = ["pre-commit", "post-merge", "pre-push", "post-checkout", "prepare-commit-msg"];
const ignoreBegin = "# BEGIN ENGINEERING GRAPHIFY";
const ignoreEnd = "# END ENGINEERING GRAPHIFY";
const graphExcludes = [
	".beads/",
	".engineering/",
	".agents/",
	".claude/",
	".codex/",
	".omp/",
	".pi/",
	".git/",
	"node_modules/",
	".env",
	".env.*",
	...generatedExclusions,
	"graphify-out/",
];
const gitExcludes = [
	"/graphify-out/cache/",
	"/graphify-out/memory/",
	"/graphify-out/.graphify*",
	"/graphify-out/manifest.json",
	"/graphify-out/graph.html",
];

export async function appendIgnores(root, filename, lines) {
	const path = safePath(root, filename);
	const current = await text(path);
	markers(current, ignoreBegin, ignoreEnd, path);
	const existing = new Set(current.split(/\r?\n/));
	const missing = lines.filter((line) => !existing.has(line));
	if (!missing.length) return;
	if (current.includes(ignoreBegin)) {
		await writeFile(path, current.replace(ignoreEnd, `${missing.join("\n")}\n${ignoreEnd}`));
		return;
	}
	await writeFile(
		path,
		`${current}${current && !current.endsWith("\n") ? "\n" : ""}\n${ignoreBegin}\n${missing.join("\n")}\n${ignoreEnd}\n`,
	);
}

async function orderCheckoutHooks(hooks) {
	const path = join(hooks, "post-checkout");
	const current = await text(path);
	const graphStart = current.indexOf("# graphify-checkout-hook-start");
	const beadsBlock =
		/^# --- BEGIN BEADS INTEGRATION[^\n]*\n[^]*?^# --- END BEADS INTEGRATION[^\n]*(?:\n|$)/m.exec(
			current,
		);
	if (graphStart < 0 || !beadsBlock || beadsBlock.index < graphStart) return;
	// Graphify has legitimate early exits. Put the native Beads section first,
	// moving only its managed bytes, so both integrations remain reachable.
	const withoutBeads =
		current.slice(0, beadsBlock.index) + current.slice(beadsBlock.index + beadsBlock[0].length);
	await writeFile(
		path,
		withoutBeads.slice(0, graphStart) + beadsBlock[0] + withoutBeads.slice(graphStart),
	);
}

async function beadsHooksInstalled(hooks) {
	let installed = true;
	for (const name of gitHooks) {
		if (!(await text(join(hooks, name))).includes("# --- BEGIN BEADS INTEGRATION"))
			installed = false;
	}
	return installed;
}

function beadsResult(state, installed) {
	return {
		status: state.initialized ? "preserved" : "initialized",
		hooks: installed ? "preserved" : "installed",
		claude: state.claude ? "preserved" : "installed",
		codex: state.codex ? "preserved" : "installed",
	};
}

async function integrateBeads(root, state, hooks, env) {
	if (!state) return { status: "disabled" };
	if (!state.initialized)
		await run(
			"bd",
			[
				"init",
				"--prefix",
				projectSlug(basename(root)),
				"--non-interactive",
				"--skip-agents",
				"--skip-hooks",
			],
			root,
			env,
		);
	const installed = await beadsHooksInstalled(hooks);
	if (!installed) await run("bd", ["hooks", "install", "--chain"], root, env);
	await orderCheckoutHooks(hooks);
	if (!state.claude) await run("bd", ["setup", "claude"], root, env);
	if (!state.codex) await run("bd", ["setup", "codex"], root, env);
	return beadsResult(state, installed);
}

async function graphHash(root) {
	const path = join(root, "graphify-out/graph.json");
	if (!(await entry(path))) return null;
	return createHash("sha256")
		.update(await text(path))
		.digest("hex");
}

async function checkGraphifyHooks(root, env) {
	const status = await inspect("graphify", ["hook", "status"], root, env);
	if (/not installed|not registered|partially registered|out of date/i.test(status))
		throw new Error(`Graphify hook installation was incomplete: ${status}`);
}

async function integrateGraphify(root, state, env, deferGraph) {
	if (!state) return { status: "disabled" };
	if (!state.skill)
		await run("graphify", ["install", "--project", "--platform", "agents"], root, env);
	await appendIgnores(root, ".graphifyignore", graphExcludes);
	await appendIgnores(root, ".gitignore", gitExcludes);
	await run("graphify", ["hook", "install"], root, env);
	await checkGraphifyHooks(root, env);
	const result = deferGraph ? { status: "deferred" } : await runGraphExtraction(root, env);
	return {
		...result,
		skill: state.skill ? "preserved" : "installed",
		hooks: "installed",
	};
}

async function runGraphExtraction(root, env) {
	const before = await graphHash(root);
	// Native incremental extraction preserves unchanged graphs and semantic nodes,
	// unlike unconditional update; --no-cluster also prevents community-label LLM calls.
	await run("graphify", ["extract", root, "--code-only", "--no-cluster"], root, env);
	const after = await graphHash(root);
	if (after === null)
		throw new Error(
			"Graphify completed without graphify-out/graph.json; inspect the extraction output. No graph was fabricated.",
		);
	return {
		status: before === null ? "extracted" : before === after ? "unchanged" : "updated",
	};
}

/**
 * Project-only native integration; never installs tools implicitly.
 * Resolves {beads:{status,hooks?,claude?,codex?}, graphify:{status,skill?,hooks?}}.
 * Preflight conflicts throw before writes. Command failures throw with earlier
 * successful steps preserved so a deliberate repair and rerun is safe.
 */
export async function integrate(
	directory,
	{ beads = true, graphify = true, deferGraph = false } = {},
) {
	if (
		typeof beads !== "boolean" ||
		typeof graphify !== "boolean" ||
		typeof deferGraph !== "boolean"
	)
		throw new TypeError("beads, graphify and deferGraph options must be booleans");
	const root = await realpath(directory);
	if (!beads && !graphify)
		return { beads: { status: "disabled" }, graphify: { status: "disabled" } };
	await requireTools(beads, graphify);
	const env = projectEnvironment(root);
	const state = await preflight(root, { beads, graphify }, env);
	const beadResult = await integrateBeads(root, state.beads, state.hooks, env);
	const graphResult = await integrateGraphify(root, state.graphify, env, deferGraph);
	return { beads: beadResult, graphify: graphResult };
}

async function requireTools(beads, graphify) {
	const statuses = await toolStatus();
	const required = new Set([...(beads ? ["bd"] : []), ...(graphify ? ["graphify"] : [])]);
	const unavailable = statuses.filter(
		({ name, available, version }) =>
			required.has(name) && (!available || version?.startsWith("unhealthy:")),
	);
	if (unavailable.length)
		throw new Error(
			`Required tools unavailable: ${unavailable.map(({ name }) => name).join(", ")}. Run engineering setup (or use --install-tools) explicitly; no integration files were changed.`,
		);
}

/** Extract only after read-only verification of the existing native integration. */
export async function extractGraph(directory) {
	const root = await realpath(directory);
	await requireTools(false, true);
	const env = projectEnvironment(root);
	const state = await preflight(root, { beads: false, graphify: true }, env);
	if (!state.graphify.skill)
		throw new Error(
			"Graphify project integration is not initialized; run integration before extraction.",
		);
	await checkGraphifyHooks(root, env);
	return runGraphExtraction(root, env);
}
