from __future__ import annotations

from sentinel_agents.base import BaseAgent
from sentinel_agents.types import DiffEvent, Finding

from sentinel_security.semgrep_runner import run_semgrep
from sentinel_security.custom_rules import run_custom_rules
from sentinel_security.taint import analyze_taint


class SecurityAgent(BaseAgent):
    name = "security"
    version = "0.2.0"
    ruleset_version = "rules-2026.03.11-a"
    ruleset_hash = "sha256:security-v2"

    def process(self, event: DiffEvent) -> list[Finding]:
        findings: list[Finding] = []

        # Tier 1: Semgrep scanning
        findings.extend(run_semgrep(event))

        # Tier 2: Custom AI-specific rules
        findings.extend(run_custom_rules(event))

        # Tier 3: Taint analysis (cross-function data flow)
        for diff_file in event.files:
            findings.extend(analyze_taint(diff_file))

        return findings
