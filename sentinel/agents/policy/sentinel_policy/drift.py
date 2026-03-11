"""Policy drift detection — compare current file state against policy expectations.

Drift occurs when files exist that violate policy rules, even if those files
were not part of the current diff.  This is useful for scheduled scans.
"""

from __future__ import annotations

from dataclasses import dataclass

from sentinel_policy.parser import PolicyConfig
from sentinel_policy.rules import evaluate_rule, file_matches_glob


@dataclass
class DriftViolation:
    """A drift violation found by comparing current state against policy."""
    rule_name: str
    file: str
    message: str
    severity: str


def detect_drift(
    current_files: dict[str, str],
    policy: PolicyConfig,
) -> list[DriftViolation]:
    """Compare current file contents against policy expectations.

    Parameters
    ----------
    current_files:
        Mapping of ``file_path -> file_content`` for files to check.
    policy:
        The merged policy configuration to check against.

    Returns
    -------
    list[DriftViolation]
        Violations found in the current files.
    """
    violations: list[DriftViolation] = []

    for file_path, content in current_files.items():
        for rule in policy.rules:
            if not file_matches_glob(file_path, rule.files):
                continue

            rule_violations = evaluate_rule(rule, file_path, content)
            for v in rule_violations:
                violations.append(
                    DriftViolation(
                        rule_name=v.rule_name,
                        file=v.file,
                        message=v.message,
                        severity=v.severity,
                    )
                )

    return violations
