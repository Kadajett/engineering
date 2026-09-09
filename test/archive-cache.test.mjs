import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { cachedArchive } from "../src/archive-cache.mjs";
import { archiveName as installedArchiveName, packInto } from "../src/package-install.mjs";
import { run } from "../src/process.mjs";
import { fixture } from "./fixture.mjs";

const archiveName = "kadajett-engineering-1.0.0.tgz";
const manifest = {
	name: "@kadajett/engineering",
	version: "1.0.0",
	files: ["src", "configs", "README.md"],
};

function setup(t) {
	const root = fixture(t, {
		"package.json": JSON.stringify(manifest),
		"src/index.mjs": "export const answer = 42;\n",
		"configs/policy.json": '{"limit":10}\n',
		"README.md": "Portable package\n",
	});
	const cacheHome = fixture(t, {});
	let calls = 0;
	let packedFiles;
	const options = {
		cacheHome,
		pack(command, settings) {
			calls++;
			const output = run(command, settings);
			packedFiles = JSON.parse(output)[0].files.map((file) => file.path);
			return output;
		},
	};
	return {
		root,
		cacheHome,
		get calls() {
			return calls;
		},
		get packedFiles() {
			return packedFiles;
		},
		pack: () => cachedArchive(root, archiveName, options),
		entries: () => {
			const directory = join(cacheHome, "kadajett-engineering", "archives-v1");
			return readdirSync(directory)
				.filter((name) => !name.startsWith("."))
				.map((name) => join(directory, name));
		},
	};
}

test("unchanged packaged content skips npm pack while development files and local state stay outside archives", (t) => {
	const context = setup(t);
	const first = context.pack();
	for (const name of [
		"test/development.mjs",
		"node_modules/private/index.js",
		".engineering/state.json",
		"src/.env",
		"configs/private.key",
	]) {
		mkdirSync(join(context.root, name, ".."), { recursive: true });
		writeFileSync(join(context.root, name), "private development data");
	}
	assert.deepEqual(context.pack(), first);
	assert.equal(context.calls, 1);
	// A fresh cache forces packaging with the unrelated files present, not just a cache read.
	rmSync(join(context.cacheHome, "kadajett-engineering"), { recursive: true });
	assert.deepEqual(context.pack(), first);
	assert.deepEqual(context.packedFiles.sort(), [
		"README.md",
		"configs/policy.json",
		"package.json",
		"src/index.mjs",
	]);
});

test("source, config, documentation, manifest, ignore rules, additions and deletions invalidate cached artifacts", (t) => {
	const context = setup(t);
	let previous = context.pack();
	const changes = [
		() => writeFileSync(join(context.root, "src/index.mjs"), "export const answer = 43;\n"),
		() => writeFileSync(join(context.root, "configs/policy.json"), '{"limit":12}\n'),
		() => writeFileSync(join(context.root, "README.md"), "Updated portable package\n"),
		() =>
			writeFileSync(
				join(context.root, "package.json"),
				JSON.stringify({ ...manifest, description: "Changed manifest" }),
			),
		() => writeFileSync(join(context.root, "src/extra.mjs"), "export const extra = true;\n"),
		() => writeFileSync(join(context.root, "src/.npmignore"), "extra.mjs\n"),
		() => rmSync(join(context.root, "src/index.mjs")),
	];
	for (const [index, change] of changes.entries()) {
		change();
		const current = context.pack();
		assert.notDeepEqual(current, previous);
		assert.deepEqual(context.pack(), current);
		assert.equal(context.calls, index + 2);
		previous = current;
	}
});

test("truncated archives and damaged integrity records are rebuilt before consumption", (t) => {
	const context = setup(t);
	const expected = context.pack();
	const [entry] = context.entries();
	writeFileSync(join(entry, archiveName), expected.subarray(0, 24));
	assert.deepEqual(context.pack(), expected);
	assert.equal(context.calls, 2);
	writeFileSync(join(entry, "integrity.json"), "{");
	assert.deepEqual(context.pack(), expected);
	assert.equal(context.calls, 3);
	assert.deepEqual(context.pack(), expected);
	assert.equal(context.calls, 3);
});

test("cache symlinks never write through to external files or directories", (t) => {
	const context = setup(t);
	const outside = fixture(t, { "keep.tgz": "do not replace" });
	const expected = context.pack();
	const [entry] = context.entries();
	rmSync(join(entry, archiveName));
	symlinkSync(join(outside, "keep.tgz"), join(entry, archiveName));
	assert.deepEqual(context.pack(), expected);
	assert.equal(readFileSync(join(outside, "keep.tgz"), "utf8"), "do not replace");
	const otherCache = fixture(t, {});
	symlinkSync(outside, join(otherCache, "kadajett-engineering"));
	assert.throws(
		() => cachedArchive(context.root, archiveName, { cacheHome: otherCache }),
		/unsafe cache directory/,
	);
	assert.deepEqual(readdirSync(outside), ["keep.tgz"]);
});

test("allowlisted source symlinks cannot pull external content into the archive", (t) => {
	const context = setup(t);
	const outside = fixture(t, { "secret.mjs": "private data" });
	symlinkSync(join(outside, "secret.mjs"), join(context.root, "src/linked.mjs"));
	assert.throws(() => context.pack(), /symlink in package inputs/);
	assert.equal(context.calls, 0);
});

test("concurrent processes publish complete interchangeable archives", async (t) => {
	const context = setup(t);
	const moduleUrl = new URL("../src/archive-cache.mjs", import.meta.url).href;
	const script = `import { cachedArchive } from ${JSON.stringify(moduleUrl)};
import { createHash } from 'node:crypto';
const bytes = cachedArchive(process.argv[1], process.argv[2], { cacheHome: process.argv[3] });
process.stdout.write(createHash('sha256').update(bytes).digest('hex'));`;
	const start = () =>
		new Promise((resolve, reject) => {
			const child = spawn(process.execPath, [
				"--input-type=module",
				"-e",
				script,
				context.root,
				archiveName,
				context.cacheHome,
			]);
			let stdout = "";
			let stderr = "";
			child.stdout.on("data", (chunk) => {
				stdout += chunk;
			});
			child.stderr.on("data", (chunk) => {
				stderr += chunk;
			});
			child.on("error", reject);
			child.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(stderr))));
		});
	const results = await Promise.all([start(), start(), start()]);
	const bytes = context.pack();
	const expected = createHash("sha256").update(bytes).digest("hex");
	assert.deepEqual(results, [expected, expected, expected]);
	assert.equal(context.calls, 0);
	assert.equal(context.entries().length, 1);
});

test("an existing project archive with different bytes remains a version collision", (t) => {
	const cacheHome = fixture(t, {});
	const previous = process.env.XDG_CACHE_HOME;
	process.env.XDG_CACHE_HOME = cacheHome;
	t.after(() => {
		if (previous === undefined) delete process.env.XDG_CACHE_HOME;
		else process.env.XDG_CACHE_HOME = previous;
	});
	const root = fixture(t, {});
	packInto(root);
	const target = join(root, ".engineering/vendor", installedArchiveName);
	const original = readFileSync(target);
	packInto(root);
	assert.deepEqual(readFileSync(target), original);
	writeFileSync(target, "previous content under the same version");
	assert.throws(() => packInto(root), /bump the engineering package version/);
	assert.equal(readFileSync(target, "utf8"), "previous content under the same version");
});
