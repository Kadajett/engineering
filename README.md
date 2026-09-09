# "engineering"

I was sick of having to bring over my code quality metrics, linters, and codegraph settings for every new project or Worker I wanted to create.

So I built "engineering": a CLI that runs the upstream project generator, then adds my engineering defaults. Complexity limits, quality gates, codegraph integration, agent instructions, and CI—without copying configuration around or maintaining another app template.

It can also adopt an existing project. Your framework keeps its tooling and application structure; "engineering" adds the checks and workflow around it.

These are my defaults, not a claim that every project should use them.

## Install from GitHub

Prerequisites: Node 22.12+, npm/npx, Git, and the project's package manager. Bun is additionally required by Epicflare. Linux is the currently verified platform; other platforms are not yet verified. This is a GitHub source release, not an npm registry release.

```bash
git clone https://github.com/Kadajett/engineering.git
cd engineering
npm ci
node ./bin/engineering.mjs doctor
```

Use `node ./bin/engineering.mjs` from this checkout in place of `engineering` in the examples below, or optionally install a user-local command link:

```bash
npm install --global --prefix "$HOME/.local" "$PWD"
export PATH="$HOME/.local/bin:$PATH"
engineering list
```

Keep the checkout: the linked command runs this source. The user-local prefix avoids requiring sudo; persist the PATH change in your shell configuration if needed.

The quality gate requires **Lizard 1.24.0**. Beads and Graphify are enabled by default for project setup, but optional with `--no-beads --no-graphify`. Inspect `doctor` before installing anything. With explicit permission to install missing native tools:

```bash
# Requires uv: https://docs.astral.sh/uv/getting-started/installation/
engineering setup
```

`setup` preserves working installed tools; it does not install Node/uv, use sudo, initialize projects or provision infrastructure. Native tool versions and Lizard compatibility are checked rather than silently upgraded. For only the quality gate, install Lizard separately (`uv tool install lizard==1.24.0`) and omit Beads/Graphify during setup of a project.

The npm package name is `@kadajett/engineering`, but it is intentionally marked private until a registry release is made. Do not use `npx @kadajett/engineering` as a registry install.

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

See [CATALOG.md](CATALOG.md) for all profile IDs, exact upstream commands, primary references and warnings. CRA requires `--allow-deprecated`; Vite is the recommended plain React SPA option. Express stays normal upstream JavaScript/CommonJS; this wrapper does not invent a TypeScript conversion.

The generator owns its interactive prompts, dependencies, application structure and supported options. Arguments after `--` go directly to it, except conflicting fixed-template C3 overrides. Unpinned generator packages/tags are resolved once to an exact npm version and recorded in `.engineering/state.json`; exact versions need no registry-version probe. The application's own lockfile pins its resulting dependencies. Some upstream generators install dependencies or create a Git repository/commit themselves.

`--name` separates the application name from the destination directory. A valid package/Worker slug is generated in a temporary sibling directory when necessary, then moved to the exact requested destination before adoption. For Workers AI, the wrapper also updates package/lockfile names, Wrangler names and HTML title/heading, with HTML escaping; chat implementation files remain upstream-owned. Nonempty destinations are never overwritten.

`--open vscode` opens the workspace after configuration and integrations, while final verification finishes. It requires an available `code` CLI; it does not start a dev server. `plan` and `--dry-run` never prompt, open an editor, install dependencies or contact the network.

The Workers AI profile pins C3 and a verified upstream template revision, with one guarded dependency compatibility correction described in [CATALOG.md](CATALOG.md). There are no local framework templates or application-logic patches. Other profiles continue to follow their upstream generator releases.

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

Adoption preserves existing scripts and adds only `engineering:check`, `engineering:baseline`, and `engineering:prune`. It runs preparation and native verification before reporting completion. Workers AI runs `cf-typegen`, then its upstream `check` (`tsc --noEmit && wrangler deploy --dry-run`). Other profiles run `cf-typegen` when present, then available `typecheck`, `type-check`, `check`, `lint`, and `build` scripts. Unknown `test` scripts are not guessed to be non-watching: discover and run the project's actual tests separately. A baseline is captured only after native checks pass. Conflicting reserved scripts, managed files or package-manager lockfiles are errors, not permission to replace them.

Use `--no-beads`, `--no-graphify`, or `--no-ci` to omit integrations explicitly. `--manager npm|pnpm|yarn|bun` selects a manager only when it does not conflict with an existing declaration/lockfile. Missing tools fail before adoption; `--install-tools` explicitly permits installing them. Adoption targets a repository root, not a subfolder whose hooks belong to another project. Worktrees/shared external hooks and custom conflicting hooks require deliberate integration rather than automatic overwrite.

Failures preserve successful steps and report an error; external generator/package-manager/native tool operations are not transactionally rolled back. Fix the reported prerequisite and rerun. A fresh destination is required for `create`; never rerun a generator over a partially generated app—use `adopt` once its native setup is complete.

### Fast path and verification ordering

Tool probes are reused within one CLI invocation. Package archives are cached by allowlisted package contents, file modes and packaging controls under `${XDG_CACHE_HOME:-$HOME/.cache}/kadajett-engineering/archives-v1`; integrity is checked and publication is atomic. A cache hit avoids another `npm pack`. Repeated adoption skips dependency installation only when manifest/lockfile bytes, manager version, direct dependency manifests and installed engineering version still match recorded installation state.

Type generation and Git/hook setup complete before parallel work. The reviewed read-only Workers AI check overlaps Graphify extraction and the engineering gate; initial baseline capture waits for native checks and graph extraction. Unreviewed profiles run native scripts before graph/policy work. All running verification jobs settle before errors are reported. Graphify excludes known generated declarations and build output, not all handwritten `.d.ts` files.

Each stage reports elapsed time and success/failure, followed by total wall time; overlapping durations are not additive. Completion means configured native checks and the engineering gate passed, not that tests or deployment were performed.

## What a project receives

- `.engineering/config.json`: versioned source scope, exclusions, strict TS projects, limits and direct import boundaries; customize configuration, not copied checker code.
- `.engineering/baseline.json`: optional compact, approved inherited exception snapshot.
- `.engineering/state.json`: selected profile, generator command, package manager, installation fingerprint, layer version and completion phase.
- `.engineering/vendor/kadajett-engineering-0.2.0.tgz`: portable devDependency archive; commit it with the manifest and lockfile. Managed `.gitignore` exceptions keep it addable even when upstream ignores `*.tgz`. CI and other machines do not need this author's home directory.
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

Wrangler configuration, binding names/IDs and provisioning remain specific to your project. D1, R2, KV, Durable Objects, Queues, Vectorize and Workers AI are covered by catalog guidance, not fake resources automatically provisioned by the wrapper. **R1 is not a Cloudflare storage service**; it may mean a DeepSeek R1 Workers AI model, or a typo for D1/R2. AI inference can be billable even in development. Setup never logs in, deploys, provisions accounts/resources, or calls an AI model. Graphify runs code-only extraction without semantic LLM calls. Its optional language parser limitations are reported, not hidden.
