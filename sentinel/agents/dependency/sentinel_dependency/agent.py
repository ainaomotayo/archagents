from __future__ import annotations

import logging
from typing import Any

from sentinel_agents.base import BaseAgent
from sentinel_agents.types import DiffEvent, Finding

from sentinel_dependency.compliance_checks import (
    check_ai_supply_chain,
    check_hipaa_cves,
    check_phi_license_risk,
)
from sentinel_dependency.cross_manifest import detect_cross_manifest_issues
from sentinel_dependency.drift_detector import detect_drift, extract_imports
from sentinel_dependency.manifest_parser import parse_manifests_from_diff
from sentinel_dependency.osv_scanner import scan_dependencies
from sentinel_dependency.typosquat import detect_typosquats

logger = logging.getLogger(__name__)


def _get_osv_cache(redis_client: Any | None = None) -> Any | None:
    """Try to create a RedisCache for OSV response caching."""
    if redis_client is None:
        return None
    try:
        from agent_core.cache import RedisCache
        return RedisCache(redis_client, prefix="sentinel:osv")
    except ImportError:
        return None


class DependencyAgent(BaseAgent):
    name = "dependency"
    version = "0.2.0"
    ruleset_version = "rules-2026.03.09-a"
    ruleset_hash = "sha256:dependency-v2"

    def __init__(
        self,
        existing_deps: set[str] | None = None,
        redis_client: Any | None = None,
    ) -> None:
        self.existing_deps = existing_deps or set()
        self._osv_cache = _get_osv_cache(redis_client)

    def process(self, event: DiffEvent) -> list[Finding]:
        findings: list[Finding] = []

        # Extract imports from diff
        imports = extract_imports(event)

        # Parse manifests once — shared by OSV scanner and cross-manifest analysis
        deps = parse_manifests_from_diff(event.files)

        # Tier 1: OSV-Scanner CVE detection
        findings.extend(self._run_osv_scanner(deps))

        # Tier 2: Architectural drift detection
        findings.extend(detect_drift(event, self.existing_deps))

        # Tier 3: Typosquat detection
        findings.extend(detect_typosquats(imports))

        # Tier 4: Cross-file manifest analysis
        findings.extend(self._run_cross_manifest(deps))

        # Tier 5: NIST/HIPAA compliance checks
        findings.extend(check_hipaa_cves(findings))
        findings.extend(check_ai_supply_chain(event.files))
        findings.extend(check_phi_license_risk(event.files))

        return findings

    def _run_osv_scanner(self, deps: list) -> list[Finding]:
        """Query OSV.dev for known CVEs in parsed dependencies."""
        try:
            if not deps:
                return []
            return scan_dependencies(deps, cache=self._osv_cache)
        except Exception:
            logger.exception("OSV scanner failed")
            return []

    @staticmethod
    def _run_cross_manifest(deps: list) -> list[Finding]:
        """Detect issues across multiple manifest files."""
        try:
            return detect_cross_manifest_issues(deps)
        except Exception:
            logger.exception("Cross-manifest analysis failed")
            return []
