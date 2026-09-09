import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { generatorCommand } from "../src/generate.mjs";
import { getProfile } from "../src/profiles.mjs";
import { fixture } from "./fixture.mjs";

const profile = getProfile("opentui");
const cli = fileURLToPath(new URL("../bin/engineering.mjs", import.meta.url));

function executable(root, name) {
	chmodSync(join(root, "bin", name), 0o755);
}

test("OpenTUI rejects upstream safety overrides and arbitrary remote templates", () => {
	for (const args of [
		["--no-install=false"],
		["--no-git", "false"],
		["--install"],
		["--", "elsewhere"],
		["--template", "owner/repository"],
		["--template", "react", "--template", "solid"],
		["--template"],
	]) {
		assert.throws(() => generatorCommand(profile, "terminal-app", args));
	}
	const command = generatorCommand(profile, "terminal-app", ["--template", "react"]);
	assert.equal(command.filter((arg) => arg === "--template").length, 1);
	assert.equal(command[command.indexOf("--template") + 1], "react");
	assert.ok(command.includes("--no-git"));
	assert.ok(command.includes("--no-install"));
});

test("missing Bun stops create before baseline prompts, tool installation, or project writes", (t) => {
	const root = fixture(t, {});
	const destination = join(root, "terminal-app");
	const result = spawnSync(
		process.execPath,
		[cli, "create", "opentui", destination, "--install-tools"],
		{
			encoding: "utf8",
			env: { ...process.env, PATH: root },
			timeout: 10000,
		},
	);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Bun/);
	assert.equal(existsSync(destination), false);
	assert.deepEqual(readdirSync(root), []);
});

test("outdated Bun cannot generate a starter whose runtime requirement it cannot meet", (t) => {
	const root = fixture(t, {
		"bin/bun": `#!${process.execPath}\nconsole.log('1.2.22');\n`,
	});
	executable(root, "bun");
	const destination = join(root, "terminal-app");
	const result = spawnSync(
		process.execPath,
		[cli, "create", "opentui", destination, "--no-baseline"],
		{
			encoding: "utf8",
			env: { ...process.env, PATH: join(root, "bin") },
			timeout: 10000,
		},
	);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Bun/);
	assert.equal(existsSync(destination), false);
});

function generate(t, race = false) {
	const root = fixture(t, {
		"bin/bun": `#!${process.execPath}\nconsole.log('1.3.14');\n`,
		"bin/npx": `#!${process.execPath}
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const destination = resolve(process.argv[4]);
if (existsSync(destination)) throw new Error('upstream would offer to delete an existing target');
mkdirSync(destination);
writeFileSync(resolve(destination, 'package.json'), JSON.stringify({ name: 'terminal-app', type: 'module' }));
writeFileSync(resolve(destination, 'app.ts'), 'export const upstream = true;\\n');
if (process.env.RACE === 'yes') {
  mkdirSync(process.env.DESTINATION, { recursive: true });
  writeFileSync(resolve(process.env.DESTINATION, 'keep'), 'user data');
}
`,
	});
	for (const name of ["bun", "npx"]) executable(root, name);
	const destination = join(root, "terminal-app");
	if (!race) mkdirSync(destination);
	const code = `import { generate } from ${JSON.stringify(new URL("../src/generate.mjs", import.meta.url).href)};
import { getProfile } from ${JSON.stringify(new URL("../src/profiles.mjs", import.meta.url).href)};
generate(getProfile('opentui'), ${JSON.stringify(destination)}, { forwarded: [], baseline: false });`;
	const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
		encoding: "utf8",
		env: {
			...process.env,
			PATH: join(root, "bin"),
			RACE: race ? "yes" : "no",
			DESTINATION: destination,
		},
		timeout: 10000,
	});
	return { root, destination, result };
}

test("OpenTUI stages an empty existing destination without exposing it to upstream deletion", (t) => {
	const { root, destination, result } = generate(t);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(
		readFileSync(join(destination, "app.ts"), "utf8"),
		"export const upstream = true;\n",
	);
	assert.equal(
		readdirSync(root).some((name) => name.startsWith(".engineering-create-")),
		false,
	);
});

test("OpenTUI retains staged work and user files when destination content appears during generation", (t) => {
	const { root, destination, result } = generate(t, true);
	assert.equal(result.status, 1);
	assert.equal(readFileSync(join(destination, "keep"), "utf8"), "user data");
	assert.equal(existsSync(join(destination, "package.json")), false);
	const staging = readdirSync(root).find((name) => name.startsWith(".engineering-create-"));
	assert.equal(
		readFileSync(join(root, staging, "terminal-app/app.ts"), "utf8"),
		"export const upstream = true;\n",
	);
});
