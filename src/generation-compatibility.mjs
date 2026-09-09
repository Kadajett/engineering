import { existsSync } from "node:fs";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { json, saveJson } from "./files.mjs";

function eligibleFailure(profile, result) {
	const expected = profile.generationCompatibility;
	return Boolean(
		expected &&
			!result.error &&
			!result.signal &&
			result.status === 1 &&
			profile.generator.package === expected.generator &&
			profile.generator.args.includes(expected.template),
	);
}

function matchesConflict(output, expected) {
	if (!/npm (?:ERR!|error) code ERESOLVE/.test(output)) return false;
	if (/npm (?:ERR!|error) code (?!ERESOLVE\b)\S+/.test(output)) return false;
	if (["Application created", "Step 2 of 3"].some((stage) => output.includes(stage))) return false;
	return [
		"files copied to project directory",
		`While resolving: wrangler@${expected.wrangler}`,
		`@cloudflare/workers-types@"${expected.workersTypes}"`,
		`peerOptional @cloudflare/workers-types@"^${expected.compatibleWorkersTypes}"`,
	].every((message) => output.includes(message));
}

function diagnostics(result) {
	return stripVTControlCharacters(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
}

export function recoverTemplateInstall(profile, root, result) {
	const compatibility = profile.generationCompatibility;
	if (!eligibleFailure(profile, result)) return false;
	const output = diagnostics(result);
	if (!matchesConflict(output, compatibility)) return false;
	if (
		![
			"package.json",
			"wrangler.jsonc",
			"tsconfig.json",
			"src/index.ts",
			"public/index.html",
			"public/chat.js",
		].every((file) => existsSync(join(root, file)))
	)
		return false;
	const pkg = json(root, "package.json");
	if (
		pkg.devDependencies?.wrangler !== compatibility.wrangler ||
		pkg.devDependencies?.["@cloudflare/workers-types"] !== compatibility.workersTypes
	)
		return false;
	pkg.devDependencies["@cloudflare/workers-types"] = compatibility.compatibleWorkersTypes;
	saveJson(root, "package.json", pkg);
	console.log(
		`Recovered pinned C3 npm peer conflict: @cloudflare/workers-types ${compatibility.workersTypes} → ${compatibility.compatibleWorkersTypes}. Dependency installation and native preparation continue in the engineering workflow.`,
	);
	return true;
}
