import assert from "node:assert/strict";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { projectFiles } from "../src/project-files.mjs";
import { oneShotTest, testingPlan } from "../src/testing.mjs";
import { projectScripts } from "../src/verification.mjs";
import { fixture } from "./fixture.mjs";

function plan(t, manifest, { profile = { id: "react-vite" }, files = {}, created = true } = {}) {
	const root = fixture(t, { "package.json": JSON.stringify(manifest), ...files });
	return { root, testing: testingPlan(root, manifest, profile, { created }) };
}

test("creation adds a real Vitest dependency and CI discovery without changing upstream configuration", (t) => {
	const manifest = {
		packageManager: "pnpm@10.0.0",
		scripts: { build: "vite build" },
		devDependencies: { vite: "7.0.0" },
	};
	const config = "export default { plugins: [] };\n";
	const { root, testing } = plan(t, manifest, { files: { "vite.config.ts": config } });
	assert.equal(testing.manifest.scripts.test, "vitest run");
	assert.equal(testing.manifest.devDependencies.vitest, "4.1.0");
	assert.equal(testing.manifest.devDependencies.vite, "7.0.0");
	assert.equal(testing.manifest.packageManager, manifest.packageManager);
	assert.equal(readFileSync(join(root, "vite.config.ts"), "utf8"), config);
	const nativeScripts = projectScripts(root, {}, testing.manifest, testing);
	assert.deepEqual(nativeScripts.checks, ["build", "test:ci"]);
	const files = projectFiles(
		root,
		{ id: "react-vite" },
		{ name: "pnpm", version: "10.0.0" },
		{ ci: true, nativeScripts },
	);
	assert.match(files.get(".github/workflows/engineering.yml"), /run: pnpm run test:ci\n/);
});

test("OpenTUI chooses the Bun runtime, not a second test dependency", (t) => {
	const manifest = { dependencies: { "@opentui/core": "0.1.0" } };
	const { testing } = plan(t, manifest, { profile: { id: "opentui" } });
	assert.equal(testing.manifest.scripts.test, "bun test");
	assert.equal(testing.manifest.devDependencies, undefined);
	assert.deepEqual(testing.checks, ["test:ci"]);
});

test("Workers retain upstream Vitest versions, pool configuration, and watch commands", (t) => {
	const manifest = {
		scripts: { test: "vitest --config vitest.config.ts" },
		devDependencies: { vitest: "3.2.4", "@cloudflare/vitest-pool-workers": "0.8.0" },
	};
	const source = "export default { test: { pool: '@cloudflare/vitest-pool-workers' } };\n";
	const { root, testing } = plan(t, manifest, {
		profile: { id: "cloudflare-workers" },
		files: { "vitest.config.ts": source },
	});
	assert.deepEqual(testing.manifest.devDependencies, manifest.devDependencies);
	assert.equal(testing.manifest.scripts.test, manifest.scripts.test);
	assert.equal(testing.manifest.scripts["test:ci"], "vitest run --config vitest.config.ts");
	assert.deepEqual(testing.checks, ["test:ci"]);
	assert.equal(readFileSync(join(root, "vitest.config.ts"), "utf8"), source);
	assert.equal(testing.files.size, 0);
});

test("known upstream Node tests run once while unknown adoption commands remain untouched", (t) => {
	const manifest = {
		scripts: {
			test: "node --test",
			"test:unit": "node --test",
			"test:custom": "custom-runner --watch",
		},
	};
	const { testing } = plan(t, manifest, { profile: { id: "generic" }, created: false });
	assert.deepEqual(testing.manifest, manifest);
	assert.deepEqual(testing.checks, ["test"]);
	const empty = plan(t, {}, { profile: { id: "generic" }, created: false }).testing;
	assert.equal(empty.runner, null);
	assert.equal(empty.manifest.devDependencies, undefined);
	assert.deepEqual(empty.checks, []);
});

test("Create React App retains its framework runner with a dedicated nonwatch alias", (t) => {
	const manifest = {
		scripts: { test: "react-scripts test" },
		dependencies: { "react-scripts": "5.0.1" },
	};
	const { testing } = plan(t, manifest, { profile: { id: "react-cra" } });
	assert.equal(testing.manifest.scripts.test, "react-scripts test");
	assert.equal(testing.manifest.scripts["test:ci"], "react-scripts test --watchAll=false");
	assert.equal(testing.manifest.devDependencies, undefined);
	assert.deepEqual(testing.checks, ["test:ci"]);
});

test("existing unfamiliar runners and test configs prevent duplicate defaults", (t) => {
	const manifest = { scripts: { test: "custom-test-command" } };
	assert.deepEqual(plan(t, manifest).testing.manifest, manifest);
	const configured = plan(
		t,
		{},
		{
			files: { "jest.config.cjs": "module.exports = {};\n" },
		},
	).testing;
	assert.equal(configured.manifest.devDependencies, undefined);
	assert.equal(configured.runner, null);
});

test("one-shot detection excludes watchers, shell composition, deployment wrappers, and interactive modes", () => {
	for (const command of [
		"vitest",
		"vitest watch",
		"vitest run --watch",
		"vitest run --ui",
		"vitest run --standalone",
		"bun test --watch",
		"jest --watchAll",
		"jest --watch-all",
		"mocha -w",
		"react-scripts test",
		"playwright test --ui",
		"cypress open",
		"node --test --watch",
		"npm run test",
		"vitest run && wrangler deploy",
		"CI=1 vitest run",
		'node --test --eval "deploy()"',
	])
		assert.equal(oneShotTest(command), false, command);
	for (const command of [
		"vitest run --config vitest.config.ts",
		"bun test",
		"node --test test/*.test.mjs",
		"jest --ci",
		"react-scripts test --watchAll=false",
		"playwright test",
		"cypress run",
	])
		assert.equal(oneShotTest(command), true, command);
});

test("conflicting aliases and package lifecycle hooks are never automatically executed", (t) => {
	const manifest = {
		scripts: {
			test: "vitest",
			"test:ci": "wrangler deploy",
			"test:unit": "node --test",
			"pretest:unit": "wrangler deploy",
		},
	};
	const { testing } = plan(t, manifest);
	assert.deepEqual(testing.manifest, manifest);
	assert.deepEqual(testing.checks, []);
});

test("discovery files survive adoption without replacing user-owned files or links", (t) => {
	const { root, testing } = plan(t, {});
	mkdirSync(join(root, ".engineering"));
	for (const [name, source] of testing.files) writeFileSync(join(root, name), source);
	const adopted = testingPlan(root, testing.manifest, { id: "react-vite" }, {});
	assert.deepEqual(adopted.checks, ["test:ci"]);
	assert.deepEqual(adopted.manifest, testing.manifest);
	writeFileSync(join(root, ".engineering/test.mjs"), "user-owned\n");
	assert.throws(
		() => testingPlan(root, {}, { id: "react-vite" }, { created: true }),
		/Preserving existing/,
	);
	const linked = fixture(t, { "package.json": "{}", "user-owned": "keep\n" });
	mkdirSync(join(linked, ".engineering"));
	symlinkSync(join(linked, "user-owned"), join(linked, ".engineering/test.mjs"));
	assert.throws(() => testingPlan(linked, {}, { id: "react-vite" }, { created: true }), /symlink/);
	assert.equal(readFileSync(join(linked, "user-owned"), "utf8"), "keep\n");
});
