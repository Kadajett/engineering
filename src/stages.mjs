export class Stages {
	started = performance.now();
	entries = [];

	async run(label, operation) {
		const entry = { label, started: performance.now(), status: "ok", seconds: 0 };
		this.entries.push(entry);
		console.log(`[${label}] starting`);
		try {
			return await operation();
		} catch (error) {
			entry.status = "FAILED";
			throw error;
		} finally {
			entry.seconds = (performance.now() - entry.started) / 1000;
			console.log(`[${label}] ${entry.status} ${entry.seconds.toFixed(2)}s`);
		}
	}

	print() {
		console.log("\nSetup timings (overlapping stages are not additive):");
		for (const entry of this.entries) {
			console.log(`  ${entry.label.padEnd(24)} ${entry.seconds.toFixed(2)}s ${entry.status}`);
		}
		console.log(
			`  Total elapsed            ${((performance.now() - this.started) / 1000).toFixed(2)}s`,
		);
	}
}
