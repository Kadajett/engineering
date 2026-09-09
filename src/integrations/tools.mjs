import { inspect, probe, run } from "./process.mjs";

const tools = [
	{ name: "bd", install: ["npm", "install", "--global", "@beads/bd"], versionArgs: ["version"] },
	{ name: "graphify", install: ["uv", "tool", "install", "graphifyy"], versionArgs: ["--version"] },
	{
		name: "lizard",
		install: ["uv", "tool", "install", "lizard==1.24.0"],
		versionArgs: ["--version"],
	},
	{
		name: "uv",
		install: ["python3", "-m", "pip", "install", "--user", "uv"],
		versionArgs: ["--version"],
	},
];

let statusPromise;

/** Invocation-cached discovery. Broken executables are available, not reinstall candidates. */
export function toolStatus() {
	statusPromise ??= Promise.all(
		tools.map(async ({ name, install, versionArgs }) => {
			const result = await probe(name, versionArgs);
			return {
				name,
				available: !result.missing,
				install: [...install],
				...(!result.missing
					? { version: result.ok ? result.text.split("\n")[0] : `unhealthy: ${result.text}` }
					: {}),
			};
		}),
	);
	return statusPromise;
}

async function beadsInstallCommand() {
	const raw = await inspect("npm", [
		"view",
		"@beads/bd",
		"name",
		"version",
		"repository.url",
		"bin",
		"--json",
		"--registry=https://registry.npmjs.org",
	]);
	const data = JSON.parse(raw);
	const repositories = [
		"git+https://github.com/gastownhall/beads.git",
		"git+https://github.com/steveyegge/beads.git",
	];
	if (
		data.name !== "@beads/bd" ||
		!repositories.includes(data["repository.url"]) ||
		data.bin?.bd !== "bin/bd.js" ||
		!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(data.version)
	) {
		throw new Error(
			"Refusing Beads installation: official npm package identity does not match @beads/bd from gastownhall/beads. Inspect https://github.com/gastownhall/beads before proceeding.",
		);
	}
	return [
		"npm",
		"install",
		"--global",
		`@beads/bd@${data.version}`,
		"--registry=https://registry.npmjs.org",
	];
}

/** Explicit opt-in only. Preserves installed versions and returns refreshed tool statuses. */
export async function installMissingTools() {
	const status = await toolStatus();
	const missing = status.filter(({ available }) => !available);
	if (missing.some(({ name }) => name === "uv")) {
		throw new Error(
			"uv is required and is never bootstrapped automatically. Install uv using your platform package manager or https://docs.astral.sh/uv/getting-started/installation/, ensure uv is on PATH, then rerun setup.",
		);
	}
	const commands = [];
	for (const tool of missing)
		commands.push(tool.name === "bd" ? await beadsInstallCommand() : tool.install);
	try {
		for (const [command, ...args] of commands) await run(command, args);
	} finally {
		if (commands.length) statusPromise = undefined;
	}
	const after = await toolStatus();
	const unavailable = after.filter(
		({ available, version }) => !available || version?.startsWith("unhealthy:"),
	);
	if (unavailable.length)
		throw new Error(
			`Tools are not executable after setup: ${unavailable.map(({ name }) => name).join(", ")}. Check the installation output and PATH; existing tools were not replaced.`,
		);
	return after;
}
