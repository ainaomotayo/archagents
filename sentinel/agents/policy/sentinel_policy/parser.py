"""YAML policy file parsing and validation."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import yaml


VALID_RULE_TYPES = {"deny-import", "deny-pattern", "require-pattern"}
VALID_SEVERITIES = {"critical", "high", "medium", "low", "info"}


@dataclass
class PolicyRule:
    """A single policy rule parsed from YAML."""

    name: str
    type: str  # "deny-import" | "deny-pattern" | "require-pattern"
    description: str
    severity: str  # maps to Severity enum values
    files: str  # glob pattern for file matching
    # For deny-import rules
    targets: list[str] = field(default_factory=list)
    # For deny-pattern / require-pattern rules
    pattern: str = ""

    def validate(self) -> list[str]:
        """Return a list of validation error messages (empty if valid)."""
        errors: list[str] = []
        if not self.name:
            errors.append("Rule must have a 'name'")
        if self.type not in VALID_RULE_TYPES:
            errors.append(
                f"Rule '{self.name}': invalid type '{self.type}'. "
                f"Must be one of {VALID_RULE_TYPES}"
            )
        if self.severity not in VALID_SEVERITIES:
            errors.append(
                f"Rule '{self.name}': invalid severity '{self.severity}'. "
                f"Must be one of {VALID_SEVERITIES}"
            )
        if not self.files:
            errors.append(f"Rule '{self.name}': must specify 'files' glob pattern")
        if self.type == "deny-import" and not self.targets:
            errors.append(f"Rule '{self.name}': deny-import rules must specify 'targets'")
        if self.type in ("deny-pattern", "require-pattern") and not self.pattern:
            errors.append(
                f"Rule '{self.name}': {self.type} rules must specify 'pattern'"
            )
        return errors


@dataclass
class PolicyConfig:
    """Parsed policy configuration from YAML."""

    version: str
    rules: list[PolicyRule]
    errors: list[str] = field(default_factory=list)


def parse_policy_yaml(content: str) -> PolicyConfig:
    """Parse a YAML policy string and return a PolicyConfig.

    Returns a PolicyConfig with errors populated if parsing or validation fails.
    """
    try:
        data = yaml.safe_load(content)
    except yaml.YAMLError as exc:
        return PolicyConfig(version="", rules=[], errors=[f"YAML parse error: {exc}"])

    if not isinstance(data, dict):
        return PolicyConfig(version="", rules=[], errors=["Policy must be a YAML mapping"])

    version = str(data.get("version", ""))
    if not version:
        return PolicyConfig(version="", rules=[], errors=["Policy must specify a 'version'"])

    raw_rules = data.get("rules", [])
    if not isinstance(raw_rules, list):
        return PolicyConfig(
            version=version, rules=[], errors=["'rules' must be a list"]
        )

    rules: list[PolicyRule] = []
    all_errors: list[str] = []

    for i, raw in enumerate(raw_rules):
        if not isinstance(raw, dict):
            all_errors.append(f"Rule at index {i} must be a mapping")
            continue

        rule = _parse_rule(raw)
        errs = rule.validate()
        if errs:
            all_errors.extend(errs)
        else:
            rules.append(rule)

    return PolicyConfig(version=version, rules=rules, errors=all_errors)


def _parse_rule(raw: dict[str, Any]) -> PolicyRule:
    """Parse a single rule dict into a PolicyRule."""
    targets = raw.get("targets", [])
    if isinstance(targets, str):
        targets = [targets]

    return PolicyRule(
        name=raw.get("name", ""),
        type=raw.get("type", ""),
        description=raw.get("description", ""),
        severity=raw.get("severity", "medium"),
        files=raw.get("files", ""),
        targets=targets,
        pattern=raw.get("pattern", ""),
    )
