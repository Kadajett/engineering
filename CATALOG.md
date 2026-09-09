# Upstream generator catalog

This package is an engineering wrapper, not a collection of application templates. It runs the selected upstream generator, then adopts its output with shared engineering policy and optional Beads/Graphify integration. It does not translate Express into TypeScript, reconstruct framework internals, fork Epicflare, or create remote infrastructure.

The catalog was researched against primary documentation and published CLI help on **2026-09-09**. Most generator packages use `@latest`; upstream prompts, templates, and requirements can change. Workers AI instead pins the verified C3/template pair below. The wrapper resolves unpinned generator packages once and records the exact executed command in project state. Read the plan before generation. Real Workers AI creation, native checks and local UI loading were subsequently verified without deployment or model inference.

## Choose once

```sh
# Show choices, then let the upstream tool own framework-specific prompts.
engineering create my-app

# Choose a known generator directly.
engineering create hono-node my-api
engineering create react-vite my-ui
engineering create next my-site
engineering create cloudflare-workers my-worker -- --lang js
engineering create workers-ai ./MyChat --name "My Chat" --open vscode

# Existing source stays yours: no generator runs during adoption.
engineering adopt . --profile generic
```

Use the wrapper's plan mode for a read-only preview rather than running a generator to inspect its output. Arguments following the wrapper's `--` are passed through as separate arguments, not a shell command. The wrapper does not implement a competing framework-specific option language.

## Profiles and exact upstream invocations

`<target>` below is the generated directory name. When its safe package slug differs from the requested destination, generation runs in a temporary sibling before moving the result to the exact destination. Each command is executed as an argument array using `npx --yes`, without a shell. These are upstream commands, not commands to deploy the resulting applications.

| Profile | Upstream invocation after `npx --yes` | Intent |
| --- | --- | --- |
| `generic` | None | Adopt an existing JS/TS repository; create requires a custom generator. |
| `hono-node` | `create-hono@latest <target> --template nodejs` | Official Hono Node.js adapter starter. |
| `hono-workers` | `create-hono@latest <target> --template cloudflare-workers` | Official Hono edge-runtime starter. |
| `express` | `express-generator@latest <target>` | Normal JavaScript/CommonJS Express application. |
| `react-vite` | `create-vite@latest <target> --template react-ts --no-immediate` | Recommended lightweight React SPA choice in this catalog. |
| `react-cra` | `create-react-app@latest <target>` | Legacy only; requires wrapper `--allow-deprecated`. |
| `next` | `create-next-app@latest <target> --disable-git --skip-install` | Upstream Next.js prompts and defaults. |
| `tanstack-start` | `@tanstack/cli@latest create <target> --framework React --no-git --no-install` | Current official React Start CLI, not an obsolete create package. |
| `epicflare` | `create-epicflare@latest <target>` | Upstream full-stack Workers application and guided setup. |
| `cloudflare` | `create-cloudflare@latest <target> --no-deploy --no-open --no-git` | Delegate all category/framework/template choices to the current C3 picker. |
| `cloudflare-workers` | `create-cloudflare@latest <target> --type hello-world --no-deploy --no-open --no-git` | C3 Worker-only starter, upstream language selection. |
| `workers-ai` | `create-cloudflare@2.72.6 <target> --template https://github.com/cloudflare/templates/llm-chat-app-template#26dfca38308b8f76d6042879fd710cf7991acac5 --no-deploy --no-open --no-git --no-auto-update --no-agents` | Verified upstream LLM chat template with a Workers AI binding. |

### Hono

