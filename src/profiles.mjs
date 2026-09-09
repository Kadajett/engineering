import { run } from "./process.mjs";

const cloudflareResources = [
	"D1",
	"R2",
	"KV",
	"Durable Objects",
	"Queues",
	"Vectorize",
	"Workers AI",
];
const cloudflareSafety = ["--no-deploy", "--no-open", "--no-git"];
const cloudflareWarning =
	"Creates local project files only; resource provisioning, account login, and deployment remain separate explicit work.";

export const profiles = [
	{
		id: "generic",
		label: "Existing JavaScript / TypeScript",
		description: "Adopt an existing repository without generating or rewriting application code.",
		generator: null,
		docs: ["https://nodejs.org/en/learn/getting-started/introduction-to-nodejs"],
		warnings: [
			"No generator. Use adopt, or select an explicit custom upstream generator when creating a project.",
		],
		resources: [],
	},
	{
		id: "hono-node",
		label: "Hono on Node.js",
		description: "Official Hono Node.js adapter starter, retaining upstream application structure.",
		generator: { package: "create-hono@latest", args: ["{target}", "--template", "nodejs"] },
		docs: ["https://hono.dev/docs/getting-started/nodejs", "https://github.com/honojs/create-hono"],
		warnings: [
			"Upstream may prompt for dependency installation and package manager; no invented TypeScript conversion or git flags.",
		],
		resources: [],
	},
	{
		id: "hono-workers",
		label: "Hono on Cloudflare Workers",
		description:
			"Official Hono Workers starter, not a Node.js application retrofitted for the edge.",
		generator: {
			package: "create-hono@latest",
			args: ["{target}", "--template", "cloudflare-workers"],
		},
		docs: ["https://hono.dev/docs/getting-started/cloudflare-workers"],
		warnings: [
			cloudflareWarning,
			"Upstream may prompt for dependency installation and package manager.",
		],
		resources: cloudflareResources,
	},
	{
		id: "express",
		label: "Express (JavaScript)",
		description:
			"Normal official express-generator application in JavaScript; upstream view-engine options remain available.",
		generator: { package: "express-generator@latest", args: ["{target}"] },
		docs: ["https://expressjs.com/en/starter/generator.html"],
		warnings: [
			"The official generator emits JavaScript/CommonJS, not TypeScript. Default view engine is Jade; pass --no-view or --view pug if desired. Its --git flag creates .gitignore, not a git repository.",
		],
		resources: [],
	},
	{
		id: "opentui",
		label: "OpenTUI (terminal app)",
		description: "TypeScript terminal app from create-tui, using OpenTUI Core by default.",
		generator: {
			package: "create-tui@0.0.11",
			args: ["{target}", "--template", "core", "--no-git", "--no-install"],
		},
		checkScripts: ["typecheck"],
		checksReadOnly: true,
		docs: ["https://opentui.com/docs/getting-started/", "https://github.com/msmps/create-tui"],
		warnings: [
			"Install Bun 1.3.0 or newer first; the upstream starters use Bun and include its lockfile.",
			"Pass --template react or --template solid after -- to choose another terminal renderer. Templates come from upstream main; the generator skips git and dependency installation.",
		],
		resources: [],
	},
	{
		id: "react-vite",
		label: "React with Vite (recommended SPA)",
		description:
			"Official Vite React TypeScript starter for a client-side app; use an upstream framework for integrated full-stack routing.",
		generator: {
			package: "create-vite@latest",
			args: ["{target}", "--template", "react-ts", "--no-immediate"],
		},
		docs: ["https://vite.dev/guide/", "https://react.dev/learn/build-a-react-app-from-scratch"],
		warnings: [
			"Use a maintained Node version satisfying the current upstream Vite requirement (the wrapper itself requires 22.12+). Pass --template react for JavaScript. --no-immediate avoids automatically starting a development server.",
		],
		resources: [],
	},
	{
		id: "react-cra",
		label: "Create React App (legacy opt-in)",
		description:
			"Unmodified official Create React App, retained only for explicit legacy requirements.",
		generator: { package: "create-react-app@latest", args: ["{target}"] },
		docs: [
			"https://react.dev/blog/2025/02/14/sunsetting-create-react-app",
			"https://create-react-app.dev/docs/getting-started/",
		],
		warnings: [
			"Create React App is officially deprecated for new applications and has no active maintainers. Explicit --allow-deprecated is required; prefer react-vite or a React framework. Upstream may install dependencies and initialize git; it has no supported skip-git option.",
		],
		resources: [],
	},
	{
		id: "next",
		label: "Next.js",
		description:
			"Official create-next-app with upstream prompts for language, router, styling, and tooling.",
		generator: {
			package: "create-next-app@latest",
			args: ["{target}", "--disable-git", "--skip-install"],
		},
		docs: ["https://nextjs.org/docs/app/api-reference/cli/create-next-app"],
		warnings: [
			"Upstream choices and saved preferences remain authoritative. Use upstream --js, --use-pnpm, --use-yarn, or --use-bun as needed; the wrapper does not rewrite generated source.",
		],
		resources: [],
	},
	{
		id: "tanstack-start",
		label: "TanStack Start (React)",
		description: "Current official TanStack CLI create command for a React Start application.",
		generator: {
			package: "@tanstack/cli@latest",
			args: ["create", "{target}", "--framework", "React", "--no-git", "--no-install"],
		},
		docs: [
			"https://tanstack.com/start/latest/docs/framework/react/getting-started",
			"https://github.com/TanStack/cli",
		],
		warnings: [
			"Current CLI defaults to non-interactive behavior; pass --interactive to choose add-ons. Deployment adapters configure output, not permission to deploy. Do not confuse --router-only with a Start app.",
		],
		resources: [],
	},
	{
		id: "epicflare",
		label: "Epicflare",
		description:
			"Current upstream create-epicflare: its own full-stack Workers starter, not a fork or local rewrite.",
		generator: { package: "create-epicflare@latest", args: ["{target}"] },
		docs: [
			"https://github.com/epicweb-dev/epicflare",
			"https://github.com/epicweb-dev/epicflare/blob/main/docs/getting-started.md",
			"https://www.npmjs.com/package/create-epicflare",
		],
		warnings: [
			"Requires Bun and bunx even when this wrapper runs through npm, pnpm, or yarn. Runs dependency installation and guided setup. Only --name is supported; --no-init, --no-git, and --no-deploy are not forwarded to setup. The framework version and application structure are owned by upstream.",
		],
		resources: ["D1", "KV", "Durable Objects"],
	},
	{
		id: "cloudflare",
		label: "Cloudflare (upstream category/template picker)",
		description:
			"Delegate Worker, full-stack, framework and official template selection to current C3 instead of maintaining another template catalog.",
		generator: { package: "create-cloudflare@latest", args: ["{target}", ...cloudflareSafety] },
		docs: [
			"https://developers.cloudflare.com/pages/get-started/c3/",
			"https://github.com/cloudflare/templates",
		],
		warnings: [
			cloudflareWarning,
			"Use upstream --category, --type, --framework or --template options, or its interactive picker. No local resource templates are maintained.",
		],
		resources: cloudflareResources,
	},
	{
		id: "cloudflare-workers",
		label: "Cloudflare Workers (C3)",
		description:
			"Official C3 Worker-only Hello World starter, with the language left to upstream selection.",
		generator: {
			package: "create-cloudflare@latest",
			args: ["{target}", "--type", "hello-world", ...cloudflareSafety],
		},
		docs: [
			"https://developers.cloudflare.com/workers/get-started/guide/",
			"https://developers.cloudflare.com/pages/get-started/c3/",
		],
		warnings: [
			cloudflareWarning,
			"C3 may prompt for language and install dependencies. Pass --lang js or --lang ts explicitly for automation. Never override the no-deploy/no-open safeguards.",
		],
		resources: cloudflareResources,
	},
	{
		id: "workers-ai",
		label: "Cloudflare Workers AI",
		description:
			"Official Cloudflare LLM chat application template fetched by C3, including upstream Workers AI binding code.",
		generator: {
			package: "create-cloudflare@2.72.6",
			args: [
				"{target}",
				"--template",
				"https://github.com/cloudflare/templates/llm-chat-app-template#26dfca38308b8f76d6042879fd710cf7991acac5",
				...cloudflareSafety,
				"--no-auto-update",
				"--no-agents",
			],
		},
		prepareScripts: ["cf-typegen"],
		checkScripts: ["check"],
		checksReadOnly: true,
		// Closed upstream PR #1137 advertises this immutable SHA to degit; its template
		// tree is identical to merged commit 48e5ce752012d498d31f6c3b6106b64f5956aaf6.
		generationCompatibility: {
			generator: "create-cloudflare@2.72.6",
			template:
				"https://github.com/cloudflare/templates/llm-chat-app-template#26dfca38308b8f76d6042879fd710cf7991acac5",
			wrangler: "4.127.0",
			workersTypes: "^4.20260702.1",
			compatibleWorkersTypes: "5.20260826.1",
		},
		docs: [
			"https://github.com/cloudflare/templates/tree/main/llm-chat-app-template",
			"https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/",
			"https://developers.cloudflare.com/workers-ai/models/",
		],
		warnings: [
			cloudflareWarning,
			"Workers AI inference accesses your Cloudflare account and may incur charges even during local development. No invented --type ai option. AI Gateway configuration is optional and separate.",
		],
		resources: ["Workers AI", "AI Gateway"],
	},
];

export function getProfile(id) {
	const profile = profiles.find((entry) => entry.id === id);
	if (!profile) throw new Error(`Unknown engineering profile: ${id}`);
	return profile;
}

export function requireProfileRuntime(profile) {
	if (profile.id !== "opentui") return;
	const message =
		"OpenTUI starters need Bun 1.3.0 or newer. Install Bun from https://bun.sh before creating or adopting this project.";
	let version;
	try {
		version = run(["bun", "--version"], { capture: true, timeout: 10000 });
	} catch (cause) {
		throw new Error(message, { cause });
	}
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!match || Number(match[1]) < 1 || (Number(match[1]) === 1 && Number(match[2]) < 3))
		throw new Error(`${message} Found: ${version}`);
}
