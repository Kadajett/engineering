export function specFile(source, prompt) {
	return `# Spec\n\nThe exercise exactly as given (from \`${source}\`). Build what it asks; anything beyond it is listed in DECISIONS.md.\n\n---\n\n${prompt.trim()}\n`;
}

function decisionSection(decision) {
	const lines = [`## ${decision.title}`, "", `**Chosen:** ${decision.chosen}`];
	if (decision.alternatives?.length)
		lines.push("", `**Considered:** ${decision.alternatives.join("; ")}`);
	lines.push(
		"",
		`**Why:** ${decision.why?.trim() || "Not given yet. Decide your reason before the interview."}`,
	);
	return lines.join("\n");
}

export function decisionsFile(plan, date) {
	return `# Decisions

Settled in an \`engineering grill\` session on ${date}. The build follows these; the talk track explains them.

## Shared understanding

${plan.summary.trim()}

${plan.decisions.map(decisionSection).join("\n\n")}
`;
}

export function transcriptFile(transcript) {
	const turns = transcript.map(
		({ question, answer }, index) => `## Q${index + 1}\n\n${question}\n\n**A:** ${answer}`,
	);
	return `# Grill transcript\n\nEvery question asked and every answer given, in order.\n\n${turns.join("\n\n")}\n`;
}

const projectLine = ({ dir, profile }) =>
	`- \`${dir === "." ? "./" : `${dir}/`}\`: ${profile}, created by \`engineering create\``;

function projectsSection(plan) {
	if (!plan.projects.length)
		return `## Where the work goes

This extends the existing project at the repository root (paths below are relative to it). Follow its conventions, scripts and tests. Run its check and test scripts, and \`engineering check\` if it uses "engineering", before calling a slice done.`;
	return `## Projects

${plan.projects.map(projectLine).join("\n")}

Each project already has its quality checks, skills and CI. Run \`npm run check\` (or the project's check script) and \`engineering check\` in each one before calling a slice done. Upgrade the starter to the versions DECISIONS.md names when they differ.`;
}

export function buildFile(plan) {
	return `# Build brief

This folder holds one grilled piece of work. Read SPEC.md and DECISIONS.md first, and TRANSCRIPT.md when a decision needs context. DECISIONS.md is binding: if a decision turns out not to work, stop and say why instead of quietly choosing something else.

${projectsSection(plan)}

## How to build

1. Load the \`tdd\` and \`codebase-design\` skills. Agree the seams in DECISIONS.md before writing tests.
2. Work the tickets in TICKETS.md in dependency order, one vertical slice at a time, test first. When the workspace has Beads, they're also beads: run \`bd ready --json\`, claim one with \`bd update <id> --claim\`, and close it with \`bd close <id> --reason "..."\` only after its acceptance passes.
3. Keep each module small enough to explain in a sentence. Name things in the spec's vocabulary.
4. Cover the spec's stated edge cases explicitly (status codes, empty, loading and error states, invalid input) with tests a reviewer can read as a specification.
5. Keep the README's install, run and test commands accurate.

## Talk track (required)

When the build passes, write TALK-TRACK.md in this folder for a live walkthrough. The builder must be able to say all of it in their own words:

- A two-minute overview: what runs where, and how a request flows from a click to the data and back.
- Each decision from DECISIONS.md: what was chosen, the alternative, the tradeoff, and the builder's reason.
- Where state lives and why.
- What the tests prove and what they deliberately don't.
- A demo script: the exact clicks and requests, including one error path.
- With more time: what's left out and what would change for production.
- Ten questions a reviewer or interviewer is likely to ask, each with a short, honest answer.
`;
}

export const agentsPointer = (docs) =>
	`## Grill brief\n\nThis workspace was planned with \`engineering grill\`. Before building, read ${docs}/BUILD.md, then SPEC.md and DECISIONS.md in the same folder. BUILD.md is the task.\n`;
