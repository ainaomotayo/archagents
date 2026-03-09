"""Rule evaluation engine for deny-import, deny-pattern, and require-pattern rules."""

from __future__ import annotations

import fnmatch
import re
from dataclasses import dataclass

from sentinel_policy.parser import PolicyRule


@dataclass
class RuleViolation:
    """A single rule violation found during evaluation."""

    rule_name: str
    file: str
    line_start: int
    line_end: int
    message: str
    severity: str


def file_matches_glob(file_path: str, glob_pattern: str) -> bool:
    """Check if a file path matches a glob pattern.

    Supports patterns like:
      - "**/*.py" — any Python file at any depth
      - "src/**/*.ts" — TypeScript files under src/
      - "*.py" — Python files in root only
      - "**/*.{py,ts,js}" — multiple extensions via brace expansion
    """
    # Handle brace expansion for patterns like "**/*.{py,ts,js}"
    patterns = _expand_braces(glob_pattern)
    for p in patterns:
        if _glob_match(file_path, p):
            return True
    return False


def _glob_match(file_path: str, pattern: str) -> bool:
    """Match a file path against a glob pattern with ** support.

    The ** segment matches zero or more path components (directories).
    """
    if "**" not in pattern:
        return fnmatch.fnmatch(file_path, pattern)

    # Convert glob to regex: ** matches any number of path segments (including zero)
    regex_str = _glob_to_regex(pattern)
    return bool(re.fullmatch(regex_str, file_path))


def _glob_to_regex(pattern: str) -> str:
    """Convert a glob pattern with ** support to a regex string.

    Converts:
      ** -> matches any characters including /  (zero or more path segments)
      *  -> matches any characters except /
      ?  -> matches any single character except /
      .  -> escaped literal dot
    """
    result: list[str] = []
    i = 0
    while i < len(pattern):
        c = pattern[i]
        if c == "*" and i + 1 < len(pattern) and pattern[i + 1] == "*":
            # ** — match anything including path separators
            # Skip any trailing /
            i += 2
            if i < len(pattern) and pattern[i] == "/":
                i += 1
                # **/ means "zero or more directories"
                result.append("(?:.+/)?")
            else:
                result.append(".*")
        elif c == "*":
            result.append("[^/]*")
            i += 1
        elif c == "?":
            result.append("[^/]")
            i += 1
        elif c in ".()[]{}+^$|":
            result.append(f"\\{c}")
            i += 1
        else:
            result.append(c)
            i += 1
    return "".join(result)


def _expand_braces(pattern: str) -> list[str]:
    """Expand brace patterns like '**/*.{py,ts}' into ['**/*.py', '**/*.ts']."""
    match = re.search(r"\{([^}]+)\}", pattern)
    if not match:
        return [pattern]

    prefix = pattern[: match.start()]
    suffix = pattern[match.end() :]
    alternatives = match.group(1).split(",")

    expanded: list[str] = []
    for alt in alternatives:
        expanded.extend(_expand_braces(prefix + alt.strip() + suffix))
    return expanded


def evaluate_rule(rule: PolicyRule, file_path: str, content: str) -> list[RuleViolation]:
    """Evaluate a single rule against a file's content.

    Args:
        rule: The policy rule to evaluate.
        file_path: Path of the file being checked.
        content: The full content (added lines) of the file.

    Returns:
        List of violations found.
    """
    if not file_matches_glob(file_path, rule.files):
        return []

    if rule.type == "deny-import":
        return _evaluate_deny_import(rule, file_path, content)
    elif rule.type == "deny-pattern":
        return _evaluate_deny_pattern(rule, file_path, content)
    elif rule.type == "require-pattern":
        return _evaluate_require_pattern(rule, file_path, content)
    return []


def _evaluate_deny_import(
    rule: PolicyRule, file_path: str, content: str
) -> list[RuleViolation]:
    """Check for denied imports/identifiers in the content."""
    violations: list[RuleViolation] = []
    lines = content.split("\n")

    for target in rule.targets:
        # Build patterns to detect imports/usages of the target
        # Match: import X, from X import, X(, and standalone usage
        patterns = [
            re.compile(rf"\bimport\s+{re.escape(target)}\b"),
            re.compile(rf"\bfrom\s+{re.escape(target)}\b"),
            re.compile(rf"\b{re.escape(target)}\s*\("),
        ]

        for line_num, line in enumerate(lines, start=1):
            for pat in patterns:
                if pat.search(line):
                    violations.append(
                        RuleViolation(
                            rule_name=rule.name,
                            file=file_path,
                            line_start=line_num,
                            line_end=line_num,
                            message=f"Denied import/usage of '{target}': {rule.description}",
                            severity=rule.severity,
                        )
                    )
                    break  # One violation per line per target

    return violations


def _evaluate_deny_pattern(
    rule: PolicyRule, file_path: str, content: str
) -> list[RuleViolation]:
    """Check for denied regex patterns in the content."""
    violations: list[RuleViolation] = []
    lines = content.split("\n")

    try:
        regex = re.compile(rule.pattern)
    except re.error:
        return []

    for line_num, line in enumerate(lines, start=1):
        if regex.search(line):
            violations.append(
                RuleViolation(
                    rule_name=rule.name,
                    file=file_path,
                    line_start=line_num,
                    line_end=line_num,
                    message=f"Denied pattern found: {rule.description}",
                    severity=rule.severity,
                )
            )

    return violations


def _evaluate_require_pattern(
    rule: PolicyRule, file_path: str, content: str
) -> list[RuleViolation]:
    """Check that a required pattern exists in the content."""
    try:
        regex = re.compile(rule.pattern)
    except re.error:
        return []

    if not regex.search(content):
        return [
            RuleViolation(
                rule_name=rule.name,
                file=file_path,
                line_start=1,
                line_end=1,
                message=f"Required pattern missing: {rule.description}",
                severity=rule.severity,
            )
        ]
    return []
