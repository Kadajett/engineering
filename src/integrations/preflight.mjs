import { lstat, readFile, realpath, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { inspect, probe } from "./process.mjs";

export async function entry(path) {
	try {
		return await lstat(path);
	} catch (error) {
		if (error.code === "ENOENT") return null;
		throw error;
	}
}

export async function text(path) {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return "";
		throw error;
	}
}

export async function safePath(root, path) {
	const rel = relative(root, path);
	if (rel === ".." || rel.startsWith(`..${sep}`))
		throw new Error(`Refusing integration outside project: ${path}`);
	let current = root;
	for (const component of rel.split(sep).filter(Boolean)) {
		current = join(current, component);
		const stat = await entry(current);
		if (stat?.isSymbolicLink())
			throw new Error(
				`Refusing to write through symlink: ${current}. Resolve it explicitly first.`,
			);
	}
}

async function safeTree(root, path) {
	await safePath(root, path);
	if (!(await entry(path))?.isDirectory()) return;
	for (const child of await readdir(path)) await safeTree(root, join(path, child));
}

export function markers(content, begin, end, path) {
	const starts = content.split(begin).length - 1;
	const ends = content.split(end).length - 1;
	if (starts !== ends || starts > 1 || (starts && content.indexOf(begin) > content.indexOf(end))) {
		throw new Error(
			`Conflicting managed markers in ${path}: ${begin}. Preserve your content and repair the markers before rerunning.`,
		);
	}
}

