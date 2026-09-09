import { ciInstall } from "./managers.mjs";
import { managedBlock, text } from "./files.mjs";

export const scripts = {
	"engineering:check": "engineering check",
	"engineering:baseline": "engineering baseline",
	"engineering:prune": "engineering prune",
	"engineering:skills": "engineering skills",
};

function agentInstructions(profile) {
	return `## Engineering layer\n\nThis project uses @kadajett/engineering (profile: ${profile.id}).\n\n- Read .engineering/config.json for source scope, strict TypeScript projects, limits and boundaries.\n- Run the package manager's engineering:check script alongside the framework's own lint, format, build and tests. Neither replaces the other.\n- Keep the framework generator and application source upstream-owned. Do not copy checker implementation into this project or repair framework code merely to install rules.\n- Inherited debt can be captured once with engineering baseline --accept --reason \"approved reason\". Never recapture a baseline to bless new failures. engineering prune only removes/reduces resolved allowances.\n- Preserve existing package manager, formatter, linter and tsconfig module/runtime settings.\n- Tests retain complexity/nesting/parameter rules; function length is exempt and file length is capped at 1000. Generated/vendor/build files are excluded explicitly.\n- Graphify is structural navigation, not source of truth. Keep .env/secrets out of extraction; no semantic model calls without approval.\n- Use Beads when enabled; do not copy another project's .beads state. Do not add remotes, deploy or provision cloud resources during setup.\n- Cloudflare bindings (D1, R2, KV, Workers AI, Durable Objects, Queues, Vectorize) are project-specific. Use upstream Wrangler commands/types, not guessed IDs or fabricated bindings.\n- Prefer functions, immutable data, guard clauses, explicit dependencies and runtime validation at trust boundaries. Coverage and duplication remain review targets; do not claim they are automated by this layer.\n\nThe packed devDependency in .engineering/vendor is committed with the lockfile: checks work without the author's home directory. See .engineering/state.json for setup provenance.`;
}

function workflow(manager, nativeScripts) {
	const extra =
		manager.name === "bun"
			? `      - uses: oven-sh/setup-bun@v2\n        with:\n          bun-version: '${manager.version}'\n`
			: manager.name === "npm"
				? ""
				: manager.name === "yarn"
					? `      - run: npm install --global corepack && corepack enable && corepack prepare yarn@${manager.version} --activate\n`
					: `      - run: npm install --global ${manager.name}@${manager.version}\n`;
	const commands = [...nativeScripts.prepare, ...nativeScripts.checks];
	const nativeSteps = commands.map((name) => `      - run: ${manager.name} run ${name}\n`).join("");
	return `# Managed by @kadajett/engineering. Existing framework workflows are unchanged.\nname: Engineering policy\non:\n  push:\n  pull_request:\npermissions:\n  contents: read\njobs:\n  policy:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n${extra}      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.12'\n      - run: python -m pip install lizard==1.24.0\n      - run: ${ciInstall(manager)}\n${nativeSteps}      - run: ${manager.name} run engineering:check\n`;
}

export function projectFiles(root, profile, manager, options) {
	const files = new Map([
		["AGENTS.md", managedBlock(text(root, "AGENTS.md"), "policy", agentInstructions(profile))],
		["CLAUDE.md", managedBlock(text(root, "CLAUDE.md"), "policy", "@AGENTS.md")],
	]);
	if (options.ci) {
		const path = ".github/workflows/engineering.yml";
		const expected = workflow(manager, options.nativeScripts ?? { prepare: [], checks: [] });
		const original = text(root, path);
		if (original && original !== expected)
			throw new Error(`Preserving existing ${path}; review it or use --no-ci`);
		files.set(path, expected);
	}
	return files;
}
