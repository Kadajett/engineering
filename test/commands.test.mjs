import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseOptions } from "../src/options.mjs";
import { fixture } from "./fixture.mjs";

const cli = fileURLToPath(new URL("../bin/engineering.mjs", import.meta.url));
const run = (args, cwd) =>
	spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", timeout: 10000 });

test("folded commands fail and name the command that replaced them", () => {
	const folded = {
		plan: "create <profile> <dir> --dry-run",
		list: "create --help",
		recommend: "skills --suggest",
		baseline: "check --baseline",
		prune: "check --prune",
		setup: "doctor --fix",
	};
	for (const [old, replacement] of Object.entries(folded)) {
		const result = run([old]);
		assert.equal(result.status, 1);
		assert.ok(result.stderr.includes(`engineering ${replacement}`), `${old}: ${result.stderr}`);
	}
});

test("replaced flags fail and name their replacement", () => {
	assert.throws(() => parseOptions(["create", "next", "--no-beads"]), /Use: --without beads/);
	assert.throws(() => parseOptions(["check", "--accept"]), /Use: --baseline --reason/);
});

test("an option outside a command is refused with that command's help", () => {
	assert.throws(
		() => parseOptions(["check", "--manager", "bun"]),
		/--manager isn't an option for engineering check\. See engineering check --help/,
	);
	assert.throws(
		() => parseOptions(["grill", "--name", "x"]),
		/isn't an option for engineering grill/,
	);
	assert.throws(
		() => parseOptions(["adopt", "--generator", "x"]),
		/isn't an option for engineering adopt/,
	);
});

test("--without leaves out exactly the named integrations; grill can only leave out beads", () => {
	const { options } = parseOptions(["create", "next", "--without", "beads, ci"]);
	const enabled = ["beads", "graphify", "ci", "skills", "mutation"].map((name) => options[name]);
	assert.deepEqual(enabled, [false, true, false, true, true]);
	assert.equal(parseOptions(["grill", "--without", "beads"]).options.beads, false);
	assert.throws(
		() => parseOptions(["grill", "--without", "ci"]),
		/--without takes beads; got "ci"/,
	);
	assert.throws(() => parseOptions(["create", "--without", "tests"]), /got "tests"/);
});

test("check records a baseline only with a reason and never while pruning", () => {
	assert.throws(() => parseOptions(["check", "--baseline"]), /requires an explicit --reason/);
	assert.throws(
		() => parseOptions(["check", "--baseline", "--reason", "x", "--prune"]),
		/--baseline or --prune/,
	);
	assert.throws(() => parseOptions(["skills", "--json"]), /--json needs --suggest/);
});

test("adopting retires untouched scripts for folded commands and keeps edited ones", (t) => {
	const scripts = {
		test: "vitest run",
		"engineering:baseline": "engineering baseline",
		"engineering:prune": "engineering prune --mine",
	};
	const root = fixture(t, { "package.json": JSON.stringify({ name: "x", scripts }) });
	const without = "beads,graphify,ci,skills,mutation";
	const result = run(["adopt", ".", "--dry-run", "--without", without], root);
	assert.equal(result.status, 0, result.stderr);
	const planned = JSON.parse(result.stdout).manifest.scripts;
	assert.equal(planned["engineering:baseline"], undefined);
	assert.equal(planned["engineering:prune"], "engineering prune --mine");
	assert.equal(planned["engineering:check"], "engineering check");
});

test("help lists the six commands, and each command shows its own options", () => {
	const overview = run(["--help"]).stdout;
	for (const name of ["create", "adopt", "grill", "check", "skills", "doctor"])
		assert.match(overview, new RegExp(`^  ${name} `, "m"));
	assert.doesNotMatch(overview, /^ {2}(plan|list|recommend|baseline|prune|setup)\b/m);
	assert.match(run(["create", "--help"]).stdout, /--without LIST[\s\S]*Profiles:[\s\S]*next/);
	assert.match(run(["help", "check"]).stdout, /--prune/);
});
