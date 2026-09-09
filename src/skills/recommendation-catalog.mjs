import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { readRegularFile } from "../archive-inputs.mjs";
import { defaultRecommendations } from "./recommendation-defaults.mjs";

const text = z
	.string()
	.refine((value) => value.trim().length > 0, "Expected a nonempty string")
	.refine(
		(value) => !/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value),
		"Expected printable text without terminal control characters",
	);
const name = text
	.max(64)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a skill name in lowercase kebab-case");
const dimension = z.array(text).min(1);
const when = z
	.object({
		languages: dimension.optional(),
		packages: dimension.optional(),
		profiles: dimension.optional(),
	})
	.strict()
	.refine(
		(value) => Object.keys(value).length > 0,
		"Specify at least one matching dimension, or omit when for a general favorite",
	);
const source = text.url().refine((value) => {
	if (!URL.canParse(value)) return false;
	const url = new URL(value);
	return (
		url.protocol === "https:" &&
		!url.username &&
		!url.password &&
		url.pathname.endsWith("/SKILL.md")
	);
}, "Expected a public HTTPS URL to a SKILL.md file without credentials");
const recommendation = z
	.object({ name, description: text, source, when: when.optional() })
	.strict();
const catalogSchema = z
	.object({
		version: z.literal(1),
		recommendations: z
			.array(recommendation)
			.refine(
				(values) => new Set(values.map((value) => value.name)).size === values.length,
				"Duplicate recommendation names in one catalog",
			),
		disabled: z.array(name).optional(),
	})
	.strict();

function catalogPaths(root, options) {
	const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
	const paths = new Map([
		[resolve(configHome, "kadajett-engineering/recommendations.json"), false],
		[resolve(root, ".engineering/recommendations.json"), false],
	]);
	if (options.catalog !== undefined) {
		if (typeof options.catalog !== "string" || !options.catalog.trim())
			throw new Error("--catalog must name a recommendations JSON file");
		const explicit = resolve(options.catalog);
		// An explicit path always has last precedence, even if it names an optional file.
		paths.delete(explicit);
		paths.set(explicit, true);
	}
	return paths;
}

function readCatalog(path, required) {
	let bytes;
	try {
		bytes = readRegularFile(path);
	} catch (error) {
		if (!required && error.code === "ENOENT") return undefined;
		throw new Error(
			`Cannot read recommendation catalog ${path}: ${error.message}; provide a readable regular JSON file`,
			{ cause: error },
		);
	}
	try {
		return catalogSchema.parse(JSON.parse(bytes.toString("utf8")));
	} catch (error) {
		const detail = error instanceof z.ZodError ? z.prettifyError(error) : error.message;
		throw new Error(
			`Invalid recommendation catalog ${path}: ${detail}; fix the catalog before retrying`,
			{ cause: error },
		);
	}
}

export function loadRecommendations(root, options = {}) {
	const recommendations = new Map(defaultRecommendations.map((entry) => [entry.name, entry]));
	const disabled = new Set();
	const catalogs = [];
	for (const [path, required] of catalogPaths(root, options)) {
		const catalog = readCatalog(path, required);
		if (!catalog) continue;
		catalogs.push(path);
		for (const entry of catalog.recommendations) recommendations.set(entry.name, entry);
		for (const entry of catalog.disabled ?? []) disabled.add(entry);
	}
	return {
		recommendations: [...recommendations.keys()]
			.sort()
			.filter((entry) => !disabled.has(entry))
			.map((entry) => recommendations.get(entry)),
		catalogs,
	};
}
