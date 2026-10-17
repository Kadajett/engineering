// A short, bounded picture of an existing project for the grilling agent: its layout, package
// manifest, and the start of its README and agent instructions.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SKIP = new Set([
	".git",
	"node_modules",
	"dist",
	"build",
	".next",
	".beads",
	"graphify-out",
	"coverage",
]);
const MAX_ENTRIES = 150;

function listing(root) {
	const lines = [];
	const walk = (dir, prefix, depth) => {
		for (const name of readdirSync(dir).sort()) {
			if (SKIP.has(name) || lines.length >= MAX_ENTRIES) continue;
			const isDir = statSync(join(dir, name)).isDirectory();
			lines.push(`${prefix}${name}${isDir ? "/" : ""}`);
			if (isDir && depth < 2) walk(join(dir, name), `${prefix}  `, depth + 1);
		}
	};
	walk(root, "", 1);
	return lines.join("\n");
}

function head(path, lines = 40) {
	return existsSync(path)
		? readFileSync(path, "utf8").split("\n").slice(0, lines).join("\n")
		: null;
}

function manifest(root) {
	const path = join(root, "package.json");
	if (!existsSync(path)) return null;
	const pkg = JSON.parse(readFileSync(path, "utf8"));
	return JSON.stringify(
		{
			name: pkg.name,
			scripts: pkg.scripts,
			dependencies: Object.keys(pkg.dependencies ?? {}),
			devDependencies: Object.keys(pkg.devDependencies ?? {}),
		},
		null,
		2,
	);
}

export function projectContext(root) {
	const parts = [`Files (two levels):\n${listing(root)}`];
	const pkg = manifest(root);
	if (pkg) parts.push(`package.json:\n${pkg}`);
	for (const file of ["README.md", "AGENTS.md"]) {
		const text = head(join(root, file));
		if (text) parts.push(`${file} (start):\n${text}`);
	}
	return parts.join("\n\n");
}
