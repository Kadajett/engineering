import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { readJson, safePath, validPath } from "./files.mjs";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const rules = [
	"file-lines",
	"lizard/cyclomatic",
	"lizard/nloc",
	"lizard/parameters",
	"eslint(max-depth)",
	"eslint(no-param-reassign)",
	"typescript-eslint(no-explicit-any)",
	"typescript-eslint(no-non-null-assertion)",
	"biome/cognitive",
	"boundary/runtime-import",
];
const allowanceSchema = z
	.object({
		id: digest,
		file: z.string().refine((path) => validPath(path) && path !== "."),
		rule: z
			.string()
			.refine(
				(rule) => rules.includes(rule) || /^typescript\/TS\d+$/.test(rule),
				"Unknown baseline rule",
			),
		value: z.number().int().positive(),
	})
	.strict();
const baselineSchema = z
	.object({
		version: z.literal(1),
		reason: z.string().trim().min(1),
		createdAt: z.iso.datetime(),
		fingerprint: digest,
		tools: z
			.object({
				engineering: z.string(),
				lizard: z.literal("1.24.0"),
				oxlint: z.string(),
				biome: z.string().nullable(),
				typescript: z.string(),
			})
			.strict(),
		allowances: z.array(allowanceSchema),
	})
	.strict();
const baselinePath = ".engineering/baseline.json";

export function readBaseline(root, fingerprint) {
	let data;
	try {
		data = readJson(root, baselinePath);
	} catch (error) {
		if (error.code === "ENOENT") return undefined;
		throw error;
	}
	const baseline = baselineSchema.parse(data);
	if (baseline.fingerprint !== fingerprint)
		throw new Error(
			"Baseline configuration/tool fingerprint changed. Review the policy change and explicitly remove/recapture the baseline; allowances are not reused.",
		);
	if (new Set(baseline.allowances.map((item) => item.id)).size !== baseline.allowances.length) {
		throw new Error("Duplicate baseline diagnostic identity");
	}
	return baseline;
}

export function report(findings, baseline) {
	const previous = new Map((baseline?.allowances ?? []).map((item) => [item.id, item]));
	const current = new Map(findings.map((item) => [item.id, item]));
	const regressions = [],
		inherited = [];
	for (const item of findings) {
		const allowed = previous.get(item.id);
		if (allowed && (allowed.file !== item.file || allowed.rule !== item.rule))
			throw new Error("Baseline identity metadata mismatch");
		if (allowed && item.value <= allowed.value) inherited.push(item);
		else regressions.push(item);
	}
	const resolved = [...previous.values()].filter((item) => !current.has(item.id));
	return { findings, regressions, inherited, resolved };
}

export function createBaseline(root, state, reason) {
	const approval = z
		.string()
		.trim()
		.min(1, "An explicit approval reason is required")
		.parse(reason);
	const directory = safePath(root, ".engineering", true);
	mkdirSync(directory, { recursive: true });
	const path = safePath(root, baselinePath, true);
	const baseline = baselineSchema.parse({
		version: 1,
		reason: approval,
		createdAt: new Date().toISOString(),
		fingerprint: state.fingerprint,
		tools: state.tools,
		allowances: state.findings.map(({ id, file, rule, value }) => ({ id, file, rule, value })),
	});
	// O_EXCL makes the initial-only contract hold even for simultaneous approvals.
	writeFileSync(path, `${JSON.stringify(baseline)}\n`, { flag: "wx" });
	return baseline;
}

export function prune(root, state, baseline) {
	if (!baseline) throw new Error("There is no baseline to prune");
	const current = new Map(state.findings.map((item) => [item.id, item]));
	const allowances = baseline.allowances
		.filter((item) => current.has(item.id))
		.map((item) => ({
			...item,
			value: Math.min(item.value, current.get(item.id).value),
		}));
	const next = { ...baseline, allowances };
	const path = safePath(root, baselinePath);
	const temporary = safePath(root, join(".engineering", `baseline-${randomUUID()}.tmp`), true);
	try {
		writeFileSync(temporary, `${JSON.stringify(next)}\n`, { flag: "wx" });
		renameSync(temporary, path);
	} finally {
		try {
			unlinkSync(temporary);
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
	return next;
}
