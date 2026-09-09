import { readFileSync } from "node:fs";
import { safePath } from "./files.mjs";
import { analyzerPath } from "./snapshot.mjs";

function functionName(node, tree) {
	const name = node.name ?? node.parent.name;
	return name ? name.getText(tree) : "(anonymous)";
}

function functionEntry(node, tree) {
	const start = node.getStart(tree);
	const parameters = node.parameters.map((parameter) => parameter.name.getText(tree));
	return {
		name: `${functionName(node, tree)} ( ${parameters.join(" , ")}${parameters.length ? " " : ""})`,
		start: tree.getLineAndCharacterOfPosition(start).line + 1,
		end: tree.getLineAndCharacterOfPosition(node.end - 1).line + 1,
		parameters: node.parameters.length,
		tokens: [],
	};
}

function appendToken(entry, tree, start, text) {
	const line = tree.getLineAndCharacterOfPosition(start).line + 1;
	const previous = entry.tokens.at(-1);
	const previousLine = previous ? previous[0] + previous[1].split("\n").length - 1 : entry.start;
	for (let skipped = previousLine; skipped < line; skipped++) entry.tokens.push([skipped, "\n"]);
	entry.tokens.push([line, text]);
}

function opaqueType(ts, node) {
	return (
		(ts.isTypeNode(node) && node.kind !== ts.SyntaxKind.ExpressionWithTypeArguments) ||
		(node.kind === ts.SyntaxKind.QuestionToken && !ts.isConditionalExpression(node.parent))
	);
}

function tokenText(ts, node, tree) {
	const text = node.getText(tree);
	if (
		ts.isLiteralExpression(node) ||
		ts.isTemplateLiteralToken(node) ||
		ts.isJsxText(node) ||
		opaqueType(ts, node)
	) {
		// Keep every literal line, including blank lines, but never interpret data
		// as regex syntax, template branches, comments or JSX control-flow words.
		return `"0${"\n".repeat(text.split("\n").length - 1)}"`;
	}
	return text;
}

function collectFunctions(ts, tree) {
	const functions = [];
	const scope = (node, parent) => {
		if (!ts.isFunctionLike(node) || !node.body) return parent;
		// Preserve the parent's declaration line without counting a nested body twice.
		if (parent) appendToken(parent, tree, node.getStart(tree), "0");
		const entry = functionEntry(node, tree);
		functions.push(entry);
		return entry;
	};
	const visit = (node, parent) => {
		const owner = scope(node, parent);
		if (node.kind <= ts.SyntaxKind.LastToken || opaqueType(ts, node)) {
			if (owner && node.end > node.getStart(tree)) {
				appendToken(owner, tree, node.getStart(tree), tokenText(ts, node, tree));
			}
			return;
		}
		for (const child of node.getChildren(tree)) {
			if (child.end > node.getStart(tree)) visit(child, owner);
		}
	};
	visit(tree);
	return functions.map((entry) => ({ ...entry, tokens: entry.tokens.map((token) => token[1]) }));
}

export function metricSource(ts, root, path) {
	if (path.endsWith(".py")) return { path };
	const source = readFileSync(safePath(root, path), "utf8");
	const tree = ts.createSourceFile(analyzerPath(path), source, ts.ScriptTarget.Latest, true);
	if (tree.parseDiagnostics.length) throw new Error(`Cannot measure invalid JS/TS syntax: ${path}`);
	// Lizard 1.24's object reader treats comparisons as generic parameters and
	// can consume adjacent functions. Its declaration reader also loses defaults.
	// Supply AST-owned tokens instead: literal data stays opaque, while defaults,
	// template interpolations and nested functions retain their executable tokens.
	return { path, source, functions: collectFunctions(ts, tree) };
}
