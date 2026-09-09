import { realpathSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { z } from "zod";
import { readRegularFile } from "../archive-inputs.mjs";
import { exclusions, inventory, safePath } from "../quality/files.mjs";
import { directPackages } from "./catalog.mjs";
import { localSkillRoots, projectSkillDirectories } from "./discovery.mjs";
import { stat } from "./safety.mjs";

const dependencies = z.record(z.string(), z.string()).optional();
const manifestSchema = z
	.object({
		dependencies,
		devDependencies: dependencies,
		optionalDependencies: dependencies,
		peerDependencies: dependencies,
	})
	.passthrough();
const profileSchema = z.string().trim().min(1);
const storedSchema = z.object({ profile: profileSchema.optional() }).passthrough();
const excluded = [
	...exclusions,
	"target",
	"out",
	"__pycache__",
	".venv",
	"venv",
	"env",
	".tox",
	".nox",
	".pytest_cache",
	".mypy_cache",
	".ruff_cache",
	".gradle",
	".idea",
	".yarn",
	".pnpm-store",
	"bower_components",
	"Pods",
	".build",
	"obj",
	"*.gen.*",
	"*.min.js",
];
const extensionLanguages = new Map(
	Object.entries({
		js: "javascript",
		jsx: "javascript",
		mjs: "javascript",
		cjs: "javascript",
		ts: "typescript",
		tsx: "typescript",
		mts: "typescript",
		cts: "typescript",
		py: "python",
		pyi: "python",
		rs: "rust",
		go: "go",
		java: "java",
		kt: "kotlin",
		kts: "kotlin",
		swift: "swift",
		c: "c",
		h: "c",
		cc: "cpp",
		cpp: "cpp",
		cxx: "cpp",
		hpp: "cpp",
		cs: "csharp",
		fs: "fsharp",
		fsx: "fsharp",
		rb: "ruby",
		php: "php",
		ex: "elixir",
		exs: "elixir",
		erl: "erlang",
		hrl: "erlang",
		dart: "dart",
		lua: "lua",
		zig: "zig",
		scala: "scala",
		sc: "scala",
		sh: "shell",
		bash: "shell",
		zsh: "shell",
		r: "r",
		jl: "julia",
		vue: "vue",
		svelte: "svelte",
	}),
);
const manifestLanguages = new Map(
	Object.entries({
		"pyproject.toml": "python",
		"requirements.txt": "python",
		"setup.py": "python",
		"setup.cfg": "python",
		Pipfile: "python",
		"Cargo.toml": "rust",
		"go.mod": "go",
		Gemfile: "ruby",
		"composer.json": "php",
		"mix.exs": "elixir",
		"pubspec.yaml": "dart",
		"Package.swift": "swift",
		"build.sbt": "scala",
		"Project.toml": "julia",
	}),
);

function readMetadata(root, name, schema) {
	const path = safePath(root, name, true);
	if (!stat(path)) return {};
	try {
		return schema.parse(JSON.parse(readRegularFile(path).toString("utf8")));
	} catch (error) {
		throw new Error(
			`Cannot read recommendation metadata ${path}: ${error.message}; review this file.`,
			{
				cause: error,
			},
		);
	}
}

function selectedProfile(root, explicit) {
	if (explicit !== undefined) return profileSchema.parse(explicit);
	const skills = readMetadata(root, ".engineering/skills.json", storedSchema);
	if (skills.profile !== undefined) return skills.profile;
	return readMetadata(root, ".engineering/state.json", storedSchema).profile ?? "generic";
}

function rootLanguage(name) {
	if (/^tsconfig(?:\.[^.]+)*\.json$/.test(name)) return "typescript";
	if (/\.csproj$/.test(name)) return "csharp";
	if (/\.fsproj$/.test(name)) return "fsharp";
	return manifestLanguages.get(name);
}

function sourceLanguages(root) {
	const languages = new Set();
	for (const name of inventory(root, { exclude: excluded })) {
		const language = extensionLanguages.get(extname(name).slice(1).toLowerCase());
		if (language) languages.add(language);
		const conventional = name.includes("/") ? undefined : rootLanguage(name);
		if (conventional) languages.add(conventional);
	}
	return [...languages].sort();
}

export function recommendationContext(directory, profile) {
	const requested = resolve(directory);
	let root;
	try {
		root = realpathSync(requested);
		if (!statSync(root).isDirectory()) throw new Error("Expected a directory");
	} catch (error) {
		throw new Error(
			`recommend requires an existing readable directory: ${requested} (${error.message})`,
			{
				cause: error,
			},
		);
	}
	const manifest = readMetadata(root, "package.json", manifestSchema);
	return {
		root,
		manifest,
		profile: selectedProfile(root, profile),
		languages: sourceLanguages(root),
		packages: directPackages(manifest),
	};
}

export function recommendationRoots(root) {
	return [
		...new Set([
			...projectSkillDirectories.map((directory) => join(root, directory)),
			...localSkillRoots(),
		]),
	];
}

function sourceDirectory(source) {
	const path =
		/^https:\/\/(?:github\.com\/[^/]+\/[^/]+\/blob|raw\.githubusercontent\.com\/[^/]+\/[^/]+)\/[a-f0-9]{40}\/(.+)\/SKILL\.md(?:[?#].*)?$/i.exec(
			source,
		)?.[1];
	if (!path) return undefined;
	try {
		const parts = path.split("/").map((part) => decodeURIComponent(part));
		if (parts.some((part) => !part || part === "." || part === ".." || /[\\/\x00-\x1f]/.test(part)))
			return undefined;
		return parts.join("/");
	} catch (error) {
		if (error instanceof URIError) return undefined;
		throw error;
	}
}

function matchingFrontmatter(text, name) {
	const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1];
	const names = frontmatter?.match(/^name:\s*([^\r\n]+)$/gm) ?? [];
	const value = names[0]
		?.slice(5)
		.trim()
		.replace(/\s+#.*$/, "")
		.replace(/^(['"])(.*)\1$/, "$2");
	return names.length === 1 && value === name && /^description:\s*\S/m.test(frontmatter);
}

function namedSkill(candidate, name) {
	try {
		const actual = realpathSync(candidate);
		if (!statSync(actual).isDirectory()) return false;
		const file = join(actual, "SKILL.md");
		if (!stat(file)?.isFile()) return false;
		return matchingFrontmatter(readRegularFile(file).toString("utf8"), name);
	} catch (error) {
		if (["ENOENT", "ENOTDIR", "ELOOP"].includes(error.code)) return false;
		throw error;
	}
}

export function installedRecommendation(skill, roots) {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name))
		throw new Error(`Invalid recommendation skill name: ${skill.name}`);
	const source = sourceDirectory(skill.source);
	const paths = new Set([skill.name, `skills/${skill.name}`]);
	if (source) paths.add(source);
	for (const root of roots) {
		for (const path of paths) {
			if (namedSkill(join(root, path), skill.name)) return true;
		}
	}
	return false;
}
