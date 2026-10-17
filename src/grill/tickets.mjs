// After the plan is confirmed, the agent breaks it into vertical-slice tickets. They're written to
// TICKETS.md and, when the workspace has Beads, created as beads with their dependencies, so the
// build agent can work them with bd ready / claim / close.

const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

export function ticketPrompt({ spec, plan, transcript, note }) {
	const decisions = plan.decisions.map((decision) => `- ${decision.title}: ${decision.chosen}`);
	const dirs = plan.projects.length
		? plan.projects.map(({ dir, profile }) => `- "${dir}": ${profile}`).join("\n")
		: '- ".": the existing project this work extends';
	const history = transcript
		.flat()
		.map(({ question, answer }) => `Q: ${question}\nA: ${answer}`)
		.join("\n");
	return `Break this agreed build into tickets for an agent that builds test first in vertical slices. Each ticket is one behavior a reviewer can see working, small enough for one focused session, with acceptance criteria that are observable (tests that pass, a request that returns a status, a UI state). Order them so each depends only on earlier ones: scaffolding and the domain model first, then each core flow end to end, then the spec's edge cases and stretch items, and last a ticket to write TALK-TRACK.md as BUILD.md describes. Follow the decisions exactly; don't add scope.

Reply with exactly one JSON object and nothing else:
{"tickets": [{"key": "t1", "title": "short imperative title", "description": "what to build and which decisions apply", "acceptance": "observable checks", "project": "<project dir>", "depends_on": ["earlier keys"]}]}

Projects:
${dirs}

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

function checkTicket(ticket, earlier, dirs) {
	if (!/^[a-z0-9-]+$/i.test(ticket?.key ?? "") || earlier.has(ticket.key))
		throw new Error(`ticket keys must be unique simple ids, got ${ticket?.key}`);
	if (![ticket.title, ticket.description, ticket.acceptance].every(nonEmpty))
		throw new Error(`ticket ${ticket.key} needs a title, description and acceptance`);
	if (!dirs.includes(ticket.project))
		throw new Error(`ticket ${ticket.key} names unknown project ${ticket.project}`);
	checkDependencies(ticket, earlier);
}

/** Tickets must be ordered so every dependency comes first; that also rules out cycles. */
export function checkTickets(reply, plan) {
	const tickets = reply?.tickets;
	if (!Array.isArray(tickets) || tickets.length < 2 || tickets.length > 30)
		throw new Error("the build needs 2 to 30 tickets");
	const dirs = plan.projects.length ? plan.projects.map(({ dir }) => dir) : ["."];
	const earlier = new Set();
	for (const ticket of tickets) {
		checkTicket(ticket, earlier, dirs);
		earlier.add(ticket.key);
	}
	return tickets;
}

export function ticketsFile(tickets, ids = {}) {
	const sections = tickets.map((ticket, index) => {
		const id = ids[ticket.key] ? ` (${ids[ticket.key]})` : "";
		const after = ticket.depends_on?.length ? `\n\nAfter: ${ticket.depends_on.join(", ")}` : "";
		return `## ${index + 1}. ${ticket.title}${id}\n\nProject: \`${ticket.project}\`${after}\n\n${ticket.description.trim()}\n\n**Acceptance:** ${ticket.acceptance.trim()}`;
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
			`${ticket.description}\n\nProject: ${ticket.project}`,
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
