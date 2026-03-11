"""Rule evaluation engine for all policy rule types."""

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

    evaluators = {
        "deny-import": _evaluate_deny_import,
        "deny-pattern": _evaluate_deny_pattern,
        "require-pattern": _evaluate_require_pattern,
        "require-review": _evaluate_require_review,
        "enforce-format": _evaluate_enforce_format,
        "dependency-allow": _evaluate_dependency_allow,
        "secret-scan": _evaluate_secret_scan,
    }
    evaluator = evaluators.get(rule.type)
    if evaluator:
        return evaluator(rule, file_path, content)
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


def _evaluate_require_review(
    rule: PolicyRule, file_path: str, content: str
) -> list[RuleViolation]:
    """Check for approval/review markers in the content.

    Looks for patterns like 'Approved-by:', 'Reviewed-by:', 'LGTM' in comments.
    """
    approval_patterns = [
        re.compile(r"(?i)Approved-by:\s*\S+"),
        re.compile(r"(?i)Reviewed-by:\s*\S+"),
        re.compile(r"(?i)\bLGTM\b"),
        re.compile(r"(?i)Signed-off-by:\s*\S+"),
    ]

    found_approvals = 0
    for pattern in approval_patterns:
        if pattern.search(content):
            found_approvals += 1

    if found_approvals < rule.min_approvals:
        return [
            RuleViolation(
                rule_name=rule.name,
                file=file_path,
                line_start=1,
                line_end=1,
                message=(
                    f"Insufficient review markers: found {found_approvals}, "
                    f"need {rule.min_approvals}. {rule.description}"
                ),
                severity=rule.severity,
            )
        ]
    return []


def _evaluate_enforce_format(
    rule: PolicyRule, file_path: str, content: str
) -> list[RuleViolation]:
    """Enforce naming conventions for identifiers in the file."""
    violations: list[RuleViolation] = []
    style = rule.format_style

    # If a pattern is specified, use it as a regex for identifier naming
    if rule.pattern:
        try:
            regex = re.compile(rule.pattern)
        except re.error:
            return []

        # Extract identifiers from def/function/const/let/var declarations
        ident_re = re.compile(
            r"(?:def|function|const|let|var|class)\s+([a-zA-Z_]\w*)"
        )
        lines = content.split("\n")
        for line_num, line in enumerate(lines, start=1):
            for m in ident_re.finditer(line):
                name = m.group(1)
                if not regex.fullmatch(name):
                    violations.append(
                        RuleViolation(
                            rule_name=rule.name,
                            file=file_path,
                            line_start=line_num,
                            line_end=line_num,
                            message=(
                                f"Identifier '{name}' doesn't match format "
                                f"'{rule.format_style or rule.pattern}': {rule.description}"
                            ),
                            severity=rule.severity,
                        )
                    )
    return violations


def _evaluate_dependency_allow(
    rule: PolicyRule, file_path: str, content: str
) -> list[RuleViolation]:
    """Check that imports/requires are from the allowlist only."""
    violations: list[RuleViolation] = []
    allowset = set(rule.allowlist)

    # Detect import/require patterns
    import_patterns = [
        re.compile(r"^\s*import\s+(\S+)", re.MULTILINE),
        re.compile(r"^\s*from\s+(\S+)\s+import", re.MULTILINE),
        re.compile(r"""require\(\s*['"]([^'"]+)['"]\s*\)"""),
        re.compile(r"""import\s+.*\s+from\s+['"]([^'"]+)['"]"""),
    ]

    lines = content.split("\n")
    for line_num, line in enumerate(lines, start=1):
        for pattern in import_patterns:
            m = pattern.search(line)
            if m:
                dep = m.group(1).split(".")[0]  # Top-level package
                if dep and dep not in allowset:
                    violations.append(
                        RuleViolation(
                            rule_name=rule.name,
                            file=file_path,
                            line_start=line_num,
                            line_end=line_num,
                            message=(
                                f"Dependency '{dep}' not in allowlist: {rule.description}"
                            ),
                            severity=rule.severity,
                        )
                    )
                    break  # One violation per line
    return violations


def _evaluate_secret_scan(
    rule: PolicyRule, file_path: str, content: str
) -> list[RuleViolation]:
    """Scan for secrets matching the specified pattern."""
    violations: list[RuleViolation] = []

    try:
        regex = re.compile(rule.pattern)
    except re.error:
        return []

    lines = content.split("\n")
    for line_num, line in enumerate(lines, start=1):
        if regex.search(line):
            # Mask the matched content in the message
            violations.append(
                RuleViolation(
                    rule_name=rule.name,
                    file=file_path,
                    line_start=line_num,
                    line_end=line_num,
                    message=f"Potential secret detected: {rule.description}",
                    severity=rule.severity,
                )
            )

    return violations
