import { parseArgs } from "node:util";

function validateBaseline(options) {
	if (options.baseline && !options.reason?.trim())
		throw new Error("--baseline requires an explicit --reason");
	if (options.baseline && options.noBaseline)
		throw new Error("Choose --baseline or --no-baseline, not both");
}

function validateSetupOptions(options, command) {
	if (
		(options.skillsDirs.length || options.skills === false) &&
		!["create", "adopt", "plan", "skills", "grill"].includes(command)
	)
		throw new Error("Skill options are supported only for create, adopt, plan, skills and grill");
	if (options.skillsDirs.some((path) => !path.trim()))
		throw new Error("--skills-dir requires a nonempty directory");
	if (options.mutation === false && !["create", "adopt", "plan"].includes(command))
		throw new Error("--no-mutation is supported only for create, adopt and plan");
}

function validateRecommendationOptions(options, command) {
	if (
		(options.catalog !== undefined || options.json || options.includeInstalled) &&
		command !== "recommend"
	)
		throw new Error("--catalog, --json and --include-installed are supported only for recommend");
	if (options.catalog !== undefined && !options.catalog.trim())
		throw new Error("--catalog requires a nonempty file path");
}

function validateCommandScope(options, command) {
	if (
		["agent", "model", "plan", "no-build"].some((key) => options[key] !== undefined) &&
		command !== "grill"
	)
		throw new Error("--agent, --model, --plan and --no-build are supported only for grill");
	if (options.name && !["create", "plan"].includes(command))
		throw new Error("--name is supported only for create and plan");
	if (options.open && !["create", "plan", "adopt"].includes(command))
		throw new Error("--open is supported only for create, plan and adopt");
}

function validateOptions(options, command) {
	validateBaseline(options);
	validateSetupOptions(options, command);
	validateRecommendationOptions(options, command);
	validateCommandScope(options, command);
	if (options.open && options.open !== "vscode") throw new Error("--open supports vscode");
	if (options.name !== undefined && !options.name.trim())
		throw new Error("--name requires a nonempty application name");
}

const OPTION_SCHEMA = {
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
	"no-mutation": { type: "boolean" },
	"skills-dir": { type: "string", multiple: true },
	catalog: { type: "string" },
	json: { type: "boolean" },
	"include-installed": { type: "boolean" },
	"allow-deprecated": { type: "boolean" },
	"dry-run": { type: "boolean" },
	agent: { type: "string" },
	model: { type: "string" },
	plan: { type: "string" },
	"no-build": { type: "boolean" },
};

export function parseOptions(args) {
	const separator = args.indexOf("--");
	const forwarded = separator < 0 ? [] : args.slice(separator + 1);
	const { values, positionals } = parseArgs({
		args: separator < 0 ? args : args.slice(0, separator),
		allowPositionals: true,
		options: OPTION_SCHEMA,
	});
	const options = {
		...values,
		forwarded,
		installTools: Boolean(values["install-tools"]),
		beads: !values["no-beads"],
		graphify: !values["no-graphify"],
		ci: !values["no-ci"],
		skills: !values["no-skills"],
		mutation: !values["no-mutation"],
		skillsDirs: values["skills-dir"] ?? [],
		allowDeprecated: Boolean(values["allow-deprecated"]),
		includeInstalled: Boolean(values["include-installed"]),
		dryRun: Boolean(values["dry-run"]),
		noBaseline: Boolean(values["no-baseline"]),
		build: !values["no-build"],
	};
	validateOptions(options, positionals[0]);
	return { command: positionals[0] ?? "help", targets: positionals.slice(1), options };
}

const help = `engineering — your usual tools, ready in the next project

Commands:
  list                                      Browse the available project types
  create [profile] [name]                    Create an app; ask for anything omitted
  adopt [directory] --profile generic        Add your tools to an existing project
  plan [profile] [name]                      Preview creation without making changes
  skills [directory]                        Set up or restore the project's skills
  recommend [directory]                     Suggest optional skills without installing
  grill [prompt] [directory]                Get grilled on work for an existing project, then ticket and build it
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
  --no-mutation          Leave out default StrykerJS setup (existing tooling is preserved)
  --skills-dir PATH      Reuse another local skill collection (repeatable)
  --allow-deprecated     Allow a legacy Create React App project
  --dry-run              Show the plan without changing files or opening an editor

Recommendation options:
  --catalog FILE         Overlay a curated favorites catalog
  --include-installed    Also show matching favorites already available locally
  --json                 Print the recommendation report as JSON
  --profile PROFILE      Supply project context when no stored profile exists

Grill options:
  --agent omp|claude|PATH  Agent that grills and builds (default omp)
  --model MODEL          Model for that agent
  --plan FILE            Skip the grilling and use a saved plan ({ spec, plan, transcript?, tickets? })
  --dry-run              Grill, then show where the brief would go without writing it
  --no-build             Stop after the tickets instead of starting the build agent
  --no-beads             Write TICKETS.md only; don't create beads
  The directory (default: current) must already hold a project; grill never creates one. Make it
  first with create or adopt. With no prompt file, grill asks what to grill you about. Rerun with
  the same prompt or topic to resume.

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

export function usage() {
	return help;
}
