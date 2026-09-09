# CLI and quality reference

[Getting started](../README.md) · [Generator catalog](../CATALOG.md)

This is the detailed guide to what "engineering" adds, how its checks work, and which parts stay under your control.

## Automatic agent skills

`create` and `adopt` install skills by default. Every project gets Matt Pocock's **tdd**, **codebase-design**, and **diagnosing-bugs** guidance, then any verified library skills that match its dependencies. Installing these skills doesn't run their interactive setup or issue-tracker workflows.

| Project dependency or profile | Skills added |
| --- | --- |
| Workers profile, Wrangler, Workers types, or Cloudflare Vite plugin | Cloudflare, Wrangler, Workers best practices |
| Cloudflare `agents` package | Agents SDK and Durable Objects, in addition to Workers guidance |
| `@cloudflare/ai-chat` | Cloudflare, Agents SDK, Durable Objects, and AI SDK guidance |
| `ai` or `workers-ai-provider` | Official AI SDK skill; the Workers provider also selects Cloudflare skills |
| Web React or Next.js | Vercel React/Next best practices |
| OpenTUI Core, React, or Solid packages | Official OpenTUI skill |
| Hono packages | Official Hono skill |
| TanStack React Start / Router | Framework skills and their required core skills |
| Clerk SDKs | Clerk setup and matching framework/backend guidance |

Selection looks at direct dependencies, dev dependencies, optional dependencies, and peers. The actual frontend dependencies take precedence over the profile's default. React used only by OpenTUI doesn't bring in browser-focused Vercel guidance; web dependencies still receive it. Duplicate skills are installed once, and unrelated provider skills are left out. Packages without a verified match are reported. The general skills still apply, but aren't presented as library-specific coverage.

