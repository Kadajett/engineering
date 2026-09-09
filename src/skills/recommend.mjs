import { selectSkills } from "./catalog.mjs";
import { loadRecommendations } from "./recommendation-catalog.mjs";
import {
	installedRecommendation,
	recommendationContext,
	recommendationRoots,
} from "./recommendation-context.mjs";

function matchingReasons(skill, context) {
	const reasons = [];
	for (const [dimension, wanted] of Object.entries(skill.when ?? {})) {
		const actual = dimension === "profiles" ? [context.profile] : context[dimension];
		const matches = wanted.filter((value) => actual.includes(value));
		if (!matches.length) return undefined;
		reasons.push(`${dimension}: ${matches.join(", ")}`);
	}
	return reasons.length ? reasons : ["general: curated engineering workflow"];
}

function category(skill) {
	if (skill.when?.packages || skill.when?.profiles) return "project";
	return skill.when?.languages ? "language" : "general";
}

export function recommendationPlan(directory, options = {}) {
	const context = recommendationContext(directory, options.profile);
	const catalog = loadRecommendations(context.root, options);
	const defaults = new Set(selectSkills(context.manifest, context.profile).map(({ name }) => name));
	const roots = recommendationRoots(context.root);
	const recommendations = [];
	for (const skill of catalog.recommendations) {
		if (defaults.has(skill.name)) continue;
		const reasons = matchingReasons(skill, context);
		if (!reasons) continue;
		const installed = installedRecommendation(skill, roots);
		if (installed && !options.includeInstalled) continue;
		recommendations.push({ ...skill, category: category(skill), reasons, installed });
	}
	return {
		version: 1,
		root: context.root,
		profile: context.profile,
		languages: context.languages,
		packages: context.packages,
		catalogs: catalog.catalogs,
		recommendations,
	};
}

export function showRecommendations(directory, options = {}) {
	const report = recommendationPlan(directory, options);
	if (options.json) return console.log(JSON.stringify(report, null, 2));
	console.log(`Optional skills for ${report.root}`);
	console.log(
		`Profile: ${report.profile}; languages: ${report.languages.join(", ") || "not detected"}`,
	);
	console.log("Read-only recommendations; nothing is installed. Automatic defaults are excluded.");
	for (const group of ["general", "language", "project"]) {
		const matches = report.recommendations.filter((skill) => skill.category === group);
		if (!matches.length) continue;
		console.log(`\n${group[0].toUpperCase() + group.slice(1)} skills:`);
		for (const skill of matches) {
			console.log(
				`  ${skill.name}${skill.installed ? " (already available)" : ""} — ${skill.description}`,
			);
			console.log(`    Why: ${skill.reasons.join("; ")}`);
			console.log(`    Review: ${skill.source}`);
		}
	}
	if (!report.recommendations.length)
		console.log(
			"\nNo matching optional skills to suggest. Use --include-installed to see available favorites.",
		);
	console.log("\nCurate favorites in .engineering/recommendations.json or pass --catalog FILE.");
}
