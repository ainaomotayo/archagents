from __future__ import annotations

from sentinel_agents.base import BaseAgent
from sentinel_agents.types import DiffEvent, Finding

from sentinel_dependency.drift_detector import detect_drift, extract_imports
from sentinel_dependency.typosquat import detect_typosquats


class DependencyAgent(BaseAgent):
    name = "dependency"
    version = "0.1.0"
    ruleset_version = "rules-2026.03.09-a"
    ruleset_hash = "sha256:dependency-v1"

    def __init__(self, existing_deps: set[str] | None = None) -> None:
        self.existing_deps = existing_deps or set()

    def process(self, event: DiffEvent) -> list[Finding]:
        findings: list[Finding] = []

        # Extract imports from diff
        imports = extract_imports(event)

        # Tier 1: OSV-Scanner CVE detection (stub — needs lock files)
        findings.extend(self._run_osv_scanner())

        # Tier 2: Architectural drift detection
        findings.extend(detect_drift(event, self.existing_deps))

        # Tier 3: Typosquat detection
        findings.extend(detect_typosquats(imports))

        return findings

    @staticmethod
    def _run_osv_scanner() -> list[Finding]:
        """Stub for OSV-Scanner integration. Returns [] until lock files are available."""
        return []
