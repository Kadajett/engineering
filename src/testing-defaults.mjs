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
