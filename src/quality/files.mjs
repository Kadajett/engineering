import {
	closeSync,
	lstatSync,
	openSync,
	readSync,
	readdirSync,
	readFileSync,
	realpathSync,
} from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const generatedExclusions = [
	"dist",
	"build",
	"coverage",
	".next",
	".tanstack",
	".output",
	".nuxt",
	".svelte-kit",
	".astro",
	".turbo",
	".cache",
	".wrangler",
	"generated",
	"routeTree.gen.ts",
	"*.generated.*",
	"worker-configuration.d.ts",
];

export const exclusions = [
	"node_modules",
	".git",
	".engineering",
	".beads",
	".graphify",
	".agents",
	".claude",
	".codex",
	".agent",
	...generatedExclusions,
	"vendor",
	".env",
	".env.*",
	".omp",
	".pi",
	"graphify-out",
];

export function validPath(value, glob = false) {
	if (typeof value !== "string" || !value || value.trim() !== value) return false;
	if (value === ".") return !glob;
	if (isAbsolute(value) || /[\\\x00-\x1f:]/.test(value)) return false;
	if (value.split("/").some((part) => !part || part === "." || part === "..")) return false;
	return glob ? !/[!\[\]{}()]/.test(value) : !/[*?]/.test(value);
}

export function projectRoot(root) {
	const absolute = resolve(root);
	if (realpathSync(absolute) !== absolute || !lstatSync(absolute).isDirectory()) {
		throw new Error(`Project root must be a real directory, not a symlink: ${root}`);
	}
	return absolute;
}

export function inside(root, path) {
	const name = relative(root, resolve(root, path)).split(sep).join("/");
	if (name === ".." || name.startsWith("../") || isAbsolute(name)) {
		throw new Error(`Path escapes project root: ${path}`);
	}
	return name;
}

export function safePath(root, path, missing = false) {
	const name = inside(root, path);
	let current = root;
	for (const part of name.split("/").filter(Boolean)) {
		current = join(current, part);
		try {
			if (lstatSync(current).isSymbolicLink())
				throw new Error(`Symlink is not permitted: ${current}`);
		} catch (error) {
			if (missing && error.code === "ENOENT") return resolve(root, name);
			throw error;
		}
	}
	return current;
}

function globExpression(pattern) {
	let result = "";
	for (let index = 0; index < pattern.length; index += 1) {
		const character = pattern[index];
		if (character === "*" && pattern[index + 1] === "*") {
			if (pattern[index + 2] === "/") {
				result += "(?:.*/)?";
				index += 2;
			} else {
				result += ".*";
				index += 1;
			}
		} else if (character === "*") result += "[^/]*";
		else if (character === "?") result += "[^/]";
		else result += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}
	return result;
}

export function matcher(patterns) {
	const expressions = patterns.map((pattern) => {
		const prefix = pattern.includes("/") ? "^" : "(?:^|/)";
		return new RegExp(`${prefix}${globExpression(pattern)}(?:/|$)`);
	});
	return (path) => expressions.some((expression) => expression.test(path));
}

export function inventory(root, config) {
	const excluded = matcher(config.exclude);
	const paths = [];
	const visit = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const absolute = join(directory, entry.name);
			const path = inside(root, absolute);
			if (excluded(path) || entry.isSymbolicLink()) continue;
			if (entry.isDirectory()) visit(absolute);
			else if (entry.isFile()) paths.push(path);
		}
	};
	visit(root);
	return paths.sort();
}

function codeFile(root, path) {
	if (/\.(?:[cm]?[jt]sx?|py)$/.test(path)) return true;
	if (extname(path)) return false;
	const handle = openSync(safePath(root, path), "r");
	try {
		const prefix = Buffer.alloc(128);
		const length = readSync(handle, prefix, 0, prefix.length, 0);
		return /^#![^\r\n]*\b(?:node|nodejs|bun)(?:\s|$)/.test(prefix.toString("utf8", 0, length));
	} finally {
		closeSync(handle);
	}
}

export function sourceFiles(root, config, paths = inventory(root, config)) {
	for (const source of config.sources) safePath(root, source);
	const files = paths.filter(
		(path) =>
			config.sources.some(
				(source) => source === "." || path === source || path.startsWith(`${source}/`),
			) && codeFile(root, path),
	);
	if (!files.length) throw new Error("No JS/TS/Python source files found in configured sources");
	return files;
}

export function isTest(path) {
	return (
		/(?:^|\/)(?:tests?|__tests__|__mocks__|e2e|test-support|fixtures)(?:\/|$)/.test(path) ||
		/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) ||
		/(?:^|\/)(?:test_[^/]+|[^/]+_test)\.py$/.test(path)
	);
}

export function readJson(root, path) {
	return JSON.parse(readFileSync(safePath(root, path), "utf8"));
}
