import { lstatSync, mkdirSync, readlinkSync, symlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { managedBlock, safePath, save, text } from "../files.mjs";

const workflow = `## Beads task workflow

Beads is the durable task and memory source for this project. Run commands from the project root using its own .beads workspace.

1. At session start and after context compaction, run bd prime, then bd ready --json. Before continuing an assigned task, run bd show <id>.
2. Before implementation, claim the task with bd update <id> --claim. If the request has no bead, create one with bd create "<title>" --description "<scope and acceptance>" --json, then claim its returned ID. A claim failure means another agent owns it: coordinate instead of taking it over.
3. Record discovered work as a bead. Use bd dep add <blocked-id> <blocker-id> for prerequisites; use bd create "<title>" --deps discovered-from:<id> for discoveries. Keep unrelated scope out of the current task.
4. Before delegation, give each worker its bead ID, scope, and acceptance criteria. Workers claim their own child tasks; the parent retains integration ownership. OMP task/hub messages coordinate live work; OMP todo and other agents' plans are session checklists, not replacements for Beads.
5. Before handoff or compaction, use bd update <id> --append-notes "<changes; verification; blocker; exact next action>". Record reusable project facts with bd remember "<fact>". Keep unfinished work open and describe the blocker rather than closing it.
6. After the task's acceptance checks pass, close it with bd close <id> --reason "<result and verification>". Report the bead ID and any remaining blockers to the user.

Use the installed bd help and bd prime for current storage/command details. Access task state through bd, not hand-edited storage. Git source history and Dolt task history are separate; setup does not authorize Git/Dolt pushes, remotes, deployments, or cloud resources.`;

const nativePointer = `## Project task context

Read the root AGENTS.md for this project's engineering policy and Beads task workflow. At session start and after compaction, run bd prime and bd ready --json from the project root before choosing work. Load the local beads skill for detailed commands. Session todo lists and subagent messages coordinate execution; persist claims, blockers, verification, and handoff notes in Beads.`;

const primeContext = `# Project Beads context

Follow the Beads task workflow in the root AGENTS.md. Beads owns durable task state and memory; harness-native todo lists and subagent messages are temporary execution aids, not a second issue tracker.

Run bd ready --json before choosing work and bd show <id> before continuing it. Claim tasks before implementation; save blockers, verification, and the exact next action before handoff; close only after acceptance checks pass.

Read stored project memories now with bd prime --export --memories-only; --export bypasses this project primer. Use bd <command> --help for current command details. Git/Dolt pushes and remotes require separate authorization.`;

function addPrimeContext(root, files) {
	const path = ".beads/PRIME.md";
	const original = text(root, path);
	if (original && !original.includes("<!-- engineering:beads-prime:start -->")) return;
	files.set(path, managedBlock(original, "beads-prime", primeContext));
}

function linkState(path, target) {
	let entry;
	try {
		entry = lstatSync(path);
	} catch (error) {
		if (error.code === "ENOENT") return false;
		throw error;
	}
	if (!entry.isSymbolicLink() || resolve(dirname(path), readlinkSync(path)) !== target)
		throw new Error(
			`Conflicting Beads skill destination: ${path}; preserve it and resolve explicitly.`,
		);
	return true;
}

export function beadsAgentPlan(root) {
	const files = new Map();
	for (const name of ["AGENTS.md", ".omp/AGENTS.md"]) {
		const body = name === "AGENTS.md" ? workflow : `@../AGENTS.md\n\n${nativePointer}`;
		files.set(name, managedBlock(text(root, name), "beads", body));
	}
	addPrimeContext(root, files);
	const target = safePath(root, ".agents/skills/beads");
	const links = [".omp/skills", ".pi/skills"].map((directory) => {
		const path = join(safePath(root, directory), "beads");
		return { path, target, exists: linkState(path, target) };
	});
	return { files, links };
}

export function installBeadsAgents(root) {
	const plan = beadsAgentPlan(root);
	for (const [name, content] of plan.files) save(root, name, content);
	for (const link of plan.links) {
		if (link.exists) continue;
		mkdirSync(dirname(link.path), { recursive: true });
		symlinkSync(relative(dirname(link.path), link.target), link.path, "dir");
	}
}
