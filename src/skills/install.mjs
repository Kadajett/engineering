import { realpathSync, symlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { cachedRepository, fetchSkill, repositoryEntry } from "./cache.mjs";
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
		const entry = stat(path);
		if (entry?.isDirectory()) return validateSkill(path, selection.name);
	}
	return undefined;
}

function skillSource(root, selection, context) {
	const project = projectSkill(root, selection);
	if (project) return { source: project, status: "project" };
	const local = findLocalSkill(selection, context.roots);
	if (local) return { source: local, status: "local" };
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

function linkExists(path, target) {
	const entry = stat(path);
	if (!entry) return false;
	if (!entry.isSymbolicLink()) throw conflict(path);
	let actual;
	try {
		actual = realpathSync(path);
	} catch (error) {
		throw new Error(`Dangling or invalid skill link: ${path}; remove it before retrying`, {
			cause: error,
		});
	}
	const expected = stat(target) ? realpathSync(target) : resolve(target);
	if (actual !== expected) throw conflict(path);
	return true;
}

function planLinks(root, skill) {
	const canonical = join(root, projectSkillDirectories[0], skill.name);
	const links = [];
	for (const directory of projectSkillDirectories) {
		const path = join(root, directory, skill.name);
		destinationParent(path);
		if (stat(path)?.isDirectory()) {
			validateSkill(path, skill.name);
			continue;
		}
		const target = path === canonical ? skill.source : canonical;
		linkExists(path, skill.source);
		links.push({ path, target });
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
	if (linkExists(link.path, link.target)) return;
	const canonical = relative(dirname(link.path), link.target);
	symlinkSync(canonical, link.path, "dir");
}

export async function installSkills(directory, selections, options = {}) {
	const selected = uniqueSelections(selections);
	if (!selected.length) return { skills: [], links: [] };
	const root = resolve(directory);
	safeParents(root);
	const context = { roots: localSkillRoots(options.skillsDirs), verified: new Set() };
	const skills = selected.map((selection) => ({
		...selection,
		...skillSource(root, selection, context),
	}));
	let links = skills.flatMap((skill) => planLinks(root, skill));
	if (!options.dryRun) {
		for (const skill of skills) {
			if (skill.status !== "planned-fetch") continue;
			skill.source = fetchSkill(skill, context.verified);
			skill.status = "fetched";
		}
		// Fetching can take time: repeat the full destination preflight before any project writes.
		links = skills.flatMap((skill) => planLinks(root, skill));
		for (const link of links) createLink(link);
	}
	return { skills, links: links.map((link) => relative(root, link.path).split("\\").join("/")) };
}