Sources include [Matt Pocock](https://github.com/mattpocock/skills), [Cloudflare](https://github.com/cloudflare/skills), [Vercel](https://github.com/vercel-labs/agent-skills), [OpenTUI](https://github.com/anomalyco/opentui), [Hono](https://github.com/honojs/skills), [TanStack](https://github.com/TanStack/router), and [Clerk](https://github.com/clerk/skills). The skill catalog records reviewed names, paths, and immutable commits rather than picking a popular search result at install time.

### Reuse and portability

A valid skill directory already in the project takes precedence. Otherwise, the installer looks in your `--skills-dir` locations, shared/user agent skill directories, and registered Claude plugins. Local content is validated and snapshotted into an engineering-owned content-addressed cache; it never links a project directly into a versioned plugin installation that an upgrade can remove.

Missing skills use the catalog's pinned public repositories. `${XDG_CACHE_HOME:-$HOME/.cache}/kadajett-engineering/skills-v2` stores a shallow, blob-filtered Git cache per selected skill and revision. The selected subtree, named repository references, and small Git control files required for integrity checks are materialized. Unrelated application blobs aren't fetched or checked out. Servers that ignore partial-fetch filtering are rejected rather than silently retaining a full clone.

Selected skills and their referenced links must resolve within the validated source boundary. Source fetching doesn't execute repository code, enable plugins or MCP servers, install application dependencies, or call a model.

Project links go in `.agents/skills`, `.claude/skills`, `.pi/skills`, and `.omp/skills`. Pi loads the root `AGENTS.md`; OMP imports it through a native context file. Existing directories are kept. `engineering skills .` repairs owned dangling links and migrates recognized legacy managed links to durable sources; unrelated or retargeted custom links remain conflicts instead of being overwritten. Symlinked destination parents are refused.

Commit `.engineering/skills.json`: it records pinned restoration sources, local snapshot digests, and managed-link ownership without absolute machine paths. Local snapshots survive plugin removal, but a clone on another machine can fall back to the recorded upstream revision rather than duplicating a customized local source. Refreshing keeps recorded fallback revisions. Machine-local links use a dedicated `ENGINEERING SKILLS` ignore block; rerunning setup moves skill entries out of old mislabeled Graphify blocks while preserving genuine Graphify and user entries.

```bash
engineering skills .                         # restore links after a clone or dependency change
engineering skills . --dry-run               # preview without downloads or file changes
engineering create hono-node my-api --skills-dir ~/my-skills
engineering create workers-ai my-worker --no-skills
```

You can repeat `--skills-dir` and point it at either a flat skill collection or an upstream repository root. `engineering skills` works without re-adopting the project, changing its quality baseline, or upgrading the installed engineering package.

Generated agent instructions explain when to load matching skills and refresh them after dependency changes. The links make guidance discoverable; they don't guarantee an agent will load it or follow every instruction.

### Observability and AI reference guidance

Skills aren't the only useful source. The managed `AGENTS.md` section also includes a relevant checklist and official links for Workers logging/tracing, AI usage and streaming, Agents production behavior, and version-matched AI SDK telemetry. `CLAUDE.md` points to that section. These references are labeled separately from installed skills and recorded under `guidance` in `.engineering/skills.json`; dry-run plans show them too.

Workers AI and Agents don't imply Sentry. Its Cloudflare docs are selected only for an actual `@sentry/cloudflare` dependency. The maintained Sentry instrumentation workflow is not installed automatically. AI Gateway is optional, and no telemetry SDK, export, sampling, payload-capture, or Wrangler setting is changed by guidance setup.

Selection follows dependency fields and the selected/stored profile, not source scanning or Wrangler parsing. Use `engineering skills . --profile workers-ai` for a native AI-binding app without a useful stored profile or AI package signal. Run the command again after dependency changes to refresh the generated reference sections. `--no-skills` skips skills and reference setup without removing existing files.

The [AI Workers guide](AI-WORKERS.md) explains the exact signals and sources. It calls out missing versus zero usage, sampled traces versus billing, AI SDK major-version differences, stream completion/cancellation, and content-collection defaults. Official links remain live; installed types and version-matched docs take precedence over newer online examples.

## One project selection

```bash
engineering create                           # choose profile, then name
engineering create hono-node                 # asks for a name
engineering create hono-node --name "My API"  # creates ./my-api
engineering create my-app                    # name supplied; choose profile
engineering plan hono-node my-api            # preview without network access or writes
engineering create hono-node my-api
engineering create express my-server -- --no-view --git
engineering create react-vite my-spa
engineering create next my-next-app -- --yes
engineering create tanstack-start my-start-app
engineering create opentui my-terminal-app
engineering create opentui my-react-terminal -- --template react
engineering create opentui my-solid-terminal -- --template solid
engineering create epicflare my-fullstack-app
engineering create cloudflare-workers my-worker -- --lang ts
engineering create cloudflare my-cloudflare-app  # use C3's template picker
engineering create workers-ai ./MyChat --name "My Chat" --open vscode
```

The [catalog](../CATALOG.md) lists every profile, its upstream command, and profile-specific requirements. Vite is the plain React SPA option; deprecated CRA needs `--allow-deprecated`. Express remains upstream JavaScript/CommonJS.

OpenTUI defaults to TypeScript Core and also supports React or Solid through `--template` (or `-t`). It requires **Bun 1.3.0+**, installed separately, and keeps the starter's Bun package manager and lockfile. You can also forward `--verbose` (`-v`); other options are rejected for this profile so they can't change its setup behavior. The pinned `create-tui@0.0.11` CLI downloads current upstream templates; the template source itself isn't pinned. Current starters provide `typecheck` for verification and `dev` for interactive use. Start the terminal app with `bun run dev`; the starters don't declare `build` or `start` scripts.

The upstream generator owns its prompts, dependencies, application structure, and supported options. Arguments after `--` go to it, subject to the built-in C3 and OpenTUI restrictions described in the catalog. Unpinned generator packages and tags are resolved once to an exact npm version, then recorded in `.engineering/state.json`. Already-exact versions don't need that registry lookup. The resulting application's lockfile pins its dependencies. Some generators also install dependencies or create a Git repository and commit.

`--name` lets the app name differ from the destination directory. Every generator uses the same naming rule: turn that name, or the folder name when `--name` is absent, into a lowercase, hyphenated package name. When the generated name differs from your folder, generation runs in a temporary sibling directory, then moves the app to your exact destination before adoption. OpenTUI always uses staging so its generator never offers to delete an existing destination. For Workers AI, "engineering" also updates package and lockfile names, Wrangler names, and the HTML title and heading. HTML names are escaped; the chat implementation stays unchanged. A nonempty destination is never overwritten.

With no destination, a prompted name or `--name` supplies a slugged child directory of the current working directory. A positional name is used as the literal child destination; explicit relative and absolute paths retain their meaning. A standalone known profile selects that profile and asks for a name. Use `--profile` or a `./` path when a project name matches a profile ID. Noninteractive creation requires an explicit name and profile; preview commands never prompt or invent either.

New Beads databases use a safe prefix derived from the folder name too, so spaces and punctuation don't break setup. Beads handles numeric prefixes according to its own naming rules. Existing databases and issue IDs stay unchanged.

`--open vscode` uses the `code` CLI to open the workspace after configuration and integrations are ready, while final checks finish. It doesn't start a development server. `plan` and `--dry-run` don't prompt, open an editor, install dependencies, or use the network.

Workers AI pins a verified C3/template pair and handles one known dependency conflict, explained in the [catalog](../CATALOG.md#other-official-cloudflare-categories). OpenTUI pins its generator version. Other profiles follow upstream generator releases. There are no local framework templates or application-logic patches.

### Another upstream generator

```bash
engineering create my-other-app --generator create-vite@latest -- --template vanilla-ts --no-immediate
```

A custom generator receives the target as its first argument. If its command needs a different layout, run the official command yourself, then adopt the result. Choosing a generator means running that package's third-party code, so review its documentation and pin a version when repeatability matters. The built-in C3 profiles prevent no-deploy/no-open options from being overridden; arbitrary custom generators have their own behavior and aren't sandboxed by "engineering".

## Adopt an existing project

```bash
engineering adopt /path/to/repo --profile generic --dry-run
engineering adopt /path/to/repo --profile next

# After reviewing the existing issues and running native checks:
engineering baseline /path/to/repo --accept --reason 'Reviewed the starter functions over the limits'
```

A baseline remembers quality problems the project already has so that new problems still fail. For example, you might accept a starter's existing 60-line function while keeping the 50-line limit for your work. That isn't permission to add more long functions, enlarge the old violation, or change the function without another check. Compiler, analyzer, and configuration errors must be fixed; a baseline can't hide them. A changed source file, different quality configuration, or incompatible analyzer version can also make an old allowance stop matching.

Interactive creation asks about the baseline before running the generator. To approve one, type `baseline: <approval reason>`. Enter or `no` accepts no exceptions. Noninteractive commands never approve a baseline on their own. `--no-baseline` skips the question without deleting an existing baseline. You can also supply your decision on the command line:

```bash
engineering create epicflare my-app --baseline --reason 'Reviewed the upstream starter issues'
engineering adopt /path/to/repo --profile generic --baseline --reason 'Reviewed the existing code'
```

A baseline is saved only after native checks pass. It is never copied from this repository or created without approval, and an existing one is never overwritten. If a project already has a baseline, re-adopt without `--baseline`. Run `engineering prune` to remove or shrink allowances for issues you've fixed; it doesn't add new approvals.

Adoption keeps existing scripts and adds `engineering:check`, `engineering:baseline`, `engineering:prune`, and `engineering:skills`. It prepares the project and runs native verification before reporting success:

- Workers AI runs `cf-typegen`, then its upstream `check`: `tsc --noEmit && wrangler deploy --dry-run`.
- Other profiles run `cf-typegen` when present, then available `typecheck`, `type-check`, `check`, `lint`, and `build` scripts. For the current OpenTUI starters, that's `typecheck`.
- Recognized one-shot test scripts run as part of native verification and CI. Vitest watcher scripts receive a separate one-shot alias; existing commands and configs remain intact. Unknown scripts, scripts with lifecycle hooks, and interactive test modes aren't launched automatically.

Conflicting reserved scripts, managed files, or package-manager lockfiles stop adoption rather than being replaced. `--manager npm|pnpm|yarn|bun` chooses a manager only when it agrees with the project's existing declaration and lockfile.

Use `--no-beads`, `--no-graphify`, `--no-ci`, or `--no-skills` for integrations you don't want. Missing tools are reported before adoption; `--install-tools` allows their installation. Adoption works at a repository root, not a nested folder using another project's hooks. Worktrees, shared external hooks, and conflicting custom hooks need manual integration so other projects' setup isn't overwritten.

If a command fails, completed steps and generated files are kept. Generator, package-manager, and native-tool operations aren't rolled back as one transaction. Fix the reported problem, finish any incomplete native setup, and use `adopt` to continue. `create` still needs an empty destination; don't run a generator over the partially created app.

### Fast path and verification ordering

Tool checks are reused within a CLI invocation. Package archives are cached under `${XDG_CACHE_HOME:-$HOME/.cache}/kadajett-engineering/archives-v1`, with keys based on included package contents, file modes, and packaging settings. Integrity is checked before use, and cache entries become available only after a complete write. A cache hit avoids another `npm pack`.

Repeated adoption skips dependency installation only when the recorded manifest and lockfile bytes, package-manager version, direct dependency manifests, and installed engineering version still match.

Type generation and Git/hook setup finish before parallel work starts. Workers AI and OpenTUI have reviewed read-only checks that can run alongside Graphify extraction and the engineering checks. Initial baseline capture waits for native checks and graph extraction. Other profiles run native scripts first, then graph and quality work. All running verification jobs finish before errors are reported. Graphify excludes known generated declarations and build output, while keeping handwritten `.d.ts` files in scope.

Each stage reports its duration and result, followed by total elapsed time. Parallel stage durations won't add up to that total. A successful setup means the configured native and engineering checks passed. Output distinguishes tests that ran from an empty suite; deployment never runs.

### Testing defaults

Creation preserves upstream test scripts, dependencies, configuration, and versions. If no runner or test setup exists, it adds pinned Vitest for ordinary JavaScript/TypeScript projects, or native `bun test` for OpenTUI. Existing-project adoption never adds a runner. Default Vitest on Workers covers runtime-independent logic only; upstream Cloudflare pool configuration wins when present, and Worker binding tests need that integration.

New defaults expose a strict `test` script and a discovery-aware `test:ci` script backed by `.engineering/test.mjs`. Setup and generated CI run the latter. An empty suite reports **no tests ran**, not coverage; as soon as tests are discovered, the real runner executes them and propagates failures. No example application tests or `passWithNoTests` flags are fabricated.

Vitest discovery loads the project's Vitest/Vite configuration. Bun discovery respects the configured test root and native filename conventions. Existing Vitest watch scripts receive a nonwatching alias; known direct one-shot commands from Node, Bun, Vitest, Jest, Mocha, AVA, TAP, uvu, React Scripts, Playwright, and Cypress are eligible for verification. Shell pipelines, lifecycle-hook wrappers, and unknown commands remain manual rather than being guessed safe.

## What a project receives

- `.engineering/config.json`: versioned settings for source scope, exclusions, strict TypeScript projects, limits, and direct import boundaries. Change the configuration rather than copying checker code.
- `.engineering/baseline.json`: an optional record of the existing issues you approved.
- `.engineering/state.json`: the profile, generator command, package manager, installation fingerprint, engineering version, and last completed phase.
- `.engineering/vendor/kadajett-engineering-0.5.0.tgz`: the engineering package as a portable devDependency archive. Commit it with the manifest and lockfile. Managed `.gitignore` exceptions allow it even if the starter ignores `*.tgz`, so CI and other machines can install it without this checkout.
- Managed sections in `AGENTS.md` and `CLAUDE.md`, alongside any unrelated instructions already there.
- `.github/workflows/engineering.yml`: locked dependency installation, the same preparation and native checks, then engineering checks. Existing framework workflows remain. Use `--no-ci` if you don't want a GitHub Actions workflow.
- Optional Beads database and agent hooks, plus Graphify skills, hooks, and a code graph. Every project has its own state. Beads initialization may create a metadata commit; "engineering" doesn't configure a Git remote.

### Beads across Claude, Codex, Pi, and OMP

Native `bd setup claude` and `bd setup codex` remain responsible for their supported hooks and the shared `.agents/skills/beads` skill. Engineering adds a managed Beads workflow to root `AGENTS.md`, an `.omp/AGENTS.md` import, and relative `.omp/skills/beads` and `.pi/skills/beads` links. Pi already loads root `AGENTS.md`; no unused `.pi/AGENTS.md` scaffold is generated. Existing unrelated context is preserved; conflicting skills and context symlinks stop setup before initialization.

All four agents are instructed to run `bd prime` and `bd ready --json` at startup and after compaction, inspect and atomically claim assigned tasks, record discovered dependencies, and save verification/blocker/next-action notes before handoff. Child tasks have their own ownership; the parent integrates. Session checklists and OMP task/hub messages complement, rather than replace, durable Beads records. `bd close` follows acceptance verification.

Pi and OMP currently have no built-in `bd setup` recipe: their integration uses recognized context and skills, not fabricated lifecycle hooks. Native `.omp/AGENTS.md` shadows root context at the same depth, so its `@../AGENTS.md` import is required to expose the full project policy. Global providers, hooks, authentication, and model settings are unchanged.

When there is no custom `.beads/PRIME.md`, engineering adds a managed project primer so native `bd prime` hooks respect the session-checklist/durable-task distinction. Existing user primers are untouched. The primer points to the root workflow and instructs agents to retrieve memories with `bd prime --export --memories-only`; `--export` is necessary because the project override otherwise takes precedence even over `--memories-only`. Native `--hook-json` framing remains supported.

The archive contains no framework source, per-project baselines, tracking databases, `node_modules`, credentials, or home-directory paths. Updating the source checkout doesn't change packages already installed in other projects. To upgrade them, bump the engineering package version and adopt the new version deliberately. A same-version archive with different contents is rejected. There is no background updater or separate fork of the framework to maintain.

## Quality contract

```bash
npm run engineering:check     # use your project's package manager
engineering check /path/to/repo
engineering prune /path/to/repo
```

The default limits are:

| Check | Limit |
| --- | --- |
| Cyclomatic complexity | 10 |
| Function NLOC (non-comment lines of code) | 50 |
| Parameters | 4 |
| Nesting | 4 |
| Cognitive complexity | 15 |
| Ordinary file length | 300 lines |
| Test file length | 1000 lines |

Tests are exempt from the function NLOC limit, but still have complexity checks. Generated route trees, Worker bindings, vendored skills, and build output are excluded from metrics. Ambient declarations needed by the compiler still participate in typechecking.

For JavaScript and TypeScript, the TypeScript AST identifies functions, parameter counts, and executable tokens. Lizard **1.24.0** then counts lines and branches without treating type syntax or literal data as runtime code. Python uses Lizard directly. Oxlint checks nesting, `any`, non-null assertions, and parameter reassignment; Biome checks cognitive complexity. Both run a narrow set of rules, not a second full lint or formatting setup.

TypeScript checks keep the project's module, JSX, runtime, and ambient settings and use its installed compiler where available, then add strict options. A JavaScript project without a tsconfig doesn't acquire a TypeScript build. Original compiler errors can't be baselined. Source roots, exclusions, and selected TypeScript projects—including monorepo tsconfig references—are configurable. Review that scope before approving a baseline.

Older TypeScript versions use their installed JavaScript compiler API. TypeScript 7/native compilers use the project's own `tsc --showConfig` and `tsc --noEmit`, with strict flags discovered from its help. In that case, the older compiler bundled with "engineering" handles AST and configuration parsing only; it doesn't replace the project's semantic checks. Native referenced projects may need their usual build or type-generation outputs first. Incremental check metadata goes into a temporary directory, not the project.

JavaScript and TypeScript checks cover standalone JS/JSX/TS/TSX files, their module-extension variants, and extensionless Node/Bun shebang entrypoints such as Express's `bin/www`. Python gets syntax, structural-complexity, and file-size checks—not JavaScript lint, TypeScript, or cognitive-complexity checks. Embedded scripts in `.vue`, `.svelte`, and `.astro` files aren't analyzed here; keep the framework's native checks. Adoption requires a `package.json`.

Import boundaries apply to configured direct runtime imports, re-exports, literal `require` calls, and literal dynamic imports. They aren't a transitive dependency graph and can't resolve arbitrary runtime strings. Next.js and TanStack server/client rules still belong to the framework; directory names alone don't establish a boundary. Add explicit import rules for your architecture where useful. Coverage and duplication remain review tasks, not checks implemented by this package.

To develop "engineering", install Lizard 1.24.0 and run `npm ci && npm run check`. Its own source has no baseline. The native TypeScript devDependency exercises compatibility; it isn't a compiler version imposed on adopted projects.

## Cloudflare scope

Use `cloudflare` for C3's current category, framework, and template picker. Choose `hono-workers`, `cloudflare-workers`, `workers-ai`, or `epicflare` directly when you already know which app you want.

Setup creates local project files. It doesn't log in, deploy, create Cloudflare resources, or call an AI model. You control account configuration and resources. Workers AI inference can be billable when you later run the app, including during local development. Graphify uses code-only extraction without model calls.
