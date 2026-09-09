import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { fixture } from "./fixture.mjs";

const cli = fileURLToPath(new URL("../bin/engineering.mjs", import.meta.url));

function invoke(root, args) {
	return spawnSync(process.execPath, [cli, ...args, "--no-skills"], {
		cwd: root,
		encoding: "utf8",
		timeout: 10000,
	});
}

test("a standalone profile needs a name instead of becoming the destination", (t) => {
	const root = fixture(t, {});
	const result = invoke(root, ["create", "react-vite", "--install-tools"]);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /name.*--name/is);
	assert.deepEqual(readdirSync(root), []);
});

test("unnamed creation and previews never fall back to the working directory", (t) => {
	const root = fixture(t, {});
	for (const args of [["create"], ["plan", "react-vite"], ["create", "react-vite", "--dry-run"]]) {
		const result = invoke(root, args);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /name.*--name/is);
	}
	assert.deepEqual(readdirSync(root), []);
});

test("a positional name preserves its child folder while the generator receives a safe slug", (t) => {
	const root = fixture(t, {});
	const result = invoke(root, ["plan", "react-vite", "MyApp"]);
	assert.equal(result.status, 0, result.stderr);
	assert.ok(result.stdout.includes(`then move to ${join(root, "MyApp")}`));
	assert.match(result.stdout, /create-vite@latest myapp /);
	assert.deepEqual(readdirSync(root), []);
});

test("a name option without a destination derives a child folder", (t) => {
	const root = fixture(t, {});
	const result = invoke(root, [
		"create",
		"--name",
		"My App",
		"--profile",
		"react-vite",
		"--dry-run",
	]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /create-vite@latest my-app /);
	assert.match(result.stdout, /Display name: My App/);
	assert.deepEqual(readdirSync(root), []);
});

test("an explicit path and display name remain independent", (t) => {
	const root = fixture(t, {});
	const destination = join(root, "apps", "Web");
	const result = invoke(root, ["plan", "react-vite", "./apps/Web", "--name", "Support Desk"]);
	assert.equal(result.status, 0, result.stderr);
	assert.ok(result.stdout.includes(`then move to ${destination}`));
	assert.match(result.stdout, /create-vite@latest support-desk /);
	assert.match(result.stdout, /Display name: Support Desk/);
});

test("an unknown standalone token is a project name requiring profile selection", (t) => {
	const root = fixture(t, {});
	const result = invoke(root, ["create", "MyApp"]);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /requires a profile/);
	assert.deepEqual(readdirSync(root), []);
});

test("previews reject missing profiles without prompting even on a terminal", (t) => {
	const root = fixture(t, {});
	const result = spawnSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`process.stdin.isTTY = true; process.stdout.isTTY = true;
const { main } = await import(${JSON.stringify(new URL("../src/cli.mjs", import.meta.url).href)});
await main(['plan', 'MyApp']).catch(error => { console.error(error.message); process.exitCode = 1; });`,
		],
		{ cwd: root, encoding: "utf8", timeout: 10000 },
	);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /requires a profile/);
	assert.equal(result.stdout, "");
	assert.deepEqual(readdirSync(root), []);
});

test("an explicit profile disambiguates a destination that is also a known profile", (t) => {
	const root = fixture(t, {});
	const result = invoke(root, ["plan", "react-vite", "--profile", "next"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /create-next-app@latest react-vite /);
});

test("an explicit path can use a profile name as its folder", (t) => {
	const root = fixture(t, {});
	const result = invoke(root, ["plan", "./react-vite", "--profile", "react-vite"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /create-vite@latest react-vite /);
});

test("custom generators accept name-only creation without a positional destination", (t) => {
	const root = fixture(t, {});
	const result = invoke(root, ["plan", "--generator", "create-example@1.0.0", "--name", "My App"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /create-example@1\.0\.0 my-app/);
});

test("only an explicit dot can target an empty working directory", (t) => {
	const root = fixture(t, {});
	const result = invoke(root, ["plan", "react-vite", ".", "--name", "Current App"]);
	assert.equal(result.status, 0, result.stderr);
	assert.ok(result.stdout.includes(`then move to ${root}`));
	const occupied = fixture(t, { keep: "user data" });
	const refused = invoke(occupied, ["plan", "react-vite", "."]);
	assert.equal(refused.status, 1);
	assert.match(refused.stderr, /new or empty directory/);
	assert.deepEqual(readdirSync(occupied), ["keep"]);
});

test("interactive creation asks for a profile and name before runtime preflight", async (t) => {
	const root = fixture(t, {});
	const child = spawn(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`process.stdin.isTTY = true; process.stdout.isTTY = true;
const { main } = await import(${JSON.stringify(new URL("../src/cli.mjs", import.meta.url).href)});
await main(['create']).catch(error => { console.error(error.message); process.exitCode = 1; });`,
		],
		{ cwd: root, env: { ...process.env, PATH: root }, timeout: 10000 },
	);
	t.after(() => child.kill());
	let stdout = "";
	let stderr = "";
	let selected = false;
	let named = false;
	child.stdout.on("data", (chunk) => {
		stdout += chunk;
		if (!selected && stdout.includes("Project selection")) {
			selected = true;
			child.stdin.write("opentui\n");
		}
		if (!named && stdout.includes("Project name:")) {
			named = true;
			child.stdin.write("My Terminal\n");
		}
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});
	const status = await new Promise((resolve, reject) => {
		child.on("error", reject);
		child.on("close", resolve);
	});
	assert.equal(status, 1, stderr);
	assert.equal(selected, true);
	assert.equal(named, true);
	assert.match(stderr, /Bun/);
	assert.deepEqual(readdirSync(root), []);
});
