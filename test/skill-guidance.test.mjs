import assert from "node:assert/strict";
import test from "node:test";
import { directPackages, selectSkills } from "../src/skills/catalog.mjs";
import { selectGuidance } from "../src/skills/guidance.mjs";

function topics(manifest, profile = "generic") {
	return selectGuidance(directPackages(manifest), profile, selectSkills(manifest, profile)).map(
		({ id }) => id,
	);
}

test("ordinary Workers get native observability without AI or a monitoring vendor", () => {
	assert.deepEqual(topics({ devDependencies: { wrangler: "^4" } }), ["workers-observability"]);
	assert.deepEqual(topics({ dependencies: { express: "^5" } }), []);
	assert.deepEqual(topics({}, "workers-ai"), [
		"workers-observability",
		"ai-usage-and-safety",
		"workers-ai-production",
	]);
});

test("AI SDK guidance works outside Workers and does not imply an Agents application", () => {
	assert.deepEqual(topics({ dependencies: { ai: "^6" } }), [
		"ai-usage-and-safety",
		"ai-sdk-observability",
	]);
	assert.deepEqual(topics({ dependencies: { "workers-ai-provider": "^3" } }), [
		"workers-observability",
		"ai-usage-and-safety",
		"workers-ai-production",
		"ai-sdk-observability",
	]);
	assert.deepEqual(topics({ dependencies: { "@cloudflare/ai-chat": "^0.11" } }), [
		"workers-observability",
		"ai-usage-and-safety",
		"workers-ai-production",
		"agents-production",
		"ai-sdk-observability",
	]);
});

test("Sentry docs require its exact Cloudflare dependency, not another SDK or scope lookalike", () => {
	const dependencies = { agents: "^0.9", ai: "^6", "@sentry/node": "^10", "@sentry/unknown": "1" };
	assert.equal(topics({ dependencies }).includes("sentry-cloudflare"), false);
	assert.equal(
		topics({ dependencies, optionalDependencies: { "@sentry/cloudflare": "^10" } }).includes(
			"sentry-cloudflare",
		),
		true,
	);
	assert.deepEqual(topics({ peerDependencies: { "@sentry/cloudflare": "^10" } }), [
		"workers-observability",
		"sentry-cloudflare",
	]);
});
