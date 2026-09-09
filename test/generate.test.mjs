import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { generatorCommand } from "../src/generate.mjs";
import { recoverTemplateInstall } from "../src/generation-compatibility.mjs";
import { projectSlug } from "../src/generation-names.mjs";
import { getProfile } from "../src/profiles.mjs";
import { fixture } from "./fixture.mjs";

const profile = getProfile("workers-ai");
const manifest = {
	name: "llm-chat-app-template",
	cloudflare: { label: "LLM Chat App" },
	devDependencies: { wrangler: "4.127.0", "@cloudflare/workers-types": "^4.20260702.1" },
};
const source = "export default { fetch() { return new Response('upstream logic'); } };\n";
const files = {
	"package.json": JSON.stringify(manifest),
	"wrangler.jsonc": '{\n\t"name": "llm-chat-app-template",\n\t"ai": { "binding": "AI" }\n}\n',
	"tsconfig.json": "{}",
	"src/index.ts": source,
	"public/index.html":
		'<title>LLM Chat App</title><h1>Cloudflare AI Chat</h1><script src="chat.js"></script>',
	"public/chat.js": "fetch('/api/chat');\n",
};
const conflict =
	'files copied to project directory\nnpm error code ERESOLVE\nnpm error While resolving: wrangler@4.127.0\nnpm error @cloudflare/workers-types@"^4.20260702.1" from the root project\nnpm error peerOptional @cloudflare/workers-types@"^5.20260826.1" from wrangler@4.127.0\n';

function create(
	t,
	{ name, directory = "MixedCaseDirectory", scenario = "success", initial = {} } = {},
) {
	const parent = fixture(t, {
		...initial,
		"bin/npm":
			"#!/usr/bin/env node\nconsole.error('unexpected npm registry lookup'); process.exit(73);\n",
		"bin/npx": `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const root = resolve(process.argv[4]);
for (const [name, content] of Object.entries(${JSON.stringify(files)})) {
  const path = resolve(root, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content);
}
if (process.env.SCENARIO === 'race') { mkdirSync(process.env.DESTINATION, { recursive: true }); writeFileSync(resolve(process.env.DESTINATION, 'keep'), 'user data'); }
if (process.env.SCENARIO === 'conflict') { console.error(${JSON.stringify(conflict)}); process.exit(1); }
if (process.env.SCENARIO === 'failure') { console.error('unrelated template failure'); process.exit(1); }
`,
	});
	chmodSync(join(parent, "bin/npx"), 0o755);
	chmodSync(join(parent, "bin/npm"), 0o755);
	const destination = join(parent, directory);
	const code = `import { generate } from ${JSON.stringify(new URL("../src/generate.mjs", import.meta.url).href)};
import { getProfile } from ${JSON.stringify(new URL("../src/profiles.mjs", import.meta.url).href)};
console.log(JSON.stringify(generate(getProfile('workers-ai'), ${JSON.stringify(destination)}, ${JSON.stringify({ name, forwarded: [], baseline: false })})));`;
	const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
		encoding: "utf8",
		env: {
			...process.env,
			PATH: `${join(parent, "bin")}:${process.env.PATH}`,
			SCENARIO: scenario,
			DESTINATION: destination,
		},
	});
	return { parent, destination, result };
}

test("fixed remote templates reject C3 defaults, selectors, and alias overrides", () => {
	for (const flag of [
		"--accept-defaults",
		"--acceptDefaults=true",
		"--accept-defaults.any=true",
		"-y",
		"--category",
		"--type=hello-world",
		"-t",
		"--template",
		"--framework",
		"-freact",
		"--existingScript",
		"--experimental",
		"--auto-update",
		"--no-auto-update=false",
		"--wrangler-defaults",
		"--",
	]) {
		assert.throws(() => generatorCommand(profile, "worker", [flag]), undefined, flag);
	}
	assert.deepEqual(
		generatorCommand(getProfile("cloudflare"), "worker", ["--category", "hello-world"]).slice(-2),
		["--category", "hello-world"],
	);
});

test("Cloudflare safety guards reject both enabling and negation overrides", () => {
	for (const flag of [
		"--deploy",
		"--deploy=true",
		"--no-deploy=false",
		"--deploy.any=true",
		"--open",
		"--no-open=false",
		"--open.any=true",
	]) {
		assert.throws(() => generatorCommand(profile, "worker", [flag]));
	}
});

