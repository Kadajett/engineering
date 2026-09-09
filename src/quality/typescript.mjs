import { lstatSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { inside, safePath } from "./files.mjs";
import { aggregate, finding, hash } from "./runtime.mjs";

function fail(ts, diagnostics) {
	if (!diagnostics.length) return;
	throw new Error(
		ts.formatDiagnostics(diagnostics, {
			getCanonicalFileName: (file) => file,
			getCurrentDirectory: () => process.cwd(),
			getNewLine: () => "\n",
		}),
	);
}

function dependency(path) {
	return path.split(/[\\/]/).includes("node_modules");
}

function guardedSystem(ts, root) {
	const library = dirname(ts.getDefaultLibFilePath({}));
	const permitted = (path) => {
		const absolute = resolve(path);
		if (dependency(absolute) || absolute.startsWith(`${library}${sep}`)) return true;
		const name = relative(root, absolute);
		if (name === ".." || name.startsWith(`..${sep}`) || isAbsolute(name)) return false;
		safePath(root, absolute, true);
		return true;
	};
	const entries = (directory) => {
		if (!permitted(directory)) return { files: [], directories: [] };
		const files = [],
			directories = [];
		try {
			for (const entry of readdirSync(directory, { withFileTypes: true })) {
				if (entry.isFile()) files.push(entry.name);
				else if (entry.isDirectory()) directories.push(entry.name);
			}
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
		return { files, directories };
	};
	return {
		...ts.sys,
		getCurrentDirectory: () => root,
		fileExists: (path) => permitted(path) && ts.sys.fileExists(path),
		readFile: (path) => (permitted(path) ? ts.sys.readFile(path) : undefined),
		directoryExists: (path) => permitted(path) && ts.sys.directoryExists(path),
		getDirectories: (path) =>
			dependency(path)
				? ts.sys.getDirectories(path)
				: entries(path).directories.map((name) => join(path, name)),
		readDirectory: (...args) => {
			const [path, extensions, excludes, includes, depth] = args;
			return ts.matchFiles(
				path,
				extensions,
				excludes,
				includes,
				ts.sys.useCaseSensitiveFileNames,
				root,
				depth,
				entries,
				(value) => value,
			);
		},
		onUnRecoverableConfigFileDiagnostic: (diagnostic) => fail(ts, [diagnostic]),
	};
}

function configPath(root, path) {
	const absolute = safePath(root, path);
	return lstatSync(absolute).isDirectory()
		? safePath(root, join(absolute, "tsconfig.json"))
		: absolute;
}

export function readProjects(ts, root, config, inventory) {
	const candidates = config.typescript.projects.length
		? config.typescript.projects
		: inventory.filter((path) => /(?:^|\/)tsconfig(?:[.-][^/]*)?\.json$/.test(path));
	const projects = new Map();
	const extended = new Set(),
		referenced = new Set();
	const system = guardedSystem(ts, root);
	const visit = (path) => {
		const absolute = configPath(root, path);
		if (projects.has(absolute)) return;
		const parsed = ts.getParsedCommandLineOfConfigFile(absolute, {}, system);
		if (!parsed) throw new Error(`Cannot parse TypeScript project: ${absolute}`);
		projects.set(absolute, { path: absolute, ...parsed });
		for (const path of parsed.options.configFile?.extendedSourceFiles ?? [])
			extended.add(resolve(path));
		for (const reference of parsed.projectReferences ?? []) {
			referenced.add(configPath(root, reference.path));
			visit(reference.path);
		}
	};
	for (const path of candidates) visit(path);
	const selected = [...projects.values()].filter(
		(project) =>
			config.typescript.projects.length ||
			!extended.has(project.path) ||
			referenced.has(project.path) ||
			project.path.endsWith(`${sep}tsconfig.json`),
	);
	for (const project of selected) fail(ts, project.errors);
	return { projects: selected, system };
}

function strictOptions(ts, original) {
	const requested = {
		strict: true,
		noUncheckedIndexedAccess: true,
		exactOptionalPropertyTypes: true,
		noImplicitReturns: true,
		noImplicitOverride: true,
		noFallthroughCasesInSwitch: true,
		useUnknownInCatchVariables: true,
		noPropertyAccessFromIndexSignature: true,
		noUncheckedSideEffectImports: true,
		forceConsistentCasingInFileNames: true,
		allowUnreachableCode: false,
		allowUnusedLabels: false,
		noCheck: false,
	};
	// Explicit false strict subflags in a project's config must not defeat strict:true.
	for (const option of ts.optionDeclarations) {
		if (option.strictFlag) requested[option.name] = true;
	}
	const supported = new Set(ts.optionDeclarations.map((option) => option.name));
	const additional = Object.fromEntries(
		Object.entries(requested).filter(([key]) => supported.has(key)),
	);
	return { ...original, ...additional, noEmit: true };
}

function programFor(ts, project, options, system) {
	const host = ts.createCompilerHost(options);
	for (const key of [
		"fileExists",
		"readFile",
		"directoryExists",
		"getDirectories",
		"readDirectory",
		"getCurrentDirectory",
	]) {
		host[key] = system[key];
	}
	host.getSourceFile = (fileName, languageVersion, onError) => {
		const text = system.readFile(fileName);
		if (text === undefined) {
			onError?.(`Unable to read ${fileName}`);
			return undefined;
		}
		return ts.createSourceFile(fileName, text, languageVersion, true);
	};
	// Source redirects check referenced source without requiring tsc -b artifacts or writes.
	host.useSourceOfProjectReferenceRedirect = () => true;
	return ts.createProgram({
		rootNames: project.fileNames,
		options,
		projectReferences: project.projectReferences,
		host,
	});
}

function strictFinding(ts, root, project, diagnostic) {
	const { file, start, length = 0 } = diagnostic;
	if (!file || start === undefined) {
		fail(ts, [diagnostic]);
	}
	const path = inside(root, file.fileName);
	const line = file.getLineAndCharacterOfPosition(start).line;
	const lines = file.text.split(/\r?\n/);
	const message = ts
		.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
		.split(`${root}${sep}`)
		.join("");
	const identity = [
		inside(root, project.path),
		diagnostic.code,
		message,
		lines[line].trim(),
		file.text.slice(start, start + length),
	];
	return finding({
		file: path,
		rule: `typescript/TS${diagnostic.code}`,
		identity,
		value: 1,
		limit: 0,
		message: `${path}:${line + 1}: TS${diagnostic.code}: ${message}`,
	});
}

export function strictFindings(ts, root, settings) {
	const findings = [];
	for (const project of settings.projects) {
		if (!project.fileNames.length && project.projectReferences?.length) continue;
		const base = programFor(ts, project, { ...project.options, noEmit: true }, settings.system);
		// Existing compiler errors are not quality debt: dependencies/configuration must work first.
		fail(ts, ts.getPreEmitDiagnostics(base));
		const strict = programFor(ts, project, strictOptions(ts, project.options), settings.system);
		fail(ts, [
			...strict.getConfigFileParsingDiagnostics(),
			...strict.getOptionsDiagnostics(),
			...strict.getGlobalDiagnostics(),
			...strict.getSyntacticDiagnostics(),
		]);
		for (const diagnostic of strict.getSemanticDiagnostics()) {
			if (!diagnostic.file || dependency(diagnostic.file.fileName)) fail(ts, [diagnostic]);
			findings.push(strictFinding(ts, root, project, diagnostic));
		}
	}
	return aggregate(findings);
}

function portable(value, root) {
	if (typeof value === "string")
		return value === root ? "<root>" : value.split(root + sep).join("<root>/");
	if (Array.isArray(value)) return value.map((item) => portable(item, root));
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value)
				.filter(([key]) => key !== "configFile")
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, item]) => [key, portable(item, root)]),
		);
	return value;
}

export function projectFingerprint(settings, root) {
	return hash(
		settings.projects
			.map((project) => ({
				path: inside(root, project.path),
				options: portable(project.options, root),
				raw: portable(project.raw, root),
				references:
					project.projectReferences?.map((reference) => inside(root, reference.path)) ?? [],
			}))
			.sort((left, right) => left.path.localeCompare(right.path)),
	);
}

export function projectForFile(settings, root, file) {
	const absolute = resolve(root, file);
	return settings.projects.find((project) => project.fileNames.includes(absolute));
}
