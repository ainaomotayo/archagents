"""Tests for the two-pass correlation engine."""

import pytest

from agent_core.correlation.engine import CorrelationEngine, _amplify_severity, _lines_overlap
from agent_core.correlation.types import CorrelationRule


class TestLineOverlap:
    def test_overlapping(self) -> None:
        assert _lines_overlap(1, 10, 5, 15) is True

    def test_adjacent(self) -> None:
        assert _lines_overlap(1, 5, 5, 10) is True

    def test_no_overlap(self) -> None:
        assert _lines_overlap(1, 5, 6, 10) is False

    def test_contained(self) -> None:
        assert _lines_overlap(1, 20, 5, 10) is True

    def test_same_line(self) -> None:
        assert _lines_overlap(5, 5, 5, 5) is True


class TestSeverityAmplification:
    def test_amplify_one_level(self) -> None:
        assert _amplify_severity("low", 1) == "medium"
        assert _amplify_severity("medium", 1) == "high"
        assert _amplify_severity("high", 1) == "critical"

    def test_amplify_capped(self) -> None:
        assert _amplify_severity("critical", 1) == "critical"
        assert _amplify_severity("high", 5) == "critical"

    def test_amplify_from_info(self) -> None:
        assert _amplify_severity("info", 2) == "medium"


class TestAIGeneratedVulnerabilityRule:
    """Rule: ai-detector + security on same file with line overlap."""

    def test_triggers_on_match(self) -> None:
        engine = CorrelationEngine()
        findings = [
            {
                "type": "ai-detection",
                "file": "src/auth.py",
                "line_start": 10,
                "line_end": 20,
                "severity": "medium",
                "confidence": "medium",
                "title": "AI-generated code",
            },
            {
                "type": "security",
                "file": "src/auth.py",
                "line_start": 15,
                "line_end": 25,
                "severity": "high",
                "confidence": "high",
                "title": "SQL injection",
            },
        ]
        # Need to use the agent type names from the rule
        findings[0]["type"] = "ai-detector"
        enriched = engine.correlate(findings)
        # Both findings should be tagged
        assert any("ai-generated-vuln" in e.tags for e in enriched)
        assert any(e.escalate_to_llm for e in enriched)

    def test_no_trigger_different_files(self) -> None:
        engine = CorrelationEngine()
        findings = [
            {"type": "ai-detector", "file": "a.py", "line_start": 1, "line_end": 10, "severity": "medium", "confidence": "medium"},
            {"type": "security", "file": "b.py", "line_start": 1, "line_end": 10, "severity": "high", "confidence": "high"},
        ]
        enriched = engine.correlate(findings)
        assert all("ai-generated-vuln" not in e.tags for e in enriched)

    def test_no_trigger_no_line_overlap(self) -> None:
        engine = CorrelationEngine()
        findings = [
            {"type": "ai-detector", "file": "a.py", "line_start": 1, "line_end": 5, "severity": "medium", "confidence": "medium"},
            {"type": "security", "file": "a.py", "line_start": 50, "line_end": 60, "severity": "high", "confidence": "high"},
        ]
        enriched = engine.correlate(findings)
        assert all("ai-generated-vuln" not in e.tags for e in enriched)


class TestComplexVulnerableCodeRule:
    """Rule: quality + security on same file."""

    def test_triggers(self) -> None:
        engine = CorrelationEngine()
        findings = [
            {"type": "quality", "file": "src/auth.py", "line_start": 1, "line_end": 50, "severity": "medium", "confidence": "high"},
            {"type": "security", "file": "src/auth.py", "line_start": 10, "line_end": 20, "severity": "high", "confidence": "high"},
        ]
        enriched = engine.correlate(findings)
        tagged = [e for e in enriched if "complex-vuln" in e.tags]
        assert len(tagged) >= 1
        assert any("refactor-before-fix" in e.recommendations for e in enriched)


class TestCopyleftWithCVERule:
    """Rule: ip-license + dependency with same_dependency."""

    def test_triggers_on_same_dependency(self) -> None:
        engine = CorrelationEngine()
        findings = [
            {"type": "ip-license", "file": "package.json", "line_start": 1, "line_end": 1, "severity": "medium", "confidence": "high",
             "extra": {"dependency": "leftpad"}},
            {"type": "dependency", "file": "package.json", "line_start": 1, "line_end": 1, "severity": "high", "confidence": "high",
             "extra": {"dependency": "leftpad"}},
        ]
        enriched = engine.correlate(findings)
        assert any(e.severity == "critical" for e in enriched)
        assert any("copyleft-cve" in e.tags for e in enriched)

    def test_no_trigger_different_dependency(self) -> None:
        engine = CorrelationEngine()
        findings = [
            {"type": "ip-license", "file": "package.json", "line_start": 1, "line_end": 1, "severity": "medium", "confidence": "high",
             "extra": {"dependency": "leftpad"}},
            {"type": "dependency", "file": "package.json", "line_start": 1, "line_end": 1, "severity": "high", "confidence": "high",
             "extra": {"dependency": "lodash"}},
        ]
        enriched = engine.correlate(findings)
        assert all("copyleft-cve" not in e.tags for e in enriched)


class TestPolicyCompoundRule:
    """Rule: policy + any other agent on same file."""

    def test_triggers_with_any_agent(self) -> None:
        engine = CorrelationEngine()
        findings = [
            {"type": "policy", "file": "src/main.py", "line_start": 1, "line_end": 10, "severity": "low", "confidence": "high"},
            {"type": "security", "file": "src/main.py", "line_start": 5, "line_end": 15, "severity": "high", "confidence": "high"},
        ]
        enriched = engine.correlate(findings)
        assert any("policy-compound" in e.tags for e in enriched)


class TestCustomRule:
    def test_add_custom_rule(self) -> None:
        engine = CorrelationEngine()
        engine.add_rule(
            CorrelationRule(
                name="test_custom",
                when={"agents": ["security", "quality"], "same_file": True},
                then={"add_tag": "custom-tag"},
            )
        )
        findings = [
            {"type": "security", "file": "a.py", "line_start": 1, "line_end": 10, "severity": "high", "confidence": "high"},
            {"type": "quality", "file": "a.py", "line_start": 1, "line_end": 10, "severity": "low", "confidence": "medium"},
        ]
        enriched = engine.correlate(findings)
        assert any("custom-tag" in e.tags for e in enriched)


class TestNoCorrelation:
    def test_no_matches(self) -> None:
        engine = CorrelationEngine()
        findings = [
            {"type": "security", "file": "a.py", "line_start": 1, "line_end": 10, "severity": "high", "confidence": "high"},
        ]
        enriched = engine.correlate(findings)
        assert len(enriched) == 1
        assert enriched[0].tags == []
        assert enriched[0].escalate_to_llm is False

    def test_empty_findings(self) -> None:
        engine = CorrelationEngine()
        enriched = engine.correlate([])
        assert enriched == []


class TestCorrelatedWith:
    def test_tracks_correlation_ids(self) -> None:
        engine = CorrelationEngine()
        findings = [
            {"type": "quality", "file": "src/auth.py", "line_start": 1, "line_end": 50, "severity": "medium", "confidence": "high"},
            {"type": "security", "file": "src/auth.py", "line_start": 10, "line_end": 20, "severity": "high", "confidence": "high"},
        ]
        enriched = engine.correlate(findings)
        # Each correlated finding should reference the other
        for e in enriched:
            if e.correlated_with:
                assert len(e.correlated_with) >= 1
