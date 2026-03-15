"""Tests for finding builder mapping verification results to Sentinel findings."""
from __future__ import annotations

from sentinel_agents.types import Confidence, Severity

from sentinel_fv.finding_builder import build_finding, build_findings
from sentinel_fv.types import (
    Counterexample,
    Location,
    Property,
    VerificationCondition,
    VerificationResult,
)


def _loc() -> Location:
    return Location(file="test.py", line_start=10, line_end=15, function_name="f")


def _vc(expression: str, kind: str = "precondition", source: str = "inferred") -> VerificationCondition:
    return VerificationCondition(
        property=Property(
            kind=kind,
            source=source,
            expression=expression,
            location=_loc(),
        ),
        assumptions=[],
        goal=expression,
    )


def test_null_deref_finding():
    """'is not None' violation maps to security/null-deref."""
    vc = _vc("x is not None")
    result = VerificationResult(status="violated", stage="smt", duration_ms=10)
    finding = build_finding(vc, result)
    assert finding is not None
    assert finding.type == "security"
    assert finding.category == "null-deref"
    assert finding.severity == Severity.HIGH


def test_division_by_zero():
    """'!= 0' violation maps to security/division-by-zero."""
    vc = _vc("y != 0")
    result = VerificationResult(status="violated", stage="smt", duration_ms=5)
    finding = build_finding(vc, result)
    assert finding is not None
    assert finding.type == "security"
    assert finding.category == "division-by-zero"


def test_postcondition_quality():
    """Postcondition violation maps to quality/contract-violation."""
    vc = _vc("result > 0", kind="postcondition")
    result = VerificationResult(status="violated", stage="smt", duration_ms=5)
    finding = build_finding(vc, result)
    assert finding is not None
    assert finding.type == "quality"
    assert finding.category == "contract-violation"


def test_timeout_low_confidence():
    """Timeout results in LOW confidence."""
    vc = _vc("x is not None")
    result = VerificationResult(status="timeout", stage="smt", duration_ms=5000)
    finding = build_finding(vc, result)
    assert finding is not None
    assert finding.confidence == Confidence.LOW
    assert "inconclusive" in finding.title.lower()


def test_counterexample_in_extra():
    """Counterexample data is stored in finding.extra."""
    vc = _vc("x != 0")
    cx = Counterexample(variable_assignments={"x": "0"})
    result = VerificationResult(status="violated", stage="smt", duration_ms=5, counterexample=cx)
    finding = build_finding(vc, result)
    assert finding is not None
    assert "counterexample" in finding.extra
    assert finding.extra["counterexample"]["x"] == "0"


def test_verified_returns_none():
    """Verified results produce no finding."""
    vc = _vc("x is not None")
    result = VerificationResult(status="verified", stage="smt", duration_ms=2)
    finding = build_finding(vc, result)
    assert finding is None


def test_build_findings_filters():
    """build_findings filters out verified results."""
    vc1 = _vc("x is not None")
    r1 = VerificationResult(status="verified", stage="smt", duration_ms=2)
    vc2 = _vc("y != 0")
    r2 = VerificationResult(status="violated", stage="smt", duration_ms=5)
    vc3 = _vc("z > 0")
    r3 = VerificationResult(status="timeout", stage="smt", duration_ms=5000)

    findings = build_findings([(vc1, r1), (vc2, r2), (vc3, r3)])
    assert len(findings) == 2


def test_scanner_name():
    """All findings have scanner set to sentinel-formal-verification."""
    vc = _vc("x != 0")
    result = VerificationResult(status="violated", stage="smt", duration_ms=5)
    finding = build_finding(vc, result)
    assert finding is not None
    assert finding.scanner == "sentinel-formal-verification"
