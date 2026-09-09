import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { readRegularFile } from "../archive-inputs.mjs";
import { cacheHome, checkCacheParents, publish, sourceFiles } from "./cache-storage.mjs";
import { assertContained, safeParents, stat, validateSkill, validateTree } from "./safety.mjs";

function localDigest(source) {
	validateTree(source);
	const hash = createHash("sha256");
	for (const name of sourceFiles(source, "", true)) {
		const path = join(source, name);
		const entry = stat(path);
		const mode = entry.isDirectory()
			? "directory"
			: entry.isSymbolicLink()
				? "link"
				: entry.mode & 0o111
					? "executable"
					: "file";
		const bytes = entry.isDirectory()
			? Buffer.alloc(0)
			: entry.isSymbolicLink()
				? Buffer.from(relative(dirname(path), realpathSync(path)))
				: readRegularFile(path);
		hash.update(JSON.stringify([name, mode, bytes.length])).update(bytes);
	}
	return hash.digest("hex");
}

export function cachedLocalSkill(selection, digest) {
	if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid local skill cache digest");
	const entry = join(cacheHome(), `local-${digest}`);
	checkCacheParents(entry);
	if (!stat(entry)) return undefined;
	const source = join(entry, "source");
	safeParents(source);
	validateSkill(source, selection.name);
	if (localDigest(source) !== digest)
		throw new Error(`Modified local skill cache content: ${entry}`);
	return source;
}

function copyLocalSnapshot(source, destination) {
	mkdirSync(destination, { mode: 0o700 });
	for (const name of sourceFiles(source, "", true)) {
		const from = join(source, name);
		const to = join(destination, name);
		safeParents(dirname(to), true);
		const info = stat(from);
		if (info.isDirectory()) {
			safeParents(to, true);
		} else if (info.isSymbolicLink()) {
			const target = realpathSync(from);
			assertContained(source, target);
			symlinkSync(relative(dirname(from), target), to);
		} else {
			copyFileSync(from, to);
			chmodSync(to, info.mode & 0o111 ? 0o700 : 0o600);
		}
	}
}

export function materializeLocalSkill(selection, source, dryRun = false) {
	validateSkill(source, selection.name);
	const digest = localDigest(source);
	const entry = join(cacheHome(), `local-${digest}`);
	const cached = cachedLocalSkill(selection, digest);
	if (!cached && !dryRun) {
		publish(entry, (temporary) => {
			const destination = join(temporary, "source");
			copyLocalSnapshot(source, destination);
			if (localDigest(destination) !== digest)
				throw new Error("Local skill changed while being cached");
		});
	}
	return {
		source: dryRun ? join(entry, "source") : cachedLocalSkill(selection, digest),
		localDigest: digest,
	};
}
