import { spawnSync } from "node:child_process";

/** What the build agent is told to do, for the session's brief folder (relative to the workspace). */
export function buildPrompt(docs) {
	return `Follow ${docs}/BUILD.md. Work its tickets in dependency order: run bd prime and bd ready --json. You own integration: when several tickets are ready at once and touch separate files, hand each to its own subagent in parallel (one ticket each, with the ticket's acceptance and the files it owns), and work single ready tickets yourself. Each ticket is claimed with bd update <id> --claim, built test first, and closed with bd close <id> --reason once its acceptance passes; after each batch, run the checks yourself and repeat until nothing is ready. If this workspace has no Beads, work ${docs}/TICKETS.md in order instead. The last ticket is ${docs}/TALK-TRACK.md.`;
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
