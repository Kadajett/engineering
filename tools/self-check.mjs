import { fileURLToPath } from "node:url";
import { check, makeConfig } from "../src/quality.mjs";

const root = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
const report = await check(root, makeConfig(root, "generic"));
for (const item of report.regressions) console.error(item.message);
console.log(`Reusable layer: ${report.regressions.length} policy violation(s), no baseline.`);
process.exitCode = report.regressions.length ? 1 : 0;
