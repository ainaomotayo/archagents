"""Stylometric analysis for AI-generated code detection.

Provides token entropy and naming uniformity analysis. AI-generated code tends to
have lower entropy (more predictable token distribution) and higher naming uniformity
(very consistent naming conventions).
"""

from __future__ import annotations

import math
import re
from collections import Counter

# Pattern matching identifiers (variable/function names) in code
_IDENTIFIER_RE = re.compile(r"\b([a-zA-Z_][a-zA-Z0-9_]*)\b")

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


def analyze_entropy(code: str) -> float:
    """Calculate Shannon entropy of tokens in the code.

    Returns a value >= 0.0. Lower entropy suggests more predictable/templated code,
    which is common in AI-generated output. Typical ranges:
    - AI-generated: 3.0 - 4.5
    - Human-written: 4.5 - 7.0
    - Empty/trivial: 0.0
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
    AI-generated code tends to score closer to 1.0 because it consistently uses
    one naming convention. Human code often mixes conventions.

    Returns 0.0 for code with fewer than 3 unique identifiers (insufficient data).
    """
    identifiers = _IDENTIFIER_RE.findall(code)
    # Filter out keywords and very short names (single char)
    user_names = [name for name in identifiers if name not in _KEYWORDS and len(name) > 1]

    unique_names = set(user_names)
    if len(unique_names) < 3:
        return 0.0

    styles = [_classify_naming_style(name) for name in unique_names]
    style_counts = Counter(styles)
    dominant_count = style_counts.most_common(1)[0][1]

    return dominant_count / len(unique_names)