test("project slugs remain valid and distinguish truncated and non-Latin names", () => {
	assert.equal(projectSlug("Café Support & AI"), "cafe-support-ai");
	for (const name of ["中文", "!!!", "a".repeat(100)])
		assert.match(projectSlug(name), /^[a-z0-9][a-z0-9-]{0,56}[a-z0-9]$/);
	assert.notEqual(projectSlug("中文"), projectSlug("日本語"));
	assert.notEqual(projectSlug(`${"a".repeat(100)}x`), projectSlug(`${"a".repeat(100)}y`));
	assert.throws(() => projectSlug("   "));
});

test("separate display name reaches final mixed-case directory without changing app logic", (t) => {
	const { parent, destination, result } = create(t, { name: "Support & <AI>" });
	assert.equal(result.status, 0, result.stderr);
	const pkg = JSON.parse(readFileSync(join(destination, "package.json"), "utf8"));
	assert.equal(pkg.name, "support-ai");
	assert.equal(pkg.cloudflare.label, "Support & <AI>");
	assert.match(readFileSync(join(destination, "wrangler.jsonc"), "utf8"), /"name": "support-ai"/);
	assert.equal(
		readFileSync(join(destination, "public/index.html"), "utf8"),
		'<title>Support &amp; &lt;AI&gt;</title><h1>Support &amp; &lt;AI&gt;</h1><script src="chat.js"></script>',
	);
	assert.equal(readFileSync(join(destination, "src/index.ts"), "utf8"), source);
	assert.equal(readFileSync(join(destination, "public/chat.js"), "utf8"), files["public/chat.js"]);
	assert.deepEqual(readdirSync(parent).sort(), ["MixedCaseDirectory", "bin"]);
});

test("known install conflict resumes only through its declared dependency correction", (t) => {
	const { destination, result } = create(t, { name: "My Chat", scenario: "conflict" });
	assert.equal(result.status, 0, result.stderr);
	const pkg = JSON.parse(readFileSync(join(destination, "package.json"), "utf8"));
	assert.deepEqual(pkg.devDependencies, {
		...manifest.devDependencies,
		"@cloudflare/workers-types": "5.20260826.1",
	});
	assert.equal(readFileSync(join(destination, "src/index.ts"), "utf8"), source);
});

test("unrelated failures retain staged work and do not create the requested destination", (t) => {
	const { parent, destination, result } = create(t, { name: "My Chat", scenario: "failure" });
	assert.notEqual(result.status, 0);
	assert.equal(existsSync(destination), false);
	const staging = readdirSync(parent).find((entry) => entry.startsWith(".engineering-create-"));
	assert.equal(readFileSync(join(parent, staging, "my-chat", "src/index.ts"), "utf8"), source);
});

test("destination content appearing during generation is never overwritten", (t) => {
	const { parent, destination, result } = create(t, { scenario: "race" });
	assert.notEqual(result.status, 0);
	assert.equal(readFileSync(join(destination, "keep"), "utf8"), "user data");
	const staging = readdirSync(parent).find((entry) => entry.startsWith(".engineering-create-"));
	assert.equal(
		readFileSync(join(parent, staging, "mixedcasedirectory", "src/index.ts"), "utf8"),
		source,
	);
});

test("preexisting nonempty destinations fail before invoking the generator", (t) => {
	const { destination, result } = create(t, {
		initial: { "MixedCaseDirectory/keep": "user data" },
	});
	assert.notEqual(result.status, 0);
	assert.deepEqual(readdirSync(destination), ["keep"]);
});

test("install recovery rejects changed versions, incomplete templates, signals, and unrelated errors", (t) => {
	const cases = [
		{ output: conflict.replace("4.127.0", "4.128.0") },
		{ output: "npm error code ENOTFOUND\nnpm install" },
		{ output: `${conflict}\nnpm error code ENOTFOUND` },
		{ output: `${conflict}\nApplication created\nStep 2 of 3` },
		{ output: conflict, status: 2 },
		{ output: conflict, signal: "SIGTERM" },
		{
			output: conflict,
			files: {
				...files,
				"package.json": JSON.stringify({
					...manifest,
					devDependencies: { ...manifest.devDependencies, wrangler: "4.128.0" },
				}),
			},
		},
		{ output: conflict, files: { "package.json": files["package.json"] } },
	];
	for (const entry of cases) {
		const root = fixture(t, entry.files ?? files);
		const before = readFileSync(join(root, "package.json"), "utf8");
		assert.equal(
			recoverTemplateInstall(profile, root, {
				status: entry.status ?? 1,
				signal: entry.signal,
				stderr: entry.output,
			}),
			false,
		);
		assert.equal(readFileSync(join(root, "package.json"), "utf8"), before);
	}
});
