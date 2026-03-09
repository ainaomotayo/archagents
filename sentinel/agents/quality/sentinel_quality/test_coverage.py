"""Test coverage gap detection — flags new source files without corresponding test files."""

from __future__ import annotations

import os
from dataclasses import dataclass

from sentinel_agents.types import DiffFile


@dataclass
class CoverageGap:
    """A source file that has no corresponding test file in the diff."""

    source_file: str
    expected_test_patterns: list[str]
    language: str


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
            gaps.append(
                CoverageGap(
                    source_file=path,
                    expected_test_patterns=sorted(set(expected)),
                    language=diff_file.language,
                )
            )

    return gaps
