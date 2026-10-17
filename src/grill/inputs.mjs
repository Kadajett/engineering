// What `engineering grill` works from: an optional prompt file, an optional directory, and an optional
// saved plan. Without a prompt file it asks what to grill about; without a directory it works in the
// prompt's own new folder (prompt file) or the current directory (asked topic).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { projectSlug } from "../generation-names.mjs";
import { profiles } from "../profiles.mjs";
import { checkTickets } from "./tickets.mjs";
import { checkTurn } from "./turn.mjs";

export const plannableProfiles = () => profiles.filter((profile) => profile.generator);

/** A missing or empty directory gets new projects; anything else is an existing project to extend. */
export const workspaceMode = (dir) =>
	!existsSync(dir) || !readdirSync(dir).length ? "new" : "extend";

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

export function defaultDestination(prompt) {
	const slug = projectSlug(
		promptTitle(prompt)
			.replace(/[^\p{L}\p{N}\s-]/gu, " ")
			.trim(),
	);
	if (!slug) throw new Error("Couldn't name the project from the prompt; pass a directory");
	return slug;
}

/**
 * A plan saved by an earlier session, or written by an agent that grilled in chat:
 * { "spec"?, "plan", "transcript"?, "tickets"? }. A plan for an existing project has no projects.
 */
export function savedPlan(path, mode) {
	const saved = JSON.parse(readFileSync(path, "utf8"));
	try {
		const ids = mode === "extend" ? null : plannableProfiles().map((profile) => profile.id);
		const plan = checkTurn({ ...saved.plan, done: true }, ids);
		const tickets =
			saved.tickets === undefined ? undefined : checkTickets({ tickets: saved.tickets }, plan);
		const transcript = Array.isArray(saved.transcript) ? saved.transcript : [];
		return { spec: saved.spec, plan, transcript, ...(tickets && { tickets }) };
	} catch (error) {
		throw new Error(`${path} isn't a usable grill plan: ${error.message}`);
	}
}
