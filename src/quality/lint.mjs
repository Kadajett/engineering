import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { inside, safePath } from "./files.mjs";
import { aggregate, finding, packageInfo, run, scopeIdentity } from "./runtime.mjs";
import { analyzerPath, snapshotSources } from "./snapshot.mjs";

const codes = [
	"eslint(max-depth)",
	"eslint(no-param-reassign)",
	"typescript-eslint(no-explicit-any)",
	"typescript-eslint(no-non-null-assertion)",
];
const span = z.object({
	offset: z.number().int().nonnegative(),
	length: z.number().int().nonnegative(),
	line: z.number().int().positive(),
});
const oxReport = z.object({
	diagnostics: z.array(
		z.object({
			code: z.enum(codes),
			message: z.string(),
			filename: z.string(),
			labels: z.array(z.object({ span })).min(1),
		}),
	),
	number_of_files: z.number().int().nonnegative(),
	number_of_rules: z.literal(4),
});
const bioReport = z.object({
	summary: z.object({
		skipped: z.literal(0),
		diagnosticsNotPrinted: z.literal(0),
		changed: z.number().int(),
		unchanged: z.number().int(),
	}),
	diagnostics: z.array(
		z.object({
			category: z.literal("lint/complexity/noExcessiveCognitiveComplexity"),
			message: z.string(),
			location: z.object({
				path: z.string(),
				start: z.object({ line: z.number().int().positive(), column: z.number().int().positive() }),
			}),
		}),
	),
});

function configuration(name) {
	return JSON.parse(readFileSync(new URL(`../../configs/${name}.json`, import.meta.url), "utf8"));
}

function checkedRun(name, args, cwd) {
	const result = run(process.execPath, [packageInfo(name).bin, ...args], { cwd });
	if (result.status !== 0 && result.status !== 1)
		throw new Error(`${name} failed (${result.status}): ${result.stderr}`);
	let report;
	try {
		report = JSON.parse(result.stdout);
	} catch (error) {
		throw new Error(`${name} returned invalid JSON: ${result.stderr}`, { cause: error });
	}
	if (result.status === 1 && !report.diagnostics?.length)
		throw new Error(`${name} failed without diagnostics: ${result.stderr}`);
	return report;
}

function context(root, files) {
	const contexts = new Map(
		files.map((file) => {
			const source = readFileSync(safePath(root, file.path), "utf8");
			return [analyzerPath(file.path), { file, source, lines: source.split(/\r?\n/) }];
		}),
	);
	if (contexts.size !== files.length) throw new Error("Analyzer snapshot paths collide");
	return contexts;
}

function location(contexts, file, line) {
	const data = contexts.get(file);
	if (!data || !data.lines[line - 1])
		throw new Error(`Analyzer returned an invalid location: ${file}:${line}`);
	return scopeIdentity(data.file, line, data.lines[line - 1]);
}

function lintFinding(diagnostic, root, contexts, limits) {
	const analyzed = inside(root, diagnostic.filename);
	const line = diagnostic.labels[0].span.line;
	const identity = location(contexts, analyzed, line);
	const file = contexts.get(analyzed).file.path;
	const depth = diagnostic.code === codes[0];
	const value = depth
		? Number(
				diagnostic.message.match(/\((\d+)\)/)?.[1] ??
					diagnostic.message.match(/depth(?: of)?\s+(\d+)/i)?.[1],
			)
		: 1;
	const limit = depth ? limits.nesting : 0;
	if (!Number.isInteger(value) || value <= limit)
		throw new Error(`Unrecognized Oxlint diagnostic: ${diagnostic.message}`);
	return finding({
		file,
		rule: diagnostic.code,
		identity,
		value,
		limit,
		message: `${file}:${line}: ${diagnostic.message}`,
	});
}

function oxlint(session, limits, temporary) {
	const { root, files, contexts } = session;
	const config = configuration("oxlint");
	config.rules["max-depth"][1].max = limits.nesting;
	const path = join(temporary, "oxlint.json");
	writeFileSync(path, JSON.stringify(config));
	const findings = [];
	for (let offset = 0; offset < files.length; offset += 100) {
		const batch = files.slice(offset, offset + 100);
		const report = oxReport.parse(
			checkedRun(
				"oxlint",
				[
					"-c",
					path,
					"--disable-nested-config",
					"--no-ignore",
					"--threads=1",
					"--format=json",
					"--",
					...batch.map((file) => `./${analyzerPath(file.path)}`),
				],
				root,
			),
		);
		if (report.number_of_files !== batch.length) throw new Error("Oxlint skipped source files");
		findings.push(
			...report.diagnostics.map((diagnostic) => lintFinding(diagnostic, root, contexts, limits)),
		);
	}
	return findings;
}

function cognitiveFinding(diagnostic, snapshot, contexts, limit) {
	const analyzed = inside(snapshot, diagnostic.location.path);
	const line = diagnostic.location.start.line;
	const identity = location(contexts, analyzed, line);
	const file = contexts.get(analyzed).file.path;
	const value = Number(diagnostic.message.match(/complexity of (\d+)/i)?.[1]);
	if (!Number.isInteger(value) || value <= limit)
		throw new Error(`Unrecognized Biome diagnostic: ${diagnostic.message}`);
	// A score of 255 is saturation, not an exact metric: it cannot safely become an allowance.
	if (value >= 255)
		throw new Error(`Biome cannot calculate an exact cognitive score: ${file}:${line}`);
	return finding({
		file,
		rule: "biome/cognitive",
		identity,
		value,
		limit,
		message: `${file}:${line}: ${diagnostic.message}`,
	});
}

function biome(session, limits, temporary) {
	const { root: snapshot, files, contexts } = session;
	if (limits.cognitive === null) return [];
	// An isolated snapshot prevents nested project Biome settings/ignore files from changing this single rule.
	const config = configuration("cognitive");
	config.linter.rules.complexity.noExcessiveCognitiveComplexity.options.maxAllowedComplexity =
		limits.cognitive;
	writeFileSync(join(snapshot, "biome.json"), JSON.stringify(config));
	const findings = [];
	for (let offset = 0; offset < files.length; offset += 100) {
		const batch = files.slice(offset, offset + 100);
		const report = bioReport.parse(
			checkedRun(
				"@biomejs/biome",
				[
					"lint",
					"--config-path",
					snapshot,
					"--only=complexity/noExcessiveCognitiveComplexity",
					"--reporter=json",
					"--max-diagnostics=none",
					...batch.map((file) => `./${analyzerPath(file.path)}`),
				],
				snapshot,
			),
		);
		if (report.summary.changed + report.summary.unchanged !== batch.length)
			throw new Error("Biome skipped source files");
		findings.push(
			...report.diagnostics.map((diagnostic) =>
				cognitiveFinding(diagnostic, snapshot, contexts, limits.cognitive),
			),
		);
	}
	return findings;
}

export function lintFindings(root, metrics, limits) {
	const files = metrics.filter((file) => !file.path.endsWith(".py"));
	if (!files.length) return [];
	const temporary = mkdtempSync(join(tmpdir(), "engineering-quality-"));
	try {
		const contexts = context(root, files);
		const session = { root: snapshotSources(contexts, temporary), files, contexts };
		return aggregate([...oxlint(session, limits, temporary), ...biome(session, limits, temporary)]);
	} finally {
		rmSync(temporary, { recursive: true, force: true });
	}
}
