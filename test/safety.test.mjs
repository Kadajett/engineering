import assert from "node:assert/strict";
import { readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { save } from "../src/files.mjs";
import { generatorCommand } from "../src/generate.mjs";
import { selectManager } from "../src/managers.mjs";
import { getProfile } from "../src/profiles.mjs";
import { fixture } from "./fixture.mjs";

test("managed files cannot write through a project symlink", (t) => {
	const outside = fixture(t, { instructions: "keep my instructions\n" });
	const root = fixture(t, {});
	symlinkSync(join(outside, "instructions"), join(root, "AGENTS.md"));
	assert.throws(() => save(root, "AGENTS.md", "replacement"));
	assert.equal(readFileSync(join(outside, "instructions"), "utf8"), "keep my instructions\n");
});

test("adoption refuses conflicting or migrated package managers", (t) => {
	const root = fixture(t, { "package-lock.json": "{}" });
	assert.throws(() => selectManager(root, {}, "bun"));
	writeFileSync(join(root, "bun.lock"), "{}");
	assert.throws(() => selectManager(root, {}, undefined));
	assert.equal(readFileSync(join(root, "package-lock.json"), "utf8"), "{}");
});

test("built-in Cloudflare profiles cannot enable deployment through forwarded flags", () => {
	assert.throws(() => generatorCommand(getProfile("cloudflare"), "worker", ["--deploy"]));
	assert.throws(() => generatorCommand(getProfile("workers-ai"), "worker", ["--no-deploy=false"]));
});
