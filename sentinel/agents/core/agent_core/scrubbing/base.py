"""Framework-level mandatory PII scrubber. Cannot be bypassed."""

from __future__ import annotations

import re
from typing import ClassVar

from .types import Redaction, ScrubResult


class BaseScrubber:
    """Mandatory scrubber with patterns that always apply."""

    MANDATORY_PATTERNS: ClassVar[dict[str, str]] = {
        "AWS_KEY": r"AKIA[0-9A-Z]{16}",
        "GCP_KEY": r"AIza[0-9A-Za-z\-_]{35}",
        "PRIVATE_KEY": r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----",
        "JWT": r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}",
        "CONNECTION_STRING": r"(?:postgres|mysql|mongodb|redis)://[^\s]+",
        "SSN": r"\b\d{3}-\d{2}-\d{4}\b",
        "EMAIL": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
        "API_KEY": r"(?:api[_-]?key|secret|token)\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{20,}",
        "BEARER_TOKEN": r"Bearer\s+[A-Za-z0-9_\-.~+/]{20,}=*",
        "GITHUB_TOKEN": r"gh[pousr]_[A-Za-z0-9_]{36,}",
    }

    def __init__(self) -> None:
        self._compiled: dict[str, re.Pattern[str]] = {
            name: re.compile(pattern)
            for name, pattern in self.MANDATORY_PATTERNS.items()
        }
        self._redactions: list[Redaction] = []

    def scrub(self, text: str) -> ScrubResult:
        redactions: list[Redaction] = []
        result = text

        # Collect all matches first to handle overlapping replacements
        all_matches: list[tuple[int, int, str, str]] = []
        for name, pattern in self._compiled.items():
            for m in pattern.finditer(result):
                all_matches.append((m.start(), m.end(), name, m.group()))

        # Sort by position (reverse) so replacements don't shift offsets
        all_matches.sort(key=lambda x: x[0], reverse=True)

        for start, end, name, original in all_matches:
            replacement = f"[REDACTED:{name}]"
            result = result[:start] + replacement + result[end:]
            redactions.append(
                Redaction(
                    pattern_name=name,
                    original=original,
                    replacement=replacement,
                    start=start,
                    end=end,
                )
            )

        # Reverse so redactions are in document order
        redactions.reverse()
        self._redactions.extend(redactions)

        return ScrubResult(sanitized=result, redactions=redactions)

    def audit_log(self) -> list[Redaction]:
        return list(self._redactions)

    def reset_audit_log(self) -> None:
        self._redactions.clear()
