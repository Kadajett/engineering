import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function fixture(test, files) {
	const root = mkdtempSync(join(tmpdir(), "engineering-test-"));
	test.after(() => rmSync(root, { recursive: true, force: true }));
	for (const [name, source] of Object.entries(files)) {
		const path = join(root, name);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, source);
	}
	return root;
}
