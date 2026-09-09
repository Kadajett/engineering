import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { json, safePath, saveJson } from "./files.mjs";
import { installDependencies } from "./managers.mjs";
import { packageManifest } from "./package-install.mjs";

const lockfiles = [
	"package-lock.json",
	"npm-shrinkwrap.json",
	"pnpm-lock.yaml",
	"yarn.lock",
	"bun.lock",
	"bun.lockb",
];

function fingerprint(root, manager) {
	const hash = createHash("sha256").update(JSON.stringify(manager));
	for (const name of ["package.json", ...lockfiles]) {
		const path = safePath(root, name);
		const bytes = existsSync(path) ? readFileSync(path) : null;
		hash.update(JSON.stringify([name, bytes?.length ?? null]));
		if (bytes) hash.update(bytes);
	}
	return hash.digest("hex");
}

function installed(root, manifest) {
	const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
	if (names.some((name) => !existsSync(join(root, "node_modules", name, "package.json"))))
		return false;
	try {
		const path = join(root, "node_modules", packageManifest.name, "package.json");
		return JSON.parse(readFileSync(path, "utf8")).version === packageManifest.version;
	} catch {
		return false;
	}
}

export function installProject(root, manager) {
	const state = json(root, ".engineering/state.json");
	const current = fingerprint(root, manager);
	if (state.installFingerprint === current && installed(root, json(root, "package.json"))) {
		console.log("Dependencies unchanged; retaining installed packages.");
		return;
	}
	installDependencies(root, manager);
	saveJson(root, ".engineering/state.json", {
		...state,
		installFingerprint: fingerprint(root, manager),
	});
}
