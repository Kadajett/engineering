import { lstatSync, mkdirSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { readRegularFile } from "../archive-inputs.mjs";

export function stat(path) {
	try {
		return lstatSync(path);
	} catch (error) {
		if (error.code === "ENOENT") return undefined;
		throw error;
	}
}

export function assertContained(root, path) {
	const name = relative(root, path);
	if (name === ".." || name.startsWith(`..${sep}`) || isAbsolute(name))
		throw new Error(`Skill source escapes its directory: ${path}`);
}

export function relativeSkillPath(path) {
	if (typeof path !== "string" || !path || isAbsolute(path) || path.includes("\\"))
		throw new Error(`Invalid repository-relative skill path: ${path}`);
	if (path.split("/").some((part) => !part || part === "." || part === ".."))
		throw new Error(`Invalid repository-relative skill path: ${path}`);
	return path;
}

export function validateSelection(selection) {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(selection.name) || selection.name.length > 64)
		throw new Error(`Invalid skill name: ${selection.name}`);
	if (!/^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9._/-]+\.git$/.test(selection.repository))
		throw new Error(`Skill repository must be a public HTTPS Git URL: ${selection.repository}`);
	if (!/^[a-f0-9]{40}$/.test(selection.revision))
		throw new Error(`Skill revision must be an exact commit: ${selection.revision}`);
	// "." means the skill is the repository root.
	if (selection.path !== ".") relativeSkillPath(selection.path);
}

export function safeParents(path, create = false) {
	let current = parse(resolve(path)).root;
	for (const part of relative(current, resolve(path)).split(/[\\/]/)) {
		current = join(current, part);
		if (create && !stat(current)) {
			try {
				mkdirSync(current, { mode: 0o700 });
			} catch (error) {
				if (error.code !== "EEXIST") throw error;
			}
		}
		const entry = stat(current);
		if (entry && (!entry.isDirectory() || entry.isSymbolicLink()))
			throw new Error(
				`Refusing unsafe skill parent directory: ${current}; replace it with a real directory`,
			);
	}
}

export function privateDirectory(path) {
	const entry = stat(path);
	if (!entry) return;
	if (!entry.isDirectory() || entry.isSymbolicLink())
		throw new Error(`Refusing unsafe skill cache directory: ${path}`);
	if ((process.getuid && entry.uid !== process.getuid()) || entry.mode & 0o077)
		throw new Error(`Skill cache must be private and owned by the current user: ${path}`);
}

function treeTarget(root, path, allowDangling) {
	try {
		return realpathSync(path);
	} catch (error) {
		if (!allowDangling || error.code !== "ENOENT" || !stat(path)?.isSymbolicLink()) throw error;
		const target = readlinkSync(path);
		assertContained(root, resolve(dirname(path), target));
		// An unresolved parent traversal cannot be proven safe through symlinked ancestors.
		if (isAbsolute(target) || target.split(/[\\/]/).includes("..")) throw error;
		return undefined;
	}
}

function visitTree(root, path, seen, allowDangling) {
	const actual = treeTarget(root, path, allowDangling);
	if (actual === undefined) return;
	assertContained(root, actual);
	if (seen.has(actual)) return;
	seen.add(actual);
	const entry = stat(actual);
	if (entry.isDirectory()) {
		for (const name of readdirSync(actual))
			visitTree(root, join(actual, name), seen, allowDangling);
	} else if (!entry.isFile()) {
		throw new Error(`Refusing non-file skill content: ${path}`);
	}
}

export function validateTree(root, path = root, allowDangling = false) {
	visitTree(realpathSync(root), path, new Set(), allowDangling);
}

export function validateSkill(path, name, boundary = path) {
	const actual = realpathSync(path);
	assertContained(realpathSync(boundary), actual);
	if (!stat(actual).isDirectory()) throw new Error(`Expected skill directory: ${path}`);
	validateTree(boundary, actual);
	const text = readRegularFile(join(actual, "SKILL.md")).toString("utf8");
	const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1];
	const names = frontmatter?.match(/^name:\s*([^\r\n]+)$/gm) ?? [];
	const value = names[0]
		?.slice(5)
		.trim()
		.replace(/\s+#.*$/, "")
		.replace(/^(['"])(.*)\1$/, "$2");
	if (names.length !== 1 || value !== name)
		throw new Error(`Expected SKILL.md frontmatter name '${name}' in ${path}`);
	if (!/^description:\s*\S/m.test(frontmatter))
		throw new Error(`Expected SKILL.md description in ${path}`);
	return actual;
}

export function destinationParent(path) {
	safeParents(dirname(path));
}
