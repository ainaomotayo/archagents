"""Main PolicyAgent — enforces YAML-based organization code policies."""

from __future__ import annotations

import hashlib

from sentinel_agents.base import BaseAgent
from sentinel_agents.types import Confidence, DiffEvent, Finding, Severity

from sentinel_policy.merge import merge_policies_from_yaml
from sentinel_policy.parser import PolicyConfig, parse_policy_yaml
from sentinel_policy.rules import evaluate_rule

# Map string severity names to Severity enum
_SEVERITY_MAP = {
    "critical": Severity.CRITICAL,
    "high": Severity.HIGH,
    "medium": Severity.MEDIUM,
    "low": Severity.LOW,
    "info": Severity.INFO,
}

# Default org policy (empty — no rules unless configured)
_DEFAULT_ORG_POLICY = """\
version: "1"
rules: []
"""


class PolicyAgent(BaseAgent):
    name = "policy"
    version = "0.1.0"
    ruleset_version = "rules-2026.03.09-a"
    ruleset_hash = "sha256:policy-v1"

    def __init__(
        self,
        org_policy_yaml: str | None = None,
        repo_policy_yaml: str | None = None,
    ) -> None:
        self._org_yaml = org_policy_yaml or _DEFAULT_ORG_POLICY
        self._repo_yaml = repo_policy_yaml
        self._policy: PolicyConfig | None = None

    @property
    def policy(self) -> PolicyConfig:
        """Lazily parse and merge policies."""
        if self._policy is None:
            self._policy = merge_policies_from_yaml(self._org_yaml, self._repo_yaml)
            # Update ruleset hash based on actual policy content
            combined = self._org_yaml + (self._repo_yaml or "")
            digest = hashlib.sha256(combined.encode()).hexdigest()[:16]
            self.ruleset_hash = f"sha256:{digest}"
        return self._policy

    def process(self, event: DiffEvent) -> list[Finding]:
        findings: list[Finding] = []
        config = self.policy

        if config.errors:
            # If policy has validation errors, report them as a single finding
            findings.append(
                Finding(
                    type="policy",
                    file="<policy-config>",
                    line_start=0,
                    line_end=0,
                    severity=Severity.HIGH,
                    confidence=Confidence.HIGH,
                    title="Policy configuration errors",
                    description="; ".join(config.errors),
                    remediation="Fix the policy YAML configuration.",
                    category="policy-config",
                    scanner="policy-agent",
                )
            )

        for diff_file in event.files:
            # Reconstruct added code from hunks
            code_lines: list[str] = []
            for hunk in diff_file.hunks:
                for line in hunk.content.split("\n"):
                    if line.startswith("+") and not line.startswith("+++"):
                        code_lines.append(line[1:])
                    elif not line.startswith("-") and not line.startswith("---"):
                        if not line.startswith("@@"):
                            code_lines.append(line)

            code = "\n".join(code_lines)
            if not code.strip():
                continue

            for rule in config.rules:
                violations = evaluate_rule(rule, diff_file.path, code)
                for v in violations:
                    severity = _SEVERITY_MAP.get(v.severity, Severity.MEDIUM)
                    findings.append(
                        Finding(
                            type="policy",
                            file=v.file,
                            line_start=v.line_start,
                            line_end=v.line_end,
                            severity=severity,
                            confidence=Confidence.HIGH,
                            title=f"Policy violation: {v.rule_name}",
                            description=v.message,
                            remediation=f"Fix the code to comply with policy rule '{v.rule_name}'.",
                            category="policy",
                            scanner="policy-agent",
                            extra={"rule_name": v.rule_name, "rule_type": rule.type},
                        )
                    )

        return findings
