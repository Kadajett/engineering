# Upstream generator catalog

"engineering" runs an upstream project generator, then adds shared quality checks and optional Beads, Graphify, skills, and CI setup. The application comes from upstream, not a local collection of templates. Express stays JavaScript, and Epicflare keeps its own architecture.

The commands below were checked against primary documentation and published CLI help on **2026-09-09**. Most generators use `@latest`, so their prompts, templates, and requirements can change. OpenTUI pins its generator; Workers AI pins both C3 and a template revision. Before running an unpinned generator, "engineering" resolves its version and records the exact command in `.engineering/state.json`. Use `engineering plan` to see what will run.

## Choose once

```sh
# Pick a project type, then answer the upstream generator's questions.
engineering create my-app

# Or choose the generator directly.
engineering create hono-node my-api
engineering create react-vite my-ui
engineering create next my-site
engineering create opentui my-terminal-app
engineering create cloudflare-workers my-worker -- --lang js
engineering create workers-ai ./MyChat --name "My Chat" --open vscode

# Already have an app? Adoption doesn't run a generator.
engineering adopt . --profile generic
```

Arguments after `--` go to the upstream tool as separate arguments, not as a shell command. Use that tool's options for framework-specific choices. To preview without generating anything, replace `create` with `plan`.

## Profiles and exact upstream invocations

Each command below runs with `npx --yes`, without a shell. Every generator gets a lowercase, hyphenated project name, whether it comes from `--name` or the folder name. If that differs from your requested folder—for example, `My App` becomes `my-app`—generation uses a temporary sibling directory, then moves the result to the exact destination you asked for.

| Profile | Upstream invocation after `npx --yes` | What you get |
| --- | --- | --- |
| `generic` | None | Adopt an existing JS/TS repository. To create one, supply a custom generator. |
| `hono-node` | `create-hono@latest <target> --template nodejs` | Official Hono Node.js adapter starter. |
| `hono-workers` | `create-hono@latest <target> --template cloudflare-workers` | Official Hono Workers starter. |
| `express` | `express-generator@latest <target>` | JavaScript/CommonJS Express application. |
| `react-vite` | `create-vite@latest <target> --template react-ts --no-immediate` | A lightweight React SPA with TypeScript. |
| `react-cra` | `create-react-app@latest <target>` | Legacy Create React App; requires `--allow-deprecated`. |
| `next` | `create-next-app@latest <target> --disable-git --skip-install` | Next.js with upstream prompts and defaults. |
| `tanstack-start` | `@tanstack/cli@latest create <target> --framework React --no-git --no-install` | Official React Start starter. |
| `opentui` | `create-tui@0.0.11 <target> --template core --no-git --no-install` | A TypeScript terminal app using OpenTUI and Bun. |
| `epicflare` | `create-epicflare@latest <target>` | Full-stack Workers application with upstream guided setup. |
| `cloudflare` | `create-cloudflare@latest <target> --no-deploy --no-open --no-git` | C3's current category, framework, and template picker. |
| `cloudflare-workers` | `create-cloudflare@latest <target> --type hello-world --no-deploy --no-open --no-git` | Worker-only starter with upstream language selection. |
| `workers-ai` | `create-cloudflare@2.72.6 <target> --template https://github.com/cloudflare/templates/llm-chat-app-template#26dfca38308b8f76d6042879fd710cf7991acac5 --no-deploy --no-open --no-git --no-auto-update --no-agents` | The verified upstream LLM chat template with a Workers AI binding. |

### Hono

