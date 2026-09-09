import { createHash } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readlinkSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { readRegularFile } from "../archive-inputs.mjs";
import { run } from "../process.mjs";
import {
	privateDirectory,
	relativeSkillPath,
	safeParents,
	stat,
	validateSkill,
	validateTree,
} from "./safety.mjs";

const gitConfig = "[core]\n\trepositoryformatversion = 0\n\tbare = true\n";

function gitEnvironment() {
	const environment = Object.fromEntries(
		Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
	);
	return {
		...environment,
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: "/dev/null",
		GIT_TERMINAL_PROMPT: "0",
		GIT_NO_REPLACE_OBJECTS: "1",
	};
}

function git(directory, args) {
	return run(
		[
			"git",
			"-c",
			"core.hooksPath=/dev/null",
			"-c",
			"core.fsmonitor=false",
			"-c",
			"credential.helper=",
			"-c",
			"protocol.allow=never",
			"-c",
			"protocol.https.allow=always",
			`--git-dir=${directory}`,
			...args,
		],
		{ capture: true, env: gitEnvironment(), timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
	);
}

export function repositoryEntry(selection) {
	const home = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
	if (!isAbsolute(home)) throw new Error("Engineering cache home must be an absolute path");
	const key = createHash("sha256")
		.update(`${selection.repository}\0${selection.revision}`)
		.digest("hex");
	return join(home, "kadajett-engineering", "skills-v1", key);
}

function checkCacheParents(entry, create = false) {
	safeParents(dirname(entry), create);
	privateDirectory(dirname(dirname(entry)));
	privateDirectory(dirname(entry));
	privateDirectory(entry);
}

function assertRepository(directory) {
	safeParents(directory);
	validateTree(directory);
	if (readRegularFile(join(directory, "config")).toString() !== gitConfig)
		throw new Error(`Unexpected skill cache Git configuration: ${directory}`);
	for (const path of ["objects/info/alternates", "objects/info/http-alternates", "info/grafts"]) {
		if (stat(join(directory, path))) throw new Error(`Unsafe skill cache Git indirection: ${path}`);
	}
}

function sourceFiles(root, prefix = "") {
	const result = [];
	for (const name of readdirSync(join(root, prefix))) {
		const path = prefix ? `${prefix}/${name}` : name;
		const entry = stat(join(root, path));
		if (entry.isDirectory()) result.push(...sourceFiles(root, path));
		else result.push(path);
	}
	return result;
}

function verifyBlob(source, record) {
	const split = record.indexOf("\t");
	const [mode, type, object] = record.slice(0, split).split(" ");
	const name = relativeSkillPath(record.slice(split + 1));
	const path = join(source, name);
	const entry = stat(path);
	if (type !== "blob" || !entry)
		throw new Error(`Missing or unsupported cached skill content: ${name}`);
	const bytes = mode === "120000" ? Buffer.from(readlinkSync(path)) : readRegularFile(path);
	const hash = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
	if (hash !== object) throw new Error(`Modified cached skill content: ${name}`);
	if (mode !== "120000" && Boolean(entry.mode & 0o111) !== (mode === "100755"))
		throw new Error(`Modified cached skill permissions: ${name}`);
	return name;
}

function verifyRepository(entry, selection) {
	const directory = join(entry, "repository.git");
	const source = join(entry, "source");
	assertRepository(directory);
	if (
		git(directory, ["rev-parse", "--verify", `${selection.revision}^{commit}`]) !==
		selection.revision
	)
		throw new Error(`Skill cache revision mismatch: ${entry}`);
	git(directory, ["fsck", "--full", "--no-reflogs"]);
	safeParents(source);
	validateTree(source);
	const records = git(directory, ["ls-tree", "-rz", "--full-tree", selection.revision])
		.split("\0")
		.filter(Boolean);
	const expected = records.map((record) => verifyBlob(source, record)).sort();
	if (JSON.stringify(sourceFiles(source).sort()) !== JSON.stringify(expected))
		throw new Error(`Unexpected files in cached skill source: ${entry}`);
}

export function cachedRepository(selection, verified = new Set()) {
	const entry = repositoryEntry(selection);
	checkCacheParents(entry);
	if (!stat(entry)) return undefined;
	if (!verified.has(entry)) {
		try {
			verifyRepository(entry, selection);
		} catch (error) {
			throw new Error(
				`Unsafe or corrupt skill cache ${entry}; remove this entry and retry: ${error.message}`,
				{ cause: error },
			);
		}
		verified.add(entry);
	}
	return validateSkill(
		join(entry, "source", selection.path),
		selection.name,
		join(entry, "source"),
	);
}

function fetchRepository(temporary, selection) {
	const directory = join(temporary, "repository.git");
	git(directory, ["init", "--bare", "--template=", directory]);
	writeFileSync(join(directory, "config"), gitConfig, { mode: 0o600 });
	git(directory, ["fetch", "--no-tags", "--depth=1", selection.repository, selection.revision]);
	if (git(directory, ["rev-parse", "FETCH_HEAD"]) !== selection.revision)
		throw new Error(`Fetched skill revision differs from pinned commit: ${selection.repository}`);
	git(directory, ["read-tree", selection.revision]);
	const source = join(temporary, "source");
	mkdirSync(source, { mode: 0o700 });
	git(directory, [`--work-tree=${source}`, "checkout-index", "--all", `--prefix=${source}/`]);
	verifyRepository(temporary, selection);
	validateSkill(join(source, selection.path), selection.name, source);
}

export function fetchSkill(selection, verified = new Set()) {
	const hit = cachedRepository(selection, verified);
	if (hit) return hit;
	const entry = repositoryEntry(selection);
	checkCacheParents(entry, true);
	const temporary = mkdtempSync(join(dirname(entry), ".fetch-"));
	try {
		fetchRepository(temporary, selection);
		try {
			renameSync(temporary, entry);
		} catch (error) {
			if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error;
		}
		return cachedRepository(selection, verified);
	} finally {
		rmSync(temporary, { recursive: true, force: true });
	}
}
