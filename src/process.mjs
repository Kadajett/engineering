import { spawnSync } from "node:child_process";

function commandError(binary, result) {
	return new Error(
		`${binary} exited ${result.status ?? result.signal}: ${result.stderr?.trim() ?? ""}`,
	);
}

export function run(command, options = {}) {
	const [binary, ...args] = command;
	const result = spawnSync(binary, args, {
		cwd: options.cwd,
		env: options.env ?? process.env,
		stdio: options.capture ? "pipe" : "inherit",
		encoding: "utf8",
		timeout: options.timeout,
		maxBuffer: options.maxBuffer,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) throw commandError(binary, result);
	return result.stdout?.trim() ?? "";
}

export function available(binary) {
	const result = spawnSync(binary, ["--version"], { stdio: "ignore" });
	return !result.error && result.status === 0;
}

export function displayCommand(command) {
	return command
		.map((part) => (/^[\w@./:=+-]+$/.test(part) ? part : JSON.stringify(part)))
		.join(" ");
}
