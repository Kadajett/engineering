import { existsSync } from "node:fs";
import { join } from "node:path";
import { available, run } from "./process.mjs";

const locks = {
	npm: ["package-lock.json", "npm-shrinkwrap.json"],
	pnpm: ["pnpm-lock.yaml"],
	yarn: ["yarn.lock"],
	bun: ["bun.lock", "bun.lockb"],
};

function validateManager(name) {
	if (name && !Object.hasOwn(locks, name)) throw new Error(`Unsupported package manager: ${name}`);
}

function lockedManager(root) {
	const found = Object.entries(locks)
		.filter(([, files]) => files.some((file) => existsSync(join(root, file))))
		.map(([name]) => name);
	if (found.length > 1)
		throw new Error(
			`Conflicting lockfiles (${found.join(", ")}); resolve explicitly before adoption`,
		);
	return found[0];
}

function existingManager(root, manifest) {
	const declared = manifest.packageManager?.split("@")[0];
	validateManager(declared);
	const locked = lockedManager(root);
	if (declared && locked && declared !== locked)
		throw new Error("packageManager and lockfile disagree");
	return declared ?? locked;
}

export function selectManager(root, manifest, requested) {
	validateManager(requested);
	const existing = existingManager(root, manifest);
	if (existing && requested && existing !== requested)
		throw new Error(`Preserving ${existing}; --manager ${requested} would migrate this project`);
	const name = existing ?? requested ?? "npm";
	if (!available(name))
		throw new Error(`Install the project's package manager (${name}) before adoption`);
	const version = run([name, "--version"], { capture: true });
	if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version))
		throw new Error(`Unexpected ${name} version: ${version}`);
	return { name, version };
}

export function installDependencies(root, manager) {
	const args = manager.name === "npm" ? ["install", "--no-audit", "--no-fund"] : ["install"];
	run([manager.name, ...args], { cwd: root });
}

export function ciInstall(manager) {
	if (manager.name === "npm") return "npm ci";
	if (manager.name === "bun") return "bun install --frozen-lockfile";
	if (manager.name === "pnpm") return "pnpm install --frozen-lockfile";
	return Number(manager.version.split(".")[0]) >= 2
		? "yarn install --immutable"
		: "yarn install --frozen-lockfile";
}
