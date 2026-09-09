// Upstream names and paths verified at these immutable revisions. No runtime discovery.
const sources = {
	matt: ["mattpocock/skills", "3cca18b368ae95cdbdebbff572ccafa662551015"],
	cloudflare: ["cloudflare/skills", "b052c32bab7dd493513260228a36c88294f343f1"],
	vercel: ["vercel-labs/agent-skills", "063bee94c3f4df8453406c830b0a7df0f2860278"],
	hono: ["honojs/skills", "f916476e71029ebf62160c3286550a99f0b6c687"],
	tanstack: ["TanStack/router", "49bcd4db743dba4a783d5533a42a0f97a5721292"],
	clerk: ["clerk/skills", "c77dfc77a4f995673583c520da6630b60a2aa1de"],
	opentui: ["anomalyco/opentui", "97a20ab24953cb7a08d4ad319fdc59b1f32c55a8"],
};

const definitions = [
	["matt", "tdd", "skills/engineering/tdd"],
	["matt", "codebase-design", "skills/engineering/codebase-design"],
	["matt", "diagnosing-bugs", "skills/engineering/diagnosing-bugs"],
	["cloudflare", "cloudflare"],
	["cloudflare", "wrangler"],
	["cloudflare", "workers-best-practices"],
	["cloudflare", "agents-sdk"],
	["cloudflare", "durable-objects"],
	["vercel", "vercel-react-best-practices", "skills/react-best-practices"],
	["hono", "hono"],
	["opentui", "opentui", "packages/web/src/content"],
	["tanstack", "react-start", "packages/react-start/skills/react-start"],
	["tanstack", "start-core", "packages/start-client-core/skills/start-core"],
	["tanstack", "react-router", "packages/react-router/skills/react-router"],
	["tanstack", "router-core", "packages/router-core/skills/router-core"],
	["clerk", "clerk", "skills/core/clerk"],
	["clerk", "clerk-setup", "skills/core/clerk-setup"],
	["clerk", "clerk-backend-api", "skills/core/clerk-backend-api"],
	["clerk", "clerk-nextjs-patterns", "skills/frameworks/clerk-nextjs-patterns"],
	["clerk", "clerk-react-patterns", "skills/frameworks/clerk-react-patterns"],
	["clerk", "clerk-react-router-patterns", "skills/frameworks/clerk-react-router-patterns"],
	["clerk", "clerk-vue-patterns", "skills/frameworks/clerk-vue-patterns"],
	["clerk", "clerk-nuxt-patterns", "skills/frameworks/clerk-nuxt-patterns"],
	["clerk", "clerk-astro-patterns", "skills/frameworks/clerk-astro-patterns"],
	["clerk", "clerk-tanstack-patterns", "skills/frameworks/clerk-tanstack-patterns"],
];

const catalog = new Map(
	definitions.map(([source, name, path = `skills/${name}`]) => {
		const [repository, revision] = sources[source];
		return [name, { name, repository: `https://github.com/${repository}.git`, revision, path }];
	}),
);

// These disciplines are self-contained; tdd consults codebase-design. The separate
// code-review workflow requires interactive issue-tracker setup, so is not a default.
const baseline = ["tdd", "codebase-design", "diagnosing-bugs"];
const workers = ["cloudflare", "wrangler", "workers-best-practices"];
const react = ["vercel-react-best-practices"];
const browserReactPackages = new Set([
	"react-dom",
	"next",
	"react-router-dom",
	"@tanstack/react-start",
	"@tanstack/react-router",
	"@clerk/nextjs",
	"@clerk/react",
	"@clerk/clerk-react",
	"@clerk/react-router",
	"@clerk/tanstack-react-start",
]);
const clerk = ["clerk", "clerk-setup"];
const start = ["react-start", "start-core"];
const router = ["react-router", "router-core"];