The [Node.js guide](https://hono.dev/docs/getting-started/nodejs) uses `nodejs`; the [Workers guide](https://hono.dev/docs/getting-started/cloudflare-workers) uses `cloudflare-workers`. Both are supported by the current [create-hono CLI](https://github.com/honojs/create-hono).

The generator may ask whether to install dependencies and which package manager to use. It supports `--install` and `--pm`; its documented options don't include a skip-install or `--no-git` flag.

### Express

The [official generator](https://expressjs.com/en/starter/generator.html) creates JavaScript/CommonJS code, which "engineering" adopts as-is. The default view engine is Jade. For an API without views:

```sh
engineering create express my-api -- --no-view
```

You can also choose `--view pug`. Express's `--git` option adds a `.gitignore`; it doesn't initialize a repository. Its `--force` option allows a nonempty destination, but "engineering" requires an empty destination for new projects. There is no TypeScript conversion step.

### React: Vite or an upstream framework, CRA only by exception

[Vite](https://vite.dev/guide/) supports `react` and `react-ts` templates. This profile uses TypeScript; add `-- --template react` for JavaScript. The `--no-immediate` flag keeps the generator from installing dependencies and starting the development server immediately. "engineering" handles installation during adoption.

Vite currently requires **Node 20.19+ or 22.12+**. "engineering" requires **Node 22.12+** for its own analyzers. Use a maintained Node version that also meets your chosen generator's requirements.

React [deprecated Create React App on February 14, 2025](https://react.dev/blog/2025/02/14/sunsetting-create-react-app). It has no active maintainers and remains in maintenance mode. If you specifically need it:

```sh
engineering create react-cra legacy-ui --allow-deprecated
```

CRA installs dependencies and may initialize Git; its current help has no skip-git option. You can adopt an existing CRA repository without running the generator again. For new apps, React recommends [a framework](https://react.dev/learn/creating-a-react-app), or [a build tool where that fits](https://react.dev/learn/build-a-react-app-from-scratch). Vite is the plain SPA choice here, not a substitute for every full-stack framework.

### Next.js and TanStack Start

[create-next-app](https://nextjs.org/docs/app/api-reference/cli/create-next-app) supports `--disable-git` and `--skip-install`. Its own prompts choose the language, router, styling, and tools. Pass `-- --yes` to accept its defaults, which may include saved preferences. The upstream package-manager flags are `--use-npm`, `--use-pnpm`, `--use-yarn`, and `--use-bun`.

The [TanStack Start guide](https://tanstack.com/start/latest/docs/framework/react/getting-started) uses `npx @tanstack/cli@latest create`. The [CLI](https://github.com/TanStack/cli) supports `--framework React`, `--no-git`, `--no-install`, and `--interactive`. Interactive mode currently defaults to false; add `-- --interactive` to choose add-ons. `--router-only` creates a Router app rather than a full Start app. A `--deployment` choice configures an adapter; "engineering" doesn't deploy it.

### OpenTUI

[OpenTUI](https://github.com/anomalyco/opentui) is a terminal UI library. This profile uses the real [create-tui generator](https://github.com/msmps/create-tui), pinned to **0.0.11**, with a TypeScript Core starter:

```sh
engineering create opentui my-terminal-app
```

Install [Bun 1.3.0+](https://bun.sh/docs/installation) first. The generated application uses Bun even if you installed "engineering" with npm. "engineering" checks that Bun is available and doesn't install it automatically. The generator's `--no-git` and `--no-install` options leave repository setup and dependency installation to adoption, which keeps the starter's Bun lockfile.

To use a different renderer:

```sh
engineering create opentui my-react-terminal -- --template react
engineering create opentui my-solid-terminal -- --template solid
```

The supported choices are `core`, `react`, and `solid`; `-t` also works in place of `--template`. You can add `--verbose` (`-v`) for more generator output. Other forwarded options are rejected to keep the same setup behavior. The CLI version is pinned, but its templates are downloaded from current upstream `main`, so starter contents can change.

Current starters have a non-watching `typecheck` script (`tsc --noEmit`) and a development watcher. Adoption runs the typecheck. After setup, run `bun run dev` to open the terminal app. These starters don't declare `build` or `start` scripts.

The [official OpenTUI skill](https://opentui.com/docs/getting-started/) is selected automatically from the project's OpenTUI dependencies. Using the React terminal renderer alone doesn't add Vercel's browser-focused React skill; an app with actual web dependencies can still receive web guidance.

### Epicflare: an upstream application, not this wrapper's architecture

[Epicflare](https://github.com/epicweb-dev/epicflare) supplies the framework versions and Workers/D1/KV/Durable Objects application. Follow its [setup guide](https://github.com/epicweb-dev/epicflare/blob/main/docs/getting-started.md) for the app itself. "engineering" adds its own checks without copying resource IDs or a quality baseline from another project.

The inspected `create-epicflare` **1.7.0** executable requires **Bun and bunx**, even when "engineering" was installed with npm, pnpm, or yarn. It clones the upstream template, runs `bun install`, and invokes `bun ./docs/post-download.ts --guided`.

That generator accepts `--name`; it silently ignores other flags. In particular, `--no-init`, `--no-git`, `--no-deploy`, and `--defaults` don't control its setup. The setup script has its own separately documented options. "engineering" keeps a Git repository created by upstream and initializes one only if needed.

The upstream README describes a quick start that starts a development server, but the inspected published generator contains no dev-server command. Check the generated app's scripts to start it. Upstream setup documentation says setup doesn't create Cloudflare resources; its later deploy workflow does. "engineering" doesn't run that workflow.

## Cloudflare: code generation is not provisioning

All Workers profiles bring in native logging and tracing guidance. Workers AI and Agents projects also get relevant token-usage, streaming, privacy, and production references. This doesn't choose a monitoring vendor or configure telemetry: Sentry docs require `@sentry/cloudflare`, and AI Gateway stays optional. See the [AI Workers guide](docs/AI-WORKERS.md).

C3 **2.72.6** supports `--no-deploy`, `--no-open`, and `--no-git`; the [official CLI reference](https://developers.cloudflare.com/pages/get-started/c3/) also documents these negated boolean options. All three built-in C3 profiles include them, and forwarded arguments can't turn deployment or browser opening back on.

C3 can still ask questions and install dependencies. With `cloudflare` and `cloudflare-workers`, pass remaining choices such as `-- --lang ts`. Use `cloudflare` when you want to pick a category, framework, or template yourself. The `workers-ai` profile keeps a fixed template, so it rejects overrides for category, type, template, framework, defaults, language, and other configuration choices, including aliases and dotted forms. For example, `--accept-defaults` can select a different starter and isn't accepted for that profile.

`--existing-script` and `--type pre-existing` refer to a Worker in your Cloudflare account, not a local repository. Use `engineering adopt` for local source. C3's `--no-git` controls C3 itself; nested generators and package lifecycle scripts can have their own behavior. A plan shows the command, but doesn't sandbox third-party code.

### Other official Cloudflare categories

These choices belong to C3 rather than to a separate "engineering" template collection:

- `hello-world` covers Worker-only, static assets, Worker plus assets, Durable Objects, and Workflows starters. Published type names include `hello-world-assets-only`, `hello-world-with-assets`, `hello-world-durable-object`, `hello-world-durable-object-with-assets`, and `hello-world-workflows`.
- Other built-in types include `scheduled`, `queues`, `common`, and `openapi`.
- `web-framework` runs upstream generators for Hono, React, Next, TanStack Start, React Router, Astro, Svelte, Vue, and others. `--platform pages` selects Pages where the framework supports it; Workers is the current general default.
- `demo` selects C3 application starters.
- `--template` accepts an external template's official GitHub URL. Don't combine it with `--category`: C3 gives category precedence. There is no current built-in `--type ai`.

The `workers-ai` profile uses the [Cloudflare LLM chat template](https://github.com/cloudflare/templates/tree/main/llm-chat-app-template), including its Workers AI binding, streaming chat, and optional AI Gateway configuration. Generation doesn't log you into an account or grant access to resources. When you later run inference, [Workers AI usage counts toward your account, including in local development](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/).

The pinned revision is the advertised head of [upstream PR #1137](https://github.com/cloudflare/templates/pull/1137). Its LLM template files match merged commit `48e5ce752012d498d31f6c3b6106b64f5956aaf6`. This matters because C3's degit 2.8.4 can't retrieve arbitrary historical commit hashes that aren't advertised by a ref. If upstream removes the ref, retrieval may fail; "engineering" won't silently choose a different template.

The pinned template uses `wrangler` `4.127.0` with `@cloudflare/workers-types` `^4.20260702.1`, while Wrangler's optional peer requires `^5.20260826.1`. For the initial npm `ERESOLVE` with that exact pair, "engineering" changes the devDependency to `5.20260826.1` and installs normally during adoption. This is limited to the pinned profile and that specific conflict. It doesn't use `--force` or `--legacy-peer-deps`, change application code, or retry unrelated failures with relaxed dependency rules. The template's `cf-typegen` and `check` scripts must pass before setup succeeds.

### Resources and bindings

The profile's `resources` list explains what you might use; selecting a profile doesn't create those resources. Some templates already include local binding configuration. You still choose the resources, set up migrations and secrets, and review access. A [Cloudflare binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/) gives a Worker access to a configured resource; it doesn't replace that setup.

| Resource | Use | What you do after generation |
| --- | --- | --- |
| [D1](https://developers.cloudflare.com/d1/) | SQL database | Choose or create a database, plan its schema and migrations, and configure the D1 binding. |
| [R2](https://developers.cloudflare.com/r2/) | Object storage | Choose or create a bucket and configure `r2_buckets`. |
| [KV](https://developers.cloudflare.com/kv/) | Distributed key-value storage | Choose or create a namespace, configure `kv_namespaces`, and account for its consistency behavior. |
| [Durable Objects](https://developers.cloudflare.com/durable-objects/) | Stateful coordination and storage | Define the object class, binding, and migrations; choose a matching starter if useful. |
| [Queues](https://developers.cloudflare.com/queues/) | Background messages | Choose or create queues, then configure producers, consumers, and retries. |
| [Vectorize](https://developers.cloudflare.com/vectorize/) | Vector indexes and similarity search | Choose or create an index with the right dimensions and metric, then add its binding. |
| [Workers AI](https://developers.cloudflare.com/workers-ai/) | Hosted inference | Configure the AI binding and model, and review access and charges. Local development inference isn't offline. |
| [AI Gateway](https://developers.cloudflare.com/ai-gateway/) | Optional AI request gateway | Set up and configure a gateway separately if you want one. |

## Custom upstream generator escape hatch

If your generator isn't in the catalog, you can still use it with the same adoption workflow:

```sh
engineering create my-ui --generator create-vite@latest -- --template vue-ts --no-immediate
engineering create my-cron --generator create-cloudflare@latest -- --type scheduled --lang ts --no-deploy --no-open --no-git
```

The form is `engineering create <target> --generator <package> -- <upstream flags>`. Custom generators use the `generic` profile by default. "engineering" adds the target as the first positional argument, so don't repeat it after `--`. You can pin the package version instead of using `@latest`.

If a generator needs a different argument order, run its official command yourself, then use `engineering adopt <directory> --profile generic`. `--generator` takes a package, not a shell command with `&&` or pipes.

For C3 framework generation, a second `--` belongs to C3 and passes later arguments to its nested framework tool. Check both tools' help because their options differ. For any custom generator, review its behavior and include the no-deploy, no-open, or no-git flags it actually supports. There isn't a universal setup-only flag; unsupported options may be ignored, as with Epicflare. Decline login, resource-creation, or deployment prompts if you only want local setup.
