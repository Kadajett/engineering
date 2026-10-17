import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { writeBrief } from "../src/grill.mjs";
import { agentSpec, runAgent } from "../src/grill/agent.mjs";
import { grillSession, readState } from "../src/grill/followthrough.mjs";
import { runGrill } from "../src/grill/session.mjs";
import { checkTurn } from "../src/grill/turn.mjs";
import { checkTickets, createBeads } from "../src/grill/tickets.mjs";
import { fixture } from "./fixture.mjs";

const cli = fileURLToPath(new URL("../bin/engineering.mjs", import.meta.url));
const context = "Files (two levels):\nsrc/\npackage.json";

const layoutTurn = {
	done: false,
	question: "One app or two?",
	options: ["One Next.js app", "web + api"],
	recommended: "One Next.js app",
};
const scopeTurn = { done: false, question: "Which stretch items?", recommended: "pagination" };
const plan = {
	done: true,
	summary: "One Next.js app with route handlers and server components; zod at every boundary.",
	decisions: [
		{
			title: "Framework",
			chosen: "Next.js latest",
			alternatives: ["Vite + Hono"],
			why: "one deployable",
		},
		{ title: "Validation", chosen: "zod on input and storage", alternatives: [], why: "" },
	],
};

/** A fake agent that replies in order and records every prompt it was sent. */
function scriptedAgent(replies) {
	const prompts = [];
	const agent = async (prompt) => {
		prompts.push(prompt);
		return JSON.stringify(replies.shift());
	};
	return { agent, prompts };
}

function scriptedIo(answers, confirmations = [""]) {
	return {
		showQuestion() {},
		showPlan() {},
		ask: async () => answers.shift(),
		confirm: async () => confirmations.shift(),
	};
}

test("the agent gets each answer as typed, next to the options it refers to", async () => {
	const { agent, prompts } = scriptedAgent([layoutTurn, scopeTurn, plan]);
	const result = await runGrill({
		spec: "# Board",
		context,
		agent,
		io: scriptedIo(["2 sorry", ""]),
	});
	assert.equal(result.plan.summary, plan.summary);
	assert.equal(result.transcript[0].answer, "2 sorry");
	assert.match(prompts[1], /\n2\. web \+ api\n/);
	assert.match(prompts[1], /A1: 2 sorry/);
	assert.match(prompts[2], /Q2: Which stretch items\?/);
	assert.match(prompts[2], /A2: \(Enter\)/);
});

test("a correction at the confirmation step goes back to the agent instead of building", async () => {
	const { agent, prompts } = scriptedAgent([plan, plan]);
	const io = scriptedIo([], ["Use cursor pagination, not pages", ""]);
	const result = await runGrill({ spec: "# Board", context, agent, io });
	assert.equal(prompts.length, 2);
	assert.match(prompts[1], /A1: Use cursor pagination, not pages/);
	assert.equal(result.transcript.length, 1);
});

test("a reply that breaks the protocol is sent back twice, then fails", async () => {
	const ok = scriptedAgent([{ done: false }, layoutTurn, scopeTurn, plan]);
	await runGrill({
		spec: "# B",
		context,
		agent: ok.agent,
		io: scriptedIo(["", ""]),
	});
	assert.match(ok.prompts[1], /broke the protocol/);
	const bad = scriptedAgent([{ done: false }, { done: true, summary: "x" }, { done: false }]);
	await assert.rejects(
		runGrill({ spec: "# B", context, agent: bad.agent, io: scriptedIo([]) }),
		/broke the grill protocol/,
	);
});

test("a question longer than three sentences is sent back to the agent", async () => {
	const wordy = {
		done: false,
		question:
			"The spec wants REST. You said server functions. Both can work. Which owns GET /groups?",
	};
	assert.throws(() => checkTurn(wordy), /at most 3 short sentences/);
	const tight = {
		done: false,
		question: "The spec wants REST, e.g. GET /groups. You said server functions. Which owns reads?",
	};
	assert.equal(checkTurn(tight), tight);
	const { agent, prompts } = scriptedAgent([wordy, layoutTurn, scopeTurn, plan]);
	await runGrill({ spec: "# B", context, agent, io: scriptedIo(["", ""]) });
	assert.match(prompts[1], /at most 3 short sentences/);
});

