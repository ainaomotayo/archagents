"""Stylometric analysis for AI-generated code detection.

Provides token entropy, AST structure entropy, and naming uniformity analysis.
Uses tree-sitter AST (via agent_core) for supported languages, with regex fallback.

AI-generated code tends to have lower entropy and higher naming uniformity.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass

# Pattern matching identifiers (variable/function names) in code
_IDENTIFIER_RE = re.compile(r"\b([a-zA-Z_][a-zA-Z0-9_]*)\b")

# Languages supported by agent_core tree-sitter
_AST_LANGUAGES = {
    "python", "javascript", "typescript", "js", "ts", "jsx", "tsx",
    "go", "rust", "java", "ruby", "c", "cpp", "cc",
}

# Common keywords/builtins to exclude from naming analysis
_KEYWORDS = frozenset({
    "if", "else", "elif", "for", "while", "return", "import", "from", "def", "class",
    "try", "except", "finally", "with", "as", "yield", "raise", "pass", "break",
    "continue", "and", "or", "not", "in", "is", "None", "True", "False", "self",
    "lambda", "global", "nonlocal", "assert", "del", "async", "await",
    # Common builtins
    "print", "len", "range", "int", "str", "float", "list", "dict", "set", "tuple",
    "bool", "type", "isinstance", "super", "open", "map", "filter", "zip", "enumerate",
    # Common JS/TS keywords
    "var", "let", "const", "function", "new", "this", "typeof", "instanceof",
    "null", "undefined", "void", "throw", "catch", "switch", "case", "default",
    "export", "require", "module", "console", "log",
})


@dataclass
class ASTEntropy:
    """Combined AST-aware entropy signal."""

    token_entropy: float
    structure_entropy: float
    naming_entropy: float
    combined: float


def analyze_entropy(code: str) -> float:
    """Calculate Shannon entropy of tokens in the code.

    Returns a value >= 0.0. Lower entropy suggests more predictable/templated code.
    """
    tokens = _IDENTIFIER_RE.findall(code)
    if not tokens:
        return 0.0

    total = len(tokens)
    counts = Counter(tokens)
    entropy = 0.0
    for count in counts.values():
        probability = count / total
        if probability > 0:
            entropy -= probability * math.log2(probability)
    return entropy


def analyze_ast_entropy(code: str, language: str) -> ASTEntropy:
    """Calculate AST-aware entropy combining structure, naming, and token signals.

    Uses tree-sitter AST for supported languages, falls back to token-only analysis.
    """
    token_entropy = analyze_entropy(code)
    lang = language.lower()

    if lang in _AST_LANGUAGES:
        try:
            structure_entropy = _compute_structure_entropy(code, lang)
            naming_entropy = _compute_naming_entropy(code, lang)
        except Exception:
            structure_entropy = token_entropy
            naming_entropy = token_entropy
    else:
        structure_entropy = token_entropy
        naming_entropy = token_entropy

    combined = (
        0.4 * token_entropy
        + 0.35 * structure_entropy
        + 0.25 * naming_entropy
    )
    return ASTEntropy(
        token_entropy=token_entropy,
        structure_entropy=structure_entropy,
        naming_entropy=naming_entropy,
        combined=combined,
    )


def _compute_structure_entropy(code: str, language: str) -> float:
    """Measure AST tree depth/branching diversity."""
    from agent_core.analysis.treesitter import parse_code

    lang_map = {"js": "javascript", "ts": "typescript", "jsx": "javascript", "cc": "cpp"}
    normalized = lang_map.get(language, language)

    root = parse_code(code, normalized)
    node_types: list[str] = []
    _collect_node_types(root, node_types)

    if not node_types:
        return 0.0

    total = len(node_types)
    counts = Counter(node_types)
    entropy = 0.0
    for count in counts.values():
        p = count / total
        if p > 0:
            entropy -= p * math.log2(p)
    return entropy


def _collect_node_types(node: object, out: list[str]) -> None:
    """Walk AST and collect all node types."""
    out.append(node.type)  # type: ignore[union-attr]
    for child in node.children:  # type: ignore[union-attr]
        _collect_node_types(child, out)


def _compute_naming_entropy(code: str, language: str) -> float:
    """Measure identifier naming pattern entropy via AST."""
    from agent_core.analysis.treesitter import parse_code, extract_identifiers

    lang_map = {"js": "javascript", "ts": "typescript", "jsx": "javascript", "cc": "cpp"}
    normalized = lang_map.get(language, language)

    root = parse_code(code, normalized)
    idents = extract_identifiers(root)
    names = [i.name for i in idents if i.name not in _KEYWORDS and len(i.name) > 1]

    if not names:
        return 0.0

    # Classify naming styles and compute entropy
    styles = [_classify_naming_style(n) for n in set(names)]
    total = len(styles)
    counts = Counter(styles)
    entropy = 0.0
    for count in counts.values():
        p = count / total
        if p > 0:
            entropy -= p * math.log2(p)
    return entropy


def _classify_naming_style(name: str) -> str:
    """Classify an identifier's naming style."""
    if name.isupper():
        return "UPPER_SNAKE"
    if "_" in name:
        if name[0].isupper():
            return "Upper_Snake"
        return "lower_snake"
    if name[0].isupper():
        return "PascalCase"
    if any(c.isupper() for c in name[1:]):
        return "camelCase"
    return "lowercase"


def analyze_naming_uniformity(code: str) -> float:
    """Measure how uniform variable naming patterns are in the code.

    Returns 0.0 (inconsistent, many styles) to 1.0 (very uniform, single style).
    Returns 0.0 for code with fewer than 3 unique identifiers (insufficient data).
    """
    identifiers = _IDENTIFIER_RE.findall(code)
    user_names = [name for name in identifiers if name not in _KEYWORDS and len(name) > 1]

    unique_names = set(user_names)
    if len(unique_names) < 3:
        return 0.0

    styles = [_classify_naming_style(name) for name in unique_names]
    style_counts = Counter(styles)
    dominant_count = style_counts.most_common(1)[0][1]

    return dominant_count / len(unique_names)