// Exact direct-package matches only: never treat an entire npm scope as a match.
// TanStack requires closures are explicit; references stay in their upstream tree.
const packageSkills = new Map(
	Object.entries({
		wrangler: workers,
		"@cloudflare/workers-types": workers,
		"@cloudflare/vite-plugin": workers,
		// Agent instances use Durable Objects; Workers alone does not establish that signal.
		agents: [...workers, "agents-sdk", "durable-objects"],
		react,
		"react-dom": react,
		next: react,
		hono: ["hono"],
		"@opentui/core": ["opentui"],
		"@opentui/react": ["opentui"],
		"@opentui/solid": ["opentui"],
		"@opentui/keymap": ["opentui"],
		"@opentui/ssh": ["opentui"],
		"@opentui/qrcode": ["opentui"],
		"@opentui/three": ["opentui"],
		"@hono/node-server": ["hono"],
		"@hono/cli": ["hono"],
		"@tanstack/react-start": start,
		"@tanstack/start-client-core": ["start-core"],
		"@tanstack/react-router": router,
		"@tanstack/router-core": ["router-core"],
		"@clerk/nextjs": [...clerk, "clerk-nextjs-patterns"],
		"@clerk/react": [...clerk, "clerk-react-patterns"],
		"@clerk/clerk-react": [...clerk, "clerk-react-patterns"],
		"@clerk/react-router": [...clerk, "clerk-react-router-patterns"],
		"@clerk/vue": [...clerk, "clerk-vue-patterns"],
		"@clerk/nuxt": [...clerk, "clerk-nuxt-patterns"],
		"@clerk/astro": [...clerk, "clerk-astro-patterns"],
		"@clerk/tanstack-react-start": [...clerk, "clerk-tanstack-patterns"],
		"@clerk/backend": [...clerk, "clerk-backend-api"],
		"@clerk/express": [...clerk, "clerk-backend-api"],
		"@clerk/fastify": [...clerk, "clerk-backend-api"],
	}),
);

const workerProfiles = new Set([
	"cloudflare",
	"cloudflare-workers",
	"workers-ai",
	"hono-workers",
	"epicflare",
]);
const profilePackages = new Map(
	Object.entries({
		"react-vite": "react",
		"react-cra": "react",
		next: "next",
		"tanstack-start": "@tanstack/react-start",
		"hono-node": "hono",
		"hono-workers": "hono",
		opentui: "@opentui/core",
	}),
);

function directPackages(manifest) {
	const names = new Set();
	for (const field of [
		"dependencies",
		"devDependencies",
		"optionalDependencies",
		"peerDependencies",
	]) {
		const dependencies = manifest?.[field];
		if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) continue;
		for (const name of Object.keys(dependencies)) names.add(name);
	}
	return [...names].sort();
}

function ignoredPackage(name) {
	return name.startsWith("@types/") || name === "@kadajett/engineering";
}

function addSelections(selected, names, reason) {
	for (const name of names) {
		if (!selected.has(name)) selected.set(name, { ...catalog.get(name), reason });
	}
}

function hasOnlyTerminalReact(packages) {
	return (
		(packages.includes("@opentui/react") || packages.includes("ink")) &&
		!packages.some((name) => browserReactPackages.has(name))
	);
}

export function selectSkills(manifest, profileId) {
	const selected = new Map();
	addSelections(selected, baseline, "baseline: trusted engineering disciplines");
	const packages = directPackages(manifest).filter((name) => !ignoredPackage(name));
	// React alone is a web hint unless a terminal renderer explains its presence.
	// Mixed apps still get browser guidance from react-dom or Next.js directly.
	const terminalOnly = hasOnlyTerminalReact(packages);
	for (const name of packages) {
		if (name === "react" && terminalOnly) continue;
		addSelections(selected, packageSkills.get(name) ?? [], `package: ${name}`);
	}
	// A deployment profile remains useful with frontend overrides. Framework guesses
	// are used only without direct packages: create-vite can actually generate Vue.
	if (workerProfiles.has(profileId)) addSelections(selected, workers, `profile: ${profileId}`);
	if (packages.length === 0) {
		const inferred = profilePackages.get(profileId);
		addSelections(selected, packageSkills.get(inferred) ?? [], `profile: ${profileId}`);
	}
	return [...selected.keys()].sort().map((name) => selected.get(name));
}

export function unmatchedPackages(manifest) {
	return directPackages(manifest).filter(
		(name) => !ignoredPackage(name) && !packageSkills.has(name),
	);
}
