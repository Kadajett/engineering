import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cachedArchive, readRegularFile } from "./archive-cache.mjs";
import { safePath } from "./files.mjs";

export const packageRoot = fileURLToPath(new URL("../", import.meta.url));
export const packageManifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
export const archiveName = `kadajett-engineering-${packageManifest.version}.tgz`;
export const dependencySpec = `file:.engineering/vendor/${archiveName}`;

export function packInto(root) {
	const target = safePath(root, `.engineering/vendor/${archiveName}`);
	const bytes = cachedArchive(packageRoot, archiveName);
	function checkExisting() {
		try {
			if (!readRegularFile(target).equals(bytes)) {
				throw new Error(
					"This package version has different content; bump the engineering package version before upgrading",
				);
			}
			return true;
		} catch (error) {
			if (error.code === "ENOENT") return false;
			throw error;
		}
	}
	if (checkExisting()) return;
	mkdirSync(dirname(target), { recursive: true });
	const temporary = mkdtempSync(join(dirname(target), ".engineering-pack-"));
	try {
		const source = join(temporary, archiveName);
		writeFileSync(source, bytes, { flag: "wx", mode: 0o644 });
		try {
			// Publish without replacing another adopter's archive or exposing partial bytes.
			linkSync(source, safePath(root, `.engineering/vendor/${archiveName}`));
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
			if (!checkExisting()) throw error;
		}
	} finally {
		rmSync(temporary, { recursive: true, force: true });
	}
}
