// What happens after the plan exists: tickets, beads, and the saved state that lets a rerun pick up
// where the last one stopped. Each grilled topic is a session with its own folder, so a project can
// be grilled again later for the next feature:
//   docs/grill/<slug>/            SPEC, DECISIONS, TRANSCRIPT, TICKETS, BUILD (and TALK-TRACK later)
//   .engineering/grill/<slug>.json  plan, transcript, tickets and bead ids
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { projectSlug } from "../generation-names.mjs";
import { agentJson } from "./session.mjs";
import { checkTickets, createBeads, ticketPrompt, ticketsFile } from "./tickets.mjs";

export function grillSession(workspace, topic) {
	const slug =
		projectSlug(
			topic
				.replace(/[^\p{L}\p{N}\s-]/gu, " ")
				.trim()
				.split(/\s+/)
				.slice(0, 8)
				.join(" "),
		) || "grill";
	return {
		workspace,
		slug,
		docs: join(workspace, "docs/grill", slug),
		state: join(workspace, ".engineering/grill", `${slug}.json`),
	};
}

export function readState(session) {
	return existsSync(session.state) ? JSON.parse(readFileSync(session.state, "utf8")) : null;
}

export function saveState(session, state) {
	mkdirSync(join(session.workspace, ".engineering/grill"), { recursive: true });
	writeFileSync(session.state, `${JSON.stringify(state, null, 2)}\n`);
}

function writeTickets(session, tickets, ids) {
	mkdirSync(session.docs, { recursive: true });
	writeFileSync(join(session.docs, "TICKETS.md"), ticketsFile(tickets, ids));
}

/** Ask the agent for tickets once (a saved plan may already carry them). */
export async function ensureTickets(session, prompt, state, agent) {
	if (state.tickets) return state;
	const tickets = await agentJson(
		agent,
		(note) => ticketPrompt({ spec: prompt, plan: state.plan, transcript: state.transcript, note }),
		(reply) => checkTickets(reply, state.plan),
	);
	const next = { ...state, tickets };
	writeTickets(session, tickets);
	saveState(session, next);
	console.log(
		`\n${tickets.length} tickets written to ${join("docs/grill", session.slug, "TICKETS.md")}.`,
	);
	return next;
}

function bdIn(workspace) {
	return (args) => {
		const result = spawnSync("bd", args, { cwd: workspace, encoding: "utf8" });
		if (result.error || result.status !== 0)
			throw new Error(
				`bd ${args[0]} failed: ${(result.stderr || result.stdout || result.error?.message || "").trim().slice(-300)}`,
			);
		return result.stdout;
	};
}

/** Create the tickets as beads in the workspace, initializing Beads there if it has none yet. */
export function ensureBeads(session, state, options) {
	if (state.beadIds || options.beads === false) return state;
	const bd = bdIn(session.workspace);
	if (!existsSync(join(session.workspace, ".beads")))
		bd([
			"init",
			"--prefix",
			projectSlug(basename(session.workspace)),
			"--non-interactive",
			"--skip-agents",
			"--skip-hooks",
		]);
	const beadIds = createBeads(state.tickets, bd);
	const next = { ...state, beadIds };
	writeTickets(session, state.tickets, beadIds);
	saveState(session, next);
	console.log(
		`Created ${Object.keys(beadIds).length} beads with their dependencies; bd ready shows what's next.`,
	);
	return next;
}
