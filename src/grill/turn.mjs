// The protocol between `engineering grill` and the agent that grills. Each turn the agent sees what
// to build, a summary of the existing project it goes into, and the transcript so far. It replies
// with one JSON object: the next question, or the finished plan once the design tree is exhausted.

const GRILL = `You are grilling a software engineer about how they will build what's described below, before anything is built. They will build it and must be able to explain every decision, so the decisions must be theirs.

Interview them until you reach a shared understanding. Map a design tree: every decision branches into the decisions that hang off it. Ask exactly one question per turn, about exactly one decision: the most important open decision whose prerequisites are already settled, with your recommended answer. Each answer can reshape the tree, so recompute it every turn instead of planning a batch. Only ask about decisions that change what gets built or that a reviewer is likely to challenge: architecture, data model and validation, contracts and errors, state and data flow, edge cases that matter, test strategy, and scope. Settle implementation details yourself (encodings, naming, defaults, small variations on an earlier choice) and record them in the plan as decisions they can override. If the description is thin, start by pinning down what they actually want. Push back when an answer is vague, risky, or contradicts the description. Use their own words and stack choices; don't steer them toward your preferences without saying why. If they say they've had enough, stop asking and return the plan, using your recommendations for whatever is still open.`;

const PROJECT = `The work goes into the existing project summarized below. Fit the decisions to what's already there (its framework, conventions, scripts and tests). When the decisions that matter are settled, stop asking and return the plan.`;

const SHAPES = `Hard rule: the question is at most 3 sentences, including any context. Options and the recommendation are a few words each.

Reply with exactly one JSON object and nothing else, in one of these shapes:
{"done": false, "question": "at most 3 sentences", "options": ["a few words", "a few words"], "recommended": "a few words"}
{"done": true, "summary": "the shared understanding in 3 to 6 sentences", "decisions": [{"title": "decision", "chosen": "what they chose, in their words where possible", "alternatives": ["what else was on the table"], "why": "their reason, or an empty string if they never gave one"}]}
"options" is optional for open questions.

Each answer in the transcript is exactly what they typed. A number means that option, an empty answer means they took your recommendation, and anything else is their own words.`;

/** The transcript is a flat list of { question, answer }, one entry per turn. */
export function transcriptText(transcript) {
	if (!transcript.length) return "(nothing asked yet)";
	return transcript
		.map(
			({ question, answer }, index) =>
				`Q${index + 1}: ${question}\nA${index + 1}: ${answer.trim() || "(Enter)"}`,
		)
		.join("\n\n");
}

/** `context` summarizes the existing project; `style` is the humanizer skill. */
export function turnPrompt({ spec, context, style, transcript, note }) {
	const setting = `${PROJECT}\n\nExisting project:\n${context}`;
	const writing = style
		? `\n\nWrite every question, option, recommendation and summary by the humanizer skill below, within the length limits above:\n"""\n${style}\n"""`
		: "";
	return `${GRILL}\n\n${setting}\n\n${SHAPES}${writing}\n\nWhat to build:\n"""\n${spec.trim()}\n"""\n\nTranscript:\n${transcriptText(transcript)}${note ? `\n\nNote: ${note}` : ""}\n`;
}

const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const strings = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");

/** Sentences in a piece of text: runs ending in . ! or ? before a space, ignoring e.g., i.e., etc. and vs. */
export const sentenceCount = (text) =>
	text
		.replace(/\b(e\.g|i\.e|etc|vs|cf)\./gi, "$1")
		.trim()
		.split(/(?<=[.!?])\s+(?=\S)/)
		.filter(Boolean).length;

export const MAX_SENTENCES = 3;

function checkQuestion(turn) {
	if (!nonEmpty(turn?.question)) throw new Error("the turn needs a question");
	if (sentenceCount(turn.question) > MAX_SENTENCES || turn.question.length > 400)
		throw new Error(
			`the question must be at most ${MAX_SENTENCES} short sentences; this one isn't: ${turn.question.slice(0, 120)}`,
		);
	if (turn.options !== undefined && !strings(turn.options))
		throw new Error("options must be a list of strings");
}

function checkDecisions(decisions) {
	if (!Array.isArray(decisions) || !decisions.length) throw new Error("the plan needs decisions");
	for (const decision of decisions)
		if (!nonEmpty(decision?.title) || !nonEmpty(decision?.chosen))
			throw new Error("every decision needs a title and what was chosen");
}

/** Throws with a reason the agent can act on when a reply breaks the protocol. */
export function checkTurn(turn) {
	if (turn?.done !== true) {
		checkQuestion(turn);
		return turn;
	}
	if (!nonEmpty(turn.summary)) throw new Error("the plan needs a summary");
	checkDecisions(turn.decisions);
	return turn;
}
