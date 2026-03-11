"""Types for PII scrubbing."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Redaction:
    pattern_name: str
    original: str
    replacement: str
    start: int
    end: int


@dataclass
class ScrubResult:
    sanitized: str
    redactions: list[Redaction] = field(default_factory=list)

    @property
    def was_modified(self) -> bool:
        return len(self.redactions) > 0
