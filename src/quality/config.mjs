import { z } from "zod";
import { exclusions, projectRoot, readJson, validPath } from "./files.mjs";

const path = z
	.string()
	.refine((value) => validPath(value), "Expected a normalized project-relative path");
const pattern = z
	.string()
	.refine((value) => validPath(value, true), "Expected a relative path or * / ** / ? glob");
const positive = z.number().int().positive();
const unique = (schema) =>
	z.array(schema).refine((values) => new Set(values).size === values.length, "Duplicate entries");
export const boundarySchema = z
	.object({
		from: pattern,
		disallow: unique(pattern).min(1),
		allow: unique(pattern).default([]),
	})
	.strict();
export const configSchema = z
	.object({
		version: z.literal(1),
		profile: z.string().min(1),
		sources: unique(path).min(1),
		exclude: unique(pattern),
		typescript: z.object({ projects: unique(path) }).strict(),
		limits: z
			.object({
				cyclomatic: positive,
				functionLines: positive,
				parameters: z.number().int().nonnegative(),
				fileLines: positive,
				testFileLines: positive,
				nesting: positive,
				cognitive: positive.max(254).nullable(),
			})
			.strict(),
		boundaries: z.array(boundarySchema),
	})
	.strict();

export function makeConfig(root, profile) {
	projectRoot(root);
	return configSchema.parse({
		version: 1,
		profile: typeof profile === "string" ? profile : profile.id,
		sources: ["."],
		exclude: [...exclusions],
		typescript: { projects: [] },
		limits: {
			cyclomatic: 10,
			functionLines: 50,
			parameters: 4,
			fileLines: 300,
			testFileLines: 1000,
			nesting: 4,
			cognitive: 15,
		},
		boundaries: typeof profile === "string" ? [] : (profile.boundaries ?? []),
	});
}

export function readConfig(root) {
	return configSchema.parse(readJson(projectRoot(root), ".engineering/config.json"));
}
