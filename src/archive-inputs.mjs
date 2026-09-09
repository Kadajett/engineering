import { createHash } from "node:crypto";
import {
	constants,
	closeSync,
	fstatSync,
	lstatSync,
	openSync,
	readFileSync,
	readdirSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

const ignoredDirectories = new Set(["node_modules", ".git", ".engineering", ".graphify", ".beads"]);
const ignoreControls = new Set([".npmignore", ".gitignore"]);

// Open the final component without following links; directories are checked separately.
export function readRegularFile(path) {
	const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		if (!fstatSync(fd).isFile()) throw new Error(`Expected a regular file: ${path}`);
		return readFileSync(fd);
	} finally {
		closeSync(fd);
	}
}

function ignoredPart(part) {
	return (
		ignoredDirectories.has(part) ||
		(part.startsWith(".") && !ignoreControls.has(part) && part !== ".")
	);
}

function inputName(root, name) {
	const parts = name.split(/[\\/]/);
	if (isAbsolute(name) || parts.some((part) => part === ".." || /[*?\[\]{}]/.test(part))) {
		throw new Error(`Package inputs must be relative literal paths: ${name}`);
	}
	if (parts.some(ignoredPart)) return undefined;
	if (/(?:\.(?:pem|key|p12|pfx)|^credentials\.json)$/i.test(parts.at(-1))) return undefined;
	const normalized = relative(root, resolve(root, name));
	if (!normalized)
		throw new Error("The package files allowlist cannot include the entire source tree");
	return normalized;
}

function inputStat(root, name) {
	// Check each component, including parents of individually allowlisted files.
	let path = root;
	let stat;
	for (const part of name.split(/[\\/]/)) {
		path = join(path, part);
		try {
			stat = lstatSync(path);
		} catch (error) {
			if (error.code === "ENOENT") return undefined;
			throw error;
		}
		if (stat.isSymbolicLink()) throw new Error(`Refusing symlink in package inputs: ${name}`);
	}
	return stat;
}

function collect(root, files, name) {
	const normalized = inputName(root, name);
	if (normalized === undefined) return;
	const stat = inputStat(root, normalized);
	if (!stat) return;
	const path = join(root, normalized);
	if (stat.isDirectory()) {
		for (const entry of readdirSync(path).sort()) collect(root, files, join(normalized, entry));
	} else if (stat.isFile()) {
		files.set(normalized, {
			name: normalized,
			mode: stat.mode & 0o777,
			bytes: readRegularFile(path),
		});
	} else {
		throw new Error(`Refusing non-file package input: ${normalized}`);
	}
}

function includedRootFile(name) {
	return (
		/^(?:readme|licen[sc]e|copying)(?:\..*)?$/i.test(name) ||
		ignoreControls.has(name) ||
		name === "npm-shrinkwrap.json"
	);
}

function collectManifest(root, files, manifest) {
	if (!Array.isArray(manifest.files))
		throw new Error("Engineering package requires an explicit files allowlist");
	for (const name of manifest.files) collect(root, files, name);
	for (const name of readdirSync(root)) {
		if (includedRootFile(name)) collect(root, files, name);
	}
	if (manifest.main) collect(root, files, manifest.main);
	if (typeof manifest.bin === "string") collect(root, files, manifest.bin);
	else for (const name of Object.values(manifest.bin ?? {})) collect(root, files, name);
}

function snapshotKey(inputs) {
	const hash = createHash("sha256").update("engineering-archive-v1\0");
	for (const file of inputs) {
		hash.update(JSON.stringify([file.name, file.mode, file.bytes.length]));
		hash.update("\0").update(file.bytes);
	}
	return hash.digest("hex");
}

export function snapshot(root) {
	const files = new Map();
	collect(root, files, "package.json");
	collectManifest(root, files, JSON.parse(files.get("package.json").bytes));
	const inputs = [...files.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
	return { inputs, key: snapshotKey(inputs) };
}
