import assert from "node:assert/strict";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { captureBaseline, check, makeConfig } from "../src/quality.mjs";
import { fixture } from "./fixture.mjs";

const require = createRequire(import.meta.url);

test("native TypeScript enforces strictness without emitting or invalidating newly added source", async (t) => {
	const root = fixture(t, {
		"package.json": JSON.stringify({ type: "module" }),
		"tsconfig.json": JSON.stringify({
			compilerOptions: {
				target: "ES2022",
				module: "NodeNext",
				types: [],
				skipLibCheck: true,
				strict: false,
				noImplicitAny: false,
				noCheck: true,
				incremental: true,
				tsBuildInfoFile: "./must-not-write.tsbuildinfo",
				outDir: "./dist",
			},
			include: ["*.ts"],
		}),
		"index.ts": "export const safe = 1;\n",
	});
	mkdirSync(join(root, "node_modules"));
	symlinkSync(
		dirname(require.resolve("typescript-native/package.json")),
		join(root, "node_modules/typescript"),
	);
	const config = makeConfig(root, "generic");
	await captureBaseline(root, config, "Empty native compiler fixture baseline");
	writeFileSync(join(root, "new.ts"), "export const identify = (input) => input;\n");
	const report = await check(root, config);
	assert.ok(
		report.regressions.some((item) => item.file === "new.ts" && item.rule === "typescript/TS7006"),
	);
	assert.equal(existsSync(join(root, "must-not-write.tsbuildinfo")), false);
	assert.equal(existsSync(join(root, "dist")), false);
});
