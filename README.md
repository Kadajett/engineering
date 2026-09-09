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
engineering create my-app                  # choose a project type
engineering create hono-node my-api        # or choose directly
engineering create react-vite my-web
engineering create next my-site
engineering create opentui my-terminal-app # requires Bun
engineering create workers-ai ./MyChat --name "My Chat" --open vscode
```

"engineering" runs the real upstream generator, installs the project's dependencies, and adds its quality configuration, agent skills, and CI. It also sets up Beads and a code-only Graphify graph unless you turn them off. Finally, it runs the available native checks and its own quality checks, then shows how to start the app.

The OpenTUI starter uses **Bun 1.3.0+**, which you need to [install separately](https://bun.sh/docs/installation). "engineering" doesn't install it for you. It defaults to TypeScript Core, with React and Solid options available in the [catalog](CATALOG.md#opentui).

Before generation, you'll be asked whether to save a baseline of problems the starter already has. For example, if an upstream function is already over the complexity limit, an approved baseline remembers that issue so you can work on the app without fixing the whole starter first. New problems still fail, and changing that function or making its violation worse requires another look. Choose no baseline if you want every existing issue fixed before the checks pass. An existing baseline is never overwritten.

Setup doesn't deploy anything or call an AI model.

See every project type with `engineering list`, or preview a command without downloads or file changes:

```bash
engineering plan workers-ai ./MyChat --name "My Chat"
```

## Skills that fit the project

Skills are on by default—there's no extra setup command to remember. Every project starts with Matt Pocock's **tdd**, **codebase-design**, and **diagnosing-bugs** skills. The project's dependencies determine which library skills to add:

- **Cloudflare Workers:** official Cloudflare, Wrangler, and Workers best practices.
- **Cloudflare Agents SDK:** Agents SDK and Durable Objects guidance.
- **Web React / Next.js:** Vercel's React and Next.js best practices.
- **OpenTUI:** the official OpenTUI skill, including Core, React, and Solid renderers. Terminal React alone doesn't pull in browser-focused React guidance.
- **Hono, TanStack Start / Router, Clerk:** matching upstream skills and any companion skills they need.

The catalog uses reviewed sources and pinned revisions. If a library has no verified match, "engineering" says so rather than pretending it has library-specific guidance.

Existing skills are reused where possible, and your user-level skill directories are left alone. Missing skills are fetched and linked into the project's shared/Codex, Claude, Pi, and OMP directories. Local links stay out of Git; `.engineering/skills.json` records the sources another machine can use.

After cloning a generated project or changing its dependencies, run this with the project's package manager:

```bash
npm run engineering:skills
```

You can also run `engineering skills .` in an existing project, even one without the engineering package. It adds skills without adopting the project or changing its baseline. Use `--skills-dir ~/my-skills` to reuse another collection.

Generated agent instructions explain when to load skills, but making them available isn't a guarantee that every agent will follow them.

## Bring an existing project

```bash
engineering adopt . --profile generic
```

Your scripts, framework configuration, and application code stay yours. Adoption adds the engineering commands and runs the available native checks. You should still run your application tests: "engineering" doesn't assume an arbitrary `test` script exits rather than starting a watcher.

A few useful options:

| Option | What it does |
| --- | --- |
| `--name "My App"` | Uses an application name different from the destination directory. |
| `--open vscode` | Opens the workspace while the final checks finish. |
| `--no-baseline` | Skips the baseline question and accepts no new exceptions. |
| `--baseline --reason "..."` | Saves the starter's existing issues with your approval reason, after native checks pass. |
| `--no-beads --no-graphify --no-ci --no-skills` | Leaves out the integrations you don't want. |
| `--dry-run` | Shows the plan without file changes or downloads. |

## What gets enforced?

The default limits are cyclomatic complexity **10**, function NLOC **50**, parameters **4**, nesting **4**, cognitive complexity **15**, and ordinary file length **300** lines. Generated and vendored output is excluded; tests have their own length allowances. TypeScript checks keep the framework's runtime settings and add strictness.

You can adjust the scope and limits in `.engineering/config.json`. A project's approved baseline is stored separately and never grows automatically. `engineering prune .` removes allowances you've fixed; it doesn't approve new ones. Each project's baseline, Beads data, and Graphify graph are independent.

## More detail

- [Generator catalog](CATALOG.md): supported frameworks, upstream commands, and Cloudflare resources.
- [CLI and quality reference](docs/REFERENCE.md): skills, baselines, checks, caching, and CI.
- [MIT license](LICENSE).

To work on "engineering" itself, install Lizard 1.24.0 and run `npm ci && npm run check`. Some checks need native tools or package registry access. The package checks its own source without a baseline.
