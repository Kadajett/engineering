import { parseArgs } from "node:util";
import { commandNames } from "./help.mjs";

/** Commands folded into others in 0.7.0, and what to run instead. */
const REMOVED_COMMANDS = {
	plan: "engineering create <profile> <dir> --dry-run",
	list: "engineering create --help",
	recommend: "engineering skills --suggest",
	baseline: 'engineering check --baseline --reason "..."',
	prune: "engineering check --prune",
	setup: "engineering doctor --fix",
};

const REMOVED_FLAGS = {
	"--accept": '--baseline --reason "..."',
	"--no-beads": "--without beads",
	"--no-graphify": "--without graphify",
	"--no-ci": "--without ci",
	"--no-skills": "--without skills",
	"--no-mutation": "--without mutation",
};

const INTEGRATIONS = ["beads", "graphify", "ci", "skills", "mutation"];

const OPTION_SCHEMA = {
	help: { type: "boolean", short: "h" },
	version: { type: "boolean" },
	profile: { type: "string" },
	generator: { type: "string" },
	manager: { type: "string" },
	name: { type: "string" },
	open: { type: "string" },
	baseline: { type: "boolean" },
	"no-baseline": { type: "boolean" },
	reason: { type: "string" },
	without: { type: "string" },
	"install-tools": { type: "boolean" },
	"skills-dir": { type: "string", multiple: true },
	"allow-deprecated": { type: "boolean" },
	"dry-run": { type: "boolean" },
	agent: { type: "string" },
	model: { type: "string" },
	plan: { type: "string" },
	"no-build": { type: "boolean" },
	prune: { type: "boolean" },
	suggest: { type: "boolean" },
	catalog: { type: "string" },
	json: { type: "boolean" },
	"include-installed": { type: "boolean" },
	fix: { type: "boolean" },
};

const SETUP = [
	"profile",
	"manager",
	"baseline",
	"no-baseline",
	"reason",
	"without",
	"skills-dir",
	"install-tools",
	"open",
	"dry-run",
];

/** Which options each command accepts; --help and --version work everywhere. */
const ACCEPTS = {
	create: [...SETUP, "name", "generator", "allow-deprecated"],
	adopt: SETUP,
	grill: ["agent", "model", "plan", "without", "no-build", "dry-run", "skills-dir"],
	check: ["baseline", "reason", "prune"],
	skills: ["suggest", "catalog", "include-installed", "json", "profile", "skills-dir", "dry-run"],
	doctor: ["fix"],
};

function checkCommand(command) {
	if (REMOVED_COMMANDS[command])
		throw new Error(
			`"${command}" was folded into another command. Use: ${REMOVED_COMMANDS[command]}`,
		);
	if (command !== undefined && command !== "help" && !commandNames.includes(command))
		throw new Error(`Unknown command: ${command}. Run engineering --help.`);
}

function checkRemovedFlags(args) {
	for (const arg of args)
		if (REMOVED_FLAGS[arg]) throw new Error(`${arg} was replaced. Use: ${REMOVED_FLAGS[arg]}`);
}

function checkScope(values, command) {
	const accepted = ACCEPTS[command] ?? [];
	const where = command ? `engineering ${command}` : "engineering";
	for (const key of Object.keys(values))
		if (key !== "help" && key !== "version" && !accepted.includes(key))
			throw new Error(`--${key} isn't an option for ${where}. See ${where} --help.`);
}

/** --without beads,ci becomes { beads: false, ci: false }; grill can only leave out beads. */
function integrations(without, command) {
	const left = without === undefined ? [] : without.split(",").map((item) => item.trim());
	const allowed = command === "grill" ? ["beads"] : INTEGRATIONS;
	const unknown = left.find((item) => !allowed.includes(item));
	if (unknown !== undefined)
		throw new Error(`--without takes ${allowed.join(", ")}; got "${unknown}"`);
	return Object.fromEntries(INTEGRATIONS.map((name) => [name, !left.includes(name)]));
}

function checkBaseline(values) {
	if (!values.baseline) return;
	if (!values.reason?.trim()) throw new Error("--baseline requires an explicit --reason");
	if (values["no-baseline"]) throw new Error("Choose --baseline or --no-baseline, not both");
	if (values.prune) throw new Error("Choose --baseline or --prune, not both");
}

/** Catalog, JSON and installed-skill options only shape `skills --suggest` output. */
function checkSuggest(values, command) {
	if (command !== "skills" || values.suggest) return;
	const key = ["catalog", "include-installed", "json"].find((name) => values[name] !== undefined);
	if (key) throw new Error(`--${key} needs --suggest`);
}

const blank = (value) => value !== undefined && !value.trim();

function checkShapes(values) {
	if (blank(values.catalog)) throw new Error("--catalog requires a nonempty file path");
	if ((values["skills-dir"] ?? []).some(blank))
		throw new Error("--skills-dir requires a nonempty directory");
	if (values.open !== undefined && values.open !== "vscode")
		throw new Error("--open supports vscode");
	if (blank(values.name)) throw new Error("--name requires a nonempty application name");
}

export function parseOptions(args) {
	const separator = args.indexOf("--");
	const own = separator < 0 ? args : args.slice(0, separator);
	checkRemovedFlags(own);
	const { values, positionals } = parseArgs({
		args: own,
		allowPositionals: true,
		options: OPTION_SCHEMA,
	});
	const command = positionals[0];
	checkCommand(command);
	if (command !== "help") checkScope(values, command);
	checkBaseline(values);
	checkSuggest(values, command);
	checkShapes(values);
	const options = {
		...values,
		...integrations(values.without, command),
		forwarded: separator < 0 ? [] : args.slice(separator + 1),
		installTools: Boolean(values["install-tools"]),
		skillsDirs: values["skills-dir"] ?? [],
		allowDeprecated: Boolean(values["allow-deprecated"]),
		includeInstalled: Boolean(values["include-installed"]),
		dryRun: Boolean(values["dry-run"]),
		noBaseline: Boolean(values["no-baseline"]),
		build: !values["no-build"],
	};
	return { command: command ?? "help", targets: positionals.slice(1), options };
}
