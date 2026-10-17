import assert from "node:assert/strict";
import test from "node:test";
import { selectSkills, unmatchedPackages } from "../src/skills/catalog.mjs";

const baseline = ["codebase-design", "diagnosing-bugs", "humanizer", "tdd"];

function names(manifest, profile = "generic") {
	return selectSkills(manifest, profile).map((skill) => skill.name);
}

function additions(manifest, profile) {
	return names(manifest, profile).filter((name) => !baseline.includes(name));
}

test("every project gets self-contained trusted disciplines without interactive setup", () => {
	assert.deepEqual(names({}, "generic"), baseline);
	assert.deepEqual(names({ dependencies: { express: "^5" } }, "express"), baseline);
	assert.deepEqual(names({ dependencies: { vue: "^3", vite: "^7" } }, "react-vite"), baseline);
});

test("actual dependencies override frontend profile guesses", () => {
	assert.deepEqual(additions({ dependencies: { vue: "^3", "@clerk/vue": "^2" } }, "react-vite"), [
		"clerk",
		"clerk-setup",
		"clerk-vue-patterns",
	]);
	assert.deepEqual(additions({ dependencies: { hono: "^4" } }, "next"), ["hono"]);
	assert.deepEqual(additions({}, "react-vite"), ["vercel-react-best-practices"]);
});

test("OpenTUI skill follows exact packages, not arbitrary scope names or profile guesses", () => {
	assert.deepEqual(additions({}, "opentui"), ["opentui"]);
	assert.deepEqual(additions({ dependencies: { express: "^5" } }, "opentui"), []);
	assert.deepEqual(
		additions({
			dependencies: { "@opentui/solid": "^0.5", "solid-js": "^1" },
			optionalDependencies: { "@opentui/keymap": "^0.5" },
			peerDependencies: { "@opentui/core": "^0.5" },
		}),
		["opentui"],
	);
	assert.deepEqual(additions({ dependencies: { "@opentui/unknown": "^1" } }), []);
	assert.deepEqual(unmatchedPackages({ dependencies: { "@opentui/unknown": "^1" } }), [
		"@opentui/unknown",
	]);
});

test("terminal React does not select browser advice, but mixed browser apps still do", () => {
	const terminal = { "@opentui/react": "^0.5", react: "^19" };
	assert.deepEqual(additions({ dependencies: terminal }), ["opentui"]);
	assert.deepEqual(additions({ dependencies: { ink: "^6", react: "^19" } }), []);
	assert.deepEqual(additions({ dependencies: terminal, devDependencies: { "react-dom": "^19" } }), [
		"opentui",
		"vercel-react-best-practices",
	]);
	assert.deepEqual(additions({ dependencies: { ...terminal, next: "^16" } }), [
		"opentui",
		"vercel-react-best-practices",
	]);
	assert.deepEqual(additions({ dependencies: { ...terminal, "@tanstack/react-start": "^1" } }), [
		"opentui",
		"react-start",
		"start-core",
		"vercel-react-best-practices",
	]);
	assert.deepEqual(additions({ dependencies: { react: "^19" } }), ["vercel-react-best-practices"]);
});

test("Workers signals select platform guidance, not the whole provider bundle", () => {
	const expected = ["cloudflare", "workers-best-practices", "wrangler"];
	assert.deepEqual(additions({ devDependencies: { wrangler: "^4" } }), expected);
	assert.deepEqual(additions({}, "workers-ai"), expected);
	assert.deepEqual(additions({ dependencies: { react: "^19" } }, "cloudflare-workers"), [
		"cloudflare",
		"vercel-react-best-practices",
		"workers-best-practices",
		"wrangler",
	]);
});

test("Agents SDK and Durable Objects require the actual stateful SDK signal", () => {
	assert.deepEqual(
		additions({ dependencies: { agents: "^0.9" }, devDependencies: { wrangler: "^4" } }),
		["agents-sdk", "cloudflare", "durable-objects", "workers-best-practices", "wrangler"],
	);
	assert.deepEqual(additions({ dependencies: { "@cloudflare/ai-chat": "^0.3", ai: "^6" } }), [
		"agents-sdk",
		"ai-sdk",
		"cloudflare",
		"durable-objects",
		"workers-best-practices",
		"wrangler",
	]);
});

test("overlapping package signals deduplicate with order-independent provenance", () => {
	const first = {
		dependencies: { next: "^16", react: "^19", "react-dom": "^19" },
		devDependencies: { react: "^19" },
	};
	const second = { dependencies: { "react-dom": "^19", react: "^19", next: "^16" } };
	assert.deepEqual(selectSkills(first, "next"), selectSkills(second, "generic"));
	assert.deepEqual(additions(first), ["vercel-react-best-practices"]);
});

test("TanStack includes required core skills without confusing React Router packages", () => {
	assert.deepEqual(
		additions({
			dependencies: {
				"@tanstack/react-start": "^1",
				"@tanstack/react-router": "^1",
				"@tanstack/router-core": "^1",
			},
		}),
		["react-router", "react-start", "router-core", "start-core"],
	);
	assert.deepEqual(
		additions({ dependencies: { "react-router": "^7", "react-router-dom": "^7" } }),
		[],
	);
	assert.deepEqual(
		additions({ dependencies: { "@tanstack/solid-start": "^1" } }, "tanstack-start"),
		[],
	);
});

test("unmatched direct packages are accurate across dependency fields", () => {
	const manifest = {
		dependencies: {
			hono: "^4",
			express: "^5",
			"@tanstack/react-query": "^5",
			"@clerk/unknown": "1",
		},
		devDependencies: {
			wrangler: "^4",
			"@types/express": "^5",
			"@kadajett/engineering": "1",
			vite: "^7",
		},
		optionalDependencies: { express: "^5", "@clerk/vue": "^2", sharp: "^0.34" },
		peerDependencies: { react: "^19", zod: "^4" },
		engines: { node: ">=22" },
	};
	assert.deepEqual(unmatchedPackages(manifest), [
		"@clerk/unknown",
		"@tanstack/react-query",
		"express",
		"sharp",
		"vite",
		"zod",
	]);
	assert.deepEqual(
		additions({ optionalDependencies: { hono: "^4" }, peerDependencies: { react: "^19" } }),
		["hono", "vercel-react-best-practices"],
	);
});

test("unknown package names cannot match object prototype properties", () => {
	const manifest = {
		dependencies: JSON.parse('{"constructor":"1","toString":"1","__proto__":"1"}'),
	};
	assert.deepEqual(names(manifest), baseline);
	assert.deepEqual(unmatchedPackages(manifest), ["__proto__", "constructor", "toString"]);
});