test("a finished plan needs a summary and decisions", () => {
	assert.equal(checkTurn(plan), plan);
	assert.throws(() => checkTurn({ ...plan, summary: " " }), /needs a summary/);
	assert.throws(() => checkTurn({ ...plan, decisions: [] }), /needs decisions/);
});

test("an executable agent receives the prompt on stdin", async (t) => {
	const root = fixture(t, {
		"agent.mjs": `#!/usr/bin/env node\nlet s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify({echo:s})));\n`,
	});
	chmodSync(join(root, "agent.mjs"), 0o755);
	const out = await runAgent(agentSpec(join(root, "agent.mjs")), "hello agent");
	assert.equal(JSON.parse(out).echo, "hello agent");
	assert.throws(() => agentSpec("gpt"), /supports claude, omp, or a path/);
});

test("the brief records the plan, flags missing reasons, and points agents at BUILD.md", (t) => {
	const root = fixture(t, { "AGENTS.md": "# Existing\n\nKeep me.\n" });
	const transcript = [{ question: "One app or two?", answer: "One Next.js app" }];
	const session = grillSession(root, "Board");
	writeBrief(session, {
		source: "prompt.md",
		prompt: "# Board\nBuild it.",
		plan,
		transcript,
		date: "2026-10-16",
	});
	const doc = (name) => readFileSync(join(root, "docs/grill/board", name), "utf8");
	assert.match(doc("DECISIONS.md"), /## Shared understanding\n\nOne Next\.js app/);
	assert.match(doc("DECISIONS.md"), /## Framework[\s\S]*\*\*Why:\*\* one deployable/);
	assert.match(doc("DECISIONS.md"), /## Validation[\s\S]*Not given yet/);
	assert.match(doc("TRANSCRIPT.md"), /\*\*A:\*\* One Next\.js app/);
	assert.match(doc("BUILD.md"), /Where the work goes[\s\S]*TALK-TRACK\.md/);
	assert.doesNotMatch(doc("BUILD.md"), /test:mutation/);
	assert.match(
		readFileSync(join(root, "AGENTS.md"), "utf8"),
		/Keep me\.[\s\S]*docs\/grill\/board\/BUILD\.md/,
	);
	assert.equal(readState(session).plan.summary, plan.summary);
});

test("a project with mutation testing gets a mutation gate in BUILD.md", (t) => {
	const root = fixture(t, {
		"package.json": JSON.stringify({ scripts: { "test:mutation": "stryker run" } }),
	});
	const session = grillSession(root, "Board");
	writeBrief(session, { source: "p.md", prompt: "# Board", plan, transcript: [], date: "d" });
	const build = readFileSync(join(root, "docs/grill/board/BUILD.md"), "utf8");
	assert.match(build, /run `test:mutation`[\s\S]*never lower the threshold/);
});

test("the grilling agent sees the existing project and is never offered project types", async () => {
	const { agent, prompts } = scriptedAgent([plan]);
	await runGrill({ spec: "Add comments to posts", context, agent, io: scriptedIo([]) });
	assert.match(prompts[0], /existing project summarized below[\s\S]*src\/\npackage\.json/);
	assert.doesNotMatch(prompts[0], /Project types:|"projects"/);
});

function invoke(root, args) {
	return spawnSync(process.execPath, [cli, "grill", ...args], {
		cwd: root,
		encoding: "utf8",
		timeout: 10000,
	});
}

test("grill refuses a missing or empty folder and names create and adopt", (t) => {
	const root = fixture(t, {
		"prompt.md": "# Tiny Board\n",
		"plan.json": JSON.stringify({ plan }),
	});
	mkdirSync(join(root, "empty"));
	for (const folder of ["board", "empty"]) {
		const result = invoke(root, ["prompt.md", folder, "--plan", "plan.json"]);
		assert.equal(result.status, 1);
		assert.match(result.stderr, new RegExp(`engineering create <profile> ${folder}`));
		assert.match(result.stderr, new RegExp(`engineering adopt ${folder} --profile`));
	}
	assert.equal(existsSync(join(root, "board")), false);
	assert.deepEqual(readdirSync(join(root, "empty")), []);
});

test("a saved plan with --dry-run says where the brief would go and writes nothing", (t) => {
	const root = fixture(t, {
		"app/package.json": '{"name":"app"}',
		"plan.json": JSON.stringify({ spec: "Add comments", plan }),
	});
	const result = invoke(root, ["app", "--plan", "plan.json", "--dry-run"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Would write the brief to .*app\/docs\/grill\/add-comments/);
	assert.deepEqual(readdirSync(join(root, "app")), ["package.json"]);
});

test("without a terminal, grill refuses to start a conversation or ask for a topic", (t) => {
	const root = fixture(t, { "prompt.md": "# Board\n" });
	for (const args of [["prompt.md", "--dry-run"], []]) {
		const result = invoke(root, args);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /run it in a terminal/);
	}
});

test("grill writes only the brief into the project: no AGENTS.md, no other files", (t) => {
	const root = fixture(t, {
		"app/package.json": '{"name":"app"}',
		"plan.json": JSON.stringify({ spec: "Add comments to posts", plan, tickets }),
	});
	const result = invoke(root, ["app", "--plan", "plan.json", "--without", "beads", "--no-build"]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(readdirSync(join(root, "app")).sort(), [".engineering", "docs", "package.json"]);
	const build = readFileSync(join(root, "app/docs/grill/add-comments-to-posts/BUILD.md"), "utf8");
	assert.match(build, /Where the work goes/);
	assert.match(
		readFileSync(join(root, "app/docs/grill/add-comments-to-posts/TICKETS.md"), "utf8"),
		/Talk track/,
	);
});

const tickets = [
	{
		key: "t1",
		title: "Store and API",
		description: "groups",
		acceptance: "tests pass",
		depends_on: [],
	},
	{
		key: "t2",
		title: "Talk track",
		description: "write it",
		acceptance: "file exists",
		depends_on: ["t1"],
	},
];

test("tickets depend only on earlier tickets and have unique keys", () => {
	assert.equal(checkTickets({ tickets }), tickets);
	const swap = (change) => ({ tickets: [tickets[0], { ...tickets[1], ...change }] });
	assert.throws(
		() => checkTickets(swap({ depends_on: ["t9"] })),
		/depends on t9, which isn't earlier/,
	);
	assert.throws(() => checkTickets(swap({ key: "t1" })), /unique/);
	assert.throws(
		() => checkTickets(swap({ acceptance: " " })),
		/needs a title, description and acceptance/,
	);
});

test("beads are created in order and wired to the beads they depend on", () => {
	const calls = [];
	let next = 0;
	const ids = createBeads(tickets, (args) => {
		calls.push(args);
		return args[0] === "create" ? `{"id":"b-${++next}"}` : "";
	});
	assert.deepEqual(ids, { t1: "b-1", t2: "b-2" });
	assert.deepEqual(calls.at(-1), ["dep", "add", "b-2", "b-1"]);
	assert.equal(calls.filter((call) => call[0] === "create").length, 2);
});

test("rerunning the same prompt resumes: tickets are asked for once and nothing is re-grilled", (t) => {
	const root = fixture(t, {
		"prompt.md": "# Board\n",
		"board/.engineering/grill/board.json": JSON.stringify({ plan, transcript: [] }),
		"agent.cjs": `#!/usr/bin/env node\nconst fs=require("fs");fs.appendFileSync(${JSON.stringify("calls")},"x");process.stdin.resume();process.stdin.on("end",()=>console.log(${JSON.stringify(JSON.stringify({ tickets }))}));\n`,
	});
	chmodSync(join(root, "agent.cjs"), 0o755);
	const args = ["prompt.md", "board", "--agent", "./agent.cjs", "--without", "beads", "--no-build"];
	const first = invoke(root, args);
	assert.equal(first.status, 0, first.stderr);
	assert.match(
		readFileSync(join(root, "board/docs/grill/board/TICKETS.md"), "utf8"),
		/## 2\. Talk track/,
	);
	const second = invoke(root, args);
	assert.equal(second.status, 0, second.stderr);
	assert.equal(readFileSync(join(root, "calls"), "utf8"), "x");
	assert.equal(
		JSON.parse(readFileSync(join(root, "board/.engineering/grill/board.json"), "utf8")).tickets
			.length,
		2,
	);
});
