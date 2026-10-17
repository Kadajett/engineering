import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { defaultDestination, plannableProfiles, writeBrief } from "../src/grill.mjs";
import { agentSpec, runAgent } from "../src/grill/agent.mjs";
import { grillSession, readState } from "../src/grill/followthrough.mjs";
import { runGrill } from "../src/grill/session.mjs";
import { checkTurn } from "../src/grill/turn.mjs";
import { checkTickets, createBeads } from "../src/grill/tickets.mjs";
import { fixture } from "./fixture.mjs";

const cli = fileURLToPath(new URL("../bin/engineering.mjs", import.meta.url));
const profileIds = plannableProfiles().map((profile) => profile.id);
const newTarget = { mode: "new", profiles: plannableProfiles() };

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
	projects: [{ dir: ".", profile: "next" }],
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
		target: newTarget,
		agent,
		io: scriptedIo(["2 sorry", ""]),
	});
	assert.equal(result.plan.projects[0].profile, "next");
	assert.equal(result.transcript[0].answer, "2 sorry");
	assert.match(prompts[1], /\n2\. web \+ api\n/);
	assert.match(prompts[1], /A1: 2 sorry/);
	assert.match(prompts[2], /Q2: Which stretch items\?/);
	assert.match(prompts[2], /A2: \(Enter\)/);
});

test("a correction at the confirmation step goes back to the agent instead of building", async () => {
	const { agent, prompts } = scriptedAgent([plan, plan]);
	const io = scriptedIo([], ["Use cursor pagination, not pages", ""]);
	const result = await runGrill({ spec: "# Board", target: newTarget, agent, io });
	assert.equal(prompts.length, 2);
	assert.match(prompts[1], /A1: Use cursor pagination, not pages/);
	assert.equal(result.transcript.length, 1);
});

test("a reply that breaks the protocol is sent back twice, then fails", async () => {
	const ok = scriptedAgent([{ done: false }, layoutTurn, scopeTurn, plan]);
	await runGrill({
		spec: "# B",
		target: newTarget,
		agent: ok.agent,
		io: scriptedIo(["", ""]),
	});
	assert.match(ok.prompts[1], /broke the protocol/);
	const bad = scriptedAgent([{ done: false }, { done: true, summary: "x" }, { done: false }]);
	await assert.rejects(
		runGrill({ spec: "# B", target: newTarget, agent: bad.agent, io: scriptedIo([]) }),
		/broke the grill protocol/,
	);
});

test("a question longer than three sentences is sent back to the agent", async () => {
	const wordy = {
		done: false,
		question:
			"The spec wants REST. You said server functions. Both can work. Which owns GET /groups?",
	};
	assert.throws(() => checkTurn(wordy, profileIds), /at most 3 short sentences/);
	const tight = {
		done: false,
		question: "The spec wants REST, e.g. GET /groups. You said server functions. Which owns reads?",
	};
	assert.equal(checkTurn(tight, profileIds), tight);
	const { agent, prompts } = scriptedAgent([wordy, layoutTurn, scopeTurn, plan]);
	await runGrill({ spec: "# B", target: newTarget, agent, io: scriptedIo(["", ""]) });
	assert.match(prompts[1], /at most 3 short sentences/);
});

