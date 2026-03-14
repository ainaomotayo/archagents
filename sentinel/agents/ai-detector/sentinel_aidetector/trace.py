"""Structured trace builder for AI detection findings.

Produces a nested `extra.trace` dict with per-signal confidence
decomposition. Keys use camelCase for TypeScript compatibility.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class SignalDetail:
    """A single detection signal's contribution to the overall score."""

    weight: float
    raw_value: float
    probability: float
    contribution: float  # weight * probability
    detail: dict[str, Any] = field(default_factory=dict)


@dataclass
class TraceBuilder:
    """Builds a structured decision trace for an AI detection finding."""

    tool_name: str | None = None
    prompt_hash: str | None = None
    prompt_category: str | None = None

    entropy: SignalDetail | None = None
    uniformity: SignalDetail | None = None
    markers: SignalDetail | None = None
    timing: SignalDetail | None = None

    def overall_score(self) -> float:
        """Sum contributions from all signals, clamped to [0, 1]."""
        total = 0.0
        for sig in [self.entropy, self.uniformity, self.markers, self.timing]:
            if sig:
                total += sig.contribution
        return max(0.0, min(1.0, total))

    def to_signals_dict(self) -> dict[str, Any]:
        """Serialize to the signals JSON shape matching TypeScript TraceSignals.

        Uses camelCase keys for cross-language compatibility.
        """
        result: dict[str, Any] = {}
        for name in ["entropy", "uniformity", "markers", "timing"]:
            sig = getattr(self, name)
            if sig is not None:
                result[name] = {
                    "weight": sig.weight,
                    "rawValue": sig.raw_value,
                    "probability": sig.probability,
                    "contribution": sig.contribution,
                    "detail": sig.detail,
                }
        return result

    def to_extra(self) -> dict[str, Any]:
        """Produce the finding.extra dict with trace nested under 'trace' key."""
        return {
            "trace": {
                "toolName": self.tool_name,
                "promptHash": self.prompt_hash,
                "promptCategory": self.prompt_category,
                "overallScore": self.overall_score(),
                "signals": self.to_signals_dict(),
            }
        }
