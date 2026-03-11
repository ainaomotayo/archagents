"""IP/License Agent — detects license issues, OSS fingerprints, and binary vendoring."""

from __future__ import annotations

from sentinel_agents.base import BaseAgent
from sentinel_agents.types import Confidence, DiffEvent, Finding, Severity

from sentinel_license.fingerprint import fingerprint_code
from sentinel_license.spdx_detector import (
    check_compatibility,
    detect_licenses,
    parse_spdx_expression,
)


class LicenseAgent(BaseAgent):
    name = "ip-license"
    version = "0.2.0"
    ruleset_version = "rules-2026.03.11-a"
    ruleset_hash = "sha256:license-v2"

    def process(self, event: DiffEvent) -> list[Finding]:
        findings: list[Finding] = []

        # 1. SPDX license header detection
        policy = event.scan_config.license_policy
        license_findings = detect_licenses(event, allowed_policy=policy)
        findings.extend(license_findings)

        # 2. Code fingerprinting against known OSS
        findings.extend(fingerprint_code(event))

        # 3. License conflict detection across detected licenses
        findings.extend(self._check_license_conflicts(license_findings))

        return findings

    def _check_license_conflicts(self, license_findings: list[Finding]) -> list[Finding]:
        """Check for license conflicts between detected licenses in the same scan."""
        detected: list[tuple[str, str]] = []  # (license_id, file)
        for f in license_findings:
            lic = f.extra.get("licenseDetected", "")
            if lic:
                detected.append((lic, f.file))

        if len(detected) < 2:
            return []

        conflict_findings: list[Finding] = []
        seen: set[tuple[str, str]] = set()

        for i, (lic_a, file_a) in enumerate(detected):
            for j, (lic_b, file_b) in enumerate(detected):
                if i >= j:
                    continue
                if lic_a == lic_b:
                    continue
                pair = tuple(sorted([lic_a, lic_b]))
                if pair in seen:
                    continue
                seen.add(pair)

                result = check_compatibility(lic_a, lic_b)
                if not result.compatible:
                    conflict_findings.append(
                        Finding(
                            type="license",
                            file=file_a,
                            line_start=1,
                            line_end=1,
                            severity=Severity.HIGH,
                            confidence=Confidence.HIGH,
                            title=f"License conflict: {lic_a} + {lic_b}",
                            description=(
                                f"Incompatible licenses detected: {lic_a} (in {file_a}) "
                                f"and {lic_b} (in {file_b}). {result.detail}"
                            ),
                            remediation="Review license compatibility and resolve conflicts.",
                            category="license-conflict",
                            scanner="license-compat",
                            extra={
                                "license_a": lic_a,
                                "license_b": lic_b,
                                "risk": result.risk,
                            },
                        )
                    )
        return conflict_findings
