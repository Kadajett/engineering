import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export function safePath(root, name) {
	const path = resolve(root, name);
	const parts = relative(root, path).split(/[\\/]/);
	if (isAbsolute(name) || parts.includes("..")) throw new Error(`Path escapes project: ${name}`);
	let current = root;
	for (const part of parts) {
		current = join(current, part);
		try {
			if (lstatSync(current).isSymbolicLink())
				throw new Error(`Refusing managed symlink: ${current}`);
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
	return path;
}

export function text(root, name) {
	const path = safePath(root, name);
	return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function json(root, name) {
	return JSON.parse(text(root, name));
}

export function save(root, name, content) {
	const path = safePath(root, name);
	if (existsSync(path) && readFileSync(path, "utf8") === content) return;
	mkdirSync(dirname(path), { recursive: true });
	const temporary = `${path}.engineering-${process.pid}.tmp`;
	writeFileSync(temporary, content, { flag: "wx" });
	renameSync(temporary, path);
}

export function saveJson(root, name, value) {
	const original = text(root, name);
	const indent = original.match(/\n([\t ]+)"/)?.[1] ?? "  ";
	save(root, name, `${JSON.stringify(value, null, indent)}\n`);
}

export function managedBlock(original, name, body) {
	const start = `<!-- engineering:${name}:start -->`;
	const end = `<!-- engineering:${name}:end -->`;
	const hasStart = original.includes(start);
	const hasEnd = original.includes(end);
	if (hasStart !== hasEnd) throw new Error(`Incomplete managed block: ${name}`);
	const block = `${start}\n${body.trim()}\n${end}`;
	if (!hasStart) return `${original.trimEnd()}\n\n${block}\n`.trimStart();
	if (original.split(start).length !== 2 || original.split(end).length !== 2) {
		throw new Error(`Duplicate managed block: ${name}`);
	}
	const begin = original.indexOf(start);
	const finish = original.indexOf(end);
	if (finish < begin) throw new Error(`Reversed managed block: ${name}`);
	return original.slice(0, begin) + block + original.slice(finish + end.length);
}
