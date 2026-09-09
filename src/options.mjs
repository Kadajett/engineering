import { parseArgs } from "node:util";

function validateBaseline(options) {
	if (options.baseline && !options.reason?.trim())
		throw new Error("--baseline requires an explicit --reason");
	if (options.baseline && options.noBaseline)
		throw new Error("Choose --baseline or --no-baseline, not both");
}

function validateSkillOptions(options, command) {
	if (
		(options.skillsDirs.length || options.skills === false) &&
		!["create", "adopt", "plan", "skills"].includes(command)
	)
		throw new Error("Skill options are supported only for create, adopt, plan and skills");
	if (options.skillsDirs.some((path) => !path.trim()))
		throw new Error("--skills-dir requires a nonempty directory");
}

function validateOptions(options, command) {
	validateBaseline(options);
	validateSkillOptions(options, command);
	if (options.open && options.open !== "vscode") throw new Error("--open supports vscode");
	if (options.name !== undefined && !options.name.trim())
		throw new Error("--name requires a nonempty application name");
	if (options.name && !["create", "plan"].includes(command))
		throw new Error("--name is supported only for create and plan");
	if (options.open && !["create", "plan", "adopt"].includes(command))
		throw new Error("--open is supported only for create, plan and adopt");
}

export function parseOptions(args) {
	const separator = args.indexOf("--");
	const forwarded = separator < 0 ? [] : args.slice(separator + 1);
	const { values, positionals } = parseArgs({
		args: separator < 0 ? args : args.slice(0, separator),
		allowPositionals: true,
		options: {
			help: { type: "boolean", short: "h" },
			version: { type: "boolean" },
			profile: { type: "string" },
			generator: { type: "string" },
			manager: { type: "string" },
			name: { type: "string" },
			open: { type: "string" },
			"no-baseline": { type: "boolean" },
			baseline: { type: "boolean" },
			reason: { type: "string" },
			accept: { type: "boolean" },
			"install-tools": { type: "boolean" },
			"no-beads": { type: "boolean" },
			"no-graphify": { type: "boolean" },
			"no-ci": { type: "boolean" },
			"no-skills": { type: "boolean" },
			"skills-dir": { type: "string", multiple: true },
			"allow-deprecated": { type: "boolean" },
			"dry-run": { type: "boolean" },
		},
	});
	const options = {
		...values,
		forwarded,
		installTools: Boolean(values["install-tools"]),
		beads: !values["no-beads"],
		graphify: !values["no-graphify"],
		ci: !values["no-ci"],
		skills: !values["no-skills"],
		skillsDirs: values["skills-dir"] ?? [],
		allowDeprecated: Boolean(values["allow-deprecated"]),
		dryRun: Boolean(values["dry-run"]),
		noBaseline: Boolean(values["no-baseline"]),
	};
	validateOptions(options, positionals[0]);
	return { command: positionals[0] ?? "help", targets: positionals.slice(1), options };
}

export function usage() {
	return `engineering — upstream generators + reusable local engineering policy

Commands:
  list                                      Show project selections
  create [profile] <directory> [-- flags]    Generate, prepare, integrate and verify
  create <directory> --generator pkg         Use another upstream npm generator
  adopt [directory] --profile generic        Install rules and verify existing code
  plan <profile> <directory>                 Preview without network or writes
  skills [directory]                        Restore automatic baseline/library skills
  check [directory]                          Read-only policy gate
  baseline [directory] --accept --reason X   Approve initial inherited debt
  prune [directory]                          Reduce resolved allowances only
  doctor                                    Inspect prerequisites
  setup                                     Explicitly install missing tools

Create/adopt options:
  --name NAME            Separate app/display name (create only)
  --open vscode          Open workspace while verification finishes
  --baseline --reason X  Approve initial debt after native checks
  --no-baseline          Explicit zero-debt policy; suppress approval prompt
  --manager npm|pnpm|yarn|bun  Preserve existing manager choices
  --install-tools        Explicitly install missing prerequisites
  --no-beads --no-graphify --no-ci --no-skills  Omit selected integrations
  --skills-dir PATH      Reuse skills from an additional local directory (repeatable)
  --allow-deprecated     Permit legacy Create React App
  --dry-run              Show plan only; never prompt or open the editor

Interactive creation asks about inherited debt before generating anything.
Non-interactive creation never implicitly approves a baseline.
Baseline and matching library skills are installed automatically during setup.
Arguments after -- belong to upstream, except unsafe fixed-template overrides.
Existing application logic and framework tooling remain upstream-owned.
`;
}
