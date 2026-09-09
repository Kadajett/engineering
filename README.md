# "engineering"

I was sick of having to bring over my code quality metrics, linters, and codegraph settings for every new project or Worker I wanted to create.

So I built "engineering": a CLI that runs the upstream project generator, then adds my engineering defaults. Quality gates, useful agent skills, codegraph integration, and CI—without copying configuration around or maintaining another app template.

Your framework keeps its tooling and application structure. "engineering" adds the workflow around it.

These are my defaults, not a claim that every project should use them.

## Get started

Requires **Node 22.12+**, npm, and Git. Linux is the currently verified platform. This is a GitHub source release, not an npm registry release.

```bash
git clone https://github.com/Kadajett/engineering.git
cd engineering
npm ci
npm install --global --prefix "$HOME/.local" "$PWD"
export PATH="$HOME/.local/bin:$PATH"
```

Keep the checkout: the user-local command links to it. Add the PATH line to your shell configuration if needed. You can also use `node ./bin/engineering.mjs` directly instead of installing the command.

Inspect the native tools, then install any missing ones with your approval:

```bash
engineering doctor
engineering setup
```

`setup` needs [uv](https://docs.astral.sh/uv/getting-started/installation/) to install missing Python tools. It installs missing Beads, Graphify, and Lizard; it does not install Node/uv, use sudo, or change existing application repositories. Lizard **1.24.0** is required for the quality gate. Beads and Graphify can be omitted per project.

## Create a project

```bash
engineering create my-app                  # choose a project type
engineering create hono-node my-api        # or choose directly
engineering create react-vite my-web
engineering create next my-site
engineering create workers-ai ./MyChat --name "My Chat" --open vscode
```

One command:

1. Runs the real upstream generator.
2. Adds your portable quality configuration and CI checks.
3. Installs baseline agent skills and the matching library guidance automatically.
4. Sets up Beads and a code-only Graphify graph.
5. Runs preparation, native checks, and the engineering gate.
6. Shows what is ready and the command to start your app.

Skills are **on by default**. You do not need to ask for them or run a separate setup command. Existing skills are reused where possible; missing verified skills are fetched and linked into the project.

Creation asks about inherited quality violations before generating anything. Approve a baseline only deliberately; declining keeps the strict gate. Existing code may need fixes before verification passes. No deployment or AI inference is performed during setup.

See all choices with `engineering list`, or preview without writing files:

```bash
engineering plan workers-ai ./MyChat --name "My Chat"
```

## Skills that fit the project

Every project starts with Matt Pocock's **tdd**, **codebase-design**, and **diagnosing-bugs** skills. Library-specific guidance is selected from the actual dependencies:

- **Cloudflare Workers:** official Cloudflare, Wrangler, and Workers best practices.
- **Cloudflare Agents SDK:** Agents SDK and Durable Objects guidance.
- **React / Next.js:** Vercel's React and Next.js best practices.
- **Hono, TanStack Start / Router, Clerk:** matching upstream skills and required companion skills.

Sources are vetted and pinned, not selected by popularity alone. Packages without a verified mapping are reported; baseline guidance still applies.

Skills are discoverable through shared/Codex, Claude, Pi, and OMP project directories. Local symlinks stay out of Git; `.engineering/skills.json` records portable sources. Generated agent instructions explain when to use the skills and refresh them after dependencies change.

After cloning a generated project or changing its dependencies:

```bash
npm run engineering:skills
```

Existing projects—including ones without an engineering package—can get skills directly with `engineering skills .`. This does not rebaseline or re-adopt them. Use `--skills-dir ~/my-skills` to reuse another local collection.

## Bring an existing project

```bash
engineering adopt . --profile generic
```

Existing scripts, framework configuration, and application logic remain yours. Setup adds the engineering commands and runs the available native checks. Run your actual application tests too; the wrapper does not guess whether an arbitrary test script watches or exits.

Useful options:

| Option | Purpose |
| --- | --- |
| `--name "My App"` | Separate application name from destination directory |
| `--open vscode` | Open the workspace while final verification finishes |
| `--no-baseline` | Keep the strict gate without an approval prompt |
| `--baseline --reason "..."` | Explicitly approve the initial inherited snapshot |
| `--no-beads --no-graphify --no-ci --no-skills` | Omit integrations you do not want |
| `--dry-run` | Inspect the plan without writes or downloads |

## What gets enforced?

Default limits: cyclomatic complexity **10**, function NLOC **50**, parameters **4**, nesting **4**, cognitive complexity **15**, and ordinary file length **300** lines. Generated/vendor output is excluded. TypeScript checks preserve framework runtime settings while adding strictness. Tests have their own length allowances.

Configuration lives in `.engineering/config.json`. Approved inherited debt is tracked separately and never silently expanded. Beads, Graphify, and each project's baseline remain independent.

## More detail

- [Generator catalog](CATALOG.md): supported frameworks, upstream commands, and Cloudflare resources.
- [CLI and quality reference](docs/REFERENCE.md): skills, safety boundaries, baselines, caching, CI, and analyzer scope.
- [MIT license](LICENSE).

To work on "engineering" itself, install Lizard 1.24.0 and run `npm ci && npm run check`. The checks use real Git/native-tool fixtures where available; some require package registry access. The layer itself has no inherited baseline.
