import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { inside, safePath } from "./files.mjs";
import { aggregate, finding } from "./runtime.mjs";
import { checkArguments, compilerCommand, strictArguments } from "./native-command.mjs";

function diagnostics(output) {
	const results = [];
	for (const line of output.split(/\r?\n/)) {
		if (!line.trim()) continue;
		const match = /^(.*?)\((\d+),(\d+)\): error TS(\d+): (.*)$/.exec(line);
		if (match) {
			results.push({
				path: match[1],
				line: Number(match[2]),
				column: Number(match[3]),
				code: Number(match[4]),
				message: match[5],
			});
		} else if (results.length && /^\s/.test(line)) {
			results.at(-1).message += `\n${line}`;
		} else throw new Error(`Unrecognized/global native TypeScript diagnostic: ${line}`);
	}
	if (!results.length) throw new Error("Native TypeScript failed without source diagnostics");
	return results;
}

function sourceLine(context, item) {
	const file = inside(context.root, item.path);
	if (file.split("/").includes("node_modules"))
		throw new Error(`Dependency diagnostic cannot be baselined: ${file}`);
	if (!context.sources.has(file))
		context.sources.set(file, readFileSync(safePath(context.root, file), "utf8").split(/\r?\n/));
	const line = context.sources.get(file)[item.line - 1];
	if (line === undefined || item.column < 1 || item.column > line.length + 1)
		throw new Error(`Invalid native diagnostic location: ${file}`);
	return { file, line };
}

function nativeFinding(context, project, item) {
	if (item.code < 2000 || (item.code >= 5000 && item.code < 7000))
		throw new Error(`Native compiler syntax/configuration error: ${item.message}`);
	const { file, line } = sourceLine(context, item);
	const message = item.message.split(context.root + sep).join("");
	const identity = [
		inside(context.root, project.path),
		item.code,
		message,
		line.trim(),
		item.column,
	];
	return finding({
		file,
		rule: `typescript/TS${item.code}`,
		identity,
		value: 1,
		limit: 0,
		message: `${file}:${item.line}: TS${item.code}: ${message}`,
	});
}

function projectFindings(context, project, index) {
	if (!project.fileNames.length && project.projectReferences.length) return [];
	const args = checkArguments(project, join(context.temporary, `project-${index}.tsbuildinfo`));
	const original = compilerCommand(context.compiler, context.root, args);
	if (original.status !== 0)
		throw new Error(
			`Original native TypeScript check failed. Prepare framework/reference outputs with its native build first.\n${original.stdout}${original.stderr}`,
		);
	const strict = compilerCommand(context.compiler, context.root, [...args, ...context.strict]);
	if (strict.status === 0) return [];
	if (strict.status !== 1 && strict.status !== 2)
		throw new Error(`Native compiler failed: ${strict.stderr}`);
	return diagnostics(strict.stdout).map((item) => nativeFinding(context, project, item));
}

export function nativeStrictFindings(root, settings, compiler) {
	if (!settings.projects.length) return [];
	const temporary = mkdtempSync(join(tmpdir(), "engineering-tsc-"));
	try {
		const context = {
			root,
			compiler,
			temporary,
			sources: new Map(),
			strict: strictArguments(compiler, root),
		};
		return aggregate(
			settings.projects.flatMap((project, index) => projectFindings(context, project, index)),
		);
	} finally {
		rmSync(temporary, { recursive: true, force: true });
	}
}
