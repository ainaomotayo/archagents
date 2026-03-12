"""IP/License Agent — detects license issues, OSS fingerprints, and binary vendoring."""

from __future__ import annotations

import logging
from typing import Any

from sentinel_agents.base import BaseAgent
from sentinel_agents.types import Confidence, DiffEvent, Finding, Severity

from sentinel_license.evidence import EvidenceChain, ProvenanceEvent
from sentinel_license.fingerprint import fingerprint_code
from sentinel_license.registry_lookup import fetch_package_info
from sentinel_license.spdx_detector import (
    check_compatibility,
    detect_licenses,
    parse_spdx_expression,
)

logger = logging.getLogger(__name__)


class LicenseAgent(BaseAgent):
    name = "ip-license"
    version = "0.3.0"
    ruleset_version = "rules-2026.03.11-a"
    ruleset_hash = "sha256:license-v2"

    last_evidence_chain: EvidenceChain | None = None

    def process(self, event: DiffEvent) -> list[Finding]:
        findings: list[Finding] = []
        chain = EvidenceChain(org_id=event.scan_id, scan_id=event.scan_id)

        # 1. SPDX license header detection
        policy = event.scan_config.license_policy
        license_findings = detect_licenses(event, allowed_policy=policy)
        findings.extend(license_findings)
        for f in license_findings:
            chain.append(ProvenanceEvent(
                event_type="license_detection",
                data={
                    "licenseDetected": f.extra.get("licenseDetected", f.title),
                    "file": f.file,
                    "line": f.line_start,
                },
            ))

        # 2. Code fingerprinting against known OSS
        fp_findings = fingerprint_code(event)
        findings.extend(fp_findings)
        for f in fp_findings:
            chain.append(ProvenanceEvent(
                event_type="fingerprint_match",
                data={
                    "source": f.extra.get("source", ""),
                    "similarity": f.extra.get("similarity", 0),
                    "license": f.extra.get("license", ""),
                },
            ))

        # 3. License conflict detection across detected licenses
        conflict_findings = self._check_license_conflicts(license_findings)
        findings.extend(conflict_findings)
        for f in conflict_findings:
            chain.append(ProvenanceEvent(
                event_type="license_conflict",
                data={
                    "license_a": f.extra.get("license_a", ""),
                    "license_b": f.extra.get("license_b", ""),
                },
            ))

        # 4. Best-effort registry enrichment for fingerprint matches
        self._enrich_with_registry_metadata(findings)

        self.last_evidence_chain = chain
        return findings

    def build_evidence_payload(
        self, chain: EvidenceChain, org_id: str
    ) -> dict[str, Any]:
        """Build a Redis Stream payload for the sentinel.evidence stream."""
        return {
            "orgId": org_id,
            "scanId": chain.scan_id,
            "type": "provenance_chain",
            "eventData": {
                "agentName": self.name,
                "agentVersion": self.version,
                "records": chain.to_dicts(),
            },
        }

    @staticmethod
    def _enrich_with_registry_metadata(findings: list[Finding]) -> None:
        """Best-effort enrichment of fingerprint findings with registry metadata.

        For each finding that has ``sourceMatch`` and ``ecosystem`` in its extra
        dict, attempt to look up the package in the corresponding registry.  On
        success the finding's *extra* is augmented with ``registryLicense``,
        ``registryVersion``, and ``registryUrl``.  Registry failures are silently
        ignored so that scan results are never lost.
        """
        for finding in findings:
            extra = finding.extra
            if not extra:
                continue
            ecosystem = extra.get("ecosystem")
            source_match = extra.get("sourceMatch")
            if not ecosystem or not source_match:
                continue

            # Derive a package name from the source URL.
            # For GitHub-style URLs the last path segment is typically the
            # package/repo name.  We fall back to the full URL.
            name = source_match.rstrip("/").rsplit("/", 1)[-1]
            version = extra.get("packageVersion", "latest")

            try:
                info = fetch_package_info(name, version, ecosystem)
            except Exception:
                logger.debug(
                    "Registry lookup failed for %s/%s (%s)", name, version, ecosystem,
                    exc_info=True,
                )
                continue

            if info is None:
                continue

            if info.spdx_license:
                extra["registryLicense"] = info.spdx_license
            if info.version:
                extra["registryVersion"] = info.version
            if info.source_url:
                extra["registryUrl"] = info.source_url

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
