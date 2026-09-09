# CLI and quality reference

[Getting started](../README.md) · [Generator catalog](../CATALOG.md)

## Automatic agent skills

Every create/adopt installs baseline guidance plus relevant library skills without a separate request. The baseline is Matt Pocock's **tdd**, **codebase-design**, and **diagnosing-bugs**. These are self-contained; interactive issue-tracker/setup workflows are not silently run.

| Signal | Guidance |
| --- | --- |
| Workers profiles, Wrangler, Workers types, Cloudflare Vite plugin | Cloudflare, Wrangler, Workers best practices |
| Cloudflare `agents` package | Also Agents SDK and Durable Objects |
| React, React DOM, Next.js | Vercel React/Next best practices |
| Hono packages | Official Hono skill |
| TanStack React Start / Router | Framework skills and their required core skills |
| Clerk SDKs | Clerk setup and the matching framework/backend guidance |

Selection uses direct dependencies, dev dependencies, optional dependencies and peers. Actual frontend dependencies override profile guesses. Skills are deduplicated; unrelated provider skills are not bundled. Unmapped packages are reported and retain baseline guidance, not invented library coverage.

Sources: [Matt Pocock](https://github.com/mattpocock/skills), [Cloudflare](https://github.com/cloudflare/skills), [Vercel](https://github.com/vercel-labs/agent-skills), [Hono](https://github.com/honojs/skills), [TanStack](https://github.com/TanStack/router), and [Clerk](https://github.com/clerk/skills). The catalog records verified skill names, paths and immutable commits; it is not a popularity-based search or a claim to cover every package.

### Reuse and portability

Existing valid project skills win. Otherwise, the installer checks explicit `--skills-dir` locations, shared/user agent skill directories, and registered Claude plugin installations. Local sources are read-only and are not silently upgraded. Missing skills are fetched from the catalog's pinned public repositories into `${XDG_CACHE_HOME:-$HOME/.cache}/kadajett-engineering/skills-v1`.

The complete upstream repository is retained so reference files remain available. Cached contents are checked against the pinned Git tree. Source code, install scripts, plugins, MCP servers and model calls are not executed or enabled by skill installation.

Project links are created under `.agents/skills`, `.claude/skills`, `.pi/skills`, and `.omp/skills` for shared/Codex, Claude, Pi, and OMP discovery. Other agents that support `.agents/skills` can use that directory. Existing directories are preserved, conflicting or dangling links require deliberate repair, and destination parent symlinks are refused.

Only the local symlinks are ignored by Git. Commit `.engineering/skills.json`: it records portable fallback sources/revisions, never absolute machine paths. Local/project skill contents remain user-managed, so their exact bytes are not claimed to match the pinned fallback. Existing fallback revisions are retained on refresh.

```bash
engineering skills .                         # restore links after clone/dependency changes
engineering skills . --dry-run               # inspect without downloads or writes
engineering create hono-node my-api --skills-dir ~/my-skills
engineering create workers-ai my-worker --no-skills  # explicit opt-out
```

`--skills-dir` is repeatable and may point at a flat skill directory or an upstream repository root. `engineering skills` does not re-adopt the project, alter its quality baseline, or require a layer-version upgrade. Generated agent instructions tell agents to load applicable guidance and refresh after dependency changes. Skills are discoverable automatically; agents still decide when to load them, and no tool can guarantee an agent follows every instruction.

## One project selection

```bash
engineering create my-app                    # interactive selection
engineering plan hono-node my-api            # no network or writes
engineering create hono-node my-api          # real official generator, then rules
engineering create express my-server -- --no-view --git
engineering create react-vite my-spa
engineering create next my-next-app -- --yes
engineering create tanstack-start my-start-app
engineering create epicflare my-fullstack-app
engineering create cloudflare-workers my-worker -- --lang ts
engineering create cloudflare my-cloudflare-app  # upstream category/template wizard
engineering create workers-ai ./MyChat --name "My Chat" --open vscode
```

See [CATALOG.md](../CATALOG.md) for all profile IDs, exact upstream commands, primary references and warnings. CRA requires `--allow-deprecated`; Vite is the recommended plain React SPA option. Express stays normal upstream JavaScript/CommonJS; this wrapper does not invent a TypeScript conversion.

The generator owns its interactive prompts, dependencies, application structure and supported options. Arguments after `--` go directly to it, except conflicting fixed-template C3 overrides. Unpinned generator packages/tags are resolved once to an exact npm version and recorded in `.engineering/state.json`; exact versions need no registry-version probe. The application's own lockfile pins its resulting dependencies. Some upstream generators install dependencies or create a Git repository/commit themselves.

`--name` separates the application name from the destination directory. A valid package/Worker slug is generated in a temporary sibling directory when necessary, then moved to the exact requested destination before adoption. For Workers AI, the wrapper also updates package/lockfile names, Wrangler names and HTML title/heading, with HTML escaping; chat implementation files remain upstream-owned. Nonempty destinations are never overwritten.

`--open vscode` opens the workspace after configuration and integrations, while final verification finishes. It requires an available `code` CLI; it does not start a dev server. `plan` and `--dry-run` never prompt, open an editor, install dependencies or contact the network.

The Workers AI profile pins C3 and a verified upstream template revision, with one guarded dependency compatibility correction described in [CATALOG.md](../CATALOG.md). There are no local framework templates or application-logic patches. Other profiles continue to follow their upstream generator releases.

### Another upstream generator

```bash
engineering create my-other-app --generator create-vite@latest -- --template vanilla-ts --no-immediate
```

Custom generators receive the target as their first argument. For a generator with a different command layout, run its official command yourself, then `adopt`. An explicitly chosen npm generator executes third-party code; review its documentation and use a pinned package version when reproducibility is important. Built-in C3 profiles forbid overriding no-deploy/no-open safeguards. Arbitrary custom generators have their own behavior; this wrapper cannot make third-party code safe.

## Adopt an existing project

```bash
engineering adopt /path/to/repo --profile generic --dry-run
engineering adopt /path/to/repo --profile next
# After reviewing native tests/typecheck and approving inherited debt:
engineering baseline /path/to/repo --accept --reason 'Approved initial inherited snapshot'
```

Interactive creation asks about inherited debt before generation. Enter `baseline: <approval reason>` only with explicit approval; Enter or `no` keeps the strict gate. Non-interactive runs never approve debt implicitly. `--no-baseline` suppresses this prompt without removing an existing baseline. Or supply the initial decision explicitly:

```bash
engineering create epicflare my-app --baseline --reason 'Approved upstream starter snapshot'
engineering adopt /path/to/repo --profile generic --baseline --reason 'Approved inherited code'
```

Baselines are never copied from this repository or captured implicitly. A pre-existing baseline is never overwritten. Re-run adoption without `--baseline`; `engineering prune` only removes or reduces resolved allowances. Compiler/analyzer/configuration errors must be fixed rather than grandfathered. A source change, larger violation, different configuration or incompatible analyzer version is not silently accepted by the baseline.

Adoption preserves existing scripts and adds `engineering:check`, `engineering:baseline`, `engineering:prune`, and `engineering:skills`. It runs preparation and native verification before reporting completion. Workers AI runs `cf-typegen`, then its upstream `check` (`tsc --noEmit && wrangler deploy --dry-run`). Other profiles run `cf-typegen` when present, then available `typecheck`, `type-check`, `check`, `lint`, and `build` scripts. Unknown `test` scripts are not guessed to be non-watching: discover and run the project's actual tests separately. A baseline is captured only after native checks pass. Conflicting reserved scripts, managed files or package-manager lockfiles are errors, not permission to replace them.

Use `--no-beads`, `--no-graphify`, `--no-ci`, or `--no-skills` to omit integrations explicitly. `--manager npm|pnpm|yarn|bun` selects a manager only when it does not conflict with an existing declaration/lockfile. Missing tools fail before adoption; `--install-tools` explicitly permits installing them. Adoption targets a repository root, not a subfolder whose hooks belong to another project. Worktrees/shared external hooks and custom conflicting hooks require deliberate integration rather than automatic overwrite.

Failures preserve successful steps and report an error; external generator/package-manager/native tool operations are not transactionally rolled back. Fix the reported prerequisite and rerun. A fresh destination is required for `create`; never rerun a generator over a partially generated app—use `adopt` once its native setup is complete.

### Fast path and verification ordering

Tool probes are reused within one CLI invocation. Package archives are cached by allowlisted package contents, file modes and packaging controls under `${XDG_CACHE_HOME:-$HOME/.cache}/kadajett-engineering/archives-v1`; integrity is checked and publication is atomic. A cache hit avoids another `npm pack`. Repeated adoption skips dependency installation only when manifest/lockfile bytes, manager version, direct dependency manifests and installed engineering version still match recorded installation state.

Type generation and Git/hook setup complete before parallel work. The reviewed read-only Workers AI check overlaps Graphify extraction and the engineering gate; initial baseline capture waits for native checks and graph extraction. Unreviewed profiles run native scripts before graph/policy work. All running verification jobs settle before errors are reported. Graphify excludes known generated declarations and build output, not all handwritten `.d.ts` files.

Each stage reports elapsed time and success/failure, followed by total wall time; overlapping durations are not additive. Completion means configured native checks and the engineering gate passed, not that tests or deployment were performed.

## What a project receives

- `.engineering/config.json`: versioned source scope, exclusions, strict TS projects, limits and direct import boundaries; customize configuration, not copied checker code.
- `.engineering/baseline.json`: optional compact, approved inherited exception snapshot.
- `.engineering/state.json`: selected profile, generator command, package manager, installation fingerprint, layer version and completion phase.
- `.engineering/vendor/kadajett-engineering-0.3.0.tgz`: portable devDependency archive; commit it with the manifest and lockfile. Managed `.gitignore` exceptions keep it addable even when upstream ignores `*.tgz`. CI and other machines do not need this author's home directory.
- Managed sections in `AGENTS.md` and `CLAUDE.md`; unrelated instructions remain intact.
- `.github/workflows/engineering.yml`: locked dependency installation, the same preparation/native checks, then the policy gate; native framework workflows are not replaced. Disable creation if your CI is not GitHub Actions.
- Optional native Beads database/agent hooks and Graphify skill/hooks/code graph. Each project has independent state. Beads initialization may create a metadata commit; no repository remote is configured.

The package archive deliberately contains no framework source, per-project baselines, tracking databases, node_modules, credentials or home-directory paths. Updating the canonical source does not silently change adopted projects. Bump the engineering package version and deliberately upgrade projects; same-version archives with different bytes are rejected. There is no automatic update daemon or framework maintenance fork.

## Quality contract

```bash
npm run engineering:check     # use the project's own manager
engineering check /path/to/repo
engineering prune /path/to/repo
```

Defaults: cyclomatic complexity 10, function NLOC 50, parameters 4, nesting 4, cognitive complexity 15, ordinary files 300 lines, test files 1000 lines. Tests are exempt from function NLOC, not all complexity rules. For JS/TS, the TypeScript AST supplies function boundaries, arity and executable token streams; Lizard 1.24.0 counts lines and branches without confusing type syntax or literal data with runtime code. Python uses Lizard directly. Narrowly configured Oxlint enforces nesting/no-any/no-non-null/no-parameter-reassignment; narrowly configured Biome supplies cognitive complexity. This is not a second whole-project formatter or recommended lint suite.

TypeScript checks preserve the project's module/JSX/runtime/ambient configuration and installed compiler where available, then add strict options. JavaScript projects without a tsconfig do not acquire an invented TS build. Original compiler errors are not baseline exceptions. Source roots/exclusions and TypeScript project selection are configuration, including monorepo tsconfig references; review the generated config's scope before approving a baseline. Generated route trees, Worker bindings, vendored skills and output are excluded from metrics, while compiler-required ambient declarations still participate in typechecking.

Legacy TypeScript versions use their installed JavaScript compiler API.
TypeScript 7/native compilers use the project's own `tsc --showConfig` and
`tsc --noEmit` commands with strict flags discovered from its help. The package's
older compiler is used only for AST/config plumbing, never as a silent semantic
downgrade. Native referenced projects may require their normal build/typegen
outputs first; use the framework's own preparation commands. Incremental check
metadata is redirected to a temporary directory, not written into the project.
Extensionless Node/Bun shebang entrypoints such as Express's `bin/www` receive
the same structural and lint gates.

Source-level JS/TS gates cover standalone JS/JSX/TS/TSX files, their module-extension variants, and extensionless Node/Bun entrypoints. Python receives syntax, structural-complexity and file-size checks only—not JS lint, TypeScript or cognitive-complexity checks. Embedded scripts in `.vue`, `.svelte` and `.astro` files are not analyzed by this layer; retain the framework-native checks. Adoption requires a `package.json`.

To develop this layer itself: `npm ci && npm run check`. Its own source has no
inherited baseline. The native TypeScript devDependency is regression coverage,
not a compiler version forced onto adopted projects.

Boundaries are configured direct runtime imports/re-exports/literal require/dynamic-import edges; they are not a transitive architecture graph and cannot resolve arbitrary runtime strings. Do not invent Next.js/TanStack server/client boundaries from directory names: use the framework's own checks and add explicit rules for your architecture. Coverage and duplication are review targets, not checks this package pretends to implement.

## Cloudflare scope

Use `cloudflare` for C3's live category/framework/template selection rather than maintaining wrappers for every template. Use `hono-workers`, `cloudflare-workers`, `workers-ai` or `epicflare` when that is the intended application.

Cloudflare configuration and resource provisioning remain under your control. Setup generates local project files; it does not log in, deploy, provision resources, or call an AI model. Workers AI inference can be billable even during development. Graphify uses code-only extraction without model calls.
