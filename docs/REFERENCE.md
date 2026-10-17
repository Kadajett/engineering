# CLI and quality reference

[Getting started](../README.md) · [Generator catalog](../CATALOG.md)

This is the detailed guide to what "engineering" adds, how its checks work, and which parts stay under your control.

## Automatic agent skills

`create` and `adopt` install skills by default. Every project gets Matt Pocock's **tdd**, **codebase-design**, and **diagnosing-bugs** guidance and blader's **humanizer** for plain prose, then any verified library skills that match its dependencies. Installing these skills doesn't run their interactive setup or issue-tracker workflows.

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
| `@stryker-mutator/core` | [Stryker mutation-testing skill](https://github.com/Kadajett/stryker-skill) |

Selection looks at direct dependencies, dev dependencies, optional dependencies, and peers. The actual frontend dependencies take precedence over the profile's default. React used only by OpenTUI doesn't bring in browser-focused Vercel guidance; web dependencies still receive it. Duplicate skills are installed once, and unrelated provider skills are left out. Packages without a verified match are reported. The general skills still apply, but aren't presented as library-specific coverage.

Sources include [Matt Pocock](https://github.com/mattpocock/skills), [Cloudflare](https://github.com/cloudflare/skills), [Vercel](https://github.com/vercel-labs/agent-skills), [OpenTUI](https://github.com/anomalyco/opentui), [Hono](https://github.com/honojs/skills), [TanStack](https://github.com/TanStack/router), and [Clerk](https://github.com/clerk/skills). The skill catalog records reviewed names, paths, and immutable commits rather than picking a popular search result at install time.

The Stryker skill is pinned to a reviewed release and selected only by the exact direct `@stryker-mutator/core` package, not by Vitest alone or an arbitrary package in the Stryker scope. Installing guidance does not run mutation tests, rewrite configuration, lower thresholds, or establish runner compatibility. Its bundled references also cover Stryker.NET and Stryker4s, but this CLI's package-based selection does not adopt standalone .NET/Scala projects; install the portable skill directly for those hosts. [Observed evaluation and compatibility limits](https://github.com/Kadajett/stryker-skill/blob/b1abf81ca5fd577345e1674824d515de120a9f4c/EVALUATION.md).

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

### Optional skill recommendations

`engineering recommend [directory]` suggests curated extras without installing skills, writing project files, adopting the project, querying a service, or executing skill content.

```bash
engineering recommend .
engineering recommend ./apps/api --profile hono-node
engineering recommend . --include-installed
engineering recommend . --catalog ~/favorites.json --json
```

The built-in catalog is separate from automatic selection: six optional Matt Pocock workflows (research, domain-modeling, prototype, grilling, writing-for-agents, code-review), Cursor Team Kit review/verification/PR preparation, Dietrich Gebert's Ponytail writing and complexity review, TypeScript guidance, Apollo's Rust best practices, pytest, and Clerk testing/webhooks. Sources link to inspected `SKILL.md` files at immutable revisions. Descriptions call out opinionated conventions or setup requirements; particularly, code-review's upstream issue-tracker integration must respect Beads rather than introduce another tracker.

By default, results exclude both the project's automatic selections and skills already available in native project directories, user collections, or registered Claude plugins. `--include-installed` reveals the latter with an availability label; it still excludes automatic defaults. Availability means a readable, correctly named skill entry point, not verification that every agent can use every ancillary resource. Dangling links and malformed entry points do not count as installed.

#### Verified review and writing extras

The requested “thermonuclear-code-review from Cursor” resolves to **thermo-nuclear-code-quality-review**, the actual frontmatter name in Cursor's `cursor-team-kit`. “Ponytail code writing” resolves to **ponytail** from **Dietrich Gebert**, not Cursor. Searches included `thermonuclear-code-review`, `thermonuclear code review Cursor skill`, `thermo-nuclear code review skill`, `ponytail code skill`, and the alternate `ponyfill code writing skill`; the hyphenated review spelling led to the primary source, while ponyfill did not identify a separate matching writing skill. Catalog names use the verified upstream names, not invented aliases.

| Optional skill and pinned source | Scope and requirements |
| --- | --- |
| [thermo-nuclear-code-quality-review](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/cursor-team-kit/skills/thermo-nuclear-code-quality-review/SKILL.md) | Cursor Team Kit's unusually strict maintainability audit, including structural simplification and opinionated 1,000-line guidance. Upstream disables automatic model invocation. Its prompt encourages restructuring, so agree on review-only versus implementation scope; it does not replace correctness/security review. No third-party service integration is specified. |
| [ponytail](https://github.com/DietrichGebert/ponytail/blob/356918eba965ee1eac64bd3a7f0dd02108350de5/skills/ponytail/SKILL.md) | Minimal-code writing through reuse, standard libraries, and native features; preserves security, trust-boundary validation, accessibility, and explicitly requested behavior. Its lite/full/ultra modes persist until stopped or changed, and its minimal-test conventions are opinionated. Prefer explicit scope over silently shrinking a requirement. The separate full plugin has Node.js lifecycle hooks; recommending this entry point does not install or activate them. |
| [ponytail-review](https://github.com/DietrichGebert/ponytail/blob/356918eba965ee1eac64bd3a7f0dd02108350de5/skills/ponytail-review/SKILL.md) | Lists deletion and simplification opportunities without applying fixes. Correctness, security, and performance are explicitly out of scope; pair with a normal review and preserve required validation rather than treating brevity as proof of safety. |
| [verify-this](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/cursor-team-kit/skills/verify-this/SKILL.md) | Runs local baseline/treatment experiments and reports verified, not verified, or inconclusive. Requires a runnable surface and valid comparison; UI/CLI paths reference the companion `control-ui`/`control-cli` skills. Sensitive artifacts stay inline unless the user agrees to disk storage. |
| [make-pr-easy-to-review](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/cursor-team-kit/skills/make-pr-easy-to-review/SKILL.md) | Uses Git and authenticated `gh` access to inspect a PR and improve its description/reviewer guidance. May edit PR metadata; rewriting history or force-pushing needs user agreement and checks that code content remains unchanged. |

Provenance: [Cursor Team Kit's pinned manifest](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/cursor-team-kit/.cursor-plugin/plugin.json) identifies the package in Cursor's repository (manifest author: Eric Zakariasson); [Ponytail's pinned lifecycle configuration](https://github.com/DietrichGebert/ponytail/blob/356918eba965ee1eac64bd3a7f0dd02108350de5/hooks/claude-codex-hooks.json) declares its Node.js commands. These are inspected recommendations, not a compatibility certification, benchmark endorsement, or permission to run upstream setup. No exact-name ambiguity remains for these two requests.

#### Curating your favorites

Catalogs overlay in this order:

1. Built-in optional recommendations.
2. `${XDG_CONFIG_HOME:-$HOME/.config}/kadajett-engineering/recommendations.json`.
3. The target project's `.engineering/recommendations.json`.
4. An explicit `--catalog FILE`, resolved from the command's working directory.

A later record replaces an earlier record with the same name. `disabled` names accumulate across catalogs and always win. Missing optional files are fine; missing explicit files, malformed catalogs, duplicate names within one file, and unknown keys fail with an error identifying the file. Files are never created or rewritten by this command.

For example, this catalog customizes one general favorite and one language-specific favorite:

```json
{
  "version": 1,
  "recommendations": [
    {
      "name": "prototype",
      "description": "Try a focused experiment before committing to a design.",
      "source": "https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/prototype/SKILL.md"
    },
    {
      "name": "typescript",
      "description": "Review strict TypeScript patterns against this project's conventions.",
      "source": "https://github.com/Gentleman-Programming/Gentleman-Skills/blob/c8036a37893679dc5e942484975405d39689c63b/curated/typescript/SKILL.md",
      "when": { "languages": ["typescript"] }
    }
  ],
  "disabled": ["code-review"]
}
```

Add any other reviewed skill using the same record shape. Names must be lowercase kebab-case, and sources must be HTTPS links to `SKILL.md` without embedded credentials. Pinned GitHub links also let discovery recognize nested plugin repository paths. Other source URLs use conventional name-based local discovery. Custom catalogs are your curation, not automatically verified endorsements.

Omit `when` for a general recommendation. Otherwise provide one or more nonempty arrays: `languages`, `packages`, `profiles`. Values within an array are alternatives; every specified dimension must match. For example, `"when": {"languages": ["typescript"], "packages": ["hono", "express"]}` requires TypeScript and either Hono or Express. Matching is exact and case-sensitive.

Languages come from source filenames and conventional root manifests, not guesses from profile names. Supported signals include JavaScript, TypeScript, Python, Rust, Go, C/C++, JVM languages, .NET, Ruby, PHP, Swift, and others; use lowercase identifiers such as `typescript`, `python`, `rust`, `cpp`, and `csharp`. Dependencies, generated/build/cache directories, agent skill trees, and symlinked trees are excluded. Vue/Svelte filenames signal `vue`/`svelte`; embedded script languages are not parsed. Package matches use only direct dependency/dev/optional/peer names in the target's `package.json`, not transitive or child-workspace dependencies. Run against the relevant workspace directory.

Profile precedence is explicit `--profile`, `.engineering/skills.json`, `.engineering/state.json`, then `generic`. A non-JavaScript project needs no `package.json`. JSON output includes the detected context, loaded catalog paths, match reasons, source links, and local availability for each result.

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

## Grill, ticket and build

```bash
engineering grill [prompt.md|.txt|.pdf] [directory] [--agent omp|claude|PATH] [--model MODEL] [--plan FILE] [--no-build] [--no-beads] [--dry-run]
```

**What to grill about.** A prompt file supplies the description; a `.pdf` needs `pdftotext`. Without one, `grill` asks "What should I grill you about?" in the terminal (or takes `spec` from `--plan`). A lone argument that's an existing file is the prompt; a directory, or any argument alongside `--plan`, is the directory.

**Where.** The directory defaults to the current one and must already hold a project. `grill` never creates projects: a missing or empty folder stops with the `engineering create <profile> <dir>` and `engineering adopt <dir> --profile <profile>` commands, before anything is asked or written.

**The conversation.** Each turn, `grill` sends the agent the description, the transcript so far, the humanizer skill's rules for its wording, and a bounded summary of the project (two levels of files, package.json scripts and dependency names, the start of README.md and AGENTS.md). It expects one JSON object back: the next question (`{"done": false, "question", "options"?, "recommended"?}`, one decision in at most three sentences; longer ones are sent back) or the plan (`{"done": true, "summary", "decisions"}`). The agent asks only about decisions that change what gets built or that a reviewer would challenge, settles small details itself and records them as decisions, and plans right away when you say you've had enough. A reply that breaks the protocol goes back with the reason up to twice; a third bad reply stops the session. Your answers reach the agent exactly as typed, next to the numbered options they may refer to; empty means you took the recommendation. At the end an empty reply confirms the plan and anything else becomes another question.

`--agent omp` (the default) runs `omp -p --no-session --no-tools`; `--agent claude` runs `claude -p --no-session-persistence` with the prompt on stdin; any other value containing a `/` is an executable that reads the prompt on stdin. `--model` is passed to the agent. Turns time out after five minutes. The same agent then builds as an orchestrator: an interactive session that hands each ready ticket to its own parallel subagent (which claims the bead and runs only its own tests), runs the project's test, lint and check scripts after each batch, closes beads only once their acceptance passes, and doesn't stop or wait for confirmation until every bead is closed.

**After the plan.** `grill` writes `docs/grill/<topic>/` with SPEC, DECISIONS, TRANSCRIPT and BUILD, and appends a pointer section to the project's AGENTS.md when it has one (it never creates that file). The agent then breaks the plan into 2 to 30 tickets, each depending only on earlier ones and naming the files it owns, written to TICKETS.md. When package.json has a `test:mutation` script, BUILD.md gains a mutation step and the ticket just before TALK-TRACK.md must pass the Stryker break threshold. With Beads enabled the tickets become beads, with `bd dep add` for each dependency; a workspace without `.beads` gets `bd init` first. Finally the build agent (`claude` or `omp`, interactive) starts in the workspace. `--no-build` stops before that.

**Resuming.** `.engineering/grill/<topic>.json` records the plan, transcript, tickets and bead ids. Rerunning with the same prompt or topic skips whatever is already done. A `--plan` file may carry `spec`, `plan`, `transcript` and `tickets`; tickets in the file skip the ticket turn. `--dry-run` grills and prints the brief folder without writing anything.

The `engineering-grill` agent skill grills in chat instead of the terminal, writes such a plan file, and runs `engineering grill <directory> --plan FILE --no-build` before building the tickets itself.

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

### Mutation testing

Mutation setup is **enabled by default** for create/adopt across the current JavaScript/TypeScript profiles. It adds pinned `@stryker-mutator/core@10.0.0`, a `test:mutation` script (`stryker run`), and project-owned `stryker.config.json`. Node 22.12+ already satisfies StrykerJS 10's Node requirement. The existing package manager installs the dependencies locally; no global Stryker installation or dashboard account is needed.

The planner reuses recognized one-shot **unit** test commands, preserving their flags and test configuration. A single plain `vitest run` with a simple Vitest 2+ version declaration gets the matching pinned native Vitest plugin and per-test coverage analysis. Other recognized host runners, including Bun and Node's test runner, use Stryker's built-in command adapter with coverage analysis off. Multiple eligible commands run in sequence per mutant. Complex version declarations or nonstandard Vitest flags conservatively retain their exact command rather than imposing plugin options.

Existing Stryker packages, scripts, or root configuration prevent a second setup; even customized configuration remains untouched on repeated adoption. Mutation script lifecycle hooks are also preserved, not attached to a newly generated script. `--no-mutation` suppresses additions without removing existing tools. Dry-run output shows the selected adapter or why no setup was added.

Default policy:

- Mutate JS/TS, including JSX/TSX and module variants, throughout the project rather than assuming `src/`. Exclude test/spec files and directories, declarations, configuration modules, and the platform's known generated/vendor/agent paths. Review `mutate` for project-specific roots, fixtures, migrations, or generated files.
- Write HTML and JSON reports to `reports/mutation/mutation.html` and `reports/mutation/mutation.json`. Temp/report paths are ignored by Git and excluded from quality scans and Graphify. Source code stays in place; Stryker mutates a sandbox.
- Keep agent and tooling folders (`.claude`, `.agents`, `.codex`, `.omp`, `.pi`, `.beads`, `.engineering`, Graphify output) out of the sandbox with `ignorePatterns`. Their skill folders are directory symlinks, which Stryker's sandbox copy rejects with `EISDIR`. `.env` files and `vendor` stay, since tests may read them.
- Fail a valid mutation score below **80**; high/low report bands are 90/80. This is an engineering default, not Stryker's upstream threshold. Keep ordinary tests and typechecks too: mutation score is not code coverage or a correctness proof.
- Use full runs (`incremental: false`). Command-runner incremental mode cannot detect changed tests, and even native incremental mode can miss dependency/configuration changes.
- Keep `allowEmpty: false`. Native Vitest reports actual tests; the command adapter synthesizes one result from exit status and **cannot detect zero executed tests**. Empty/no-valid-mutant reports can still exit successfully upstream and must not be interpreted as a passing test-quality measurement.

Run with the project's package manager:

```bash
npm run test:mutation
```

The script is deliberately separate from `test:ci`, `engineering:check`, setup verification, and generated CI: mutation runs multiply unit-test cost, and empty starters do not yet have meaningful tests. To enforce it in CI, run the same script after the project's preparation and normal tests. Setup success never claims a mutation score. Review survivors and improve behavioral assertions rather than adding meaningless tests or automatically weakening the threshold.

**Runtime boundaries:** unknown commands, lifecycle-wrapped tests, and Playwright/Cypress-only setups receive an explanation rather than a fabricated unit integration. Known `@cloudflare/vitest-pool-workers` and `@cloudflare/vitest-plugin` projects are also skipped: native Stryker Vitest uses a host thread pool, while a command runner's host environment does not activate mutants inside Worker isolates. Plain Vitest tests of runtime-independent Worker logic are supported. Browser/custom pools and remote runners need an explicit integration review; a recognized command alone cannot establish remote mutant activation.

#### Other Stryker languages

Language detection by `engineering recommend` is broader than project creation/adoption. The latter currently requires `package.json`; it does not configure .NET or Scala builds. Stryker is not a universal arbitrary-language mutator.

| Language | Upstream engine | Project-local integration, not automatically applied here |
| --- | --- | --- |
| JavaScript / TypeScript | StrykerJS 10.0.0 | Default setup above; test runtime must execute the source or have a reviewed build step. |
| C# | Stryker.NET 4.16.0 | Create a local tool manifest only if absent (`dotnet new tool-manifest`), then `dotnet tool install dotnet-stryker --version 4.16.0`. Commit the manifest; teammates run `dotnet tool restore`. Run `dotnet stryker` from the test project. This pinned release targets .NET 8; also retain the app's SDK/build prerequisites. |
| Scala | Stryker4s 1.1.1 | For sbt, add `addSbtPlugin("io.stryker-mutator" % "sbt-stryker4s" % "1.1.1")` to the existing `project/plugins.sbt`, then run `sbt stryker` (or `sbt module/stryker`). Use JDK 17+ and the project's compatible build tool. Official Maven and Mill integrations are also available. |

C# support does not imply F#/VB support; Scala support does not imply Java/Kotlin support. Python, Rust, and Go need different mutation tools, not an invented Stryker adapter. The non-JS commands above are source-verified guidance, not runtime-verified integrations in this CLI.

Primary references: [StrykerJS configuration](https://github.com/stryker-mutator/stryker-js/blob/cb3bd8fe25d5215422c9b632357062d3a43fcf92/docs/configuration.md), [incremental limitations](https://github.com/stryker-mutator/stryker-js/blob/cb3bd8fe25d5215422c9b632357062d3a43fcf92/docs/incremental.md), [command runner implementation](https://github.com/stryker-mutator/stryker-js/blob/cb3bd8fe25d5215422c9b632357062d3a43fcf92/packages/core/src/test-runner/command-test-runner.ts), [Workers process environment](https://developers.cloudflare.com/workers/runtime-apis/nodejs/process/), [Stryker.NET 4.16.0 setup](https://github.com/stryker-mutator/stryker-net/blob/f9109e24c615a7030a3b33e5532c665c974e4ec5/docs/getting-started.md), and [Stryker4s 1.1.1 build integrations](https://github.com/stryker-mutator/stryker4s/blob/ea5b62a77fc70884e679ee1d598217c0772e4c8e/README.md).

## What a project receives

- `.engineering/config.json`: versioned settings for source scope, exclusions, strict TypeScript projects, limits, and direct import boundaries. Change the configuration rather than copying checker code.
- `.engineering/baseline.json`: an optional record of the existing issues you approved.
- `.engineering/state.json`: the profile, generator command, package manager, installation fingerprint, engineering version, and last completed phase.
- `.engineering/vendor/kadajett-engineering-<version>.tgz`: the engineering package as a portable devDependency archive. Commit it with the manifest and lockfile. Managed `.gitignore` exceptions allow it even if the starter ignores `*.tgz`, so CI and other machines can install it without this checkout.
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
