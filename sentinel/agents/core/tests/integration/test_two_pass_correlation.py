"""Integration tests for the two-pass correlation engine.

Feed known_bad_diff findings through the correlation engine and verify
that cross-agent rules fire correctly.
"""

from __future__ import annotations

import json
import os

import pytest

from agent_core.correlation.engine import CorrelationEngine
from agent_core.correlation.types import EnrichedFinding

FIXTURES = os.path.join(os.path.dirname(__file__), "..", "fixtures")


def _load_fixture(name: str) -> dict:
    with open(os.path.join(FIXTURES, name)) as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Simulated findings from multiple agents (as if agents processed known_bad_diff)
# ---------------------------------------------------------------------------

def _simulated_findings() -> list[dict]:
    """Return findings that multiple agents would produce from known_bad_diff."""
    return [
        # Security agent: SQL injection in auth.py
        {
            "type": "security",
            "file": "auth.py",
            "line_start": 6,
            "line_end": 7,
            "severity": "high",
            "confidence": "high",
            "title": "SQL Injection",
            "scanner": "semgrep",
            "category": "CWE-89",
        },
        # Security agent: command injection in auth.py
        {
            "type": "security",
            "file": "auth.py",
            "line_start": 8,
            "line_end": 9,
            "severity": "high",
            "confidence": "high",
            "title": "Command Injection",
            "scanner": "taint-analysis",
            "category": "CWE-78",
        },
        # AI detector: high AI score on utils.py
        {
            "type": "ai-detector",
            "file": "auth.py",
            "line_start": 6,
            "line_end": 9,
            "severity": "medium",
            "confidence": "medium",
            "title": "AI-generated code detected",
            "scanner": "ai-detector",
            "category": "ai-generated",
        },
        # Quality agent: high complexity in complex.py
        {
            "type": "quality",
            "file": "auth.py",
            "line_start": 1,
            "line_end": 10,
            "severity": "medium",
            "confidence": "high",
            "title": "Cyclomatic complexity 15",
            "scanner": "complexity",
            "category": "complexity",
        },
        # Policy agent: forbidden import in policy_violator.py
        {
            "type": "policy",
            "file": "policy_violator.py",
            "line_start": 1,
            "line_end": 1,
            "severity": "high",
            "confidence": "high",
            "title": "Forbidden import: pickle",
            "scanner": "policy-agent",
            "category": "deny-import",
        },
        # Security agent: also flagged policy_violator.py for eval()
        {
            "type": "security",
            "file": "policy_violator.py",
            "line_start": 5,
            "line_end": 5,
            "severity": "high",
            "confidence": "high",
            "title": "Use of eval()",
            "scanner": "semgrep",
            "category": "CWE-95",
        },
        # IP/License: copyleft header in lib.py
        {
            "type": "ip-license",
            "file": "lib.py",
            "line_start": 1,
            "line_end": 2,
            "severity": "medium",
            "confidence": "high",
            "title": "GPL-3.0 license detected",
            "scanner": "spdx-detector",
            "category": "copyleft",
            "extra": {"dependency": "foobar"},
        },
        # Dependency agent: CVE on flask
        {
            "type": "dependency",
            "file": "requirements.txt",
            "line_start": 1,
            "line_end": 1,
            "severity": "high",
            "confidence": "high",
            "title": "CVE-2023-XXXX: flask@2.3.0",
            "scanner": "osv-scanner",
            "category": "cve",
            "extra": {"dependency": "foobar"},
        },
    ]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestTwoPassCorrelation:
    def test_ai_generated_vulnerability_rule_fires(self):
        """ai-detector + security on same file with line overlap -> amplified."""
        engine = CorrelationEngine()
        findings = _simulated_findings()

        enriched = engine.correlate(findings, "scan-bad-001")

        # Find the AI-detector finding
        ai_finding = next(e for e in enriched if e.scanner == "ai-detector")
        assert "ai-generated-vuln" in ai_finding.tags
        assert ai_finding.escalate_to_llm is True
        # Severity should be amplified from medium
        assert ai_finding.severity in ("high", "critical")

    def test_complex_vulnerable_code_rule_fires(self):
        """quality + security on same file -> amplified with recommendation."""
        engine = CorrelationEngine()
        findings = _simulated_findings()

        enriched = engine.correlate(findings, "scan-bad-001")

        # Quality finding on auth.py should be correlated with security
        quality = next(e for e in enriched if e.scanner == "complexity")
        assert "complex-vuln" in quality.tags
        assert "refactor-before-fix" in quality.recommendations

    def test_copyleft_with_cve_rule_fires(self):
        """ip-license + dependency with same_dependency -> critical."""
        engine = CorrelationEngine()
        findings = _simulated_findings()

        enriched = engine.correlate(findings, "scan-bad-001")

        license_finding = next(e for e in enriched if e.scanner == "spdx-detector")
        assert "copyleft-cve" in license_finding.tags
        assert license_finding.severity == "critical"
        assert license_finding.escalate_to_llm is True

    def test_policy_compound_rule_fires(self):
        """policy + any other agent on same file -> amplified."""
        engine = CorrelationEngine()
        findings = _simulated_findings()

        enriched = engine.correlate(findings, "scan-bad-001")

        policy_finding = next(e for e in enriched if e.scanner == "policy-agent")
        assert "policy-compound" in policy_finding.tags

    def test_clean_diff_produces_no_correlations(self):
        """No findings from clean code -> no correlations."""
        engine = CorrelationEngine()
        enriched = engine.correlate([], "scan-clean-001")
        assert enriched == []

    def test_correlated_with_tracking(self):
        """Correlated findings should reference each other."""
        engine = CorrelationEngine()
        findings = _simulated_findings()

        enriched = engine.correlate(findings, "scan-bad-001")

        # At least some findings should have correlated_with set
        correlated = [e for e in enriched if e.correlated_with]
        assert len(correlated) > 0

    def test_custom_rule_integration(self):
        """Adding a custom rule should work alongside builtins."""
        from agent_core.correlation.types import CorrelationRule

        engine = CorrelationEngine()
        engine.add_rule(CorrelationRule(
            name="test_custom",
            when={"agents": ["security", "dependency"], "same_file": False},
            then={"add_tag": "custom-test"},
        ))

        findings = _simulated_findings()
        enriched = engine.correlate(findings, "scan-bad-001")

        tagged = [e for e in enriched if "custom-test" in e.tags]
        assert len(tagged) > 0

    def test_original_severity_preserved(self):
        """EnrichedFinding should preserve original severity."""
        engine = CorrelationEngine()
        findings = _simulated_findings()

        enriched = engine.correlate(findings, "scan-bad-001")

        # The IP/License finding gets amplified to critical, but original should be medium
        license_finding = next(e for e in enriched if e.scanner == "spdx-detector")
        assert license_finding.original_severity == "medium"
        assert license_finding.severity == "critical"
