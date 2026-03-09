"""Cyclomatic complexity analysis for Python and JavaScript/TypeScript code."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class ComplexityResult:
    """Complexity measurement for a single function."""

    function_name: str
    line_start: int
    line_end: int
    complexity: int


# Decision-point keywords that increase cyclomatic complexity by 1 each.
_PYTHON_DECISION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bif\b"),
    re.compile(r"\belif\b"),
    re.compile(r"\bfor\b"),
    re.compile(r"\bwhile\b"),
    re.compile(r"\band\b"),
    re.compile(r"\bor\b"),
    re.compile(r"\bexcept\b"),
    re.compile(r"\bcase\b"),
    # Ternary: <expr> if <cond> else <expr>  — already counted by \bif\b above
]

_JS_DECISION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"(?<!\belse\s)\bif\b"),  # if but not else if (counted separately)
    re.compile(r"\belse\s+if\b"),
    re.compile(r"\bfor\b"),
    re.compile(r"\bwhile\b"),
    re.compile(r"&&"),
    re.compile(r"\|\|"),
    re.compile(r"\bcatch\b"),
    re.compile(r"\bcase\b"),
    re.compile(r"\?"),  # ternary operator
]

# Function definition patterns
_PYTHON_FUNC_RE = re.compile(
    r"^(?P<indent>[ \t]*)(?:async\s+)?def\s+(?P<name>\w+)\s*\(",
    re.MULTILINE,
)

_JS_FUNC_RE = re.compile(
    r"(?:"
    # function declarations: function foo(
    r"(?:async\s+)?function\s+(?P<name1>\w+)\s*\("
    r"|"
    # arrow / method: foo = (...) => or foo(...) {
    r"(?:(?:export\s+)?(?:const|let|var)\s+)?(?P<name2>\w+)\s*(?:=\s*)?(?:async\s+)?\([^)]*\)\s*(?:=>|{)"
    r"|"
    # class method: name(...) {
    r"(?:async\s+)?(?P<name3>\w+)\s*\([^)]*\)\s*\{"
    r")",
    re.MULTILINE,
)

_JS_KEYWORDS = frozenset({
    "if", "else", "for", "while", "switch", "catch", "return",
    "throw", "new", "delete", "typeof", "void", "await", "do",
})


def _strip_comments_python(code: str) -> str:
    """Remove comments and string literals to avoid false positives."""
    # Remove single-line comments
    code = re.sub(r"#.*$", "", code, flags=re.MULTILINE)
    # Remove triple-quoted strings
    code = re.sub(r'"""[\s\S]*?"""', '""', code)
    code = re.sub(r"'''[\s\S]*?'''", "''", code)
    return code


def _strip_comments_js(code: str) -> str:
    """Remove comments and string literals to avoid false positives."""
    # Remove single-line comments
    code = re.sub(r"//.*$", "", code, flags=re.MULTILINE)
    # Remove block comments
    code = re.sub(r"/\*[\s\S]*?\*/", "", code)
    # Remove template literals (simplified)
    code = re.sub(r"`[^`]*`", '""', code)
    return code


def _count_decision_points(body: str, patterns: list[re.Pattern[str]]) -> int:
    """Count the number of decision points in a code body."""
    count = 0
    for pat in patterns:
        count += len(pat.findall(body))
    return count


def _extract_python_function_body(lines: list[str], func_start_idx: int, indent: str) -> int:
    """Return the end line index (exclusive) for a Python function starting at func_start_idx."""
    body_indent_len = len(indent) + 1  # must be indented more than the def
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
    """Return the end line index (exclusive) for a JS/TS function by counting braces."""
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


def calculate_complexity(code: str, language: str) -> list[ComplexityResult]:
    """Calculate cyclomatic complexity for each function in the given code.

    Args:
        code: Source code to analyze.
        language: Programming language — "python", "javascript", "typescript", or "js".

    Returns:
        A list of ComplexityResult, one per function found.
    """
    results: list[ComplexityResult] = []
    lang = language.lower()

    if lang == "python":
        cleaned = _strip_comments_python(code)
        lines = cleaned.split("\n")
        for m in _PYTHON_FUNC_RE.finditer(cleaned):
            func_name = m.group("name")
            indent = m.group("indent")
            start_line = cleaned[: m.start()].count("\n")
            end_idx = _extract_python_function_body(lines, start_line, indent)
            body = "\n".join(lines[start_line + 1 : end_idx])
            complexity = 1 + _count_decision_points(body, _PYTHON_DECISION_PATTERNS)
            results.append(
                ComplexityResult(
                    function_name=func_name,
                    line_start=start_line + 1,  # 1-based
                    line_end=end_idx,
                    complexity=complexity,
                )
            )
    elif lang in ("javascript", "typescript", "js", "ts", "jsx", "tsx"):
        cleaned = _strip_comments_js(code)
        lines = cleaned.split("\n")
        for m in _JS_FUNC_RE.finditer(cleaned):
            func_name = m.group("name1") or m.group("name2") or m.group("name3") or "anonymous"
            if func_name in _JS_KEYWORDS:
                continue
            start_line = cleaned[: m.start()].count("\n")
            end_idx = _extract_js_function_body(lines, start_line)
            body = "\n".join(lines[start_line + 1 : end_idx])
            complexity = 1 + _count_decision_points(body, _JS_DECISION_PATTERNS)
            results.append(
                ComplexityResult(
                    function_name=func_name,
                    line_start=start_line + 1,
                    line_end=end_idx,
                    complexity=complexity,
                )
            )

    return results
