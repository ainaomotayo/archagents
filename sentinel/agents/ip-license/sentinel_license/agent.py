from __future__ import annotations

from sentinel_agents.base import BaseAgent
from sentinel_agents.types import DiffEvent, Finding

from sentinel_license.spdx_detector import detect_licenses
from sentinel_license.fingerprint import fingerprint_code


class LicenseAgent(BaseAgent):
    name = "ip-license"
    version = "0.1.0"
    ruleset_version = "rules-2026.03.09-a"
    ruleset_hash = "sha256:license-v1"

    def process(self, event: DiffEvent) -> list[Finding]:
        findings: list[Finding] = []

        # SPDX license header detection
        policy = event.scan_config.license_policy
        findings.extend(detect_licenses(event, allowed_policy=policy))

        # Code fingerprinting against known OSS
        findings.extend(fingerprint_code(event))

        return findings
