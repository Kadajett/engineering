# "engineering"

I was sick of bringing my code quality checks, linters, and codegraph settings into every new project or Worker I wanted to build.

So I built "engineering": a CLI that runs the upstream project generator, then adds the workflow I like to work with—quality checks, useful agent skills, a code graph, and CI. I get to start on the application instead of copying configuration around.

Your framework still owns its tools and application structure. These are my defaults, not a claim that every project should use them.

## Get started

You'll need **Node 22.12+**, npm, and Git. **Linux is the platform tested so far.** This is a GitHub source release, not a package published to npm.

```bash
git clone https://github.com/Kadajett/engineering.git
cd engineering
npm ci
npm install --global --prefix "$HOME/.local" "$PWD"
export PATH="$HOME/.local/bin:$PATH"
```

Keep the checkout: the command links to it. Add the PATH line to your shell configuration if needed. If you don't want to install a command, use `node ./bin/engineering.mjs` from the checkout instead.

Next, check the supporting tools and install any you're missing:

```bash
engineering doctor
engineering setup
```

`setup` asks before installing Beads, Graphify, and Lizard. It needs [uv](https://docs.astral.sh/uv/getting-started/installation/) for missing Python tools; it won't install Node or uv, use sudo, or change your existing apps. The quality checks require **Lizard 1.24.0**. Beads and Graphify are optional for each project.

## Create a project

```bash
engineering create                        # choose a type, then enter a project name
engineering create hono-node              # asks for the project name
engineering create hono-node --name "My API" # creates ./my-api
engineering create hono-node my-api        # name supplied: no name prompt
engineering create react-vite my-web
engineering create next my-site
engineering create opentui my-terminal-app # requires Bun
engineering create workers-ai ./MyChat --name "My Chat" --open vscode
```

"engineering" runs the real upstream generator, installs the project's dependencies, and adds its quality configuration, agent skills, and CI. It also sets up Beads and a code-only Graphify graph unless you turn them off. Finally, it runs the available native checks and its own quality checks, then shows how to start the app.

A supplied positional name is the destination folder under your current directory. A prompted name or `--name` without a destination becomes a lowercase, hyphenated child folder. Explicit paths still work; use `--name` alongside a path when the display name should differ. Unattended creation needs both the profile and name; nothing silently defaults to the current directory.

The OpenTUI starter uses **Bun 1.3.0+**, which you need to [install separately](https://bun.sh/docs/installation). "engineering" doesn't install it for you. It defaults to TypeScript Core, with React and Solid options available in the [catalog](CATALOG.md#opentui).

Before generation, you'll be asked whether to save a baseline of problems the starter already has. For example, if an upstream function is already over the complexity limit, an approved baseline remembers that issue so you can work on the app without fixing the whole starter first. New problems still fail, and changing that function or making its violation worse requires another look. Choose no baseline if you want every existing issue fixed before the checks pass. An existing baseline is never overwritten.

Setup doesn't deploy anything or call an AI model.

See every project type with `engineering list`, or preview a command without downloads or file changes:

```bash
engineering plan workers-ai ./MyChat --name "My Chat"
```

## Get grilled before you build

```bash
engineering grill                                  # asks what to grill you about; works on the current project
engineering grill ./prompt.md                      # new project, named from the prompt's heading
engineering grill ./take-home.pdf board --model sonnet --manager bun
engineering grill ~/Dev/my-app                     # extend an existing project
engineering grill . --plan /tmp/grill-plan.json    # use a plan an agent already grilled out of you
```

`grill` is for work you'll have to explain afterward: a take-home, a live-coding prompt, or the next feature in an existing project. Without a prompt file it asks what to grill you about. An agent (OMP by default, or Claude Code with `--agent claude`) then interviews you one question at a time, since each answer changes what's worth asking next. It only asks about decisions that change what gets built or that a reviewer would challenge; it settles small details itself and lists them in the plan. A question is at most three sentences, written by the humanizer skill's rules, with options where they help and the agent's recommended answer. Press Enter to take the recommendation, type an option's number, or answer in your own words; your answer goes to the agent as typed. Say you've had enough and it plans with its recommendations for the rest. It pushes back on vague or risky answers.

A missing or empty directory gets new projects. Any other directory is extended: the agent sees a summary of its files, package.json, README and AGENTS.md, and plans no new projects.

When nothing is left open, it shows the shared understanding. Press Enter to accept it, or type what's wrong and the grilling continues. Then `grill`:

1. Creates the new projects with `engineering create`, if any.
2. Writes `docs/grill/<topic>/`: SPEC, DECISIONS (each decision with its alternatives and your reason; missing reasons are flagged), TRANSCRIPT, and BUILD (instructions for the build agent).
3. Has the agent break the plan into vertical-slice tickets in dependency order (TICKETS.md), and creates them as beads with their dependencies. A folder without Beads gets one.
4. Starts the build agent in your terminal, told to work `bd ready` one ticket at a time, test first, and finish with a TALK-TRACK.md you can walk through. `--no-build` stops before this.

Each step is saved in `.engineering/grill/<topic>.json`, so rerunning with the same prompt or topic resumes where it stopped. `--plan FILE` skips the grilling; the `engineering-grill` agent skill uses it after grilling you in chat.

This is the one command that calls a model, through the agent CLI you already use; the rest of "engineering" stays model-free. The agent can only plan project types `engineering` knows, in plain folders. Create options such as `--manager bun`, `--no-beads` and `--baseline --reason "..."` pass through to new projects.


## Skills that fit the project

Skills are on by default—there's no extra setup command to remember. Every project starts with Matt Pocock's **tdd**, **codebase-design**, and **diagnosing-bugs** skills, plus blader's **humanizer** so agent-written prose reads plainly. The project's dependencies determine which library skills to add:

- **Cloudflare Workers:** official Cloudflare, Wrangler, and Workers best practices.
- **Cloudflare Agents SDK:** Agents SDK and Durable Objects guidance.
- **AI SDK / AI chat:** the official `ai-sdk` skill, selected from `ai`, `workers-ai-provider`, or `@cloudflare/ai-chat`.
- **Web React / Next.js:** Vercel's React and Next.js best practices.
- **OpenTUI:** the official OpenTUI skill, including Core, React, and Solid renderers. Terminal React alone doesn't pull in browser-focused React guidance.
- **Hono, TanStack Start / Router, Clerk:** matching upstream skills and any companion skills they need.
- **StrykerJS:** the [Stryker skill](https://github.com/Kadajett/stryker-skill), selected by a direct `@stryker-mutator/core` dependency. It covers meaningful survivors, safe execution, and sustained team workflows—not score chasing.

The catalog uses reviewed sources and pinned revisions. If a library has no verified match, "engineering" says so rather than pretending it has library-specific guidance.

Existing project skills are reused, and user-level collections are left alone. Local skills are copied into an engineering-owned cache before linking, so a Claude plugin update can remove its old version without breaking projects. Missing skills are fetched at pinned revisions without checking out an entire monorepo. Shared/Codex, Claude, Pi, and OMP links stay out of Git; `.engineering/skills.json` records restoration sources and managed-link ownership.

After cloning a generated project or changing its dependencies, run this with the project's package manager:

```bash
npm run engineering:skills
```

You can also run `engineering skills .` in an existing project, even one without the engineering package. It adds skills without adopting the project or changing its baseline. Use `--skills-dir ~/my-skills` to reuse another collection.

Generated agent instructions explain when to load skills, but making them available isn't a guarantee that every agent will follow them.

### Recommend extras without installing them

```bash
engineering recommend .                     # general and matching optional skills
engineering recommend . --include-installed # also show favorites you already have
engineering recommend . --catalog ~/favorites.json --json
```

Recommendations are separate from the automatic installs. The selection includes Cursor Team Kit's **thermo-nuclear-code-quality-review** (the requested thermonuclear review), Dietrich Gebert's **ponytail** minimal-code workflow, focused complexity review, evidence-based verification, and PR preparation. Planning/research skills, TypeScript, Rust and pytest guidance, and Clerk testing/webhooks remain available. Every suggestion explains its match and links to an inspected `SKILL.md` at an immutable commit; see [verified names, sources, and caveats](docs/REFERENCE.md#verified-review-and-writing-extras).

Keep your own favorites in `${XDG_CONFIG_HOME:-$HOME/.config}/kadajett-engineering/recommendations.json` for all projects, or `.engineering/recommendations.json` for one project. You can add skills, override descriptions and matching rules, or disable suggestions. A record without matching rules is general; others match languages, direct packages, or project profiles. See the [catalog format and precedence](docs/REFERENCE.md#optional-skill-recommendations).

The command works without adopting a project, runs offline, and changes no files. It excludes automatic defaults and skills already available in project/user collections unless you request the latter. Review each source before choosing to install it; recommendations never run a skill's setup or replace your existing tooling.

### AI Workers: logging, tokens, and production guidance

Workers projects also get a short observability checklist and official reference links in their agent instructions. AI Workers and Agents projects get more: token accounting, streaming and cancellation, tool safety, durable execution, and privacy-aware tracing. The guidance checks which stack you use instead of assuming every AI app has the same APIs.

Start with native Cloudflare logs and traces. AI Gateway remains a choice, and Sentry-specific docs are added only when `@sentry/cloudflare` is a dependency. Setup doesn't install monitoring SDKs, change sampling, or start recording prompts. The [AI Workers guide](docs/AI-WORKERS.md) explains the recommendations, version traps, and sources.

For an older native `env.AI` project without a stored profile, run `engineering skills . --profile workers-ai`. This refreshes guidance without adopting the app or changing its baseline.

## Beads in every agent

Claude Code and Codex keep their native Beads setup. Pi reads the root `AGENTS.md`; OMP imports it through `.omp/AGENTS.md`. Both receive native links to the shared Beads skill, without enabling foreign providers or changing global configuration. The workflow is explicit: run `bd prime` and `bd ready --json` at startup and after compaction, claim work before editing, and save blockers and handoff notes before stopping. Close a bead only after its acceptance checks pass.

Beads is the durable record. OMP's `todo` and `task`/`hub`, and other agents' session plans, remain useful for live coordination but don't replace it. A project-local `.beads/PRIME.md` keeps native hook guidance consistent with that distinction; existing custom primers are preserved. Stored memories remain available through `bd prime --export --memories-only`.

## Testing defaults

New projects keep upstream test runners and configuration. Where none exists, ordinary JS/TS starters get Vitest and OpenTUI gets Bun's native runner. Workers without an upstream test setup get runtime-independent unit tests; testing bindings still requires Cloudflare's runtime integration.

The `test` command is strict. For added defaults, `test:ci` discovers tests using the runner and reports an empty suite explicitly—no placeholder tests or coverage claims. Once tests exist, their failures fail setup and CI. Known one-shot upstream test commands run automatically; a Vitest watcher gets a separate one-shot alias without replacing the original script. Unknown scripts remain manual.

### Mutation testing by default

Creation and adoption add [StrykerJS](https://stryker-mutator.io/docs/stryker-js/) **10.0.0**, `stryker.config.json`, and `test:mutation` when a compatible one-shot unit test command is available. This covers the platform's JavaScript/TypeScript profiles, including Bun/OpenTUI. Existing Stryker setup is preserved; `--no-mutation` skips new setup.

```bash
npm run test:mutation   # use the project's package manager
```

Stryker changes production code in a temporary sandbox and checks whether your tests catch it. The generated configuration fails scores below **80**, writes local HTML/JSON reports under `reports/mutation/`, and excludes tests, declarations, configuration, and known generated/vendor output from mutation. Review the scope for your app. Mutation testing runs separately from setup, ordinary checks, and generated CI; add the script to CI when you want the slower gate.

Plain Vitest uses its native Stryker runner. Other recognized host unit-test commands use the command adapter, which reruns the full suite per mutant and cannot count tests. Unknown commands, E2E-only projects, and Cloudflare's isolated Worker test pools aren't automatically configured. Runtime-independent Worker unit tests remain eligible. Empty suites or reports without valid mutants are not evidence of test quality.

Stryker also has C#/.NET and Scala engines, but this platform currently creates/adopts JS/TS projects only. The [mutation testing reference](docs/REFERENCE.md#mutation-testing) documents that boundary and the native local-tool paths for those engines.

## Bring an existing project

```bash
engineering adopt . --profile generic
```

Your scripts, framework configuration, and application code stay yours. Adoption adds engineering commands and runs native checks plus recognized one-shot tests. It doesn't install a new runner into an existing project or launch an arbitrary test watcher; any unrecognized test command still needs your review.

A few useful options:

| Option | What it does |
| --- | --- |
| `--name "My App"` | Creates `./my-app` when no destination is supplied; otherwise sets the application name separately. |
| `--open vscode` | Opens the workspace while the final checks finish. |
| `--no-baseline` | Skips the baseline question and accepts no new exceptions. |
| `--baseline --reason "..."` | Saves the starter's existing issues with your approval reason, after native checks pass. |
| `--no-beads --no-graphify --no-ci --no-skills` | Leaves out the integrations you don't want. |
| `--no-mutation` | Skips new StrykerJS setup without removing existing mutation tooling. |
| `--dry-run` | Shows the plan without file changes or downloads. |

## What gets enforced?

The default limits are cyclomatic complexity **10**, function NLOC **50**, parameters **4**, nesting **4**, cognitive complexity **15**, and ordinary file length **300** lines. Generated and vendored output is excluded; tests have their own length allowances. TypeScript checks keep the framework's runtime settings and add strictness.

You can adjust the scope and limits in `.engineering/config.json`. A project's approved baseline is stored separately and never grows automatically. `engineering prune .` removes allowances you've fixed; it doesn't approve new ones. Each project's baseline, Beads data, and Graphify graph are independent.

## More detail

- [Generator catalog](CATALOG.md): supported frameworks, upstream commands, and Cloudflare resources.
- [CLI and quality reference](docs/REFERENCE.md): skills, baselines, checks, caching, and CI.
- [AI Workers guide](docs/AI-WORKERS.md): observability, token usage, privacy, and production practices without requiring Sentry.
- [MIT license](LICENSE).

To work on "engineering" itself, install Lizard 1.24.0 and run `npm ci && npm run check`. Some checks need native tools or package registry access. The package checks its own source without a baseline.
