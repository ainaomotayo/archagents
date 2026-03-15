"""Test coverage gap detection — flags new source files without corresponding test files.

Enhanced with import graph analysis via tree-sitter to detect which functions
in source files are actually exercised by existing test files in the diff.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

from sentinel_agents.types import DiffFile


@dataclass
class CoverageGap:
    """A source file that has no corresponding test file in the diff."""

    source_file: str
    expected_test_patterns: list[str]
    language: str
    exported_functions: list[str] = field(default_factory=list)
    tested_functions: list[str] = field(default_factory=list)

    @property
    def untested_functions(self) -> list[str]:
        """Functions exported but not referenced in any test file."""
        return [f for f in self.exported_functions if f not in self.tested_functions]


# File extensions that represent testable source code.
_SOURCE_EXTENSIONS = {
    ".py",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".mjs",
    ".mts",
}

# Patterns that indicate a file is already a test file.
_TEST_INDICATORS = (
    "test_",
    "_test.",
    ".test.",
    ".spec.",
    "tests/",
    "test/",
    "__tests__/",
    "conftest",
)


def _is_source_file(path: str) -> bool:
    """Return True if the path looks like a testable source file."""
    _, ext = os.path.splitext(path)
    return ext in _SOURCE_EXTENSIONS


def _is_test_file(path: str) -> bool:
    """Return True if the path looks like it is already a test file."""
    basename = os.path.basename(path).lower()
    path_lower = path.lower()
    return any(indicator in basename or indicator in path_lower for indicator in _TEST_INDICATORS)


def _expected_test_paths(source_path: str) -> list[str]:
    """Generate expected test file patterns for a given source path.

    For example:
        src/utils/parser.py  -> [test_parser.py, parser_test.py]
        src/utils/parser.ts  -> [parser.test.ts, parser.spec.ts]
    """
    dirname = os.path.dirname(source_path)
    basename = os.path.basename(source_path)
    name, ext = os.path.splitext(basename)

    patterns: list[str] = []
    if ext == ".py":
        patterns.append(f"test_{name}.py")
        patterns.append(f"{name}_test.py")
    elif ext in (".js", ".ts", ".jsx", ".tsx", ".mjs", ".mts"):
        patterns.append(f"{name}.test{ext}")
        patterns.append(f"{name}.spec{ext}")
    else:
        return []

    # Also look in tests/ and __tests__/ directories relative to the source
    result: list[str] = []
    for pat in patterns:
        result.append(pat)
        result.append(os.path.join(dirname, pat))
        result.append(os.path.join(dirname, "tests", pat))
        result.append(os.path.join(dirname, "__tests__", pat))
        # Common pattern: tests/ at project root
        parts = source_path.split("/")
        if len(parts) > 1:
            result.append(os.path.join("tests", pat))
    return result


# Languages supported by tree-sitter for function extraction
_AST_LANGUAGES = {
    "python", "javascript", "typescript", "js", "ts", "jsx", "tsx",
    "go", "rust", "java", "ruby", "c", "cpp",
}


def _extract_function_names(code: str, language: str) -> list[str]:
    """Extract top-level function names from source code using tree-sitter.

    Falls back to regex extraction for unsupported languages.
    """
    lang = language.lower()
    if lang in _AST_LANGUAGES:
        try:
            from agent_core.analysis.treesitter import parse_code, extract_functions
            root = parse_code(code, lang)
            return [fn.name for fn in extract_functions(root, lang)]
        except Exception:
            pass

    # Regex fallback
    names: list[str] = []
    for pattern in [
        r"def\s+(\w+)\s*\(",         # Python
        r"function\s+(\w+)\s*\(",     # JS
        r"(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>",  # JS arrow
        r"func\s+(\w+)\s*\(",         # Go
        r"fn\s+(\w+)\s*[<(]",         # Rust
    ]:
        names.extend(re.findall(pattern, code))
    return names


def _extract_imports_from_test(code: str, language: str) -> set[str]:
    """Extract imported names from a test file to determine what it tests."""
    imported: set[str] = set()
    lang = language.lower()

    if lang == "python":
        # from module import name1, name2
        for m in re.finditer(r"from\s+\S+\s+import\s+(.+)", code):
            for name in m.group(1).split(","):
                name = name.strip().split(" as ")[0].strip()
                if name:
                    imported.add(name)
        # import module  (less useful but captures it)
        for m in re.finditer(r"^import\s+(\S+)", code, re.MULTILINE):
            imported.add(m.group(1).split(".")[-1])
    elif lang in ("javascript", "typescript", "js", "ts", "jsx", "tsx"):
        # import { name1, name2 } from '...'
        for m in re.finditer(r"import\s*\{([^}]+)\}\s*from", code):
            for name in m.group(1).split(","):
                name = name.strip().split(" as ")[0].strip()
                if name:
                    imported.add(name)
        # const { name1, name2 } = require('...')
        for m in re.finditer(r"(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require", code):
            for name in m.group(1).split(","):
                name = name.strip()
                if name:
                    imported.add(name)
    elif lang == "go":
        # Function calls in test: functionName(
        for m in re.finditer(r"(\w+)\s*\(", code):
            imported.add(m.group(1))

    return imported


def _get_added_code(diff_file: DiffFile) -> str:
    """Reconstruct added code lines from hunks."""
    lines: list[str] = []
    for hunk in diff_file.hunks:
        for line in hunk.content.splitlines():
            if line.startswith("+") and not line.startswith("+++"):
                lines.append(line[1:])
            elif not line.startswith("-"):
                lines.append(line)
    return "\n".join(lines)


def find_coverage_gaps(files: list[DiffFile]) -> list[CoverageGap]:
    """Check if new source files in the diff have corresponding test files.

    Compares source files against all file paths present in the same diff to
    determine if a test file exists for each source file.

    Args:
        files: List of DiffFile objects from a DiffEvent.

    Returns:
        List of CoverageGap instances for source files lacking test coverage.
    """
    # Collect all file paths in the diff for lookup
    all_paths = {f.path for f in files}
    all_basenames = {os.path.basename(f.path).lower() for f in files}

    # Extract imported names from all test files for cross-reference
    test_imports: set[str] = set()
    for diff_file in files:
        if _is_test_file(diff_file.path) and _is_source_file(diff_file.path):
            code = _get_added_code(diff_file)
            test_imports |= _extract_imports_from_test(code, diff_file.language)

    gaps: list[CoverageGap] = []

    for diff_file in files:
        path = diff_file.path
        if not _is_source_file(path):
            continue
        if _is_test_file(path):
            continue

        expected = _expected_test_paths(path)
        expected_basenames = {os.path.basename(p).lower() for p in expected}

        # Check if any expected test file is present in the diff
        has_test = bool(expected_basenames & all_basenames) or bool(set(expected) & all_paths)

        if not has_test:
            # Extract exported functions for richer gap reporting
            code = _get_added_code(diff_file)
            exported = _extract_function_names(code, diff_file.language)
            tested = [fn for fn in exported if fn in test_imports]

            gaps.append(
                CoverageGap(
                    source_file=path,
                    expected_test_patterns=sorted(set(expected)),
                    language=diff_file.language,
                    exported_functions=exported,
                    tested_functions=tested,
                )
            )

    return gaps
