import { ciInstall } from "./managers.mjs";
import { managedBlock, text } from "./files.mjs";

export const scripts = {
	"engineering:check": "engineering check",
	"engineering:baseline": "engineering baseline",
	"engineering:prune": "engineering prune",
	"engineering:skills": "engineering skills",
};

function agentInstructions(profile) {
	return `## Working on this project

This project uses @kadajett/engineering with the ${profile.id} profile.

- Start with .engineering/config.json: it lists the source files, TypeScript projects, code limits, and import boundaries we check.
- Run the package manager's engineering:check script as well as the framework's own lint, format, build, and tests. They catch different problems.
- Keep the framework's app structure and source intact during setup. The checker belongs in its package, not copied into the app.
- If we're keeping known quality issues, record them once with engineering baseline --accept --reason "why we're keeping them". Don't reset the baseline to make new failures pass. Run engineering prune after fixing old issues to remove their allowances.
- Keep the project's existing package manager, formatter, linter, and TypeScript module/runtime settings.
- Tests follow the same complexity, nesting, and parameter limits as app code, but have no function-length limit and may be up to 1000 lines per file. Generated, vendor, and build files are excluded through configuration.
- Use Graphify to help navigate, then check the source itself. Keep secrets and .env files out of extraction, and ask before using semantic model calls.
- Setup isn't permission to add remotes, deploy, or create cloud resources.
- For Cloudflare projects, use the actual Wrangler configuration, generated types, and resource IDs. Bindings belong to this project, not to an example from another app.
- Prefer functions, immutable data, early returns, and explicit dependencies. Validate data at trust boundaries. Review coverage and duplication yourself; these checks don't measure them.

Commit the package in .engineering/vendor with the lockfile so everyone can run the same checks without access to the author's machine. The setup details are in .engineering/state.json.`;
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
