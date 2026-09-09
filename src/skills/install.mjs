import { createHash } from "node:crypto";
import { readlinkSync, realpathSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { readRegularFile } from "../archive-inputs.mjs";
import { cachedRepository, fetchSkill, repositoryEntry } from "./cache.mjs";
import { cachedLocalSkill, materializeLocalSkill } from "./local-cache.mjs";
import { findLocalSkill, localSkillRoots, projectSkillDirectories } from "./discovery.mjs";
import {
	destinationParent,
	safeParents,
	stat,
	validateSelection,
	validateSkill,
} from "./safety.mjs";

function projectSkill(root, selection) {
	for (const directory of projectSkillDirectories) {
		const path = join(root, directory, selection.name);
		destinationParent(path);
		if (stat(path)?.isDirectory()) return validateSkill(path, selection.name);
	}
	return undefined;
}

function skillSource(root, selection, context) {
	const project = projectSkill(root, selection);
	if (project) return { source: project, status: "project" };
	const local = findLocalSkill(selection, context.roots);
	if (local)
		return {
			...materializeLocalSkill(selection, local, true),
			originalSource: local,
			status: "local",
		};
	const previous = context.stored.skills?.find((skill) => skill.name === selection.name);
	if (previous?.localDigest) {
		const source = cachedLocalSkill(selection, previous.localDigest);
		if (source) return { source, localDigest: previous.localDigest, status: "local" };
	}
	const cached = cachedRepository(selection, context.verified);
	if (cached) return { source: cached, status: "cached" };
	return {
		source: join(repositoryEntry(selection), "source", selection.path),
		status: "planned-fetch",
	};
}

function conflict(path) {
	return new Error(
		`Conflicting skill destination: ${path}; move or remove this entry before retrying`,
	);
}

function targetHash(target) {
	return createHash("sha256").update(target).digest("hex");
}

function legacyLinkTarget(root, target, skill) {
	return (
		target === skill.originalSource ||
		target === join(root, projectSkillDirectories[0], skill.name) ||
		(target.includes("/kadajett-engineering/skills-v") && target.endsWith(`/${skill.path}`)) ||
		(target.includes("/plugins/cache/") &&
			(target.endsWith(`/${skill.path}`) || target.endsWith(`/skills/${skill.name}`)))
	);
}

function managedLink(root, path, skill, stored) {
	const target = resolve(dirname(path), readlinkSync(path));
	const name = relative(root, path).split("\\").join("/");
	if (Array.isArray(stored.managedLinks))
		return stored.managedLinks.some(
			(link) => link.path === name && link.targetHash === targetHash(target),
		);
	// Older manifests recorded skill provenance, but not individual target hashes.
	// Only migrate recognizable engineering/cache links, never arbitrary custom targets.
	const previous = stored.skills?.find(
		(item) =>
			item.name === skill.name && item.repository === skill.repository && item.path === skill.path,
	);
	if (!previous || !["local", "pinned-upstream"].includes(previous.resolution)) return false;
	return legacyLinkTarget(root, target, skill);
}

function assertMatchingUserLink(path, skill) {
	let actual;
	try {
		actual = realpathSync(path);
	} catch (error) {
		throw new Error(`Dangling or invalid skill link: ${path}; remove it before retrying`, {
			cause: error,
		});
	}
	if (actual !== skill.originalSource && actual !== skill.source) throw conflict(path);
}

function planLinks(root, skill, stored) {
	const canonical = join(root, projectSkillDirectories[0], skill.name);
	const links = [];
	for (const directory of projectSkillDirectories) {
		const path = join(root, directory, skill.name);
		destinationParent(path);
		const entry = stat(path);
		if (entry?.isDirectory()) {
			validateSkill(path, skill.name);
			continue;
		}
		const target = path === canonical ? skill.source : canonical;
		if (!entry) {
			links.push({ path, target });
			continue;
		}
		if (!entry.isSymbolicLink()) throw conflict(path);
		const previousTarget = readlinkSync(path);
		if (managedLink(root, path, skill, stored)) {
			links.push({ path, target, previousTarget });
			continue;
		}
		if (resolve(dirname(path), previousTarget) === target) {
			links.push({ path, target, previousTarget });
			continue;
		}
		// A user's matching link remains theirs: do not migrate it or claim ownership.
		assertMatchingUserLink(path, skill);
	}
	return links;
}

function uniqueSelections(selections) {
	const unique = new Map();
	for (const selection of selections) {
		validateSelection(selection);
		const existing = unique.get(selection.name);
		if (existing && JSON.stringify(existing) !== JSON.stringify(selection))
			throw new Error(`Conflicting selections for skill: ${selection.name}`);
		unique.set(selection.name, selection);
	}
	return [...unique.values()];
}

function createLink(link) {
	safeParents(dirname(link.path), true);
	const entry = stat(link.path);
	if (entry) {
		if (!entry.isSymbolicLink() || readlinkSync(link.path) !== link.previousTarget)
			throw conflict(link.path);
		if (resolve(dirname(link.path), link.previousTarget) === link.target) return;
		unlinkSync(link.path);
	}
	symlinkSync(relative(dirname(link.path), link.target), link.path, "dir");
}

export async function installSkills(directory, selections, options = {}) {
	const selected = uniqueSelections(selections);
	if (!selected.length) return { skills: [], links: [], managedLinks: [] };
	const root = resolve(directory);
	safeParents(root);
	const manifest = join(root, ".engineering/skills.json");
	destinationParent(manifest);
	const stored = stat(manifest) ? JSON.parse(readRegularFile(manifest)) : {};
	const context = { roots: localSkillRoots(options.skillsDirs), verified: new Set(), stored };
	const skills = selected.map((selection) => ({
		...selection,
		...skillSource(root, selection, context),
	}));
	let links = skills.flatMap((skill) => planLinks(root, skill, stored));
	if (!options.dryRun) {
		for (const skill of skills) {
			if (skill.originalSource)
				Object.assign(skill, materializeLocalSkill(skill, skill.originalSource));
			if (skill.status !== "planned-fetch") continue;
			skill.source = fetchSkill(skill, context.verified);
			skill.status = "fetched";
		}
		// Fetching can take time: repeat the full destination preflight before any project writes.
		links = skills.flatMap((skill) => planLinks(root, skill, stored));
		for (const link of links) createLink(link);
	}
	return {
		skills: skills.map(({ originalSource, ...skill }) => skill),
		links: links.map((link) => relative(root, link.path).split("\\").join("/")),
		managedLinks: links.map((link) => ({
			path: relative(root, link.path).split("\\").join("/"),
			targetHash: targetHash(link.target),
		})),
	};
}
