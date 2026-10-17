import { spawnSync } from "node:child_process";

/** What the build agent is told to do, for the session's brief folder (relative to the workspace). */
export function buildPrompt(docs) {
	return `Follow ${docs}/BUILD.md. You are the orchestrator and own integration. Run bd prime and bd ready --json. Whenever two or more tickets are ready, start one subagent per ticket in a single parallel batch; give each its bead id, description, acceptance and owned files, and tell it to claim the bead with bd update <id> --claim, build test first, run only its own tests, and leave the bead open. Work a lone ready ticket yourself. After each batch, run the project's test, lint and check scripts yourself, fix integration problems, then close each finished bead with bd close <id> --reason once its acceptance passes. Repeat until bd ready is empty and every bead is closed; don't stop, ask questions or wait for confirmation before then. If this workspace has no Beads, work ${docs}/TICKETS.md in order instead. The last ticket is ${docs}/TALK-TRACK.md.`;
}

/** The interactive build session for an agent, or null when the agent has no interactive mode here. */
export function buildCommand(agent, docs) {
	if (agent === "claude" || agent === "omp") return { command: agent, args: [buildPrompt(docs)] };
	return null;
}

/** Hand the terminal to the build agent in the workspace until it exits. */
export function kickoff(workspace, docs, agent = "omp") {
	const build = buildCommand(agent, docs);
	if (!build) {
		console.log(
			`\nNo interactive build agent for ${agent}. Start one in ${workspace} and point it at ${docs}/BUILD.md.`,
		);
		return;
	}
	console.log(`\nStarting ${build.command} in ${workspace} to work the tickets.\n`);
	const result = spawnSync(build.command, build.args, { cwd: workspace, stdio: "inherit" });
	if (result.error) throw new Error(`Couldn't start ${build.command}: ${result.error.message}`);
}
