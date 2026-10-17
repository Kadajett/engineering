import { exclusions } from "./quality/files.mjs";

export const testDiscovery = {
	vitest: `import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createVitest } from "vitest/node";

const context = await createVitest("test", { watch: false });
let found;
try {
	found = (await context.globTestSpecifications()).length > 0;
} finally {
	await context.close();
}
if (!found) {
	console.log("No test files discovered. No tests ran; this is not test coverage. Add real tests and run the test script.");
} else {
	const cli = join(dirname(fileURLToPath(import.meta.resolve("vitest/package.json"))), "vitest.mjs");
	const result = spawnSync(process.execPath, [cli, "run"], { stdio: "inherit" });
	if (result.error) throw result.error;
	process.exitCode = result.status ?? 1;
}
`,
	bun: `import { spawnSync } from "node:child_process";

const configFile = Bun.file("bunfig.toml");
const config = await configFile.exists() ? Bun.TOML.parse(await configFile.text()) : {};
const files = new Bun.Glob("**/*{.test,_test,.spec,_spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}");
let found = false;
for await (const file of files.scan({ cwd: config.test?.root ?? ".", onlyFiles: true })) {
	if (file.split("/").includes("node_modules")) continue;
	found = true;
	break;
}
if (!found) {
	console.log("No test files discovered. No tests ran; this is not test coverage. Add real tests and run the test script.");
} else {
	const result = spawnSync(process.execPath, ["test"], { stdio: "inherit" });
	if (result.error) throw result.error;
	process.exitCode = result.status ?? 1;
}
`,
};

export const mutationVersion = "10.0.0";
export const mutationScript = "stryker run";

const mutationExclusions = [
	...exclusions,
	"test",
	"tests",
	"__tests__",
	"__mocks__",
	"fixtures",
	"__fixtures__",
	"*{.test,.spec,_test,_spec}.*",
	"*.d.{ts,mts,cts}",
	"*{.config,.conf}.{js,mjs,cjs,ts,mts,cts}",
];

export function mutationConfig(commands, nativeVitest) {
	return {
		$schema: "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
		testRunner: nativeVitest ? "vitest" : "command",
		plugins: nativeVitest ? ["@stryker-mutator/vitest-runner"] : [],
		...(nativeVitest
			? { coverageAnalysis: "perTest" }
			: { coverageAnalysis: "off", commandRunner: { command: commands.join(" && ") } }),
		mutate: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}", `!**/{${mutationExclusions.join(",")}}{,/**}`],
		reporters: ["clear-text", "progress", "html", "json"],
		htmlReporter: { fileName: "reports/mutation/mutation.html" },
		jsonReporter: { fileName: "reports/mutation/mutation.json" },
		incremental: false,
		thresholds: { high: 90, low: 80, break: 80 },
		allowEmpty: false,
	};
}
