import { existsSync, readFileSync } from "node:fs";
import { configSchema } from "./quality/config.mjs";
import { inventory, projectRoot, safePath, sourceFiles } from "./quality/files.mjs";
import { hash, loadCompiler, packageInfo } from "./quality/runtime.mjs";
import { collectMetrics, metricFindings } from "./quality/metrics.mjs";
import { lintFindings } from "./quality/lint.mjs";
import { boundaryFindings } from "./quality/boundaries.mjs";
import { projectFingerprint, readProjects, strictFindings } from "./quality/typescript.mjs";
import { createBaseline, prune, readBaseline, report } from "./quality/baseline.mjs";
import { readNativeProjects } from "./quality/native-projects.mjs";
import { nativeStrictFindings } from "./quality/native-strict.mjs";

export { makeConfig, readConfig } from "./quality/config.mjs";

function prepare(root, configuration) {
	const directory = projectRoot(root);
	const config = configSchema.parse(configuration);
	const paths = inventory(directory, config);
	const sources = sourceFiles(directory, config, paths);
	const compiler = loadCompiler(directory);
	const ts = compiler.ast;
	const projects = compiler.native
		? readNativeProjects({ ts, root: directory, config, paths, compiler })
		: readProjects(ts, directory, config, paths);
	const engineering = JSON.parse(
		readFileSync(new URL("../package.json", import.meta.url), "utf8"),
	).version;
	const tools = {
		engineering,
		lizard: "1.24.0",
		oxlint: packageInfo("oxlint").version,
		biome: config.limits.cognitive === null ? null : packageInfo("@biomejs/biome").version,
		typescript: compiler.version,
	};
	const fingerprint = hash({ config, tools, projects: projectFingerprint(projects, directory) });
	return { directory, config, sources, ts, projects, tools, fingerprint, compiler };
}

function collect(state) {
	const { directory, config, sources, ts, projects, compiler } = state;
	const metrics = collectMetrics(directory, sources, ts);
	const findings = [
		...lintFindings(directory, metrics, config.limits),
		...metricFindings(metrics, config.limits),
		...boundaryFindings({ ts, root: directory, settings: projects }, sources, config.boundaries),
		...(compiler.native
			? nativeStrictFindings(directory, projects, compiler)
			: strictFindings(ts, directory, projects)),
	].sort((left, right) => left.file.localeCompare(right.file) || left.id.localeCompare(right.id));
	if (new Set(findings.map((item) => item.id)).size !== findings.length)
		throw new Error("Duplicate analyzer finding identity");
	return { ...state, findings };
}

export async function check(root, config) {
	const prepared = prepare(root, config);
	const baseline = readBaseline(prepared.directory, prepared.fingerprint);
	return report(collect(prepared).findings, baseline);
}

export async function captureBaseline(root, config, reason) {
	const directory = projectRoot(root);
	if (typeof reason !== "string" || !reason.trim())
		throw new Error("An explicit approval reason is required");
	if (existsSync(safePath(directory, ".engineering/baseline.json", true))) {
		throw new Error(
			"Baseline already exists; initial capture cannot overwrite it. Use prune to remove resolved allowances.",
		);
	}
	const state = collect(prepare(directory, config));
	const baseline = createBaseline(directory, state, reason);
	return report(state.findings, baseline);
}

export async function pruneBaseline(root, config) {
	const prepared = prepare(root, config);
	const baseline = readBaseline(prepared.directory, prepared.fingerprint);
	if (!baseline) throw new Error("There is no baseline to prune");
	const state = collect(prepared);
	// Validate stored metadata before touching the approved snapshot.
	report(state.findings, baseline);
	return report(state.findings, prune(prepared.directory, state, baseline));
}
