import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

export async function probe(command, args, cwd, env = process.env) {
	try {
		const result = await execute(command, args, {
			cwd,
			env,
			encoding: "utf8",
			timeout: 30_000,
			maxBuffer: 4 * 1024 * 1024,
		});
		return { ok: true, text: `${result.stdout}${result.stderr}`.trim() };
	} catch (error) {
		if (error.code === "ENOENT")
			return { ok: false, missing: true, text: `${command} is not on PATH` };
		return {
			ok: false,
			text: `${error.stdout ?? ""}${error.stderr ?? ""}`.trim() || error.message,
		};
	}
}

export async function inspect(command, args, cwd, env) {
	const result = await probe(command, args, cwd, env);
	if (!result.ok) throw new Error(`${command} ${args.join(" ")} failed: ${result.text}`);
	return result.text;
}

export function run(command, args, cwd, env = process.env) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd, env, stdio: "inherit", shell: false });
		child.once("error", reject);
		child.once("exit", (code, signal) => {
			if (code === 0) resolve();
			else
				reject(
					new Error(
						`${command} ${args.join(" ")} failed (${signal ?? `exit ${code}`}); earlier successful steps are preserved. Resolve the error and rerun.`,
					),
				);
		});
	});
}

export function projectEnvironment(root) {
	const env = {
		...process.env,
		BD_NON_INTERACTIVE: "1",
		BEADS_DIR: `${root}/.beads`,
		GRAPHIFY_NO_TIPS: "1",
	};
	for (const key of Object.keys(env)) {
		if (
			key.startsWith("GIT_") ||
			key.startsWith("GRAPHIFY_") ||
			key.startsWith("BEADS_") ||
			key.startsWith("BD_")
		)
			delete env[key];
	}
	return {
		...env,
		BD_NON_INTERACTIVE: "1",
		BEADS_DIR: `${root}/.beads`,
		BD_AGENT_PROFILE: "conservative",
		GRAPHIFY_NO_TIPS: "1",
	};
}
