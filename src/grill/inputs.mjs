// What `engineering grill` works from: an optional prompt file, an optional directory, and an optional
// saved plan. Without a prompt file it asks what to grill about. The directory defaults to the current
// one and must already hold a project: grill plans work, it never creates projects.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { checkTickets } from "./tickets.mjs";
import { checkTurn } from "./turn.mjs";

/** Throws with the commands that make a project when `dir` is missing or empty. */
export function requireProject(dir) {
	if (existsSync(dir) && statSync(dir).isDirectory() && readdirSync(dir).length) return;
	const shown = relative(process.cwd(), dir) || ".";
	throw new Error(`${shown} has no project yet. grill plans work inside an existing project; it doesn't create one.
Create one:      engineering create <profile> ${shown}   (engineering create --help lists the profiles)
Or bring one in: engineering adopt ${shown} --profile <profile>
Then run grill again.`);
}

/** True when the project's package.json has a test:mutation script (set up by create or adopt). */
export function hasMutationScript(dir) {
	const path = join(dir, "package.json");
	if (!existsSync(path)) return false;
	return typeof JSON.parse(readFileSync(path, "utf8")).scripts?.["test:mutation"] === "string";
}

/** A lone existing file is the prompt; otherwise, with a saved plan (which carries the spec), it's the directory. */
export function resolveTargets(targets, { plan } = {}) {
	if (targets.length > 2) throw new Error("grill takes at most a prompt file and a directory");
	if (targets.length === 2) return { promptPath: targets[0], directory: targets[1] };
	if (!targets.length) return {};
	const stat = existsSync(targets[0]) ? statSync(targets[0]) : null;
	if (stat?.isFile()) return { promptPath: targets[0] };
	return plan || stat?.isDirectory() ? { directory: targets[0] } : { promptPath: targets[0] };
}

export function readPrompt(path) {
	if (!existsSync(path)) throw new Error(`Prompt file not found: ${path}`);
	let text;
	if (extname(path).toLowerCase() === ".pdf") {
		const result = spawnSync("pdftotext", ["-layout", path, "-"], { encoding: "utf8" });
		if (result.error || result.status !== 0)
			throw new Error("Reading a PDF needs pdftotext (poppler-utils). Or save the prompt as .md.");
		text = result.stdout;
	} else text = readFileSync(path, "utf8");
	if (!text.trim()) throw new Error(`Prompt file is empty: ${path}`);
	return text;
}

/** The prompt's first heading, or its first line: what the work is called. */
export const promptTitle = (prompt) =>
	(/^#+\s+(.+)$/m.exec(prompt)?.[1] ?? prompt.trim().split("\n")[0]).trim();

/**
 * A plan saved by an earlier session, or written by an agent that grilled in chat:
 * { "spec"?, "plan", "transcript"?, "tickets"? }.
 */
export function savedPlan(path) {
	const saved = JSON.parse(readFileSync(path, "utf8"));
	try {
		const plan = checkTurn({ ...saved.plan, done: true });
		const tickets =
			saved.tickets === undefined ? undefined : checkTickets({ tickets: saved.tickets });
		const transcript = Array.isArray(saved.transcript) ? saved.transcript : [];
		return { spec: saved.spec, plan, transcript, ...(tickets && { tickets }) };
	} catch (error) {
		throw new Error(`${path} isn't a usable grill plan: ${error.message}`);
	}
}
