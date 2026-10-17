import { profiles } from "./profiles.mjs";

/** The profiles create can generate, one per line: what `engineering create --help` lists. */
export function profileList() {
	return profiles
		.filter((profile) => profile.generator)
		.map((profile) => `  ${profile.id.padEnd(20)} ${profile.label}`)
		.join("\n");
}

const setupOptions = `  --profile ID           Project type (create: or pass it first; adopt: default generic)
  --manager npm|pnpm|yarn|bun  Package manager; an existing choice is kept
  --baseline --reason X  Remember the starter's existing issues, with your reason
  --no-baseline          Don't create a baseline or ask about one
  --without LIST         Leave out any of: beads,graphify,ci,skills,mutation
  --skills-dir PATH      Reuse another local skill collection (repeatable)
  --install-tools        Install missing tools first
  --open vscode          Open VS Code while the last checks run
  --dry-run              Show the plan without changing anything`;

const sections = {
	create: () => `engineering create [profile] [name or directory]

Make a new project from an upstream starter, with checks, tests (Vitest and
StrykerJS), skills, Beads and CI. Asks for anything you leave out.

${setupOptions}
  --name NAME            App name; also names the folder when none is given
  --generator PKG        Use another npm project generator
  --allow-deprecated     Allow a legacy Create React App project
  -- ARGS                Pass the rest to the upstream generator

Profiles:
${profileList()}

Examples:
  engineering create next ./board --manager bun
  engineering create react-vite --name "My App"
  engineering create next ./board --dry-run`,
	adopt: () => `engineering adopt [directory]

Add the same checks, tests, skills, Beads and CI to an existing project.
Your scripts, framework configuration and code stay yours.

${setupOptions}`,
	grill: () => `engineering grill [prompt] [directory]

Get grilled on work for an existing project, one decision at a time, then
write the brief, ticket it as beads, and start the build agent. The directory
(default: current) must already hold a project; grill never creates one.

  --agent omp|claude|PATH  Agent that grills and builds (default omp)
  --model MODEL          Model for that agent
  --plan FILE            Skip the grilling and use a saved plan
  --without beads        Write TICKETS.md only; don't create beads
  --no-build             Stop after the tickets
  --dry-run              Show where the brief would go without writing it

Rerun with the same prompt or topic to resume.`,
	check: () => `engineering check [directory]

Check the code against the project's limits without changing it.

  --baseline --reason X  Record today's existing issues once, with your reason
  --prune                Drop allowances for issues you've since fixed`,
	skills: () => `engineering skills [directory]

Set up or restore the project's agent skills.

  --suggest              Suggest optional skills instead; installs nothing
  --catalog FILE         With --suggest: overlay your favorites catalog
  --include-installed    With --suggest: also show ones you already have
  --json                 With --suggest: print the report as JSON
  --profile ID           Project context when none is stored
  --skills-dir PATH      Reuse another local skill collection (repeatable)
  --dry-run              Show the plan without changing anything`,
	doctor: () => `engineering doctor

See which tools are ready or missing.

  --fix                  Install the missing tools`,
};

export const commandNames = Object.keys(sections);

const overview = `engineering — your usual tools, ready in the next project

  create [profile] [dir]   Make a new project
  adopt [dir]              Bring an existing project in
  grill [prompt] [dir]     Plan work in a project, ticket it, and build it
  check [dir]              Check the code against its limits
  skills [dir]             Set up the project's agent skills
  doctor                   See which tools are ready or missing

engineering <command> --help shows a command's options.`;

/** Help for one command, or the overview when there's no known command. */
export function usage(command) {
	return sections[command]?.() ?? overview;
}
