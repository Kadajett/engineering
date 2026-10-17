// After the plan is confirmed, the agent breaks it into vertical-slice tickets. They're written to
// TICKETS.md and, when the workspace has Beads, created as beads with their dependencies, so the
// build agent can work them with bd ready / claim / close.

const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

const MUTATION_GATE =
	"\n\nThe project runs mutation testing with its test:mutation script. The ticket just before TALK-TRACK.md must include in its acceptance that test:mutation passes the break threshold in stryker.config.json, with surviving mutants killed by stronger tests rather than a lower threshold.";

/** `mutation` is true when the project has a test:mutation script. */
export function ticketPrompt({ spec, plan, transcript, mutation, note }) {
	const decisions = plan.decisions.map((decision) => `- ${decision.title}: ${decision.chosen}`);
	const history = transcript
		.flat()
		.map(({ question, answer }) => `Q: ${question}\nA: ${answer}`)
		.join("\n");
	return `Break this agreed build into tickets for an agent that builds test first in vertical slices. Each ticket is one behavior a reviewer can see working, small enough for one focused session, with acceptance criteria that are observable (tests that pass, a request that returns a status, a UI state). Order them so each depends only on earlier ones: scaffolding and the domain model first, then each core flow end to end, then the spec's edge cases and stretch items, and last a ticket to write TALK-TRACK.md as BUILD.md describes. Several agents may build ready tickets at once, so depend only on the tickets each one truly needs and name the files each ticket owns in its description. Follow the decisions exactly; don't add scope.${mutation ? MUTATION_GATE : ""}

Reply with exactly one JSON object and nothing else:
{"tickets": [{"key": "t1", "title": "short imperative title", "description": "what to build, which decisions apply, and the files it owns", "acceptance": "observable checks", "depends_on": ["earlier keys"]}]}

Summary: ${plan.summary}

Decisions:
${decisions.join("\n")}

Spec:
"""
${spec.trim()}
"""

Transcript:
${history || "(none)"}${note ? `\n\nNote: ${note}` : ""}
`;
}

function checkDependencies(ticket, earlier) {
	const missing = (ticket.depends_on ?? []).find((key) => !earlier.has(key));
	if (missing !== undefined)
		throw new Error(`ticket ${ticket.key} depends on ${missing}, which isn't earlier`);
}

function checkTicket(ticket, earlier) {
	if (!/^[a-z0-9-]+$/i.test(ticket?.key ?? "") || earlier.has(ticket.key))
		throw new Error(`ticket keys must be unique simple ids, got ${ticket?.key}`);
	if (![ticket.title, ticket.description, ticket.acceptance].every(nonEmpty))
		throw new Error(`ticket ${ticket.key} needs a title, description and acceptance`);
	checkDependencies(ticket, earlier);
}

/** Tickets must be ordered so every dependency comes first; that also rules out cycles. */
export function checkTickets(reply) {
	const tickets = reply?.tickets;
	if (!Array.isArray(tickets) || tickets.length < 2 || tickets.length > 30)
		throw new Error("the build needs 2 to 30 tickets");
	const earlier = new Set();
	for (const ticket of tickets) {
		checkTicket(ticket, earlier);
		earlier.add(ticket.key);
	}
	return tickets;
}

export function ticketsFile(tickets, ids = {}) {
	const sections = tickets.map((ticket, index) => {
		const id = ids[ticket.key] ? ` (${ids[ticket.key]})` : "";
		const after = ticket.depends_on?.length ? `\n\nAfter: ${ticket.depends_on.join(", ")}` : "";
		return `## ${index + 1}. ${ticket.title}${id}${after}\n\n${ticket.description.trim()}\n\n**Acceptance:** ${ticket.acceptance.trim()}`;
	});
	return `# Tickets\n\nWork these in order. When the workspace has Beads, the same tickets are beads: use bd ready, claim, and close.\n\n${sections.join("\n\n")}\n`;
}

/**
 * Create the tickets as beads and wire their dependencies. `bd(args)` runs bd in the workspace and
 * returns stdout. Returns { [ticket key]: bead id }.
 */
export function createBeads(tickets, bd) {
	const ids = {};
	for (const ticket of tickets) {
		const out = bd([
			"create",
			"--title",
			ticket.title,
			"--description",
			ticket.description,
			"--acceptance",
			ticket.acceptance,
			"--type",
			"task",
			"--json",
		]);
		ids[ticket.key] = JSON.parse(out.slice(out.indexOf("{"))).id;
		for (const key of ticket.depends_on ?? []) bd(["dep", "add", ids[ticket.key], ids[key]]);
	}
	return ids;
}
