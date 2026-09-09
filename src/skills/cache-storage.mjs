import { mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { privateDirectory, safeParents, stat } from "./safety.mjs";

export function cacheHome() {
	const home = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
	if (!isAbsolute(home)) throw new Error("Engineering cache home must be an absolute path");
	return join(home, "kadajett-engineering", "skills-v2");
}
export function checkCacheParents(entry, create = false) {
	safeParents(dirname(entry), create);
	privateDirectory(dirname(dirname(entry)));
	privateDirectory(dirname(entry));
	privateDirectory(entry);
}
export function sourceFiles(root, prefix = "", includeDirectories = false) {
	const result = [];
	for (const name of readdirSync(join(root, prefix)).sort()) {
		const path = prefix ? `${prefix}/${name}` : name;
		const entry = stat(join(root, path));
		if (entry.isDirectory()) {
			if (includeDirectories) result.push(path);
			result.push(...sourceFiles(root, path, includeDirectories));
		} else result.push(path);
	}
	return result;
}
export function publish(entry, populate) {
	checkCacheParents(entry, true);
	const temporary = mkdtempSync(join(dirname(entry), ".fetch-"));
	try {
		populate(temporary);
		try {
			renameSync(temporary, entry);
		} catch (error) {
			if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error;
		}
	} finally {
		rmSync(temporary, { recursive: true, force: true });
	}
}
