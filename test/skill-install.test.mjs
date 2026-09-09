import assert from "node:assert/strict";
import {
	cpSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	readlinkSync,
	realpathSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { run } from "../src/process.mjs";
import { repositoryEntry } from "../src/skills/cache.mjs";
import { installSkills } from "../src/skills/install.mjs";
import { fixture } from "./fixture.mjs";

const selection = {
	name: "fixture-skill",
	repository: "https://github.com/example/skills.git",
	revision: "a".repeat(40),
	path: "skills/engineering/fixture-skill",
	reason: "fixture dependency",
};
const document =
	"---\nname: fixture-skill\ndescription: Fixture skill with reference files\n---\nRead references/guide.txt.\n";
const directories = [".agents/skills", ".claude/skills", ".pi/skills", ".omp/skills"];

function environment(t, values) {
	const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
	Object.assign(process.env, values);
	t.after(() => {
		for (const [key, value] of previous) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});
}

function setup(t, projectFiles = {}) {
	const home = fixture(t, {});
	environment(t, {
		HOME: home,
		XDG_CACHE_HOME: join(home, "cache"),
		XDG_CONFIG_HOME: join(home, "config"),
		CLAUDE_CONFIG_DIR: join(home, "claude"),
		CODEX_HOME: join(home, "codex"),
		PI_CODING_AGENT_DIR: join(home, "pi"),
		PI_CONFIG_DIR: ".omp",
		OMP_PROFILE: "",
		PI_PROFILE: "",
	});
	const root = fixture(t, projectFiles);
	const local = fixture(t, {
		"fixture-skill/SKILL.md": document,
		"fixture-skill/references/guide.txt": "keep this reference\n",
	});
	return { root, local, home, options: { skillsDirs: [local] } };
}

function target(root, directory = ".agents/skills") {
	return join(root, directory, selection.name);
}

function linkAt(path, source) {
	mkdirSync(dirname(path), { recursive: true });
	symlinkSync(source, path, "dir");
}

test("local skills preserve reference files and reruns keep the same discoverable links", async (t) => {
	const context = setup(t, {
		".agents/skills/graphify/SKILL.md": "graphify",
		".agents/skills/beads/SKILL.md": "beads",
	});
	const first = await installSkills(context.root, [selection], context.options);
	const second = await installSkills(context.root, [selection], context.options);
	assert.deepEqual(second, first);
	assert.equal(first.skills[0].status, "local");
	for (const directory of directories) {
		const path = target(context.root, directory);
		assert.equal(realpathSync(path), join(context.local, selection.name));
		assert.equal(readFileSync(join(path, "references/guide.txt"), "utf8"), "keep this reference\n");
	}
	assert.equal(
		readlinkSync(target(context.root, ".claude/skills")),
		"../../.agents/skills/fixture-skill",
	);
	assert.equal(readFileSync(join(context.local, "fixture-skill/SKILL.md"), "utf8"), document);
	assert.equal(
		readFileSync(join(context.root, ".agents/skills/graphify/SKILL.md"), "utf8"),
		"graphify",
	);
	assert.equal(readFileSync(join(context.root, ".agents/skills/beads/SKILL.md"), "utf8"), "beads");
	assert.deepEqual(readdirSync(context.home), []);
});

test("existing project-owned skills take precedence and are never replaced or ignored", async (t) => {
	const owned = `${document}\nProject-specific policy\n`;
	const context = setup(t, { ".claude/skills/fixture-skill/SKILL.md": owned });
	const result = await installSkills(context.root, [selection], context.options);
	assert.equal(result.skills[0].status, "project");
	assert.equal(lstatSync(target(context.root, ".claude/skills")).isDirectory(), true);
	assert.equal(readFileSync(join(target(context.root), "SKILL.md"), "utf8"), owned);
	assert.equal(result.links.includes(".claude/skills/fixture-skill"), false);
	assert.deepEqual(await installSkills(context.root, [selection], context.options), result);
});

test("all destination parents are checked before any links are written", async (t) => {
	const context = setup(t);
	const outside = fixture(t, { "keep.txt": "private" });
	linkAt(join(context.root, ".omp"), outside);
	await assert.rejects(
		installSkills(context.root, [selection], context.options),
		/unsafe skill parent/,
	);
	assert.deepEqual(readdirSync(context.root), [".omp"]);
	assert.deepEqual(readdirSync(outside), ["keep.txt"]);
});

test("dangling destinations fail without repairing or replacing user links", async (t) => {
	const context = setup(t);
	const path = target(context.root, ".pi/skills");
	linkAt(path, join(context.local, "missing"));
	await assert.rejects(
		installSkills(context.root, [selection], context.options),
		/Dangling or invalid skill link/,
	);
	assert.equal(readlinkSync(path), join(context.local, "missing"));
	assert.deepEqual(readdirSync(context.root), [".pi"]);
});

test("different existing link targets conflict even when both skills have valid metadata", async (t) => {
	const context = setup(t);
	const other = fixture(t, { "SKILL.md": document });
	linkAt(target(context.root), other);
	await assert.rejects(
		installSkills(context.root, [selection], context.options),
		/Conflicting skill destination/,
	);
	assert.equal(realpathSync(target(context.root)), other);
	assert.deepEqual(readdirSync(context.root), [".agents"]);
});

test("existing agent links to the selected source remain valid when adding the canonical link", async (t) => {
	const context = setup(t);
	const alias = target(context.root, ".claude/skills");
	const source = join(context.local, selection.name);
	linkAt(alias, source);
	await installSkills(context.root, [selection], context.options);
	assert.equal(readlinkSync(alias), source);
	assert.equal(realpathSync(target(context.root)), source);
	assert.equal(readFileSync(join(alias, "SKILL.md"), "utf8"), document);
});

test("a conflict in a later skill preflights the whole selection before project mutation", async (t) => {
	const context = setup(t, { ".omp/skills/another-skill": "user file" });
	const another = { ...selection, name: "another-skill", path: "skills/another-skill" };
	await assert.rejects(
		installSkills(context.root, [selection, another], context.options),
		/Conflicting skill destination/,
	);
	assert.deepEqual(readdirSync(context.root), [".omp"]);
	assert.deepEqual(readdirSync(context.home), []);
});

test("dry runs plan local and missing sources without Git, network, cache, or project writes", async (t) => {
	const context = setup(t);
	environment(t, { PATH: fixture(t, {}) });
	const local = await installSkills(context.root, [selection], {
		...context.options,
		dryRun: true,
	});
	const missing = await installSkills(context.root, [{ ...selection, name: "missing-skill" }], {
		dryRun: true,
	});
	assert.equal(local.skills[0].status, "local");
	assert.equal(missing.skills[0].status, "planned-fetch");
	assert.deepEqual(
		missing.links,
		directories.map((directory) => `${directory}/missing-skill`),
	);
	assert.deepEqual(readdirSync(context.root), []);
	assert.deepEqual(readdirSync(context.home), []);
});

test("local references cannot escape through symlinks and wrong skill names fail closed", async (t) => {
	const context = setup(t);
	const outside = fixture(t, { "secret.txt": "private" });
	const linked = join(context.local, "fixture-skill/references/outside");
	symlinkSync(outside, linked, "dir");
	await assert.rejects(
		installSkills(context.root, [selection], context.options),
		/escapes its directory/,
	);
	unlinkSync(linked);
	writeFileSync(
		join(context.local, "fixture-skill/SKILL.md"),
		document.replace("name: fixture-skill", "name: other"),
	);
	await assert.rejects(
		installSkills(context.root, [selection], context.options),
		/frontmatter name/,
	);
	assert.deepEqual(readdirSync(context.root), []);
});

test("nested Claude plugin installations are reused read-only without changing plugin registration", async (t) => {
	const context = setup(t);
	const plugin = fixture(t, {
		[`${selection.path}/SKILL.md`]: document,
		[`${selection.path}/references/guide.txt`]: "plugin reference",
	});
	const registry = join(process.env.CLAUDE_CONFIG_DIR, "plugins/installed_plugins.json");
	mkdirSync(dirname(registry), { recursive: true });
	const original = JSON.stringify({
		version: 2,
		plugins: { "fixture@official": [{ installPath: plugin }] },
	});
	writeFileSync(registry, original);
	const result = await installSkills(context.root, [selection]);
	assert.equal(result.skills[0].status, "local");
	assert.equal(realpathSync(target(context.root)), join(plugin, selection.path));
	assert.equal(readFileSync(registry, "utf8"), original);
	assert.equal(
		readFileSync(join(target(context.root), "references/guide.txt"), "utf8"),
		"plugin reference",
	);
});

function seedCache(t, links = {}) {
	const context = setup(t);
	const source = fixture(t, {
		[`${selection.path}/SKILL.md`]: document,
		"shared/reference.txt": "repository reference",
	});
	for (const [path, destination] of Object.entries(links)) {
		mkdirSync(dirname(join(source, path)), { recursive: true });
		symlinkSync(destination, join(source, path));
	}
	run(["git", "init", "--quiet", source]);
	run(["git", "-C", source, "add", "."]);
	run([
		"git",
		"-C",
		source,
		"-c",
		"user.name=Fixture",
		"-c",
		"user.email=fixture@example.com",
		"commit",
		"--quiet",
		"-m",
		"fixture",
	]);
	const selected = {
		...selection,
		revision: run(["git", "-C", source, "rev-parse", "HEAD"], { capture: true }),
	};
	const entry = repositoryEntry(selected);
	mkdirSync(entry, { recursive: true, mode: 0o700 });
	run(["git", "clone", "--quiet", "--bare", source, join(entry, "repository.git")]);
	writeFileSync(
		join(entry, "repository.git/config"),
		"[core]\n\trepositoryformatversion = 0\n\tbare = true\n",
	);
	cpSync(source, join(entry, "source"), {
		recursive: true,
		verbatimSymlinks: true,
		filter: (path) => path !== join(source, ".git"),
	});
	return { ...context, selected, entry };
}

test("pinned cache reuse preserves repository-relative references and rejects modified content", async (t) => {
	const context = seedCache(t);
	const first = await installSkills(context.root, [context.selected]);
	assert.equal(first.skills[0].status, "cached");
	assert.equal(
		readFileSync(join(realpathSync(target(context.root)), "../../../shared/reference.txt"), "utf8"),
		"repository reference",
	);
	assert.deepEqual(await installSkills(context.root, [context.selected]), first);
	writeFileSync(
		join(context.entry, "source", selection.path, "SKILL.md"),
		`${document}\nUnexpected instruction\n`,
	);
	await assert.rejects(
		installSkills(context.root, [context.selected]),
		/corrupt skill cache.*Modified cached skill content/,
	);
});

test("corrupt cache source roots cannot redirect skill verification outside the private cache", async (t) => {
	const context = seedCache(t);
	const outside = fixture(t, { [`${selection.path}/SKILL.md`]: document });
	rmSync(join(context.entry, "source"), { recursive: true });
	symlinkSync(outside, join(context.entry, "source"), "dir");
	await assert.rejects(
		installSkills(context.root, [context.selected]),
		/corrupt skill cache.*unsafe skill parent/,
	);
	assert.deepEqual(readdirSync(context.root), []);
	assert.equal(readFileSync(join(outside, selection.path, "SKILL.md"), "utf8"), document);
});

test("repository caches preserve unrelated dangling links but reject broken skill references", async (t) => {
	const context = seedCache(t, { "README.md": "missing-readme.md\n" });
	await installSkills(context.root, [context.selected]);
	assert.equal(readFileSync(join(target(context.root), "SKILL.md"), "utf8"), document);
	const broken = seedCache(t, { [`${selection.path}/missing`]: "absent.md" });
	await assert.rejects(installSkills(broken.root, [broken.selected]), /ENOENT/);
	assert.deepEqual(readdirSync(broken.root), []);
});

test("dangling repository links cannot escape containment directly or through another link", async (t) => {
	const outside = fixture(t, {});
	const direct = seedCache(t, { outside: join(outside, "missing") });
	await assert.rejects(installSkills(direct.root, [direct.selected]), /escapes its directory/);
	const indirect = seedCache(t, { alias: "outside/missing", outside: outside });
	await assert.rejects(installSkills(indirect.root, [indirect.selected]), /escapes its directory/);
	assert.deepEqual(readdirSync(direct.root), []);
	assert.deepEqual(readdirSync(indirect.root), []);
});

test("unresolved parent traversals stay rejected even when their immediate symlink is local", async (t) => {
	const context = seedCache(t, { alias: "inside/../missing", inside: "." });
	await assert.rejects(installSkills(context.root, [context.selected]), /ENOENT/);
	assert.deepEqual(readdirSync(context.root), []);
});
