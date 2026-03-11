"""Cyclomatic complexity analysis using tree-sitter AST (30+ languages).

Falls back to regex-based analysis for unsupported languages.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Tree-sitter languages supported by agent_core
_AST_LANGUAGES = {
    "python", "javascript", "typescript", "js", "ts", "jsx", "tsx",
    "go", "rust", "java", "ruby", "c", "cpp", "cc",
}


@dataclass
class ComplexityResult:
    """Complexity measurement for a single function."""

    function_name: str
    line_start: int
    line_end: int
    complexity: int


def calculate_complexity(code: str, language: str) -> list[ComplexityResult]:
    """Calculate cyclomatic complexity for each function in the given code.

    Uses tree-sitter AST for supported languages, falls back to regex for others.
    """
    lang = language.lower()

    if lang in _AST_LANGUAGES:
        return _calculate_ast(code, lang)

    # Fallback: regex for Python/JS only
    if lang in ("python",):
        return _calculate_regex_python(code)
    if lang in ("javascript", "typescript", "js", "ts", "jsx", "tsx"):
        return _calculate_regex_js(code)
    return []


def _calculate_ast(code: str, language: str) -> list[ComplexityResult]:
    """Use agent_core tree-sitter for AST-based complexity."""
    from agent_core.analysis.complexity import calculate_complexity as ast_complexity
    from agent_core.analysis.complexity import ComplexityResult as AstResult

    # Normalize language aliases for agent_core
    lang_map = {"js": "javascript", "ts": "typescript", "jsx": "javascript", "tsx": "tsx", "cc": "cpp"}
    normalized = lang_map.get(language, language)

    results = ast_complexity(code, normalized)
    return [
        ComplexityResult(
            function_name=r.function_name,
            line_start=r.line_start,
            line_end=r.line_end,
            complexity=r.complexity,
        )
        for r in results
    ]


# --- Regex fallback (preserved for backward compatibility) ---

_PYTHON_DECISION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bif\b"),
    re.compile(r"\belif\b"),
    re.compile(r"\bfor\b"),
    re.compile(r"\bwhile\b"),
    re.compile(r"\band\b"),
    re.compile(r"\bor\b"),
    re.compile(r"\bexcept\b"),
    re.compile(r"\bcase\b"),
]

_JS_DECISION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"(?<!\belse\s)\bif\b"),
    re.compile(r"\belse\s+if\b"),
    re.compile(r"\bfor\b"),
    re.compile(r"\bwhile\b"),
    re.compile(r"&&"),
    re.compile(r"\|\|"),
    re.compile(r"\bcatch\b"),
    re.compile(r"\bcase\b"),
    re.compile(r"\?"),
]

_PYTHON_FUNC_RE = re.compile(
    r"^(?P<indent>[ \t]*)(?:async\s+)?def\s+(?P<name>\w+)\s*\(",
    re.MULTILINE,
)

_JS_FUNC_RE = re.compile(
    r"(?:"
    r"(?:async\s+)?function\s+(?P<name1>\w+)\s*\("
    r"|"
    r"(?:(?:export\s+)?(?:const|let|var)\s+)?(?P<name2>\w+)\s*(?:=\s*)?(?:async\s+)?\([^)]*\)\s*(?:=>|{)"
    r"|"
    r"(?:async\s+)?(?P<name3>\w+)\s*\([^)]*\)\s*\{"
    r")",
    re.MULTILINE,
)

_JS_KEYWORDS = frozenset({
    "if", "else", "for", "while", "switch", "catch", "return",
    "throw", "new", "delete", "typeof", "void", "await", "do",
})


def _count_decision_points(body: str, patterns: list[re.Pattern[str]]) -> int:
    count = 0
    for pat in patterns:
        count += len(pat.findall(body))
    return count


def _extract_python_function_body(lines: list[str], func_start_idx: int, indent: str) -> int:
    body_indent_len = len(indent) + 1
    end_idx = func_start_idx + 1
    for i in range(func_start_idx + 1, len(lines)):
        stripped = lines[i].strip()
        if stripped == "":
            end_idx = i + 1
            continue
        current_indent = len(lines[i]) - len(lines[i].lstrip())
        if current_indent >= body_indent_len:
            end_idx = i + 1
        else:
            break
    return end_idx


def _extract_js_function_body(lines: list[str], func_start_idx: int) -> int:
    brace_count = 0
    started = False
    for i in range(func_start_idx, len(lines)):
        for ch in lines[i]:
            if ch == "{":
                brace_count += 1
                started = True
            elif ch == "}":
                brace_count -= 1
                if started and brace_count <= 0:
                    return i + 1
    return len(lines)


def _calculate_regex_python(code: str) -> list[ComplexityResult]:
    cleaned = re.sub(r"#.*$", "", code, flags=re.MULTILINE)
    cleaned = re.sub(r'"""[\s\S]*?"""', '""', cleaned)
    cleaned = re.sub(r"'''[\s\S]*?'''", "''", cleaned)
    lines = cleaned.split("\n")
    results = []
    for m in _PYTHON_FUNC_RE.finditer(cleaned):
        func_name = m.group("name")
        indent = m.group("indent")
        start_line = cleaned[: m.start()].count("\n")
        end_idx = _extract_python_function_body(lines, start_line, indent)
        body = "\n".join(lines[start_line + 1 : end_idx])
        complexity = 1 + _count_decision_points(body, _PYTHON_DECISION_PATTERNS)
        results.append(ComplexityResult(func_name, start_line + 1, end_idx, complexity))
    return results


def _calculate_regex_js(code: str) -> list[ComplexityResult]:
    cleaned = re.sub(r"//.*$", "", code, flags=re.MULTILINE)
    cleaned = re.sub(r"/\*[\s\S]*?\*/", "", cleaned)
    cleaned = re.sub(r"`[^`]*`", '""', cleaned)
    lines = cleaned.split("\n")
    results = []
    for m in _JS_FUNC_RE.finditer(cleaned):
        func_name = m.group("name1") or m.group("name2") or m.group("name3") or "anonymous"
        if func_name in _JS_KEYWORDS:
            continue
        start_line = cleaned[: m.start()].count("\n")
        end_idx = _extract_js_function_body(lines, start_line)
        body = "\n".join(lines[start_line + 1 : end_idx])
        complexity = 1 + _count_decision_points(body, _JS_DECISION_PATTERNS)
        results.append(ComplexityResult(func_name, start_line + 1, end_idx, complexity))
    return results
