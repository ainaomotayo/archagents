from __future__ import annotations

from sentinel_agents.base import BaseAgent
from sentinel_agents.types import DiffEvent, Finding


class FormalVerificationAgent(BaseAgent):
    name = "formal-verification"
    version = "0.1.0"
    ruleset_version = "rules-2026.03.15-a"
    ruleset_hash = "sha256:fv-v1"

    def process(self, event: DiffEvent) -> list[Finding]:
        findings: list[Finding] = []
        return findings
