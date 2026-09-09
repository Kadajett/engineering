import { createInterface } from "node:readline/promises";

export async function chooseBaseline(options) {
	if (options.dryRun || options.baseline || options.noBaseline) return options;
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		console.log("No baseline requested. We'll check the starter against your usual limits.");
		return options;
	}
	const prompt = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const answer = (
			await prompt.question(
				"If the starter already has quality issues, we can remember them so only new ones fail.\nType 'baseline: your reason' to do that, or press Enter to leave the checks as they are: ",
			)
		).trim();
		if (!answer || /^(?:n|no)$/i.test(answer)) return { ...options, noBaseline: true };
		const reason = /^baseline:\s*(\S.*)$/i.exec(answer)?.[1];
		if (!reason)
			throw new Error("Type 'baseline: your reason' or press Enter. Nothing has been created yet.");
		return { ...options, baseline: true, reason };
	} finally {
		prompt.close();
	}
}
