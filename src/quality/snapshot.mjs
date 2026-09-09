import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";

export function analyzerPath(path) {
	return extname(path) ? path : `__engineering_scripts__/${path}.js`;
}

export function snapshotSources(contexts, temporary) {
	const root = join(temporary, "snapshot");
	mkdirSync(root);
	for (const [path, data] of contexts) {
		const target = join(root, path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, data.source);
	}
	return root;
}
