import { run } from "./runtime.mjs";

export function compilerCommand(compiler, root, args) {
	const result = run(
		process.execPath,
		[compiler.bin, "--pretty", "false", "--locale", "en", ...args],
		{ cwd: root },
	);
	if (result.status === null)
		throw new Error("Native TypeScript terminated without an exit status");
	return result;
}

export function compilerJson(compiler, root, args) {
	const result = compilerCommand(compiler, root, args);
	if (result.status !== 0) throw new Error(result.stdout + result.stderr);
	return JSON.parse(result.stdout);
}

export function strictArguments(compiler, root) {
	const result = compilerCommand(compiler, root, ["--help", "--all"]);
	if (result.status !== 0) throw new Error("Cannot inspect native TypeScript options");
	const supported = new Set(
		[...result.stdout.matchAll(/^--([A-Za-z]\w*)/gm)].map((match) => match[1]),
	);
	const enabled = [
		"strict",
		"noUncheckedIndexedAccess",
		"exactOptionalPropertyTypes",
		"noImplicitReturns",
		"noImplicitOverride",
		"noFallthroughCasesInSwitch",
		"noPropertyAccessFromIndexSignature",
		"noUncheckedSideEffectImports",
		"forceConsistentCasingInFileNames",
		...compiler.ast.optionDeclarations
			.filter((option) => option.strictFlag)
			.map((option) => option.name),
	];
	const disabled = ["allowUnreachableCode", "allowUnusedLabels", "noCheck"];
	return [...new Set(enabled)]
		.filter((name) => supported.has(name))
		.flatMap((name) => [`--${name}`, "true"])
		.concat(
			disabled.filter((name) => supported.has(name)).flatMap((name) => [`--${name}`, "false"]),
		);
}

export function checkArguments(project, temporary) {
	const options = project.raw.compilerOptions;
	if (options.generateTrace || options.generateCpuProfile) {
		throw new Error("Disable TypeScript profiling output before the read-only engineering check");
	}
	const args = [
		"--project",
		project.path,
		"--noEmit",
		"true",
		"--diagnostics",
		"false",
		"--extendedDiagnostics",
		"false",
		"--listFiles",
		"false",
		"--listEmittedFiles",
		"false",
		"--traceResolution",
		"false",
	];
	if (options.incremental || options.composite) args.push("--tsBuildInfoFile", temporary);
	return args;
}
