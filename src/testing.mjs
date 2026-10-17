import { existsSync, readdirSync } from "node:fs";
import { safePath, text } from "./files.mjs";
import {
	mutationConfig,
	mutationScript,
	mutationVersion,
	testDiscovery,
} from "./testing-defaults.mjs";

const runnerPackages = [
	"vitest",
	"jest",
	"mocha",
	"ava",
	"tap",
	"tape",
	"uvu",
	"cypress",
	"@playwright/test",
	"playwright",
	"react-scripts",
	"@web/test-runner",
	"@angular/build",
	"@angular-devkit/build-angular",
	"@cloudflare/vitest-pool-workers",
	"@cloudflare/vitest-plugin",
];
const testName = /^(?:test|tests)(?::|$)/;
const unsafe = /[;&|<>`$\n\r\\]/;

function tokens(command) {
	if (typeof command !== "string" || unsafe.test(command)) return [];
	const parts = command.match(/"[^"\n]*"|'[^'\n]*'|[^\s"']+/g) ?? [];
	if (parts.join(" ") !== command.trim().replace(/\s+/g, " ")) return [];
	return parts.map((part) => part.replace(/^(["'])(.*)\1$/, "$2"));
}

function interactive(parts) {
	return parts.some(
		(part) =>
			/^(?:--(?:watch(?:All|-all)?|ui|inspect(?:-brk)?|debug|open|headed|api|standalone)(?:=|$)|-w$)/.test(
				part,
			) && !/^--(?:watch(?:All)?|ui|api)=false$/.test(part),
	);
}

function vitestOneShot(parts) {
	const run = parts[1] === "run" || parts.includes("--run") || parts.includes("--watch=false");
	return (
		run &&
		!parts.some((part) => ["watch", "dev", "bench", "list", "related", "init"].includes(part))
	);
}

function nodeOneShot(parts) {
	return (
		parts.includes("--test") &&
		!parts.some((part) => /^(?:--(?:test-watch|eval|print|run)(?:=|$)|-[ep]$)/.test(part))
	);
}

const standaloneRunners = new Set(["jest", "mocha", "ava", "tap", "tape", "uvu"]);
const runnerChecks = new Map([
	["vitest", vitestOneShot],
	["node", nodeOneShot],
	["bun", (parts) => parts[1] === "test"],
	["react-scripts", (parts) => parts[1] === "test" && parts.includes("--watchAll=false")],
	["playwright", (parts) => parts[1] === "test"],
	["cypress", (parts) => parts[1] === "run"],
]);

export function oneShotTest(command) {
	const parts = tokens(command);
	if (!parts.length || interactive(parts)) return false;
	if (standaloneRunners.has(parts[0])) return true;
	return runnerChecks.get(parts[0])?.(parts) ?? false;
}

export function testScripts(scripts = {}) {
	const commands = new Set();
	return Object.entries(scripts)
		.filter(([name, command]) => {
			if (!testName.test(name) || !/^[\w:-]+$/.test(name)) return false;
			if (scripts[`pre${name}`] || scripts[`post${name}`] || !oneShotTest(command)) return false;
			if (commands.has(command)) return false;
			commands.add(command);
			return true;
		})
		.map(([name]) => name);
}

function oneShotVariant(command) {
	const parts = tokens(command);
	if (parts[0] === "react-scripts" && parts[1] === "test" && !interactive(parts))
		return oneShotTest(command) ? null : `${command} --watchAll=false`;
	if (parts[0] !== "vitest" || interactive(parts) || oneShotTest(command)) return null;
	if (["bench", "list", "related", "init"].includes(parts[1])) return null;
	return command.replace(/^vitest(?:\s+(?:watch|dev))?(?=\s|$)/, "vitest run");
}

function upstreamRunner(root, manifest) {
	const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
	if (runnerPackages.some((name) => dependencies[name])) return true;
	if (
		Object.values(manifest.scripts ?? {}).some(
			(command) => oneShotTest(command) || tokens(command)[0] === "vitest",
		)
	)
		return true;
	if (["jest", "ava", "mocha", "tap"].some((name) => manifest[name])) return true;
	return readdirSync(root).some(
		(name) =>
			/^(?:vitest|jest|playwright|cypress|karma|web-test-runner)\.(?:config|workspace)\./.test(
				name,
			) || /^\.?(?:mocharc|nycrc)(?:\.|$)/.test(name),
	);
}

const discoveryPath = ".engineering/test.mjs";

function discoveryPlan(root, scripts, runner) {
	const files = new Map();
	const path = discoveryPath;
	if (runner) {
		const target = safePath(root, path);
		const original = text(root, path);
		if (existsSync(target) && original !== testDiscovery[runner])
			throw new Error(`Preserving existing ${path}`);
		files.set(path, testDiscovery[runner]);
	}
	const managed = Object.entries(testDiscovery).find(
		([runtime, source]) =>
			scripts["test:ci"] === `${runtime === "bun" ? "bun" : "node"} ${path}` &&
			(files.get(path) ?? text(root, path)) === source,
	);
	const checks = testScripts(scripts);
	if (managed && !scripts["pretest:ci"] && !scripts["posttest:ci"]) {
		const strict = managed[0] === "bun" ? "bun test" : "vitest run";
		return { files, checks: [...checks.filter((name) => scripts[name] !== strict), "test:ci"] };
	}
	return { files, checks };
}

function addOneShotAliases(scripts, notes) {
	const plannedScripts = { ...scripts };
	for (const [name, command] of Object.entries(plannedScripts)) {
		if (!testName.test(name)) continue;
		const run = oneShotVariant(command);
		if (!run || Object.values(plannedScripts).includes(run)) continue;
		const alias = name === "test" ? "test:ci" : `${name}:ci`;
		if (Object.hasOwn(plannedScripts, alias)) {
			notes.push(`Preserved ${alias}; no safe one-shot alias added for ${name}.`);
			continue;
		}
		plannedScripts[alias] = run;
	}
	return plannedScripts;
}

function needsDefault(root, manifest, options) {
	return (
		options.created &&
		!Object.keys(manifest.scripts ?? {}).some((name) => testName.test(name)) &&
		!upstreamRunner(root, manifest)
	);
}

export function testingPlan(root, manifest, profile, options) {
	const notes = [];
	const scripts = addOneShotAliases(manifest.scripts, notes);
	let runner = null;
	let devDependencies = manifest.devDependencies;
	if (needsDefault(root, manifest, options)) {
		runner = profile.id === "opentui" ? "bun" : "vitest";
		scripts.test = runner === "bun" ? "bun test" : "vitest run";
		scripts["test:ci"] = `${runner === "bun" ? "bun" : "node"} ${discoveryPath}`;
		if (runner === "vitest") devDependencies = { ...devDependencies, vitest: "4.1.0" };
		notes.push(`${runner} tests are strict: add real tests; an empty suite is not test coverage.`);
		if (profile.resources?.length)
			notes.push(
				"Default Vitest tests cover runtime-independent logic only; Worker bindings require the upstream Cloudflare test integration.",
			);
	} else if (!testScripts(scripts).length) {
		notes.push(
			"No known one-shot test script found; existing test tooling is unchanged and is not run automatically.",
		);
	}
	const discovery = discoveryPlan(root, scripts, runner);
	return {
		manifest: { ...manifest, scripts, ...(devDependencies ? { devDependencies } : {}) },
		runner,
		notes,
		...discovery,
	};
}

function existingMutation(root, manifest) {
	const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
	return (
		Object.keys(dependencies).some((name) => name.startsWith("@stryker-mutator/")) ||
		Object.entries(manifest.scripts ?? {}).some(
			([name, command]) =>
				/^(?:(?:pre|post)?test:mutation|mutate|mutation)/.test(name) || /\bstryker\b/.test(command),
		) ||
		readdirSync(root).some((name) => /^\.?stryker(?:\.conf|\.config)?(?:\.|$)/i.test(name))
	);
}

function mutationCommands(manifest) {
	return testScripts(manifest.scripts)
		.map((name) => manifest.scripts[name])

		.filter((command) => !/^(?:playwright|cypress)\b/.test(command));
}
function mutationBlocker(manifest, commands) {
	const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
	if (dependencies["@cloudflare/vitest-pool-workers"] || dependencies["@cloudflare/vitest-plugin"])
		return "Cloudflare Worker isolates need an explicit mutant-activation integration; host environment variables do not activate their mutants.";
	if (!commands.length) return "No recognized one-shot unit test command. Add one and adopt again.";
	return null;
}

export function mutationPlan(root, manifest, options) {
	const files = new Map();
	const notes = [];
	const unchanged = { manifest, files, notes, runner: null };
	if (options.mutation === false) {
		notes.push("Mutation testing setup disabled; existing tooling is unchanged.");
		return unchanged;
	}
	if (existingMutation(root, manifest)) {
		notes.push("Existing mutation testing scripts, dependencies, and configuration preserved.");
		return unchanged;
	}
	const commands = mutationCommands(manifest);
	const blocker = mutationBlocker(manifest, commands);
	if (blocker) {
		notes.push(`Mutation testing not configured: ${blocker}`);
		return unchanged;
	}
	const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
	const nativeVitest =
		commands.length === 1 &&
		commands[0] === "vitest run" &&
		/^[~^]?(?:[2-9]|[1-9]\d+)\.\d+\.\d+$/.test(dependencies.vitest ?? "");
	const config = mutationConfig(commands, nativeVitest);
	files.set("stryker.config.json", `${JSON.stringify(config, null, 2)}\n`);
	safePath(root, "stryker.config.json");
	notes.push(
		"StrykerJS configured. Run test:mutation separately; scores below 80 fail. No mutation tests ran during setup.",
	);
	if (!nativeVitest)
		notes.push(
			"Command runner executes the full unit suite per mutant without coverage analysis. Keep tests strict: this adapter cannot detect zero executed tests.",
		);
	return {
		manifest: {
			...manifest,
			scripts: { ...manifest.scripts, "test:mutation": mutationScript },
			devDependencies: {
				...manifest.devDependencies,
				"@stryker-mutator/core": mutationVersion,
				...(nativeVitest ? { "@stryker-mutator/vitest-runner": mutationVersion } : {}),
			},
		},
		files,
		notes,
		runner: config.testRunner,
	};
}
