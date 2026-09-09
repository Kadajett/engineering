import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { run, finding } from "./runtime.mjs";
import { isTest, safePath } from "./files.mjs";
import { metricSource } from "./metric-source.mjs";

const integer = z.number().int().nonnegative();
const fileSchema = z
	.object({
		path: z.string(),
		lines: integer,
		functions: z.array(
			z
				.object({
					identity: z.tuple([z.string(), integer.positive()]),
					start: integer.positive(),
					end: integer.positive(),
					cyclomatic: integer,
					nloc: integer,
					parameters: integer,
				})
				.strict(),
		),
	})
	.strict();

function hasLizard(python) {
	try {
		const result = run(python, [
			"-c",
			'import importlib.metadata; print(importlib.metadata.version("lizard"))',
		]);
		return result.status === 0 && result.stdout.trim() === "1.24.0";
	} catch (error) {
		if (error.cause?.code === "ENOENT") return false;
		throw error;
	}
}

function interpreter() {
	if (hasLizard("python3")) return "python3";
	let directory;
	try {
		directory = run("uv", ["tool", "dir"]);
	} catch (error) {
		throw new Error(
			"Lizard 1.24.0 is required: install Python + uv, then uv tool install lizard==1.24.0",
			{ cause: error },
		);
	}
	if (directory.status !== 0 || !directory.stdout.trim())
		throw new Error(`uv tool dir failed: ${directory.stderr}`);
	const base = join(directory.stdout.trim(), "lizard");
	const candidates = [join(base, "bin", "python"), join(base, "Scripts", "python.exe")];
	for (const python of candidates) if (hasLizard(python)) return python;
	throw new Error("Lizard 1.24.0 is required: uv tool install lizard==1.24.0");
}

export function collectMetrics(root, paths, ts) {
	for (const path of paths) safePath(root, path);
	const helper = fileURLToPath(new URL("./lizard_metrics.py", import.meta.url));
	const input = paths.map((path) => metricSource(ts, root, path));
	const result = run(interpreter(), [helper], { cwd: root, input: JSON.stringify(input) });
	if (result.status !== 0 || result.stderr.trim())
		throw new Error(`Lizard failed: ${result.stderr}`);
	const files = z.array(fileSchema).parse(JSON.parse(result.stdout));
	if (JSON.stringify(files.map((file) => file.path)) !== JSON.stringify(paths)) {
		throw new Error("Lizard returned an incomplete or reordered manifest");
	}
	return files;
}

function functionFindings(file, limits) {
	const rules = [
		["cyclomatic", limits.cyclomatic],
		["nloc", limits.functionLines],
		["parameters", limits.parameters],
	];
	const findings = [];
	for (const fn of file.functions) {
		for (const [metric, limit] of rules) {
			if (metric === "nloc" && isTest(file.path)) continue;
			if (fn[metric] <= limit) continue;
			findings.push(
				finding({
					file: file.path,
					rule: `lizard/${metric}`,
					identity: fn.identity,
					value: fn[metric],
					limit,
					message: `${file.path}:${fn.start}: ${fn.identity[0]} ${metric} ${fn[metric]} > ${limit}`,
				}),
			);
		}
	}
	return findings;
}

export function metricFindings(files, limits) {
	return files.flatMap((file) => {
		const limit = isTest(file.path) ? limits.testFileLines : limits.fileLines;
		const findings =
			file.lines > limit
				? [
						finding({
							file: file.path,
							rule: "file-lines",
							identity: [],
							value: file.lines,
							limit,
							message: `${file.path}: ${file.lines} lines > ${limit}`,
						}),
					]
				: [];
		return [...findings, ...functionFindings(file, limits)];
	});
}
