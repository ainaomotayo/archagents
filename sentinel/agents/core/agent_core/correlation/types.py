"""Types for two-pass correlation engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class CorrelationRule:
    name: str
    when: dict[str, Any]  # {"agents": [...], "same_file": bool, "line_overlap": bool, ...}
    then: dict[str, Any]  # {"amplify_severity": int, "add_tag": str, "escalate_to_llm": bool, ...}


@dataclass
class EnrichedFinding:
    """A finding enriched by the correlation engine."""

    # Original finding fields
    type: str
    file: str
    line_start: int
    line_end: int
    severity: str
    confidence: str
    title: str = ""
    description: str = ""
    remediation: str = ""
    category: str = ""
    scanner: str = ""
    cwe_id: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    # Enrichment fields
    tags: list[str] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)
    escalate_to_llm: bool = False
    correlated_with: list[str] = field(default_factory=list)  # finding IDs
    original_severity: str = ""

    @classmethod
    def from_finding_dict(cls, finding: dict[str, Any]) -> EnrichedFinding:
        return cls(
            type=finding.get("type", ""),
            file=finding.get("file", ""),
            line_start=finding.get("line_start", 0),
            line_end=finding.get("line_end", 0),
            severity=finding.get("severity", "info"),
            confidence=finding.get("confidence", "low"),
            title=finding.get("title", ""),
            description=finding.get("description", ""),
            remediation=finding.get("remediation", ""),
            category=finding.get("category", ""),
            scanner=finding.get("scanner", ""),
            cwe_id=finding.get("cwe_id"),
            extra=finding.get("extra", {}),
            original_severity=finding.get("severity", "info"),
        )
