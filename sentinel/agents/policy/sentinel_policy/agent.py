"""Main PolicyAgent — enforces YAML-based organization code policies.

Supports 5-level policy hierarchy: org -> team -> repo -> directory -> file.
Includes policy drift detection for scheduled scans.
"""

from __future__ import annotations

import hashlib

from sentinel_agents.base import BaseAgent
from sentinel_agents.types import Confidence, DiffEvent, Finding, Severity

from sentinel_policy.drift import detect_drift
from sentinel_policy.merge import merge_hierarchy, merge_policies_from_yaml
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
    version = "0.2.0"
    ruleset_version = "rules-2026.03.11-a"
    ruleset_hash = "sha256:policy-v2"

    def __init__(
        self,
        org_policy_yaml: str | None = None,
        repo_policy_yaml: str | None = None,
        *,
        team_policy_yaml: str | None = None,
        dir_policy_yaml: str | None = None,
        file_policy_yaml: str | None = None,
    ) -> None:
        self._org_yaml = org_policy_yaml or _DEFAULT_ORG_POLICY
        self._team_yaml = team_policy_yaml
        self._repo_yaml = repo_policy_yaml
        self._dir_yaml = dir_policy_yaml
        self._file_yaml = file_policy_yaml
        self._policy: PolicyConfig | None = None

    @property
    def policy(self) -> PolicyConfig:
        """Lazily parse and merge policies via 5-level hierarchy."""
        if self._policy is None:
            yamls = [
                self._org_yaml,
                self._team_yaml,
                self._repo_yaml,
                self._dir_yaml,
                self._file_yaml,
            ]
            configs = [parse_policy_yaml(y) for y in yamls if y]
            if configs:
                self._policy = merge_hierarchy(*configs)
            else:
                self._policy = parse_policy_yaml(self._org_yaml)

            # Update ruleset hash
            combined = "".join(y for y in yamls if y)
            digest = hashlib.sha256(combined.encode()).hexdigest()[:16]
            self.ruleset_hash = f"sha256:{digest}"
        return self._policy

    def process(self, event: DiffEvent) -> list[Finding]:
        findings: list[Finding] = []
        config = self.policy

        if config.errors:
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
            code = self._extract_added_code(diff_file)
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

    def detect_drift(self, current_files: dict[str, str]) -> list[Finding]:
        """Run drift detection: compare current files against policy expectations.

        Parameters
        ----------
        current_files:
            Mapping of ``file_path -> file_content`` for files to check.

        Returns
        -------
        list[Finding]
            Drift violations as findings.
        """
        config = self.policy
        drift_violations = detect_drift(current_files, config)

        findings: list[Finding] = []
        for dv in drift_violations:
            severity = _SEVERITY_MAP.get(dv.severity, Severity.MEDIUM)
            findings.append(
                Finding(
                    type="policy",
                    file=dv.file,
                    line_start=0,
                    line_end=0,
                    severity=severity,
                    confidence=Confidence.HIGH,
                    title=f"Policy drift: {dv.rule_name}",
                    description=dv.message,
                    remediation=f"Fix file to comply with policy rule '{dv.rule_name}'.",
                    category="policy-drift",
                    scanner="policy-agent",
                    extra={"rule_name": dv.rule_name},
                )
            )
        return findings

    @staticmethod
    def _extract_added_code(diff_file) -> str:
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
