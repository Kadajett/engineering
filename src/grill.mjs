import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { createProject } from "./create.mjs";
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
	defaultDestination,
	plannableProfiles,
	promptTitle,
	readPrompt,
	resolveTargets,
	savedPlan,
	workspaceMode,
} from "./grill/inputs.mjs";
import { kickoff } from "./grill/kickoff.mjs";
import { runGrill, terminalIo } from "./grill/session.mjs";
import { writingRules } from "./grill/style.mjs";
import { ticketsFile } from "./grill/tickets.mjs";

export { defaultDestination, plannableProfiles };

/** Generator flags that answer upstream prompts, so creation runs unattended after the grilling. */
const UNATTENDED = {
	"hono-node": (manager) => ["--install", "--pm", manager ?? "npm"],
};

export function writeBrief(session, { source, prompt, plan, transcript, tickets, date, mode }) {
	mkdirSync(session.docs, { recursive: true });
	writeFileSync(join(session.docs, "SPEC.md"), specFile(source, prompt));
	writeFileSync(join(session.docs, "DECISIONS.md"), decisionsFile(plan, date));
	writeFileSync(join(session.docs, "TRANSCRIPT.md"), transcriptFile(transcript));
	writeFileSync(join(session.docs, "BUILD.md"), buildFile(plan));
	if (tickets) writeFileSync(join(session.docs, "TICKETS.md"), ticketsFile(tickets));
	if (mode === "new") {
		const agents = join(session.workspace, "AGENTS.md");
		const existing = existsSync(agents) ? readFileSync(agents, "utf8") : "# Agent instructions\n";
		const docs = relative(session.workspace, session.docs);
		if (!existing.includes("## Grill brief"))
			writeFileSync(agents, `${existing.trimEnd()}\n\n${agentsPointer(docs)}`);
	}
	saveState(session, { plan, transcript, ...(tickets && { tickets }) });
}

async function createProjects(workspace, plan, options) {
	const backup = join(tmpdir(), `engineering-grill-${basename(workspace)}.json`);
	writeFileSync(backup, JSON.stringify({ plan }, null, 2));
	try {
		mkdirSync(workspace, { recursive: true });
		for (const { dir, profile } of plan.projects) {
			const forwarded = UNATTENDED[profile]?.(options.manager) ?? [];
			await createProject([profile, join(workspace, dir)], { ...options, forwarded });
		}
	} catch (error) {
		console.error(`Your grill plan is saved; retry with --plan ${backup}`);
		throw error;
	}
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

/** The prompt text and where the work lives. */
async function resolveWork(targets, options, term) {
	const { promptPath, directory } = resolveTargets(targets, { plan: options.plan });
	const prompt = await promptText(promptPath, options, term);
	const workspace = resolve(directory ?? (promptPath ? defaultDestination(prompt) : "."));
	const session = grillSession(workspace, promptPath ? promptTitle(prompt) : prompt);
	const source = promptPath ?? "what you asked for";
	return { prompt, source, workspace, mode: workspaceMode(workspace), session };
}

function target(work) {
	return work.mode === "extend"
		? { mode: "extend", context: projectContext(work.workspace) }
		: { mode: "new", profiles: plannableProfiles() };
}

/** Grill (or load a saved plan), create any new projects and write the brief. Null for a dry run. */
async function plan(work, options, term) {
	const result = options.plan
		? savedPlan(options.plan, work.mode)
		: await runGrill({
				spec: work.prompt,
				target: target(work),
				style: writingRules(work.workspace, options.skillsDirs),
				agent: thinkingAgent(options),
				io: term.get(),
			});
	if (options.dryRun) {
		for (const { dir, profile } of result.plan.projects)
			console.log(`Would run: engineering create ${profile} ${join(work.workspace, dir)}`);
		console.log(`Would write the brief to ${work.session.docs}`);
		return null;
	}
	if (work.mode === "new") await createProjects(work.workspace, result.plan, options);
	const date = new Date().toISOString().slice(0, 10);
	writeBrief(work.session, {
		...result,
		source: work.source,
		prompt: work.prompt,
		date,
		mode: work.mode,
	});
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
