"""Tree-sitter AST parsing and extraction utilities."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import tree_sitter as ts


@dataclass
class FunctionNode:
    name: str
    line_start: int  # 1-based
    line_end: int  # 1-based
    body_text: str
    parameters: list[str] = field(default_factory=list)


@dataclass
class Comment:
    text: str
    line_start: int  # 1-based
    line_end: int  # 1-based


@dataclass
class Identifier:
    name: str
    line: int  # 1-based
    kind: str  # "function", "class", "variable", "parameter"


# Language detection from file extension
_EXT_TO_LANG: dict[str, str] = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".rb": "ruby",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
}

# Mapping from language name to tree-sitter language loader
_LANG_LOADERS: dict[str, Any] = {}


def _get_language(lang: str) -> ts.Language:
    """Get tree-sitter Language object for a language name."""
    if lang in ("js", "jsx"):
        lang = "javascript"
    elif lang in ("ts",):
        lang = "typescript"
    elif lang == "tsx":
        lang = "tsx"

    if lang not in _LANG_LOADERS:
        _LANG_LOADERS[lang] = _load_language(lang)
    return _LANG_LOADERS[lang]


def _load_language(lang: str) -> ts.Language:
    """Import and return tree-sitter Language for the given language."""
    if lang == "python":
        import tree_sitter_python as mod
    elif lang == "javascript":
        import tree_sitter_javascript as mod
    elif lang in ("typescript", "tsx"):
        import tree_sitter_typescript as mod

        if lang == "tsx":
            return ts.Language(mod.language_tsx())
        return ts.Language(mod.language_typescript())
    elif lang == "go":
        import tree_sitter_go as mod
    elif lang == "rust":
        import tree_sitter_rust as mod
    elif lang == "java":
        import tree_sitter_java as mod
    elif lang == "ruby":
        import tree_sitter_ruby as mod
    elif lang == "c" or lang == "cpp":
        import tree_sitter_c as mod
    else:
        raise ValueError(f"Unsupported language: {lang}")
    return ts.Language(mod.language())


def detect_language(file_path: str) -> str | None:
    """Detect language from file extension."""
    for ext, lang in _EXT_TO_LANG.items():
        if file_path.endswith(ext):
            return lang
    return None


def parse_code(code: str, language: str) -> ts.Node:
    """Parse code and return the root AST node."""
    lang = _get_language(language)
    parser = ts.Parser(lang)
    tree = parser.parse(code.encode("utf-8"))
    return tree.root_node


# Node types that represent function definitions per language
_FUNCTION_NODE_TYPES: dict[str, set[str]] = {
    "python": {"function_definition"},
    "javascript": {"function_declaration", "method_definition", "arrow_function"},
    "typescript": {"function_declaration", "method_definition", "arrow_function"},
    "tsx": {"function_declaration", "method_definition", "arrow_function"},
    "go": {"function_declaration", "method_declaration"},
    "rust": {"function_item"},
    "java": {"method_declaration", "constructor_declaration"},
    "ruby": {"method"},
    "c": {"function_definition"},
    "cpp": {"function_definition"},
}

_COMMENT_NODE_TYPES = {"comment", "line_comment", "block_comment"}


def extract_functions(root: ts.Node, language: str) -> list[FunctionNode]:
    """Extract all function/method definitions from the AST."""
    fn_types = _FUNCTION_NODE_TYPES.get(language, {"function_definition"})
    functions: list[FunctionNode] = []
    _walk_for_functions(root, fn_types, functions)
    return functions


def _walk_for_functions(
    node: ts.Node, fn_types: set[str], out: list[FunctionNode]
) -> None:
    if node.type in fn_types:
        name_node = node.child_by_field_name("name")
        name = name_node.text.decode("utf-8") if name_node else "<anonymous>"
        params: list[str] = []
        params_node = node.child_by_field_name("parameters")
        if params_node:
            for child in params_node.children:
                if child.type in ("identifier", "typed_parameter", "parameter"):
                    param_name = child.child_by_field_name("name")
                    if param_name:
                        params.append(param_name.text.decode("utf-8"))
                    elif child.type == "identifier":
                        params.append(child.text.decode("utf-8"))
        out.append(
            FunctionNode(
                name=name,
                line_start=node.start_point.row + 1,
                line_end=node.end_point.row + 1,
                body_text=node.text.decode("utf-8"),
                parameters=params,
            )
        )
    for child in node.children:
        _walk_for_functions(child, fn_types, out)


def extract_comments(root: ts.Node) -> list[Comment]:
    """Extract all comments from the AST."""
    comments: list[Comment] = []
    _walk_for_comments(root, comments)
    return comments


def _walk_for_comments(node: ts.Node, out: list[Comment]) -> None:
    if node.type in _COMMENT_NODE_TYPES:
        out.append(
            Comment(
                text=node.text.decode("utf-8"),
                line_start=node.start_point.row + 1,
                line_end=node.end_point.row + 1,
            )
        )
    for child in node.children:
        _walk_for_comments(child, out)


_IDENTIFIER_CONTEXTS: dict[str, str] = {
    "function_definition": "function",
    "function_declaration": "function",
    "method_definition": "function",
    "method_declaration": "function",
    "class_definition": "class",
    "class_declaration": "class",
    "variable_declarator": "variable",
    "assignment": "variable",
    "parameter": "parameter",
    "typed_parameter": "parameter",
}


def extract_identifiers(root: ts.Node) -> list[Identifier]:
    """Extract named identifiers with their context kind."""
    identifiers: list[Identifier] = []
    _walk_for_identifiers(root, identifiers)
    return identifiers


def _walk_for_identifiers(node: ts.Node, out: list[Identifier]) -> None:
    if node.type in _IDENTIFIER_CONTEXTS:
        name_node = node.child_by_field_name("name")
        if name_node:
            kind = _IDENTIFIER_CONTEXTS[node.type]
            out.append(
                Identifier(
                    name=name_node.text.decode("utf-8"),
                    line=name_node.start_point.row + 1,
                    kind=kind,
                )
            )
    for child in node.children:
        _walk_for_identifiers(child, out)