function jsonObject(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalidHook(hook) {
	return !hook || typeof hook !== "object" || !Array.isArray(hook.hooks);
}

async function jsonHooks(path) {
	if (!(await entry(path))) return;
	const value = JSON.parse(await text(path));
	if (!jsonObject(value)) throw new Error(`${path} must contain a JSON object.`);
	if (value.hooks === undefined) return;
	if (!jsonObject(value.hooks)) throw new Error(`Refusing to replace invalid hooks in ${path}.`);
	for (const hooks of Object.values(value.hooks)) {
		if (!Array.isArray(hooks) || hooks.some(invalidHook))
			throw new Error(`Unsupported hook structure in ${path}; repair it before integration.`);
	}
}

async function hookSafety(root, hooks, beads, graphify) {
	const names = new Set(
		beads ? ["pre-commit", "post-merge", "pre-push", "post-checkout", "prepare-commit-msg"] : [],
	);
	if (graphify) {
		names.add("post-commit");
		names.add("post-checkout");
	}
	for (const name of names) {
		const path = join(hooks, name);
		await safePath(root, path);
		const content = await text(path);
		if (!content) continue;
		if (content.startsWith("#!") && !/^#![^\n]*\b(?:sh|bash|dash|zsh)(?:\s|$)/.test(content))
			throw new Error(`Cannot safely append shell integration to non-shell hook ${path}.`);
		markers(content, "# --- BEGIN BEADS INTEGRATION", "# --- END BEADS INTEGRATION", path);
		markers(content, "# graphify-hook-start", "# graphify-hook-end", path);
		markers(content, "# graphify-checkout-hook-start", "# graphify-checkout-hook-end", path);
		const userContent = content
			.replace(/# --- BEGIN BEADS INTEGRATION[^]*?# --- END BEADS INTEGRATION[^\n]*/g, "")
			.replace(/# graphify(?:-checkout)?-hook-start[^]*?# graphify(?:-checkout)?-hook-end/g, "");
		if (/^\s*(?:exec|exit)\b/m.test(userContent))
			throw new Error(
				`Hook ${path} contains a terminating exec/exit; official appended hooks may be unreachable. Compose this hook explicitly before integration.`,
			);
	}
}

async function beadsPreflight(root, env) {
	const help = await inspect("bd", ["init", "--help"], root, env);
	for (const flag of ["--prefix", "--non-interactive", "--skip-agents", "--skip-hooks"])
		if (!help.includes(flag))
			throw new Error(
				`Installed bd does not support ${flag}; update it deliberately before adoption.`,
			);
	for (const path of [
		".beads",
		".beads/config.yaml",
		".beads/metadata.json",
		".beads/redirect",
		".claude/settings.json",
		".claude/settings.local.json",
		".codex/config.toml",
		".codex/hooks.json",
		"AGENTS.md",
		"CLAUDE.md",
	])
		await safePath(root, join(root, path));
	for (const path of [".claude/settings.json", ".claude/settings.local.json", ".codex/hooks.json"])
		await jsonHooks(join(root, path));
	await safeTree(root, join(root, ".agents/skills/beads"));
	const config = await text(join(root, ".codex/config.toml"));
	if (/^\s*(?:codex_hooks|hooks)\s*=\s*false\b/m.test(config))
		throw new Error(
			"Codex native hooks are explicitly disabled in .codex/config.toml; refusing to override that choice.",
		);
	for (const name of ["AGENTS.md", "CLAUDE.md"]) {
		const content = await text(join(root, name));
		markers(content, "<!-- BEGIN BEADS INTEGRATION", "<!-- END BEADS INTEGRATION", name);
		markers(content, "<!-- BEGIN BEADS CODEX SETUP", "<!-- END BEADS CODEX SETUP", name);
	}
	const claude = await probe("bd", ["setup", "claude", "--check"], root, env);
	const codex = await probe("bd", ["setup", "codex", "--check"], root, env);
	if (!codex.ok && (await entry(join(root, ".agents/skills/beads"))))
		throw new Error(
			`Existing Beads skill/setup is not current; refusing to overwrite it automatically. Inspect 'bd setup codex --check', preserve custom skill edits, then repair deliberately. ${codex.text}`,
		);
	return {
		initialized: Boolean(await entry(join(root, ".beads"))),
		claude: claude.ok,
		codex: codex.ok,
	};
}

async function graphifyCapabilities(root, env) {
	const help = await inspect("graphify", ["install", "--help"], root, env);
	if (!help.includes("--project") || !help.includes("agents"))
		throw new Error(
			"Installed Graphify lacks the project-scoped agents skill installer; update it deliberately.",
		);
	const cliHelp = await inspect("graphify", ["--help"], root, env);
	if (!cliHelp.includes("--code-only") || !cliHelp.includes("--no-cluster"))
		throw new Error("Installed Graphify lacks the required local code-only extraction flags.");
}

async function graphifyPaths(root) {
	for (const path of [".agents/skills/graphify", "graphify-out"])
		await safeTree(root, join(root, path));
	for (const path of [".graphifyrc", ".graphifyignore", ".gitignore", ".gitattributes"])
		await safePath(root, join(root, path));
	const skill = Boolean(await entry(join(root, ".agents/skills/graphify")));
	if (skill && !(await entry(join(root, ".agents/skills/graphify/SKILL.md")))?.isFile())
		throw new Error("Existing .agents/skills/graphify has no SKILL.md; refusing to overwrite it.");
	for (const filename of [".gitignore", ".graphifyignore"]) {
		markers(
			await text(join(root, filename)),
			"# BEGIN ENGINEERING GRAPHIFY",
			"# END ENGINEERING GRAPHIFY",
			filename,
		);
	}
	return { skill };
}

async function graphifyMergeSafety(root, env) {
	const driver = await probe("git", ["config", "--get", "merge.graphify.driver"], root, env);
	if (driver.ok && !/^(?:graphify|"[^"]+" -m graphify) merge-driver %O %A %B$/.test(driver.text))
		throw new Error("Existing merge.graphify.driver is customized; refusing to replace it.");
	const attr = await inspect(
		"git",
		["check-attr", "merge", "--", "graphify-out/graph.json"],
		root,
		env,
	);
	if (!/: merge: (?:unspecified|graphify)$/.test(attr))
		throw new Error(`Existing graph merge attribute conflicts with Graphify: ${attr}`);
}

async function graphifyConfig(root) {
	const rc = await text(join(root, ".graphifyrc"));
	for (const raw of rc.split("\n")) {
		const line = raw.trim();
		if (
			line &&
			!line.startsWith("#") &&
			(!line.includes("=") ||
				(/^viz_node_limit\s*=/.test(line) && !/^viz_node_limit\s*=\s*\d+\s*$/.test(line)))
		)
			throw new Error(`Invalid .graphifyrc entry: ${line}`);
	}
}

async function graphifyPreflight(root, env) {
	await graphifyCapabilities(root, env);
	const state = await graphifyPaths(root);
	await graphifyMergeSafety(root, env);
	await graphifyConfig(root);
	return state;
}

/** All checks here are read-only; mutations begin only after the whole preflight succeeds. */
export async function preflight(root, options, env) {
	const top = await inspect("git", ["rev-parse", "--show-toplevel"], root, env);
	if ((await realpath(top)) !== root)
		throw new Error(
			`Integration target must be the repository root (${top}); refusing to modify a parent repository.`,
		);
	const gitDir = resolve(root, await inspect("git", ["rev-parse", "--git-dir"], root, env));
	const commonDir = resolve(
		root,
		await inspect("git", ["rev-parse", "--git-common-dir"], root, env),
	);
	if (gitDir !== commonDir)
		throw new Error(
			"Linked worktrees share repository hooks/config. Integrate from the primary checkout instead.",
		);
	await safePath(root, join(gitDir, "config"));
	let hooks = resolve(root, await inspect("git", ["rev-parse", "--git-path", "hooks"], root, env));
	if (hooks.endsWith(`${sep}_`)) hooks = dirname(hooks);
	await safePath(root, hooks);
	await hookSafety(root, hooks, options.beads, options.graphify);
	const beads = options.beads ? await beadsPreflight(root, env) : null;
	const graphify = options.graphify ? await graphifyPreflight(root, env) : null;
	return { beads, graphify, hooks };
}
