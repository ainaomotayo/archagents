"""Main QualityAgent — combines complexity, duplication, and test coverage analysis.

Supports 30+ languages via tree-sitter AST for complexity and naming,
with regex fallback for unsupported languages.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any

from sentinel_agents.base import BaseAgent
from sentinel_agents.types import Confidence, DiffEvent, DiffFile, Finding, Severity

from sentinel_quality.compliance_checks import (
    check_access_documentation,
    check_ai_documentation,
    check_ai_test_coverage,
    check_data_governance,
)
from sentinel_quality.complexity import calculate_complexity
from sentinel_quality.duplication import detect_duplicates
from sentinel_quality.naming import analyze_naming_consistency
from sentinel_quality.test_coverage import find_coverage_gaps

logger = logging.getLogger(__name__)


def _get_ast_cache(redis_client: Any = None):
    """Create a RedisCache for memoizing AST analysis results."""
    if redis_client is None:
        return None
    try:
        from agent_core.cache import RedisCache
        return RedisCache(redis_client, prefix="sentinel.ast_cache", default_ttl=3600)
    except Exception:
        return None

# Complexity thresholds
COMPLEXITY_HIGH = 15
COMPLEXITY_MEDIUM = 10

# Naming consistency threshold — below this triggers a finding
NAMING_CONSISTENCY_THRESHOLD = 0.5

# Languages supported for complexity analysis (tree-sitter + regex fallback)
_COMPLEXITY_LANGUAGES = {
    "python", "javascript", "typescript", "js", "ts", "jsx", "tsx",
    "go", "rust", "java", "ruby", "c", "cpp", "cc",
}

# Languages supported for naming analysis (tree-sitter + regex fallback)
_NAMING_LANGUAGES = {
    "python", "javascript", "typescript", "js", "ts", "jsx", "tsx",
    "go", "rust", "java", "ruby", "c", "cpp", "cc",
}


class QualityAgent(BaseAgent):
    name = "quality"
    version = "0.1.0"
    ruleset_version = "rules-2026.03.09-a"
    ruleset_hash = "sha256:quality-v1"

    def __init__(self, redis_client: Any = None) -> None:
        self._ast_cache = _get_ast_cache(redis_client)

    def _cache_key(self, code: str, lang: str, analysis: str) -> str:
        """Generate cache key for memoized AST analysis."""
        content_hash = hashlib.sha256(f"{code}:{lang}".encode()).hexdigest()[:16]
        return f"{analysis}:{lang}:{content_hash}"

    def _cached_complexity(self, code: str, lang: str):
        """Memoized complexity analysis."""
        if self._ast_cache:
            key = self._cache_key(code, lang, "complexity")
            cached = self._ast_cache.get_sync(key)
            if cached is not None:
                return cached
        results = calculate_complexity(code, lang)
        if self._ast_cache:
            self._ast_cache.set_sync(
                self._cache_key(code, lang, "complexity"),
                [{"function_name": r.function_name, "complexity": r.complexity,
                  "line_start": r.line_start, "line_end": r.line_end} for r in results],
            )
        return results

    def process(self, event: DiffEvent) -> list[Finding]:
        findings: list[Finding] = []

        # 1. Complexity analysis — per file
        findings.extend(self._analyze_complexity(event))

        # 2. Duplication detection — across all files
        findings.extend(self._analyze_duplication(event))

        # 3. Test coverage gap detection
        findings.extend(self._analyze_test_coverage(event))

        # 4. Naming consistency analysis — per file
        findings.extend(self._analyze_naming(event))

        # 5. NIST/HIPAA compliance checks
        findings.extend(check_ai_documentation(event.files))
        findings.extend(check_data_governance(event.files))
        findings.extend(check_ai_test_coverage(event.files))
        findings.extend(check_access_documentation(event.files))

        return findings

    def _analyze_complexity(self, event: DiffEvent) -> list[Finding]:
        findings: list[Finding] = []
        for diff_file in event.files:
            lang = diff_file.language.lower()
            if lang not in _COMPLEXITY_LANGUAGES:
                continue

            code = self._extract_added_code(diff_file)
            if not code.strip():
                continue

            results = self._cached_complexity(code, lang)
            for result in results:
                if result.complexity >= COMPLEXITY_MEDIUM:
                    if result.complexity >= COMPLEXITY_HIGH:
                        severity = Severity.HIGH
                    else:
                        severity = Severity.MEDIUM

                    findings.append(
                        Finding(
                            type="quality",
                            file=diff_file.path,
                            line_start=result.line_start,
                            line_end=result.line_end,
                            severity=severity,
                            confidence=Confidence.HIGH,
                            title=f"High cyclomatic complexity ({result.complexity}) "
                            f"in `{result.function_name}`",
                            description=(
                                f"Function `{result.function_name}` has cyclomatic complexity "
                                f"of {result.complexity}. "
                                f"Threshold for medium is {COMPLEXITY_MEDIUM}, "
                                f"high is {COMPLEXITY_HIGH}."
                            ),
                            remediation=(
                                "Consider refactoring into smaller functions, using early returns, "
                                "or extracting conditional logic into helper functions."
                            ),
                            category="complexity",
                            scanner="quality-agent",
                            extra={"complexity": result.complexity},
                        )
                    )
        return findings

    def _analyze_duplication(self, event: DiffEvent) -> list[Finding]:
        findings: list[Finding] = []
        duplicates = detect_duplicates(event.files)
        for dup in duplicates:
            locations_str = ", ".join(
                f"{loc.file}:{loc.line_start}-{loc.line_end}" for loc in dup.locations
            )
            # Use the first location for the finding's file/line
            first = dup.locations[0]
            findings.append(
                Finding(
                    type="quality",
                    file=first.file,
                    line_start=first.line_start,
                    line_end=first.line_end,
                    severity=Severity.LOW,
                    confidence=Confidence.MEDIUM,
                    title=f"Duplicate code block ({dup.line_count} lines) found",
                    description=(
                        f"Identical code block found at: {locations_str}. "
                        f"Preview: {dup.content_preview[:100]}"
                    ),
                    remediation="Extract duplicated code into a shared function or utility.",
                    category="duplication",
                    scanner="quality-agent",
                    extra={
                        "block_hash": dup.block_hash,
                        "duplicate_count": len(dup.locations),
                    },
                )
            )
        return findings

    @staticmethod
    def _extract_added_code(diff_file: DiffFile) -> str:
        """Reconstruct added code from diff hunks."""
        code_lines: list[str] = []
        for hunk in diff_file.hunks:
            for line in hunk.content.split("\n"):
                if line.startswith("+") and not line.startswith("+++"):
                    code_lines.append(line[1:])
                elif not line.startswith("-") and not line.startswith("---"):
                    if not line.startswith("@@"):
                        code_lines.append(line)
        return "\n".join(code_lines)

    def _analyze_naming(self, event: DiffEvent) -> list[Finding]:
        findings: list[Finding] = []
        for diff_file in event.files:
            lang = diff_file.language.lower()
            if lang not in _NAMING_LANGUAGES:
                continue

            code = self._extract_added_code(diff_file)
            if not code.strip():
                continue

            result = analyze_naming_consistency(code, lang)

            if result.consistency_score < NAMING_CONSISTENCY_THRESHOLD:
                style_summary = ", ".join(
                    f"{style.value}: {count}"
                    for style, count in sorted(
                        result.style_counts.items(), key=lambda x: -x[1]
                    )
                )
                findings.append(
                    Finding(
                        type="quality",
                        file=diff_file.path,
                        line_start=1,
                        line_end=1,
                        severity=Severity.LOW,
                        confidence=Confidence.MEDIUM,
                        title=(
                            f"Inconsistent naming conventions "
                            f"(score {result.consistency_score:.2f})"
                        ),
                        description=(
                            f"File uses mixed naming styles: {style_summary}. "
                            f"Dominant style is {result.dominant_style.value}."
                        ),
                        remediation=(
                            "Adopt a single naming convention for the codebase. "
                            "For Python, prefer snake_case for variables and functions. "
                            "For JavaScript/TypeScript, prefer camelCase."
                        ),
                        category="naming-inconsistency",
                        scanner="quality-agent",
                        extra={
                            "consistency_score": result.consistency_score,
                            "dominant_style": result.dominant_style.value,
                        },
                    )
                )
        return findings

    def _analyze_test_coverage(self, event: DiffEvent) -> list[Finding]:
        findings: list[Finding] = []
        gaps = find_coverage_gaps(event.files)
        for gap in gaps:
            untested = gap.untested_functions
            desc = (
                f"New source file `{gap.source_file}` ({gap.language}) "
                f"has no corresponding test file in the diff."
            )
            if gap.exported_functions:
                desc += (
                    f" Exports {len(gap.exported_functions)} function(s): "
                    f"{', '.join(gap.exported_functions[:5])}."
                )
                if untested:
                    desc += (
                        f" {len(untested)} untested: "
                        f"{', '.join(untested[:5])}."
                    )

            findings.append(
                Finding(
                    type="quality",
                    file=gap.source_file,
                    line_start=1,
                    line_end=1,
                    severity=Severity.MEDIUM,
                    confidence=Confidence.MEDIUM,
                    title=f"No test file found for `{gap.source_file}`",
                    description=desc,
                    remediation=(
                        f"Add a test file. Expected patterns: "
                        f"{', '.join(gap.expected_test_patterns[:4])}"
                    ),
                    category="test-coverage",
                    scanner="quality-agent",
                    extra={
                        "exported_functions": gap.exported_functions,
                        "untested_functions": untested,
                    },
                )
            )
        return findings
