import { createInterface } from "node:readline/promises";

export async function chooseBaseline(options) {
	if (options.dryRun || options.baseline || options.noBaseline) return options;
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		console.log("Initial baseline: not approved; new violations will fail verification.");
		return options;
	}
	const prompt = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const answer = (
			await prompt.question(
				"Initial inherited debt: type 'baseline: <approval reason>' to accept it after native checks, or Enter for no baseline: ",
			)
		).trim();
		if (!answer || /^(?:n|no)$/i.test(answer)) return { ...options, noBaseline: true };
		const reason = /^baseline:\s*(\S.*)$/i.exec(answer)?.[1];
		if (!reason) throw new Error("Expected 'baseline: <reason>' or Enter; nothing created.");
		return { ...options, baseline: true, reason };
	} finally {
		prompt.close();
	}
}
