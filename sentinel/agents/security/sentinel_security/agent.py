from __future__ import annotations

from sentinel_agents.base import BaseAgent
from sentinel_agents.types import DiffEvent, Finding

from sentinel_security.semgrep_runner import run_semgrep
from sentinel_security.custom_rules import run_custom_rules


class SecurityAgent(BaseAgent):
    name = "security"
    version = "0.1.0"
    ruleset_version = "rules-2026.03.09-a"
    ruleset_hash = "sha256:security-v1"

    def process(self, event: DiffEvent) -> list[Finding]:
        findings: list[Finding] = []

        # Tier 1: Semgrep scanning
        findings.extend(run_semgrep(event))

        # Tier 2: Custom AI-specific rules
        findings.extend(run_custom_rules(event))

        return findings
