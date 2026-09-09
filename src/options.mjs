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
	return `engineering — your usual tools, ready in the next project

Commands:
  list                                      Browse the available project types
  create [profile] [name]                    Create an app; ask for anything omitted
  adopt [directory] --profile generic        Add your tools to an existing project
  plan [profile] [name]                      Preview creation without making changes
  skills [directory]                        Set up or restore the project's skills
  check [directory]                         Check the code without changing it
  baseline [directory] --accept --reason X   Remember approved existing issues
  prune [directory]                         Remove allowances for issues you've fixed
  doctor                                    See which tools are ready or missing
  setup                                     Install the missing tools

Create/adopt options:
  --name NAME            Set the app name; default to a matching child folder
  --open vscode          Open VS Code while the last checks run
  --baseline --reason X  Remember existing issues after the native checks pass
  --no-baseline          Don't create a baseline or ask about one
  --manager npm|pnpm|yarn|bun  Choose a manager without replacing an existing choice
  --install-tools        Install missing tools before setup
  --no-beads --no-graphify --no-ci --no-skills  Leave out what you don't need
  --skills-dir PATH      Reuse another local skill collection (repeatable)
  --allow-deprecated     Allow a legacy Create React App project
  --dry-run              Show the plan without changing files or opening an editor

Start: engineering create
Or:    engineering create react-vite MyApp

Advanced creation:
  create --name "My App" --profile react-vite  Derive the folder my-app
  create react-vite ./web --name "My App"     Keep a separate folder and display name
  create my-app --generator pkg              Use another npm project generator
  create react-vite .                        Use the current directory only if empty

A known profile by itself asks for a name. Other names ask for a profile;
--profile selects one directly. Explicit paths keep their destination.
Without a terminal, pass the name and profile; previews always require a name.

Some starters come with code that doesn't meet your limits. In an interactive
terminal, we'll ask whether to remember those issues in a baseline. Without
your approval, they still need fixing. New issues always need fixing.

Shared engineering skills and matching library guidance are set up for you.
Arguments after -- go to the upstream generator, apart from conflicting safety flags.
Your framework keeps its own application structure and tooling.
`;
}
