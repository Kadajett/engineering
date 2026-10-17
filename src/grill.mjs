import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { agentSpec, runAgent } from "./grill/agent.mjs";
import {
	agentsPointer,
	buildFile,
	decisionsFile,
	specFile,
	transcriptFile,
} from "./grill/brief.mjs";
import { projectContext } from "./grill/context.mjs";
import {
	ensureBeads,
	ensureTickets,
	grillSession,
	readState,
	saveState,
} from "./grill/followthrough.mjs";
import {
	hasMutationScript,
	promptTitle,
	readPrompt,
	requireProject,
	resolveTargets,
	savedPlan,
} from "./grill/inputs.mjs";
import { kickoff } from "./grill/kickoff.mjs";
import { runGrill, terminalIo } from "./grill/session.mjs";
import { writingRules } from "./grill/style.mjs";
import { ticketsFile } from "./grill/tickets.mjs";

/** Appends the brief pointer to the project's AGENTS.md, if it has one; never creates the file. */
function pointAgentsAtBrief(session) {
	const agents = join(session.workspace, "AGENTS.md");
	if (!existsSync(agents)) return;
	const existing = readFileSync(agents, "utf8");
	if (existing.includes("## Grill brief")) return;
	const docs = relative(session.workspace, session.docs);
	writeFileSync(agents, `${existing.trimEnd()}\n\n${agentsPointer(docs)}`);
}

export function writeBrief(session, { source, prompt, plan, transcript, tickets, date }) {
	mkdirSync(session.docs, { recursive: true });
	writeFileSync(join(session.docs, "SPEC.md"), specFile(source, prompt));
	writeFileSync(join(session.docs, "DECISIONS.md"), decisionsFile(plan, date));
	writeFileSync(join(session.docs, "TRANSCRIPT.md"), transcriptFile(transcript));
	const mutation = hasMutationScript(session.workspace);
	writeFileSync(join(session.docs, "BUILD.md"), buildFile({ mutation }));
	if (tickets) writeFileSync(join(session.docs, "TICKETS.md"), ticketsFile(tickets));
	pointAgentsAtBrief(session);
	saveState(session, { plan, transcript, ...(tickets && { tickets }) });
}

function thinkingAgent(options) {
	const spec = agentSpec(options.agent, options.model);
	return (text) => {
		process.stdout.write(`\n(${spec.command} is thinking…)\n`);
		return runAgent(spec, text);
	};
}

/** Lazily opened terminal; grilling and asking for a topic need one, resuming doesn't. */
function terminal() {
	let io = null;
	return {
		get() {
			if (io) return io;
			if (!process.stdin.isTTY || !process.stdout.isTTY)
				throw new Error("grill is a conversation; run it in a terminal");
			io = terminalIo();
			return io;
		},
		close: () => io?.close(),
	};
}

async function askTopic(io) {
	for (;;) {
		const topic = (await io.topic()).trim();
		if (topic) return topic;
	}
}

/** The prompt file's text, a saved plan's spec, or what the builder types when asked. */
async function promptText(promptPath, options, term) {
	if (promptPath) return readPrompt(promptPath);
	const saved = options.plan ? JSON.parse(readFileSync(options.plan, "utf8")) : null;
	return saved?.spec ?? askTopic(term.get());
}

/** The prompt text and the existing project the work goes into. */
async function resolveWork(targets, options, term) {
	const { promptPath, directory } = resolveTargets(targets, { plan: options.plan });
	const workspace = resolve(directory ?? ".");
	requireProject(workspace);
	const prompt = await promptText(promptPath, options, term);
	const session = grillSession(workspace, promptPath ? promptTitle(prompt) : prompt);
	const source = promptPath ?? "what you asked for";
	return { prompt, source, workspace, session };
}

/** Grill (or load a saved plan) and write the brief. Null for a dry run. */
async function plan(work, options, term) {
	const result = options.plan
		? savedPlan(options.plan)
		: await runGrill({
				spec: work.prompt,
				context: projectContext(work.workspace),
				style: writingRules(work.workspace, options.skillsDirs),
				agent: thinkingAgent(options),
				io: term.get(),
			});
	if (options.dryRun) {
		console.log(`Would write the brief to ${work.session.docs}`);
		return null;
	}
	const date = new Date().toISOString().slice(0, 10);
	writeBrief(work.session, { ...result, source: work.source, prompt: work.prompt, date });
	return readState(work.session);
}

async function followThrough(work, state, options) {
	const ticketed = await ensureTickets(work.session, work.prompt, state, thinkingAgent(options));
	ensureBeads(work.session, ticketed, options);
	const docs = relative(work.workspace, work.session.docs);
	if (options.build === false)
		return console.log(
			`\nReady. Start an agent in ${work.workspace} and point it at ${docs}/BUILD.md.`,
		);
	kickoff(work.workspace, docs, options.agent ?? "omp");
}

export async function grill(targets, options) {
	if (options.forwarded.length) throw new Error("grill doesn't forward arguments after --");
	const term = terminal();
	let work;
	let state;
	try {
		work = await resolveWork(targets, options, term);
		state = readState(work.session);
		if (state) console.log(`Resuming ${work.session.slug} in ${work.workspace}.`);
		else state = await plan(work, options, term);
	} finally {
		term.close();
	}
	if (state && !options.dryRun) await followThrough(work, state, options);
}
