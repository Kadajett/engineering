"""Lizard 1.24.0 counters with AST-confirmed JS/TS function ownership.

Python retains its upstream reader. JS/TS tokens and arity come from the
validated TypeScript AST; Lizard still supplies NLOC and condition counting.
"""

import ast
import importlib.metadata
import json
import pathlib
import sys
from collections import Counter

import lizard

from lizard_languages.typescript import TypeScriptReader
VERSION = "1.24.0"


def analyze_function(entry, path):
    context = lizard.FileInfoBuilder(path)
    context.current_line = entry["start"]
    context.push_new_function(entry["name"])
    context.current_function.nloc = 0
    reader = TypeScriptReader(context)
    tokens = (token for text in entry["tokens"]
              for token in reader.generate_tokens(text))
    tokens = lizard.line_counter(lizard.preprocessing(tokens, reader), reader)
    for _ in lizard.condition_counter(tokens, reader):
        pass
    function = context.current_function
    return {
        "start": entry["start"],
        "end": entry["end"],
        "cyclomatic": function.cyclomatic_complexity,
        "nloc": function.nloc,
        "parameters": entry["parameters"],
    }


def analyze_javascript(entry, source):
    occurrences = Counter()
    functions = []
    for item in entry["functions"]:
        occurrences[item["name"]] += 1
        function = analyze_function(item, entry["path"])
        function["identity"] = [item["name"], occurrences[item["name"]]]
        functions.append(function)
    return {"path": entry["path"], "lines": len(source.splitlines()), "functions": functions}


def analyze(entry):
    path = entry["path"]
    source = entry.get("source")
    if source is None:
        source = pathlib.Path(path).read_text(encoding="utf-8")
    if "functions" in entry:
        return analyze_javascript(entry, source)
    if path.endswith(".py"):
        ast.parse(source, filename=path)
    suffix = pathlib.Path(path).suffix
    aliases = {".mts": ".ts", ".cts": ".ts", ".mjs": ".js", ".cjs": ".js", "": ".js"}
    name = str(pathlib.Path(path).with_suffix(aliases.get(suffix, suffix)))
    result = lizard.analyze_file.analyze_source_code(name, source)
    occurrences = Counter()
    functions = []
    for function in result.function_list:
        occurrences[function.long_name] += 1
        functions.append({
            "identity": [function.long_name, occurrences[function.long_name]],
            "start": function.start_line,
            "end": function.end_line,
            "cyclomatic": function.cyclomatic_complexity,
            "nloc": function.nloc,
            "parameters": function.parameter_count,
        })
    return {"path": path, "lines": len(source.splitlines()), "functions": functions}


def main():
    installed = importlib.metadata.version("lizard")
    if installed != VERSION:
        raise RuntimeError(f"Expected lizard {VERSION}, found {installed}")
    paths = json.load(sys.stdin)
    if not isinstance(paths, list) or not paths:
        raise ValueError("Expected a nonempty source-file manifest")
    print(json.dumps([analyze(path) for path in paths]))


if __name__ == "__main__":
    main()
