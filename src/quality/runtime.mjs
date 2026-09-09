import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
export function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		...options,
	});
	if (result.error)
		throw new Error(`Cannot run ${command}: ${result.error.message}`, { cause: result.error });
	if (result.signal) throw new Error(`${command} terminated by ${result.signal}`);
	return result;
}

function metadataPath(name) {
	try {
		return require.resolve(`${name}/package.json`);
	} catch (error) {
		if (error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
	}
	let directory = dirname(require.resolve(name));
	while (true) {
		const path = join(directory, "package.json");
		try {
			if (JSON.parse(readFileSync(path, "utf8")).name === name) return path;
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
		const parent = dirname(directory);
		if (parent === directory) throw new Error(`Cannot locate package metadata for ${name}`);
		directory = parent;
	}
}

export function packageInfo(name) {
	const path = metadataPath(name);
	const metadata = JSON.parse(readFileSync(path, "utf8"));
	const bin =
		typeof metadata.bin === "string" ? metadata.bin : Object.values(metadata.bin ?? {})[0];
	return { version: metadata.version, bin: bin ? join(dirname(path), bin) : undefined };
}

export function loadCompiler(root) {
	const projectRequire = createRequire(join(root, "package.json"));
	let path;
	try {
		path = projectRequire.resolve("typescript");
	} catch (error) {
		if (error.code !== "MODULE_NOT_FOUND") throw error;
		path = require.resolve("typescript");
	}
	const api = require(path);
	if (typeof api.createProgram === "function")
		return { ast: api, version: api.version, native: false };
	const metadataFile = projectRequire.resolve("typescript/package.json");
	const metadata = JSON.parse(readFileSync(metadataFile, "utf8"));
	if (!metadata.bin?.tsc)
		throw new Error("Installed TypeScript provides neither a compiler API nor a tsc command");
	return {
		ast: require("typescript"),
		version: metadata.version,
		native: true,
		bin: join(dirname(metadataFile), metadata.bin.tsc),
	};
}

export function hash(value) {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function finding(descriptor) {
	const { file, rule, identity, value, limit, message } = descriptor;
	return { id: hash([file, rule, identity]), file, rule, value, limit, message };
}

export function aggregate(findings) {
	const result = new Map();
	for (const item of findings) {
		const existing = result.get(item.id);
		if (existing) existing.value += item.value;
		else result.set(item.id, { ...item });
	}
	return [...result.values()].sort(
		(left, right) => left.file.localeCompare(right.file) || left.id.localeCompare(right.id),
	);
}

export function scopeIdentity(file, line, sourceLine) {
	const scope = file.functions
		.filter((fn) => fn.start <= line && fn.end >= line)
		.sort((left, right) => left.end - left.start - (right.end - right.start))[0];
	return [scope?.identity ?? ["<module>", 1], sourceLine.trim()];
}
