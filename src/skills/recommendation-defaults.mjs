// Names and descriptions inspected in upstream SKILL.md files at immutable commits.
// These optional favorites are separate from catalog.mjs and never select installs.
const sources = {
	matt: "mattpocock/skills/3cca18b368ae95cdbdebbff572ccafa662551015",
	gentleman: "Gentleman-Programming/Gentleman-Skills/c8036a37893679dc5e942484975405d39689c63b",
	apollo: "apollographql/skills/c288eb80629dd2309eed81f23d693f66a452d043",
	clerk: "clerk/skills/c77dfc77a4f995673583c520da6630b60a2aa1de",
	cursor: "cursor/plugins/7366ac128bdf95f45e6734f412b49a4031800169",
	ponytail: "DietrichGebert/ponytail/356918eba965ee1eac64bd3a7f0dd02108350de5",
};

function source(key, path) {
	const [owner, repository, revision] = sources[key].split("/");
	return `https://github.com/${owner}/${repository}/blob/${revision}/${path}/SKILL.md`;
}

const clerkPackages = [
	"@clerk/nextjs",
	"@clerk/react",
	"@clerk/clerk-react",
	"@clerk/react-router",
	"@clerk/vue",
	"@clerk/nuxt",
	"@clerk/astro",
	"@clerk/tanstack-react-start",
	"@clerk/backend",
	"@clerk/express",
	"@clerk/fastify",
];

export const defaultRecommendations = [
	{
		name: "research",
		description:
			"Research primary sources in a background agent and capture cited findings in a repo note.",
		source: source("matt", "skills/engineering/research"),
	},
	{
		name: "domain-modeling",
		description:
			"Sharpen domain terminology and record a glossary or architectural decisions when useful.",
		source: source("matt", "skills/engineering/domain-modeling"),
	},
	{
		name: "prototype",
		description:
			"Build throwaway logic or UI experiments to answer a design question, not production scaffolding.",
		source: source("matt", "skills/engineering/prototype"),
	},
	{
		name: "grilling",
		description:
			"Interactively stress-test a plan or decision before acting; expects human answers and confirmation.",
		source: source("matt", "skills/productivity/grilling"),
	},
	{
		name: "writing-for-agents",
		description:
			"Write focused agent instructions, skills, and context pointers for AGENTS.md or CLAUDE.md.",
		source: source("matt", "skills/productivity/writing-for-agents"),
	},
	{
		name: "code-review",
		description:
			"Review standards and spec separately. Requires issue-tracker integration; adapt docs/agents/issue-tracker.md to Beads before use, rather than replacing Beads through upstream setup.",
		source: source("matt", "skills/engineering/code-review"),
	},
	{
		name: "thermo-nuclear-code-quality-review",
		description:
			"Cursor Team Kit's explicit-invocation maintainability audit: aggressive structural simplification and opinionated 1,000-line guidance. Review scope before allowing its suggested restructuring; not a correctness or security review.",
		source: source("cursor", "cursor-team-kit/skills/thermo-nuclear-code-quality-review"),
	},
	{
		name: "ponytail",
		description:
			"Dietrich Gebert's minimal-code workflow: reuse, stdlib and native features before new code. Opinionated persistent lite/full/ultra modes and minimal tests; the separate full plugin adds Node.js lifecycle hooks.",
		source: source("ponytail", "skills/ponytail"),
	},
	{
		name: "ponytail-review",
		description:
			"List over-engineering and deletion opportunities without applying fixes. Explicitly excludes correctness, security and performance; pair with a normal review and preserve required validation.",
		source: source("ponytail", "skills/ponytail-review"),
	},
	{
		name: "verify-this",
		description:
			"Prove a falsifiable claim with local baseline/treatment evidence. Runs repros or measurements; UI/CLI paths reference control-ui/control-cli skills. Sensitive artifacts require agreement before disk storage.",
		source: source("cursor", "cursor-team-kit/skills/verify-this"),
	},
	{
		name: "make-pr-easy-to-review",
		description:
			"Prepare reviewer guidance and PR descriptions using Git and authenticated gh access. Can edit PR metadata; history rewriting or force-pushing requires an agreed plan and content-identity checks.",
		source: source("cursor", "cursor-team-kit/skills/make-pr-easy-to-review"),
	},
	{
		name: "typescript",
		description:
			"Strict TypeScript types, interfaces, generics, and narrowing. Opinionated const-object and flat-interface rules; review against your existing conventions.",
		source: source("gentleman", "curated/typescript"),
		when: { languages: ["typescript"] },
	},
	{
		name: "rust-best-practices",
		description:
			"Apollo's Rust handbook guidance for ownership, errors, performance, tests, and docs; review its opinionated lint and test rules against your conventions.",
		source: source("apollo", "skills/rust-best-practices"),
		when: { languages: ["rust"] },
	},
	{
		name: "pytest",
		description:
			"Python pytest fixtures, mocking, parametrization, and markers; useful when choosing or already using pytest, without a project scaffold.",
		source: source("gentleman", "curated/pytest"),
		when: { languages: ["python"] },
	},
	{
		name: "clerk-testing",
		description:
			"Clerk auth E2E testing with Playwright or Cypress. Requires development keys/testing credentials; review setup before allowing app or credential creation.",
		source: source("clerk", "skills/features/clerk-testing"),
		when: { packages: clerkPackages },
	},
	{
		name: "clerk-webhooks",
		description:
			"Verify Clerk webhook signatures and handle eventually consistent events; requires a configured endpoint and webhook signing secret.",
		source: source("clerk", "skills/features/clerk-webhooks"),
		when: { packages: clerkPackages },
	},
];
