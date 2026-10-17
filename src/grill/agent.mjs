import { spawn } from "node:child_process";

const TURN_TIMEOUT_MS = 5 * 60_000;

/**
 * How each supported agent is run in print mode. The prompt goes on stdin for claude and as the final
 * argument for omp. Any other value is a path to an executable that reads the prompt on stdin.
 */
const AGENTS = {
	claude: { command: "claude", args: ["-p", "--no-session-persistence"], stdin: true },
	omp: {
		command: "omp",
		args: ["-p", "--no-session", "--no-tools", "--no-skills", "--no-rules", "--no-title"],
		stdin: false,
	},
};

export function agentSpec(name = "omp", model) {
	const known = AGENTS[name];
	if (!known && !name.includes("/"))
		throw new Error(`--agent supports claude, omp, or a path to an executable; got ${name}`);
	const spec = known ?? { command: name, args: [], stdin: true };
	return model ? { ...spec, args: [...spec.args, "--model", model] } : spec;
}

/** Run one agent turn and return its stdout. */
export function runAgent(spec, prompt) {
	const args = spec.stdin ? spec.args : [...spec.args, prompt];
	return new Promise((resolve, reject) => {
		const child = spawn(spec.command, args, { stdio: ["pipe", "pipe", "pipe"] });
		let out = "";
		let err = "";
		const timer = setTimeout(() => child.kill(), TURN_TIMEOUT_MS);
		child.stdout.on("data", (chunk) => (out += chunk));
		child.stderr.on("data", (chunk) => (err += chunk));
		child.on("error", (error) =>
			reject(new Error(`Couldn't run ${spec.command}: ${error.message}`)),
		);
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code === 0) resolve(out);
			else reject(new Error(`${spec.command} exited ${code}: ${(err || out).trim().slice(-300)}`));
		});
		child.stdin.end(spec.stdin ? prompt : "");
	});
}

/** The outermost JSON object in a reply; models sometimes wrap it in prose or a code fence. */
export function replyObject(out) {
	const start = out.indexOf("{");
	const end = out.lastIndexOf("}");
	if (start < 0 || end < start)
		throw new Error(`The agent's reply had no JSON: ${out.slice(0, 200)}`);
	return JSON.parse(out.slice(start, end + 1));
}
