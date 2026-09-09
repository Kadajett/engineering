import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import test from "node:test";
import { extractGraph, integrate } from "../src/integrations.mjs";
import { exclusions, inventory } from "../src/quality/files.mjs";
import { projectEnvironment } from "../src/integrations/process.mjs";
import { fixture } from "./fixture.mjs";

const nativeGraphify = {
	skip:
		spawnSync("graphify", ["--version"]).error?.code === "ENOENT"
			? "Graphify is not installed"
			: false,
};

const nativeBeads = {
	skip: spawnSync("bd", ["--version"]).error?.code === "ENOENT" ? "Beads is not installed" : false,
};

test(
	"Beads works in spaced numeric folders and keeps existing issues on repeat setup",
	nativeBeads,
	async (t) => {
		const parent = fixture(t, { "123 My Project/index.ts": "export const value = 1;\n" });
		const root = join(parent, "123 My Project");
		execFileSync("git", ["init", "-q", root]);
		await integrate(root, { graphify: false });
		const options = { cwd: root, env: projectEnvironment(root), encoding: "utf8" };
		const issue = JSON.parse(
			execFileSync("bd", ["create", "Keep this issue", "--type", "task", "--json"], options),
		);
		execFileSync("bd", ["remember", "Keep the integration memory"], options);
		const memories = execFileSync("bd", ["prime", "--export", "--memories-only"], options);
		assert.ok(memories.includes("Keep the integration memory"));
		writeFileSync(join(root, ".beads/PRIME.md"), "Custom project primer\n");
		await integrate(root, { graphify: false });
		const [preserved] = JSON.parse(execFileSync("bd", ["show", issue.id, "--json"], options));
		assert.equal(preserved.id, issue.id);
		assert.equal(preserved.title, "Keep this issue");
		assert.equal(execFileSync("bd", ["prime"], options).trim(), "Custom project primer");
	},
);

function repository(t, files) {
	const root = fixture(t, files);
	execFileSync("git", ["init", "-q", root]);
	return root;
}

function graphFiles(root) {
	const graph = JSON.parse(readFileSync(join(root, "graphify-out/graph.json"), "utf8"));
	return new Set(graph.nodes.map((node) => basename(node.source_file)));
}

test("quality inventory excludes generated types, not handwritten declarations", (t) => {
	const root = fixture(t, {
		"worker-configuration.d.ts": "export interface WorkerGenerated {}\n",
		"nested/worker-configuration.d.ts": "export interface NestedWorkerGenerated {}\n",
		"routes/routeTree.gen.ts": "export const routeTree = {};\n",
		"models/api.generated.d.ts": "export interface GeneratedApi {}\n",
		"types/handwritten.d.ts": "export interface HandwrittenContract {}\n",
	});
	assert.deepEqual(inventory(root, { exclude: exclusions }), ["types/handwritten.d.ts"]);
});

test(
	"deferred setup upgrades ignores before native extraction and retains handwritten types",
	nativeGraphify,
	async (t) => {
		const root = repository(t, {
			"worker-configuration.d.ts": "export interface WorkerGenerated { value: string; }\n",
			"handwritten.d.ts": "export interface HandwrittenContract { value: string; }\n",
			"private.ts": "export function privateFunction() { return 1; }\n",
			".graphifyignore":
				"private.ts\n# BEGIN ENGINEERING GRAPHIFY\nnode_modules/\n# END ENGINEERING GRAPHIFY\n",
		});
		const setup = await integrate(root, { beads: false, deferGraph: true });
		assert.equal(setup.graphify.status, "deferred");
		assert.equal(existsSync(join(root, "graphify-out/graph.json")), false);
		assert.equal((await extractGraph(root)).status, "extracted");
		const files = graphFiles(root);
		assert.equal(files.has("worker-configuration.d.ts"), false);
		assert.equal(files.has("private.ts"), false);
		assert.equal(files.has("handwritten.d.ts"), true);
		const ignore = readFileSync(join(root, ".graphifyignore"), "utf8");
		writeFileSync(join(root, "new.ts"), "export function newlyAdded() { return 2; }\n");
		assert.equal((await integrate(root, { beads: false })).graphify.status, "updated");
		assert.equal(graphFiles(root).has("new.ts"), true);
		assert.equal(readFileSync(join(root, ".graphifyignore"), "utf8"), ignore);
	},
);

test(
	"standalone extraction refuses uninitialized, incomplete and symlinked integration state",
	nativeGraphify,
	async (t) => {
		const root = repository(t, { "index.ts": "export function main() { return 1; }\n" });
		await assert.rejects(() => extractGraph(root), /not initialized/);
		assert.equal(existsSync(join(root, ".agents")), false);
		await integrate(root, { beads: false, deferGraph: true });
		execFileSync("git", ["-C", root, "config", "--unset", "merge.graphify.driver"]);
		await assert.rejects(() => extractGraph(root), /incomplete/);
		assert.equal(existsSync(join(root, "graphify-out/graph.json")), false);
		const outside = fixture(t, { "graph.json": "keep outside data\n" });
		symlinkSync(outside, join(root, "graphify-out"));
		await assert.rejects(() => extractGraph(root), /symlink/);
		assert.equal(readFileSync(join(outside, "graph.json"), "utf8"), "keep outside data\n");
	},
);

test(
	"Beads preflight preserves conflicting native agent skills before initialization",
	nativeBeads,
	async (t) => {
		const root = repository(t, { ".omp/skills/beads/SKILL.md": "Custom task workflow\n" });
		await assert.rejects(() => integrate(root, { graphify: false }), /Conflicting Beads skill/);
		assert.equal(existsSync(join(root, ".beads")), false);
		assert.equal(
			readFileSync(join(root, ".omp/skills/beads/SKILL.md"), "utf8"),
			"Custom task workflow\n",
		);
	},
);

test(
	"Beads refuses native context symlinks without changing their targets",
	nativeBeads,
	async (t) => {
		const outside = fixture(t, { instructions: "External policy\n" });
		const root = repository(t, { ".omp/keep": "" });
		symlinkSync(join(outside, "instructions"), join(root, ".omp/AGENTS.md"));
		await assert.rejects(() => integrate(root, { graphify: false }), /symlink/);
		assert.equal(existsSync(join(root, ".beads")), false);
		assert.equal(readFileSync(join(outside, "instructions"), "utf8"), "External policy\n");
	},
);
