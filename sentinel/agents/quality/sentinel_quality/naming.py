"""Naming consistency analysis — detects mixed naming conventions in code."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum


class NamingStyle(Enum):
    """Common identifier naming conventions."""

    SNAKE_CASE = "snake_case"
    CAMEL_CASE = "camelCase"
    PASCAL_CASE = "PascalCase"
    UPPER_SNAKE = "UPPER_SNAKE"
    UNKNOWN = "unknown"


@dataclass
class NamingResult:
    """Result of naming consistency analysis on a code snippet."""

    identifiers: dict[str, NamingStyle] = field(default_factory=dict)
    dominant_style: NamingStyle = NamingStyle.UNKNOWN
    consistency_score: float = 1.0
    style_counts: dict[NamingStyle, int] = field(default_factory=dict)


# Regex to extract identifiers from typical code patterns.
# Matches: variable assignments, function/method defs, const/let/var declarations.
_PYTHON_IDENT_RE = re.compile(
    r"""
    (?:^|\s)def\s+([a-zA-Z_]\w*)          # function definitions
    | (?:^|\s)class\s+([a-zA-Z_]\w*)       # class definitions
    | ^([a-zA-Z_]\w*)\s*=                   # variable assignments at start of line
    | ^\s+([a-zA-Z_]\w*)\s*=               # indented variable assignments
    """,
    re.MULTILINE | re.VERBOSE,
)

_JS_IDENT_RE = re.compile(
    r"""
    (?:function|async\s+function)\s+([a-zA-Z_$]\w*)   # function declarations
    | (?:const|let|var)\s+([a-zA-Z_$]\w*)              # variable declarations
    | class\s+([a-zA-Z_$]\w*)                          # class declarations
    | ([a-zA-Z_$]\w*)\s*[=:]\s*(?:function|\(|async)   # method/arrow function
    """,
    re.MULTILINE | re.VERBOSE,
)

# Single-character or dunder names that should be ignored.
_SKIP_NAMES = {"_", "__", "self", "cls", "args", "kwargs"}


def classify_style(name: str) -> NamingStyle:
    """Classify an identifier's naming style.

    Args:
        name: The identifier string.

    Returns:
        The detected NamingStyle.
    """
    if not name or len(name) <= 1:
        return NamingStyle.UNKNOWN

    # Skip dunder methods/attributes
    if name.startswith("__") and name.endswith("__"):
        return NamingStyle.UNKNOWN

    # UPPER_SNAKE: all uppercase with underscores (e.g. MAX_SIZE, HTTP_OK)
    if re.fullmatch(r"[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*", name):
        return NamingStyle.UPPER_SNAKE

    # snake_case: lowercase with underscores (e.g. my_var, get_data)
    if re.fullmatch(r"[a-z][a-z0-9]*(?:_[a-z0-9]+)+", name):
        return NamingStyle.SNAKE_CASE

    # Also treat single lowercase word as snake_case (compatible)
    if re.fullmatch(r"[a-z][a-z0-9]*", name):
        return NamingStyle.SNAKE_CASE

    # PascalCase: starts with uppercase, has mixed case, no underscores
    if re.fullmatch(r"[A-Z][a-zA-Z0-9]*", name) and any(c.islower() for c in name):
        return NamingStyle.PASCAL_CASE

    # camelCase: starts with lowercase, has at least one uppercase letter, no underscores
    if re.fullmatch(r"[a-z][a-zA-Z0-9]*", name) and any(c.isupper() for c in name):
        return NamingStyle.CAMEL_CASE

    return NamingStyle.UNKNOWN


def _extract_identifiers(code: str, language: str) -> list[str]:
    """Extract identifier names from source code.

    Args:
        code: Source code text.
        language: Programming language (python, javascript, typescript, etc.).

    Returns:
        List of identifier name strings.
    """
    lang = language.lower()
    if lang in ("python", "py"):
        pattern = _PYTHON_IDENT_RE
    elif lang in ("javascript", "typescript", "js", "ts", "jsx", "tsx", "mjs", "mts"):
        pattern = _JS_IDENT_RE
    else:
        pattern = _PYTHON_IDENT_RE  # fallback

    identifiers: list[str] = []
    for match in pattern.finditer(code):
        # Each group in the alternation — pick the one that matched
        for group in match.groups():
            if group and group not in _SKIP_NAMES:
                identifiers.append(group)
    return identifiers


def analyze_naming_consistency(code: str, language: str) -> NamingResult:
    """Analyze naming consistency of identifiers in a code snippet.

    Extracts identifiers, classifies each into a naming style, and computes
    a consistency score where 1.0 means all identifiers use the same style
    and 0.0 means completely mixed.

    Args:
        code: Source code text.
        language: Programming language name.

    Returns:
        NamingResult with identifiers, dominant style, and consistency score.
    """
    identifiers = _extract_identifiers(code, language)
    result = NamingResult()

    if not identifiers:
        # No identifiers found — neutral result
        result.consistency_score = 1.0
        result.dominant_style = NamingStyle.UNKNOWN
        return result

    # Classify each identifier
    style_counts: dict[NamingStyle, int] = {}
    classified: dict[str, NamingStyle] = {}

    for name in identifiers:
        style = classify_style(name)
        if style == NamingStyle.UNKNOWN:
            continue
        classified[name] = style
        style_counts[style] = style_counts.get(style, 0) + 1

    result.identifiers = classified
    result.style_counts = style_counts

    if not classified:
        # All identifiers were UNKNOWN — neutral
        result.consistency_score = 1.0
        result.dominant_style = NamingStyle.UNKNOWN
        return result

    # Find dominant style (excluding UPPER_SNAKE which is conventionally used for constants)
    # Constants in UPPER_SNAKE are expected in any codebase, so we don't penalize them.
    non_const_counts = {
        s: c for s, c in style_counts.items() if s != NamingStyle.UPPER_SNAKE
    }

    if not non_const_counts:
        # Only constants — perfectly consistent
        result.consistency_score = 1.0
        result.dominant_style = NamingStyle.UPPER_SNAKE
        return result

    total_non_const = sum(non_const_counts.values())
    dominant_style = max(non_const_counts, key=non_const_counts.get)  # type: ignore[arg-type]
    dominant_count = non_const_counts[dominant_style]

    result.dominant_style = dominant_style
    result.consistency_score = dominant_count / total_non_const if total_non_const > 0 else 1.0

    return result