test("a plan can only create known project types in simple folders", () => {
	assert.equal(checkTurn(plan, profileIds), plan);
	const withProjects = (projects) => ({ ...plan, projects });
	assert.throws(
		() => checkTurn(withProjects([{ dir: ".", profile: "rails" }]), profileIds),
		/unknown project type/,
	);
	assert.throws(
		() => checkTurn(withProjects([{ dir: "../x", profile: "next" }]), profileIds),
		/simple folder/,
	);
	assert.throws(
		() =>
			checkTurn(
				withProjects([
					{ dir: ".", profile: "next" },
					{ dir: "api", profile: "hono-node" },
				]),
				profileIds,
			),
		/distinct/,
	);
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

test("the prompt's heading names the workspace", () => {
	assert.equal(
		defaultDestination("# FS: Assisted Live Coding\n\nBuild a board."),
		"fs-assisted-live-coding",
	);
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
		mode: "new",
	});
	const doc = (name) => readFileSync(join(root, "docs/grill/board", name), "utf8");
	assert.match(doc("DECISIONS.md"), /## Shared understanding\n\nOne Next\.js app/);
	assert.match(doc("DECISIONS.md"), /## Framework[\s\S]*\*\*Why:\*\* one deployable/);
	assert.match(doc("DECISIONS.md"), /## Validation[\s\S]*Not given yet/);
	assert.match(doc("TRANSCRIPT.md"), /\*\*A:\*\* One Next\.js app/);
	assert.match(doc("BUILD.md"), /`\.\/`: next[\s\S]*TALK-TRACK\.md/);
	assert.match(
		readFileSync(join(root, "AGENTS.md"), "utf8"),
		/Keep me\.[\s\S]*docs\/grill\/board\/BUILD\.md/,
	);
	assert.equal(readState(session).plan.summary, plan.summary);
});

test("extending a project never plans new ones and frames the agent with the existing code", async () => {
	const { agent, prompts } = scriptedAgent([plan]);
	const target = { mode: "extend", context: "Files (two levels):\nsrc/\npackage.json" };
	const result = await runGrill({
		spec: "Add comments to posts",
		target,
		agent,
		io: scriptedIo([]),
	});
	assert.deepEqual(result.plan.projects, []);
	assert.match(prompts[0], /extends the existing project[\s\S]*src\/\npackage\.json/);
	assert.doesNotMatch(prompts[0], /Project types:/);
});

function invoke(root, args) {
	return spawnSync(process.execPath, [cli, "grill", ...args], {
		cwd: root,
		encoding: "utf8",
		timeout: 10000,
	});
}

test("a saved plan with --dry-run shows what would be created and writes nothing", (t) => {
	const root = fixture(t, {
		"prompt.md": "# Tiny Board\n",
		"plan.json": JSON.stringify({
			plan: {
				...plan,
				projects: [
					{ dir: "web", profile: "react-vite" },
					{ dir: "api", profile: "hono-node" },
				],
			},
		}),
	});
	const result = invoke(root, ["prompt.md", "board", "--plan", "plan.json", "--dry-run"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /engineering create react-vite .*board\/web/);
	assert.match(result.stdout, /engineering create hono-node .*board\/api/);
	assert.deepEqual(readdirSync(root).sort(), ["plan.json", "prompt.md"]);
});

test("a saved plan naming an unknown project type is refused", (t) => {
	const root = fixture(t, { "prompt.md": "# Board\n" });
	writeFileSync(
		join(root, "plan.json"),
		JSON.stringify({ plan: { ...plan, projects: [{ dir: ".", profile: "rails" }] } }),
	);
	const result = invoke(root, ["prompt.md", "--plan", "plan.json", "--dry-run"]);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /isn't a usable grill plan: unknown project type rails/);
});

test("without a terminal, grill refuses to start a conversation or ask for a topic", (t) => {
	const root = fixture(t, { "prompt.md": "# Board\n" });
	for (const args of [["prompt.md", "--dry-run"], []]) {
		const result = invoke(root, args);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /run it in a terminal/);
	}
});

test("a folder with files is extended: nothing is created and the brief goes in docs/grill", (t) => {
	const root = fixture(t, {
		"app/package.json": '{"name":"app"}',
		"plan.json": JSON.stringify({ spec: "Add comments to posts", plan, tickets }),
	});
	const result = invoke(root, ["app", "--plan", "plan.json", "--no-beads", "--no-build"]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(readdirSync(join(root, "app")).sort(), [".engineering", "docs", "package.json"]);
	const build = readFileSync(join(root, "app/docs/grill/add-comments-to-posts/BUILD.md"), "utf8");
	assert.match(build, /extends the existing project/);
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
		project: ".",
		depends_on: [],
	},
	{
		key: "t2",
		title: "Talk track",
		description: "write it",
		acceptance: "file exists",
		project: ".",
		depends_on: ["t1"],
	},
];

test("tickets must name planned projects and depend only on earlier tickets", () => {
	assert.equal(checkTickets({ tickets }, plan), tickets);
	const swap = (change) => ({ tickets: [tickets[0], { ...tickets[1], ...change }] });
	assert.throws(() => checkTickets(swap({ project: "api" }), plan), /unknown project api/);
	assert.throws(
		() => checkTickets(swap({ depends_on: ["t9"] }), plan),
		/depends on t9, which isn't earlier/,
	);
	assert.throws(() => checkTickets(swap({ key: "t1" }), plan), /unique/);
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
	const args = ["prompt.md", "board", "--agent", "./agent.cjs", "--no-beads", "--no-build"];
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
