import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, relative } from "node:path";
import { readRegularFile, snapshot } from "./archive-inputs.mjs";
import { run } from "./process.mjs";

export { readRegularFile };

function digest(bytes) {
	return createHash("sha256").update(bytes).digest("hex");
}

function isPrivate(stat) {
	return !(process.getuid && stat.uid !== process.getuid()) && !(stat.mode & 0o077);
}

function ensureDirectory(path) {
	try {
		mkdirSync(path, { mode: 0o700 });
	} catch (error) {
		if (error.code !== "EEXIST") throw error;
	}
	const stat = lstatSync(path);
	if (!stat.isDirectory() || stat.isSymbolicLink())
		throw new Error(`Refusing unsafe cache directory: ${path}`);
	return stat;
}

function cacheDirectory(cacheHome) {
	const base = cacheHome ?? (process.env.XDG_CACHE_HOME || join(homedir(), ".cache"));
	if (!isAbsolute(base)) throw new Error("Engineering cache home must be an absolute path");
	const directory = join(base, "kadajett-engineering", "archives-v1");
	let current = parse(directory).root;
	for (const part of relative(current, directory).split(/[\\/]/)) {
		current = join(current, part);
		const stat = ensureDirectory(current);
		if ((current === dirname(directory) || current === directory) && !isPrivate(stat)) {
			throw new Error(
				`Engineering cache directory must be private and owned by the current user: ${current}`,
			);
		}
	}
	return directory;
}

function cacheEntryStat(entry) {
	let stat;
	try {
		stat = lstatSync(entry);
	} catch (error) {
		if (error.code === "ENOENT") return undefined;
		throw error;
	}
	if (!stat.isDirectory() || stat.isSymbolicLink())
		throw new Error(`Refusing unsafe cache entry: ${entry}`);
	if (!isPrivate(stat)) throw new Error(`Refusing non-private cache entry: ${entry}`);
	return stat;
}

function cachedBytes(entry, archiveName) {
	if (!cacheEntryStat(entry)) return undefined;
	try {
		const bytes = readRegularFile(join(entry, archiveName));
		const integrity = JSON.parse(readRegularFile(join(entry, "integrity.json")));
		if (integrity.sha256 === digest(bytes)) return bytes;
	} catch (error) {
		if (error.code && !["ENOENT", "ELOOP"].includes(error.code)) throw error;
	}
	// Leave damaged entries in place until a complete replacement is ready.
	return undefined;
}

function materializeSnapshot(source, inputs) {
	mkdirSync(source, { mode: 0o700 });
	for (const file of inputs) {
		const path = join(source, file.name);
		mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
		writeFileSync(path, file.bytes, { flag: "wx", mode: file.mode });
	}
}

function packSnapshot(temporary, inputs, archiveName, pack) {
	const source = join(temporary, "source");
	const publication = join(temporary, "entry");
	materializeSnapshot(source, inputs);
	mkdirSync(publication, { mode: 0o700 });
	const packed = JSON.parse(
		pack(["npm", "pack", source, "--json", "--ignore-scripts", "--pack-destination", publication], {
			capture: true,
		}),
	);
	if (packed.length !== 1 || packed[0].filename !== archiveName)
		throw new Error("Unexpected npm pack manifest");
	const bytes = readRegularFile(join(publication, archiveName));
	writeFileSync(join(publication, "integrity.json"), JSON.stringify({ sha256: digest(bytes) }), {
		flag: "wx",
		mode: 0o600,
	});
	return bytes;
}

function removeDamagedEntry(entry, temporary) {
	const damaged = join(temporary, "damaged");
	try {
		renameSync(entry, damaged);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	rmSync(damaged, { recursive: true, force: true });
}

function publishArchive(publication, entry, archiveName, bytes) {
	// A concurrent producer may have published first. Readers only see complete entries.
	for (;;) {
		try {
			renameSync(publication, entry);
			return bytes;
		} catch (error) {
			if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error;
		}
		const winner = cachedBytes(entry, archiveName);
		if (winner) return winner;
		removeDamagedEntry(entry, dirname(publication));
	}
}

export function cachedArchive(root, archiveName, { cacheHome, pack = run } = {}) {
	if (archiveName !== parse(archiveName).base || !archiveName.endsWith(".tgz"))
		throw new Error("Invalid engineering archive name");
	const { inputs, key } = snapshot(root);
	const cache = cacheDirectory(cacheHome);
	const entry = join(cache, key);
	const hit = cachedBytes(entry, archiveName);
	if (hit) return hit;
	const temporary = mkdtempSync(join(cache, ".pack-"));
	try {
		const bytes = packSnapshot(temporary, inputs, archiveName, pack);
		return publishArchive(join(temporary, "entry"), entry, archiveName, bytes);
	} finally {
		rmSync(temporary, { recursive: true, force: true });
	}
}
