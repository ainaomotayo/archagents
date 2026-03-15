"""YAML policy file parsing and validation."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import yaml


VALID_RULE_TYPES = {
    "deny-import", "deny-pattern", "require-pattern",
    "require-review", "enforce-format", "dependency-allow", "secret-scan",
}
VALID_SEVERITIES = {"critical", "high", "medium", "low", "info"}


@dataclass
class PolicyRule:
    """A single policy rule parsed from YAML."""

    name: str
    type: str  # "deny-import" | "deny-pattern" | "require-pattern"
    description: str
    severity: str  # maps to Severity enum values
    files: str  # glob pattern for file matching
    # For deny-import / dependency-allow rules
    targets: list[str] = field(default_factory=list)
    # For deny-pattern / require-pattern / secret-scan / enforce-format rules
    pattern: str = ""
    # For require-review rules
    min_approvals: int = 1
    # For enforce-format rules
    format_style: str = ""  # "snake_case", "camelCase", "PascalCase"
    # For dependency-allow rules
    allowlist: list[str] = field(default_factory=list)

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
        if self.type in ("deny-pattern", "require-pattern", "secret-scan") and not self.pattern:
            errors.append(
                f"Rule '{self.name}': {self.type} rules must specify 'pattern'"
            )
        if self.type == "dependency-allow" and not self.allowlist:
            errors.append(
                f"Rule '{self.name}': dependency-allow rules must specify 'allowlist'"
            )
        return errors


@dataclass
class PolicyConfig:
    """Parsed policy configuration from YAML."""

    version: str
    rules: list[PolicyRule]
    errors: list[str] = field(default_factory=list)


def parse_policy_yaml(content: str, *, use_schema: bool = True) -> PolicyConfig:
    """Parse a YAML policy string and return a PolicyConfig.

    Returns a PolicyConfig with errors populated if parsing or validation fails.
    If *use_schema* is True and jsonschema is available, also validates against
    the JSON Schema definition.
    """
    try:
        data = yaml.safe_load(content)
    except yaml.YAMLError as exc:
        return PolicyConfig(version="", rules=[], errors=[f"YAML parse error: {exc}"])

    if not isinstance(data, dict):
        return PolicyConfig(version="", rules=[], errors=["Policy must be a YAML mapping"])

    # JSON Schema validation (optional, graceful if jsonschema not installed)
    if use_schema:
        try:
            from sentinel_policy.schema import validate_schema
            schema_errors = validate_schema(data)
            if schema_errors:
                return PolicyConfig(
                    version=str(data.get("version", "")),
                    rules=[],
                    errors=schema_errors,
                )
        except ImportError:
            pass

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


def validate_policy_yaml(content: str) -> list[str]:
    """Dry-run validation: parse and validate without evaluating rules.

    Returns a list of error messages (empty if valid).
    """
    config = parse_policy_yaml(content)
    return config.errors


def _parse_rule(raw: dict[str, Any]) -> PolicyRule:
    """Parse a single rule dict into a PolicyRule."""
    targets = raw.get("targets", [])
    if isinstance(targets, str):
        targets = [targets]

    allowlist = raw.get("allowlist", [])
    if isinstance(allowlist, str):
        allowlist = [allowlist]

    return PolicyRule(
        name=raw.get("name", ""),
        type=raw.get("type", ""),
        description=raw.get("description", ""),
        severity=raw.get("severity", "medium"),
        files=raw.get("files", ""),
        targets=targets,
        pattern=raw.get("pattern", ""),
        min_approvals=raw.get("min_approvals", 1),
        format_style=raw.get("format_style", ""),
        allowlist=allowlist,
    )
