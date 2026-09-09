import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { json, save, saveJson, text } from "./files.mjs";

export function projectSlug(name) {
	if (typeof name !== "string" || !name.trim()) throw new Error("Project name cannot be empty");
	const normalized = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
	let slug = normalized
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!slug) slug = `app-${createHash("sha256").update(name).digest("hex").slice(0, 10)}`;
	if (slug.length > 58) {
		const hash = createHash("sha256").update(name).digest("hex").slice(0, 10);
		slug = `${slug.slice(0, 47).replace(/-+$/g, "")}-${hash}`;
	}
	return slug;
}

export function requireEmptyDestination(root) {
	let stat;
	try {
		stat = lstatSync(root);
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}
	if (!stat.isDirectory() || stat.isSymbolicLink() || readdirSync(root).length > 0) {
		throw new Error("create requires a new or empty directory; use adopt for existing projects");
	}
}

export function generationName(profile, root, name) {
	if (name !== undefined && (typeof name !== "string" || !name.trim())) {
		throw new Error("Project name cannot be empty");
	}
	return name !== undefined || profile.generator?.package.startsWith("create-cloudflare@")
		? projectSlug(name ?? basename(root))
		: basename(root);
}

function escapeHtml(value) {
	return value.replace(
		/[&<>"']/g,
		(character) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[character],
	);
}

function renameLockfile(root, slug) {
	if (!existsSync(join(root, "package-lock.json"))) return;
	const lock = json(root, "package-lock.json");
	lock.name = slug;
	if (lock.packages?.[""]) lock.packages[""].name = slug;
	saveJson(root, "package-lock.json", lock);
}

function renameWorkerConfig(root, filename, slug) {
	const config = text(root, filename);
	const renamed = config.replace(
		/("name"\s*:\s*)"[^"\r\n]*"/,
		(_, prefix) => `${prefix}${JSON.stringify(slug)}`,
	);
	if (renamed === config && !config.includes(`"name": ${JSON.stringify(slug)}`)) {
		throw new Error(
			`Pinned Workers AI template is missing its Worker name in ${filename}; nothing adopted`,
		);
	}
	save(root, filename, renamed);
}

export function applyProjectName(root, profile, slug, name) {
	if (name === undefined && profile.id !== "workers-ai") return;
	const pkg = json(root, "package.json");
	pkg.name = slug;
	if (name !== undefined && pkg.cloudflare) pkg.cloudflare.label = name;
	saveJson(root, "package.json", pkg);
	renameLockfile(root, slug);
	if (profile.id !== "workers-ai") return;
	renameWorkerConfig(root, "wrangler.jsonc", slug);
	if (existsSync(join(root, "wrangler.e2e.jsonc")))
		renameWorkerConfig(root, "wrangler.e2e.jsonc", `${slug}-e2e`);
	if (name !== undefined) {
		const html = text(root, "public/index.html");
		const display = escapeHtml(name);
		save(
			root,
			"public/index.html",
			html
				.replace("<title>LLM Chat App</title>", () => `<title>${display}</title>`)
				.replace("<h1>Cloudflare AI Chat</h1>", () => `<h1>${display}</h1>`),
		);
	}
}
