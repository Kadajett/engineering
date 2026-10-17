import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { readRegularFile } from "../archive-inputs.mjs";
import { stat, validateSkill } from "./safety.mjs";

// Locations follow vercel-labs/skills/src/agents.ts and upstream Pi/OMP skill discovery.
export const projectSkillDirectories = [
	".agents/skills",
	".claude/skills",
	".pi/skills",
	".omp/skills",
];

function configuredHome(variable, fallback) {
	const path = process.env[variable]?.trim() || fallback;
	return path.startsWith("~/") ? join(homedir(), path.slice(2)) : resolve(path);
}

function pluginRoots(claude) {
	const registry = join(claude, "plugins/installed_plugins.json");
	if (!stat(registry)) return [];
	const data = JSON.parse(readRegularFile(registry));
	return Object.values(data.plugins ?? {}).flatMap((entries) =>
		entries
			.filter((entry) => typeof entry.installPath === "string")
			.map((entry) => entry.installPath),
	);
}

function ompAgentHome() {
	const root = join(homedir(), process.env.PI_CONFIG_DIR?.trim() || ".omp");
	const profile = (process.env.OMP_PROFILE ?? process.env.PI_PROFILE ?? "").trim();
	if (!profile || profile === "default")
		return configuredHome("PI_CODING_AGENT_DIR", join(root, "agent"));
	if (!/^[a-zA-Z0-9_-]+$/.test(profile)) throw new Error(`Invalid OMP profile: ${profile}`);
	return join(root, "profiles", profile, "agent");
}

export function localSkillRoots(explicit = []) {
	const home = homedir();
	const claude = configuredHome("CLAUDE_CONFIG_DIR", join(home, ".claude"));
	const codex = configuredHome("CODEX_HOME", join(home, ".codex"));
	const pi = configuredHome("PI_CODING_AGENT_DIR", join(home, ".pi/agent"));
	const omp = ompAgentHome();
	const config = configuredHome("XDG_CONFIG_HOME", join(home, ".config"));
	return [
		...new Set([
			...explicit.map((path) => resolve(path)),
			join(home, ".agents/skills"),
			join(home, ".agent/skills"),
			join(config, "agents/skills"),
			join(claude, "skills"),
			join(codex, "skills"),
			join(pi, "skills"),
			join(omp, "skills"),
			...pluginRoots(claude),
		]),
	];
}

export function findLocalSkill(selection, roots) {
	for (const root of roots) {
		// A repository-root skill (path ".") is only found under its own name.
		const nested = selection.path === "." ? [] : [join(root, selection.path)];
		const candidates = [join(root, selection.name), ...nested];
		for (const candidate of new Set(candidates)) {
			if (!stat(candidate)) continue;
			return validateSkill(candidate, selection.name);
		}
	}
	return undefined;
}
