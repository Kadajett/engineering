import { createInterface } from "node:readline/promises";
import { replyObject } from "./agent.mjs";
import { checkTurn, turnPrompt } from "./turn.mjs";

/** The question as the agent sees it in the transcript, with the options and recommendation it showed. */
const questionText = (question) =>
	[
		question.question,
		...(question.options ?? []).map((option, index) => `${index + 1}. ${option}`),
		...(question.recommended ? [`Recommended: ${question.recommended}`] : []),
	].join("\n");

const RETRIES = 2;

/**
 * Ask the agent for one JSON object and check it. A reply that breaks the protocol goes back with
 * the reason (`promptFor(note)` builds the prompt), up to RETRIES times, then fails.
 */
export async function agentJson(agent, promptFor, check) {
	let note;
	for (let attempt = 0; ; attempt++) {
		const out = await agent(promptFor(note));
		try {
			return check(replyObject(out));
		} catch (error) {
			if (attempt >= RETRIES)
				throw new Error(`The agent's reply broke the grill protocol: ${error.message}`);
			note = `Your last reply broke the protocol (${error.message}). Reply again with one valid JSON object.`;
		}
	}
}

const takeTurn = (agent, context) =>
	agentJson(
		agent,
		(note) => turnPrompt({ ...context, note }),
		(reply) => checkTurn(reply),
	);

/**
 * Grill until the agent returns a plan the builder confirms, one question per turn. `context`
 * summarizes the existing project. `agent(prompt)` returns the agent's raw reply; `io` shows each
 * question and collects the answer. Corrections at the confirmation step go back to the agent as
 * another turn. The transcript is a flat list of { question, answer }.
 */
export async function runGrill({ spec, context, style, agent, io }) {
	const transcript = [];
	for (;;) {
		const turn = await takeTurn(agent, { spec, context, style, transcript });
		if (!turn.done) {
			io.showQuestion(turn, transcript.length + 1);
			transcript.push({ question: questionText(turn), answer: String(await io.ask()) });
			continue;
		}
		io.showPlan(turn);
		const correction = (await io.confirm()).trim();
		if (!correction) return { plan: turn, transcript };
		transcript.push({ question: "Is this the shared understanding?", answer: correction });
	}
}

export function formatQuestion(turn, number) {
	const lines = [`\n❓ Q${number}: ${turn.question}`];
	turn.options?.forEach((option, choice) => lines.push(`   ${choice + 1}. ${option}`));
	if (turn.recommended) lines.push(`➡️  ${turn.recommended}`);
	return `${lines.join("\n")}\n\n`;
}

export function formatPlan(plan) {
	const decisions = plan.decisions.map((decision) => `  - ${decision.title}: ${decision.chosen}`);
	return `\nShared understanding\n\n${plan.summary}\n\nDecisions:\n${decisions.join("\n")}\n\n`;
}

/** A terminal io for runGrill; call close() when done. */
export function terminalIo(input = process.stdin, output = process.stdout) {
	const prompt = createInterface({ input, output });
	return {
		topic: () =>
			prompt.question("What should I grill you about? Describe what you want to build or change: "),
		showQuestion: (turn, number) => output.write(formatQuestion(turn, number)),
		ask: () => prompt.question("> (Enter = recommended, a number, or your own words): "),
		showPlan: (plan) => output.write(formatPlan(plan)),
		confirm: () =>
			prompt.question(
				"Is this the shared understanding? Enter to build it, or type what's wrong: ",
			),
		close: () => prompt.close(),
	};
}