The [Node.js guide](https://hono.dev/docs/getting-started/nodejs) names the `nodejs` template; the [Workers guide](https://hono.dev/docs/getting-started/cloudflare-workers) names `cloudflare-workers`. Both template names are present in current `create-hono --help`. The generator may prompt for dependency installation and package manager. Its supported flags include `--install` and `--pm`; there is no documented `--no-git` or skip-install flag to invent. See [create-hono upstream](https://github.com/honojs/create-hono).

### Express

The [official generator](https://expressjs.com/en/starter/generator.html) emits JavaScript and CommonJS. This wrapper supports that output as-is. The upstream default view engine is Jade; choose `--no-view` for no view engine, or `--view pug` if desired:

```sh
engineering create express my-api -- --no-view
```

The Express generator's `--git` means **add a `.gitignore` file**, not initialize a repository. Its `--force` permits writes to a non-empty target; it is not appropriate for a wrapper's new-project path. There is no official TypeScript switch and no local TypeScript rewrite.

### React: Vite or an upstream framework, CRA only by exception

[Vite's guide](https://vite.dev/guide/) documents both `react` and `react-ts` templates. This catalog defaults to TypeScript; pass `--template react` for JavaScript. Current help supports `--no-immediate`, which prevents the generator's install-and-start-development flow. No unsupported skip-git flag is added.

Vite currently requires **Node 20.19+ or 22.12+**; the wrapper requires **Node 22.12+** because of its own analyzers. Individual generators can raise their minimum independently. Use a maintained Node version satisfying the selected generator.

React [officially deprecated Create React App on February 14, 2025](https://react.dev/blog/2025/02/14/sunsetting-create-react-app). The announcement says it has no active maintainers and is in maintenance mode. Current published help emits the deprecation warning. CRA is not a recommendation for new work:

```sh
engineering create react-cra legacy-ui --allow-deprecated
```

CRA installs dependencies and may initialize git; current help exposes no supported skip-git flag. Existing CRA repositories can be adopted without running CRA. React recommends [frameworks for new applications](https://react.dev/learn/creating-a-react-app), or [a build tool when appropriate](https://react.dev/learn/build-a-react-app-from-scratch). “Recommended SPA” here distinguishes Vite from CRA, not Vite from all full-stack frameworks.

### Next.js and TanStack Start

[create-next-app's official reference](https://nextjs.org/docs/app/api-reference/cli/create-next-app) documents `--disable-git` and `--skip-install`. Language, router, styling, and tool choices stay upstream. `--yes` may reuse saved preferences; it does not mean a wrapper-owned deterministic template. Its `--use-npm`, `--use-pnpm`, `--use-yarn`, and `--use-bun` are upstream flags.

The [current TanStack Start guide](https://tanstack.com/start/latest/docs/framework/react/getting-started) names `npx @tanstack/cli@latest create`. Published `create --help` confirms `--framework React`, `--no-git`, `--no-install`, and `--interactive`. Current CLI help says interactive mode defaults to false; pass `--interactive` to choose add-ons. `--router-only` is not a full Start application. A `--deployment` choice configures a deployment adapter; it is not a request for this wrapper to deploy. See [TanStack CLI upstream](https://github.com/TanStack/cli).

### Epicflare: an upstream application, not this wrapper's architecture

Use the [official Epicflare repository](https://github.com/epicweb-dev/epicflare) and [setup guide](https://github.com/epicweb-dev/epicflare/blob/main/docs/getting-started.md). Upstream owns its framework versions and Workers/D1/KV/Durable Objects application. This wrapper does not copy Epicflare's source, resource IDs, or existing quality baseline.

Published `create-epicflare` **1.7.0** was inspected directly, including its executable source. It requires **Bun and bunx**, even if the engineering wrapper was installed with npm, pnpm, or yarn. The executable clones the upstream template, runs `bun install`, and invokes `bun ./docs/post-download.ts --guided`. Its accepted customization is `--name`; other flags are silently ignored, not passed into the setup script.

In particular, do not pass `--no-init`, `--no-git`, `--no-deploy`, or `--defaults` to `create-epicflare` expecting safeguards. Those are not supported generator options. The wrapper preserves an upstream-created Git repository and initializes one only if missing. The setup script's own options are documented separately and are not the generator's CLI.

The repository README says quick start starts the development server, but the inspected published generator does not contain a dev-server command. Treat this discrepancy as an upstream documentation/version difference, not a reason to add a local workaround. Current setup documentation explicitly says setup does not provision Cloudflare resources; the deploy workflow performs resource-ensure operations later. This wrapper must not run that workflow.

## Cloudflare: code generation is not provisioning

C3 **2.72.6** published help confirms `--no-deploy`, `--no-open`, and `--no-git`. The [official C3 CLI reference](https://developers.cloudflare.com/pages/get-started/c3/) also documents negated boolean flags. These safeguards are included in all three C3 profiles. Deployment/browser-opening flags are rejected in forwarded arguments rather than allowed to override safeguards. Do not use `--existing-script` or `--type pre-existing` for local-only scaffolding: those refer to an account's existing Worker, not adoption of a local repository.

C3 can still prompt and install dependencies. For the general `cloudflare`/`cloudflare-workers` selections, specify remaining upstream choices such as `--lang ts`. The fixed remote-template `workers-ai` profile rejects category, type, template, framework, defaults, language and other configuration overrides, including aliases and dotted forms: `--accept-defaults` can silently select a different C3 scaffold and is not appropriate here. Use `cloudflare` for upstream selection instead. `--no-git` controls C3's own Git initialization, not arbitrary nested third-party commands or package lifecycle scripts. Generators execute third-party code: reviewing a plan does not sandbox it.

### Other official Cloudflare categories

These are C3 categories/templates, not wrapper-maintained frameworks:

- `hello-world`: Worker-only, static assets, Worker plus assets, Durable Objects, or Workflows starters. Published type names include `hello-world-assets-only`, `hello-world-with-assets`, `hello-world-durable-object`, `hello-world-durable-object-with-assets`, and `hello-world-workflows`.
- Other supported built-in types include `scheduled`, `queues`, `common`, and `openapi`.
- `web-framework`: upstream framework generators via C3. Current help lists Hono, React, Next, TanStack Start, React Router, Astro, Svelte, Vue, and others. C3's `--platform pages` selects Pages only for frameworks that support it; Workers is the general current default.
- `demo`: C3's application starters.
- External upstream template: use `--template` with an official GitHub URL. **Do not combine `--category` and `--template`**: current C3 help says category takes precedence. There is no current built-in `--type ai`.

The `workers-ai` profile uses the actual [Cloudflare LLM chat template](https://github.com/cloudflare/templates/tree/main/llm-chat-app-template), not a hand-written substitute. It contains Workers AI binding code, streaming chat, and optional AI Gateway configuration. Scaffolded configuration does not establish a logged-in account or grant production access. [Workers AI usage incurs account usage, including during local development](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/).

The pinned revision is the still-advertised head of [upstream PR #1137](https://github.com/cloudflare/templates/pull/1137); its LLM template tree matches merged commit `48e5ce752012d498d31f6c3b6106b64f5956aaf6`. This reference is deliberate: C3's degit 2.8.4 cannot resolve arbitrary historical commit hashes absent from advertised refs. Removing that upstream ref can break retrieval; failures preserve generated work rather than falling back to an unreviewed template.

That template pairs `wrangler` `4.127.0` with `@cloudflare/workers-types` `^4.20260702.1`, although Wrangler's optional peer requires `^5.20260826.1`. Only the pinned profile's initial npm `ERESOLVE` with this exact manifest/peer tuple is recovered: the wrapper updates that devDependency to `5.20260826.1`, then performs a normal dependency installation during adoption. No `--force`, `--legacy-peer-deps`, application-source rewrite, or fallback for unrelated install failures is used. Its native `cf-typegen` and `check` scripts run before setup is considered verified.

### Resources and bindings

Profile `resources` entries are **guidance**, not a claim that the wrapper provisions or binds anything. Some upstream templates already contain local binding configuration; others require you to add it later. A Wrangler binding grants access to a configured resource and is not a replacement for resource setup, migrations, secrets, or access review. See [Cloudflare bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/).

| Resource | Use | Explicit work after generation |
| --- | --- | --- |
| [D1](https://developers.cloudflare.com/d1/) | SQL database | Decide schema/migrations, select or provision database, configure D1 binding. |
| [R2](https://developers.cloudflare.com/r2/) | Object storage | Select or provision bucket and configure `r2_buckets`. |
| [KV](https://developers.cloudflare.com/kv/) | Distributed key-value storage | Select or provision namespace and configure `kv_namespaces`; account for consistency semantics. |
| [Durable Objects](https://developers.cloudflare.com/durable-objects/) | Stateful coordination and storage | Define the object class/binding and its migrations; select an appropriate supported starter if useful. |
| [Queues](https://developers.cloudflare.com/queues/) | Background message processing | Select or provision queues and configure producer/consumer bindings and retry policy. |
| [Vectorize](https://developers.cloudflare.com/vectorize/) | Vector indexes and similarity search | Select or provision an index matching embedding dimensions/metric, then configure its binding. |
| [Workers AI](https://developers.cloudflare.com/workers-ai/) | Hosted inference | Configure AI binding/model, review access and usage charges; local dev inference is not offline. |
| [AI Gateway](https://developers.cloudflare.com/ai-gateway/) | Optional AI request gateway | Explicit gateway setup/configuration; not implied by selecting Workers AI. |

## Custom upstream generator escape hatch

When the catalog is not the right selection, supply a trusted generator package explicitly. This uses the same adoption layer without adding a local framework template:

```sh
engineering create my-ui --generator create-vite@latest -- --template vue-ts --no-immediate
engineering create my-cron --generator create-cloudflare@latest -- --type scheduled --lang ts --no-deploy --no-open --no-git
```

The API is `engineering create <target> --generator <package> -- <upstream flags>`. Custom generators default to the `generic` engineering profile. The wrapper inserts the target argument; do not repeat it after `--`. A pinned package version can be supplied instead of `@latest` for a reviewed generator release.

This escape hatch is for packages accepting the target as their first positional argument. For commands with a different argument layout, run the official command yourself and then `engineering adopt <directory> --profile generic`. Do not encode `&&`, pipes, or a whole shell command into `--generator`.

For C3 framework generation, a second `--` in forwarded arguments belongs to C3 and forwards later arguments to its nested framework tool. Review both tools' help; their flags are not interchangeable. With custom generators, explicitly include supported no-deploy/no-open/no-git options and decline any login, provisioning, or deployment prompts. There is no universal safe-setup flag, and unsupported flags may be silently ignored (as in Epicflare).
