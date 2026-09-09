import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { safePath } from "./files.mjs";
import { compilerJson } from "./native-command.mjs";

function configPath(root, name) {
	const path = safePath(root, name);
	return lstatSync(path).isDirectory() ? safePath(root, join(path, "tsconfig.json")) : path;
}

function rawConfig(ts, path) {
	const parsed = ts.parseConfigFileTextToJson(path, readFileSync(path, "utf8"));
	if (parsed.error) throw new Error(`Invalid JSONC TypeScript configuration: ${path}`);
	return parsed.config;
}

function extendedPaths(root, path, raw) {
	const values = Array.isArray(raw.extends) ? raw.extends : [raw.extends];
	const paths = [];
	for (const value of values) {
		if (typeof value !== "string") continue;
		if (!value.startsWith(".") && !isAbsolute(value)) continue;
		const candidate = resolve(dirname(path), value);
		paths.push(safePath(root, existsSync(candidate) ? candidate : `${candidate}.json`));
	}
	return paths;
}

function resolvedProject(context, path, raw) {
	const { compiler, root, ts } = context;
	const shown = compilerJson(compiler, root, ["--showConfig", "--project", path]);
	const names = new Set(ts.optionDeclarations.map((option) => option.name));
	const supported = Object.fromEntries(
		Object.entries(shown.compilerOptions ?? {}).filter(([name]) => names.has(name)),
	);
	const options = ts.convertCompilerOptionsFromJson(supported, dirname(path)).options;
	const fileNames = (shown.files ?? []).map((file) => safePath(root, resolve(dirname(path), file)));
	const projectReferences = (shown.references ?? []).map((reference) => ({
		path: configPath(root, resolve(dirname(path), reference.path)),
	}));
	// Expanded source lists change as files are added; keep policy globs/declared files,
	// not the expanded list, in the configuration fingerprint.
	return {
		path,
		fileNames,
		options,
		projectReferences,
		raw: {
			compilerOptions: shown.compilerOptions ?? {},
			include: shown.include,
			exclude: shown.exclude,
			files: raw.files,
		},
	};
}

export function readNativeProjects(context) {
	const { ts, root, config, paths } = context;
	const candidates = config.typescript.projects.length
		? config.typescript.projects
		: paths.filter((path) => /(?:^|\/)tsconfig(?:[.-][^/]*)?\.json$/.test(path));
	const raw = new Map(),
		extended = new Set(),
		referenced = new Set();
	const collect = (name) => {
		const path = configPath(root, name);
		if (raw.has(path)) return;
		const value = rawConfig(ts, path);
		raw.set(path, value);
		for (const base of extendedPaths(root, path, value)) {
			extended.add(base);
			collect(base);
		}
		for (const reference of value.references ?? []) {
			const target = configPath(root, resolve(dirname(path), reference.path));
			referenced.add(target);
			collect(target);
		}
	};
	for (const candidate of candidates) collect(candidate);
	const explicit = new Set(config.typescript.projects.map((path) => configPath(root, path)));
	const selected = [...raw].filter(
		([path]) => explicit.has(path) || referenced.has(path) || !extended.has(path),
	);
	return {
		projects: selected.map(([path, value]) => resolvedProject(context, path, value)),
		system: ts.sys,
	};
}
