import { createHash } from "node:crypto";
import { mkdirSync, readlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { readRegularFile } from "../archive-inputs.mjs";
import { run } from "../process.mjs";
import { cacheHome, checkCacheParents, publish, sourceFiles } from "./cache-storage.mjs";
import {
	assertContained,
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
		GIT_NO_LAZY_FETCH: "1",
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
	const key = createHash("sha256")
		.update(`${selection.repository}\0${selection.revision}\0${selection.path}`)
		.digest("hex");
	return join(cacheHome(), key);
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

function treeRecords(directory, revision) {
	return new Map(
		git(directory, ["ls-tree", "-rz", "--full-tree", revision])
			.split("\0")
			.filter(Boolean)
			.map((record) => {
				const split = record.indexOf("\t");
				const [mode, type, object] = record.slice(0, split).split(" ");
				return [relativeSkillPath(record.slice(split + 1)), { mode, type, object }];
			}),
	);
}

function verifyBlob(source, name, record) {
	const { mode, type, object } = record;
	const path = join(source, name);
	const entry = stat(path);
	if (type !== "blob" || !entry || !["100644", "100755", "120000"].includes(mode))
		throw new Error(`Missing or unsupported cached skill content: ${name}`);
	if (entry.isSymbolicLink() !== (mode === "120000"))
		throw new Error(`Modified cached skill type: ${name}`);
	const bytes = mode === "120000" ? Buffer.from(readlinkSync(path)) : readRegularFile(path);
	const hash = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
	if (hash !== object) throw new Error(`Modified cached skill content: ${name}`);
	if (mode !== "120000" && Boolean(entry.mode & 0o111) !== (mode === "100755"))
		throw new Error(`Modified cached skill permissions: ${name}`);
}

function expandReferences(source, name, record, include) {
	const file = join(source, name);
	if (record.mode === "120000") {
		const target = readlinkSync(file);
		if (isAbsolute(target)) throw new Error(`Skill source escapes its directory: ${file}`);
		const resolved = resolve(dirname(file), target);
		assertContained(source, resolved);
		include(relative(source, resolved).split("\\").join("/"));
	} else if (name.endsWith(".md")) {
		const text = readRegularFile(file).toString("utf8");
		for (const match of text.matchAll(/\]\(([^\s)#]+)(?:#[^\s)]*)?\)|`([^`\s]+)`/g)) {
			const target = match[1] ?? match[2];
			if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) continue;
			const resolved = resolve(dirname(file), target);
			assertContained(source, resolved);
			include(relative(source, resolved).split("\\").join("/"), false);
		}
	}
}

// Expand the skill and named references, plus Git control blobs required by fsck.
function selectedFiles(source, records, selection, materialize = () => {}) {
	const selected = new Set();
	const pending = new Set();
	const files = [...records.keys()];
	function include(path, required = true) {
		const matches = files.filter(
			(name) => path === "." || name === path || name.startsWith(`${path}/`),
		);
		if (!matches.length && required) throw new Error(`Missing skill reference: ${path}`);
		for (const name of matches) {
			if (selected.has(name)) continue;
			const { type, mode } = records.get(name);
			if (type !== "blob" || !["100644", "100755", "120000"].includes(mode))
				throw new Error(`Unsupported skill content: ${name}`);
			selected.add(name);
			pending.add(name);
		}
	}
	include(selection.path);
	for (const name of files.filter((path) => /(^|\/)\.(?:gitattributes|gitmodules)$/.test(path)))
		include(name);
	while (pending.size) {
		const names = [...pending];
		pending.clear();
		materialize(names);
		for (const name of names) {
			verifyBlob(source, name, records.get(name));
			expandReferences(source, name, records.get(name), include);
		}
	}
	return [...selected].sort();
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
	const records = treeRecords(directory, selection.revision);
	const expected = selectedFiles(source, records, selection);
	if (JSON.stringify(sourceFiles(source).sort()) !== JSON.stringify(expected))
		throw new Error(`Unexpected files in cached skill source: ${entry}`);
	const blobs = new Set(expected.map((name) => records.get(name).object));
	const objects = git(directory, [
		"cat-file",
		"--batch-all-objects",
		"--batch-check=%(objecttype) %(objectname)",
	]);
	if (objects.split("\n").some((line) => line.startsWith("blob ") && !blobs.has(line.slice(5))))
		throw new Error(
			"Skill fetch included unrelated blobs; the server must support blobless filtered fetches",
		);
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

export function fetchSkill(selection, verified = new Set()) {
	const hit = cachedRepository(selection, verified);
	if (hit) return hit;
	const entry = repositoryEntry(selection);
	publish(entry, (temporary) => {
		const directory = join(temporary, "repository.git");
		git(directory, ["init", "--bare", "--template=", directory]);
		writeFileSync(join(directory, "config"), gitConfig, { mode: 0o600 });
		git(directory, [
			"fetch",
			"--no-tags",
			"--depth=1",
			"--filter=blob:none",
			selection.repository,
			selection.revision,
		]);
		if (git(directory, ["rev-parse", "FETCH_HEAD"]) !== selection.revision)
			throw new Error(`Fetched skill revision differs from pinned commit: ${selection.repository}`);
		git(directory, ["read-tree", selection.revision]);
		const source = join(temporary, "source");
		mkdirSync(source, { mode: 0o700 });
		const records = treeRecords(directory, selection.revision);
		const downloaded = new Set();
		selectedFiles(source, records, selection, (names) => {
			const objects = [...new Set(names.map((name) => records.get(name).object))].filter(
				(object) => !downloaded.has(object),
			);
			if (objects.length) {
				git(directory, [
					"fetch",
					"--no-tags",
					"--no-write-fetch-head",
					"--filter=blob:none",
					selection.repository,
					...objects,
				]);
				for (const object of objects) downloaded.add(object);
			}
			git(directory, [
				`--work-tree=${source}`,
				"checkout-index",
				`--prefix=${source}/`,
				"--",
				...names,
			]);
		});
		// The checkout index names the full tree, including deliberately omitted blobs.
		// It is only extraction state; the published bare cache is verified from Git objects.
		unlinkSync(join(directory, "index"));
		// Partial fetch writes promisor remote settings. Cached verification is offline:
		// retain the promisor packs, but remove network-capable configuration before publishing.
		writeFileSync(join(directory, "config"), gitConfig, { mode: 0o600 });
		verifyRepository(temporary, selection);
		validateSkill(join(source, selection.path), selection.name, source);
	});
	return cachedRepository(selection, verified);
}
