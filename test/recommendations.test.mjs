import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { fixture } from "./fixture.mjs";

const cli = fileURLToPath(new URL("../bin/engineering.mjs", import.meta.url));
const source =
	"https://github.com/example/favorites/blob/0123456789abcdef0123456789abcdef01234567/skills";
const record = (name, when) => ({
	name,
	description: `Use ${name}`,
	source: `${source}/${name}/SKILL.md`,
	...(when ? { when } : {}),
});
const catalog = (recommendations, disabled = []) =>
	JSON.stringify({ version: 1, recommendations, disabled });
const skill = (name) =>
	`---\nname: ${name}\ndescription: A locally installed favorite.\n---\nGuidance.\n`;

function invoke(root, home, args = []) {
	return spawnSync(process.execPath, [cli, "skills", root, "--suggest", "--json", ...args], {
		encoding: "utf8",
		timeout: 10000,
		env: {
			...process.env,
			HOME: home,
			XDG_CONFIG_HOME: join(home, ".config"),
			CLAUDE_CONFIG_DIR: join(home, ".claude"),
			CODEX_HOME: join(home, ".codex"),
			PI_CODING_AGENT_DIR: join(home, ".pi/agent"),
			PI_CONFIG_DIR: ".omp",
			OMP_PROFILE: "default",
			PI_PROFILE: "default",
		},
	});
}

function report(root, home, args) {
	const result = invoke(root, home, args);
	assert.equal(result.status, 0, result.stderr);
	return JSON.parse(result.stdout);
}

const favorites = (result) =>
	result.recommendations.filter(({ name }) => name.startsWith("favorite-"));

test("recommendations combine dimensions, explain matches, and never suggest automatic defaults", (t) => {
	const home = fixture(t, {});
	const root = fixture(t, {
		"package.json": JSON.stringify({
			dependencies: { hono: "4.0.0" },
			devDependencies: { typescript: "5.9.3" },
		}),
		"src/index.ts": "export const app = 1;\n",
		".engineering/skills.json": JSON.stringify({ version: 1, profile: "hono-node", skills: [] }),
		".engineering/recommendations.json": catalog([
			record("favorite-general"),
			record("favorite-language", { languages: ["python", "typescript"] }),
			record("favorite-project", {
				languages: ["typescript"],
				packages: ["express", "hono"],
				profiles: ["hono-node"],
			}),
			record("favorite-wrong-language", { languages: ["rust"], packages: ["hono"] }),
			record("favorite-wrong-project", { packages: ["next"] }),
			record("tdd"),
			record("hono"),
		]),
	});
	const before = readdirSync(root, { recursive: true }).sort();
	const result = report(root, home);
	assert.deepEqual(
		favorites(result)
			.map(({ name }) => name)
			.sort(),
		["favorite-general", "favorite-language", "favorite-project"],
	);
	const project = favorites(result).find(({ name }) => name === "favorite-project");
	assert.deepEqual(project.reasons, [
		"languages: typescript",
		"packages: hono",
		"profiles: hono-node",
	]);
	assert.equal(
		result.recommendations.some(({ name }) => ["tdd", "hono"].includes(name)),
		false,
	);
	assert.deepEqual(readdirSync(root, { recursive: true }).sort(), before);
	assert.deepEqual(readdirSync(home), []);
});

test("available skills are excluded across native project paths and registered plugins, but dangling links remain eligible", (t) => {
	const home = fixture(t, {
		".claude/plugins/cache/favorites/1/skills/engineering/favorite-plugin/SKILL.md":
			skill("favorite-plugin"),
	});
	writeFileSync(
		join(home, ".claude/plugins/installed_plugins.json"),
		JSON.stringify({
			plugins: { favorites: [{ installPath: join(home, ".claude/plugins/cache/favorites/1") }] },
		}),
	);
	const plugin = {
		...record("favorite-plugin"),
		source: `${source}/engineering/favorite-plugin/SKILL.md`,
	};
	const root = fixture(t, {
		".omp/skills/favorite-project/SKILL.md": skill("favorite-project"),
		".omp/skills/favorite-invalid/SKILL.md": "not a skill\n",
		".engineering/recommendations.json": catalog([
			record("favorite-project"),
			plugin,
			record("favorite-dangling"),
			record("favorite-invalid"),
		]),
	});
	symlinkSync(join(home, "removed-plugin"), join(root, ".omp/skills/favorite-dangling"));
	assert.deepEqual(
		favorites(report(root, home))
			.map(({ name }) => name)
			.sort(),
		["favorite-dangling", "favorite-invalid"],
	);
	const included = favorites(report(root, home, ["--include-installed"]));
	assert.deepEqual(
		included
			.filter(({ installed }) => installed)
			.map(({ name }) => name)
			.sort(),
		["favorite-plugin", "favorite-project"],
	);
});

test("favorite overlays override by name and retain opt-outs without changing catalogs", (t) => {
	const home = fixture(t, {
		".config/kadajett-engineering/recommendations.json": catalog(
			[record("favorite-shared"), record("favorite-hidden")],
			["favorite-hidden"],
		),
	});
	const projectRecord = { ...record("favorite-shared"), description: "Project preference" };
	const explicitRecord = { ...record("favorite-shared"), description: "Explicit preference" };
	const root = fixture(t, {
		".engineering/recommendations.json": catalog([projectRecord, record("favorite-hidden")]),
		"custom.json": catalog([explicitRecord]),
	});
	assert.equal(favorites(report(root, home))[0].description, "Project preference");
	const result = report(root, home, ["--catalog", join(root, "custom.json")]);
	assert.deepEqual(
		favorites(result).map(({ description }) => description),
		["Explicit preference"],
	);
	assert.ok(result.catalogs.includes(join(root, "custom.json")));
});

test("language discovery ignores vendored, generated, and symlinked trees and works without npm", (t) => {
	const home = fixture(t, { "outside/index.ts": "export {};\n" });
	const root = fixture(t, {
		"pyproject.toml": "[project]\nname = 'favorite'\nversion = '0.1.0'\n",
		"app/main.py": "print('hello')\n",
		"node_modules/pkg/index.ts": "export {};\n",
		"dist/build.rs": "fn main() {}\n",
		".agents/skills/sample/example.go": "package example\n",
		".engineering/recommendations.json": catalog([
			record("favorite-python", { languages: ["python"] }),
			record("favorite-typescript", { languages: ["typescript"] }),
			record("favorite-rust", { languages: ["rust"] }),
			record("favorite-go", { languages: ["go"] }),
		]),
	});
	symlinkSync(join(home, "outside"), join(root, "external"));
	assert.deepEqual(
		favorites(report(root, home)).map(({ name }) => name),
		["favorite-python"],
	);
});

test("malformed favorite catalogs fail rather than silently broadening recommendations", (t) => {
	const home = fixture(t, {});
	const invalid = [
		catalog([record("favorite-duplicate"), record("favorite-duplicate")]),
		catalog([record("favorite-empty", { packages: [] })]),
		catalog([{ ...record("favorite-unsafe"), source: "javascript:alert(1)" }]),
		catalog([{ ...record("favorite-typo"), when: { package: ["hono"] } }]),
	];
	const root = fixture(t, {});
	for (const content of invalid) {
		writeFileSync(join(root, "custom.json"), content);
		const result = invoke(root, home, ["--catalog", join(root, "custom.json")]);
		assert.equal(result.status, 1);
		assert.equal(result.stdout, "");
		assert.ok(result.stderr.includes("custom.json"));
	}
});
