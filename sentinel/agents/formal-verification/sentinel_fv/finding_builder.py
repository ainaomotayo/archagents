"""Finding builder mapping verification results to Sentinel findings."""
from __future__ import annotations

import re

from sentinel_agents.types import Confidence, Finding, Severity

from sentinel_fv.types import VerificationCondition, VerificationResult

_SCANNER = "sentinel-formal-verification"

# Classification patterns
_NULL_DEREF_RE = re.compile(r"is not None|!= None")
_DIV_ZERO_RE = re.compile(r"!=\s*0")


def _classify(vc: VerificationCondition) -> tuple[str, str, Severity]:
    """Classify a VC into (type, category, severity) based on expression and kind."""
    expr = vc.property.expression
    kind = vc.property.kind

    if _NULL_DEREF_RE.search(expr):
        return "security", "null-deref", Severity.HIGH

    if _DIV_ZERO_RE.search(expr):
        return "security", "division-by-zero", Severity.HIGH

    if kind == "postcondition":
        return "quality", "contract-violation", Severity.MEDIUM

    if kind == "invariant":
        return "quality", "invariant-violation", Severity.MEDIUM

    # Default for preconditions / assertions
    return "quality", "assertion-violation", Severity.MEDIUM


def _confidence_from_property(vc: VerificationCondition) -> Confidence:
    """Map property confidence string to Confidence enum."""
    conf = vc.property.confidence
    if conf == "high":
        return Confidence.HIGH
    if conf == "low":
        return Confidence.LOW
    return Confidence.MEDIUM


def build_finding(
    vc: VerificationCondition,
    result: VerificationResult,
) -> Finding | None:
    """Build a Finding from a VC and its verification result.

    Returns None for verified results (no issue to report).
    """
    if result.status == "verified":
        return None

    finding_type, category, severity = _classify(vc)
    loc = vc.property.location

    extra: dict = {}

    if result.status == "timeout":
        confidence = Confidence.LOW
        title = "Verification inconclusive"
        description = (
            f"Could not verify '{vc.property.expression}' "
            f"in {loc.function_name} within timeout"
        )
    else:
        # violated
        confidence = _confidence_from_property(vc)
        title = f"Potential {category.replace('-', ' ')}"
        description = (
            f"Property '{vc.property.expression}' may be violated "
            f"in {loc.function_name}"
        )
        if result.counterexample is not None:
            extra["counterexample"] = result.counterexample.variable_assignments

    return Finding(
        type=finding_type,
        file=loc.file,
        line_start=loc.line_start,
        line_end=loc.line_end,
        severity=severity,
        confidence=confidence,
        title=title,
        description=description,
        category=category,
        scanner=_SCANNER,
        extra=extra,
    )


def build_findings(
    results: list[tuple[VerificationCondition, VerificationResult]],
) -> list[Finding]:
    """Build findings from a list of (VC, result) pairs, filtering verified."""
    findings: list[Finding] = []
    for vc, result in results:
        finding = build_finding(vc, result)
        if finding is not None:
            findings.append(finding)
    return findings
