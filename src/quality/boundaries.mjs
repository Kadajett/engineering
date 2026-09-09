import { readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { inside, matcher, safePath } from "./files.mjs";
import { aggregate, finding } from "./runtime.mjs";
import { projectForFile } from "./typescript.mjs";

function importSpecifier(ts, node) {
	const clause = node.importClause;
	if (clause?.isTypeOnly) return undefined;
	const bindings = clause?.namedBindings;
	if (
		!clause?.name &&
		bindings &&
		ts.isNamedImports(bindings) &&
		bindings.elements.length &&
		bindings.elements.every((item) => item.isTypeOnly)
	)
		return undefined;
	return node.moduleSpecifier;
}

function exportSpecifier(ts, node) {
	if (node.isTypeOnly) return undefined;
	const clause = node.exportClause;
	if (
		clause &&
		ts.isNamedExports(clause) &&
		clause.elements.length &&
		clause.elements.every((item) => item.isTypeOnly)
	)
		return undefined;
	return node.moduleSpecifier;
}

function importEqualsSpecifier(ts, node) {
	if (node.isTypeOnly || !ts.isExternalModuleReference(node.moduleReference)) return undefined;
	return node.moduleReference.expression;
}

function callSpecifier(ts, node) {
	const expression = node.expression;
	if (
		expression.kind === ts.SyntaxKind.ImportKeyword ||
		(ts.isIdentifier(expression) && expression.text === "require")
	)
		return node.arguments[0];
	return undefined;
}

function runtimeSpecifier(ts, node) {
	if (ts.isImportDeclaration(node)) return importSpecifier(ts, node);
	if (ts.isExportDeclaration(node)) return exportSpecifier(ts, node);
	if (ts.isImportEqualsDeclaration(node)) return importEqualsSpecifier(ts, node);
	if (ts.isCallExpression(node)) return callSpecifier(ts, node);
	return undefined;
}

function targets(context, file, specifier) {
	const { ts, root, settings } = context;
	const paths = [specifier];
	if (specifier.startsWith("."))
		paths.push(posix.normalize(posix.join(posix.dirname(file), specifier)));
	else if (specifier.startsWith("#")) paths.push(specifier.slice(1));
	const project = projectForFile(settings, root, file);
	if (project) {
		const resolved = ts.resolveModuleName(
			specifier,
			resolve(root, file),
			project.options,
			settings.system,
		).resolvedModule;
		if (resolved && !resolved.isExternalLibraryImport)
			paths.push(inside(root, resolved.resolvedFileName));
	}
	return paths.flatMap((path) => [path, path.replace(/\.[cm]?[jt]sx?$/, "")]);
}

function fileFindings(context, file, policies) {
	const { ts, root } = context;
	const relevant = policies.filter((policy) => policy.from(file));
	if (!relevant.length) return [];
	const source = ts.createSourceFile(
		file,
		readFileSync(safePath(root, file), "utf8"),
		ts.ScriptTarget.Latest,
		true,
	);
	if (source.parseDiagnostics.length) throw new Error(`Cannot parse boundary source: ${file}`);
	const findings = [];
	const visit = (node) => {
		const specifier = runtimeSpecifier(ts, node);
		if (specifier && ts.isStringLiteralLike(specifier)) {
			const candidates = targets(context, file, specifier.text);
			for (const policy of relevant) {
				if (candidates.some(policy.disallow) && !candidates.some(policy.allow)) {
					const line = source.getLineAndCharacterOfPosition(specifier.getStart(source)).line + 1;
					findings.push(
						finding({
							file,
							rule: "boundary/runtime-import",
							identity: [policy.identity, specifier.text],
							value: 1,
							limit: 0,
							message: `${file}:${line}: forbidden runtime import ${specifier.text}`,
						}),
					);
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return findings;
}

export function boundaryFindings(context, paths, boundaries) {
	const policies = boundaries.map((boundary) => ({
		identity: boundary,
		from: matcher([boundary.from]),
		disallow: matcher(boundary.disallow),
		allow: matcher(boundary.allow),
	}));
	return aggregate(
		paths
			.filter((path) => !path.endsWith(".py"))
			.flatMap((file) => fileFindings(context, file, policies)),
	);
}
