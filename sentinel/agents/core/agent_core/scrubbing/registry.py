"""Agent-specific scrubber registry. Applies base patterns FIRST, then agent-specific."""

from __future__ import annotations

import re

from .base import BaseScrubber
from .types import Redaction, ScrubResult


class ScrubberRegistry:
    """Registry for layered scrubbing: mandatory base + agent-specific patterns."""

    def __init__(self) -> None:
        self._base = BaseScrubber()
        self._agent_patterns: dict[str, dict[str, re.Pattern[str]]] = {}

    def register(self, agent_name: str, patterns: dict[str, str]) -> None:
        self._agent_patterns[agent_name] = {
            name: re.compile(pat) for name, pat in patterns.items()
        }

    def scrub(self, agent_name: str, text: str) -> ScrubResult:
        # Step 1: mandatory base scrubbing
        base_result = self._base.scrub(text)
        result = base_result.sanitized
        all_redactions = list(base_result.redactions)

        # Step 2: agent-specific patterns
        agent_patterns = self._agent_patterns.get(agent_name, {})
        if agent_patterns:
            matches: list[tuple[int, int, str, str]] = []
            for name, pattern in agent_patterns.items():
                for m in pattern.finditer(result):
                    matches.append((m.start(), m.end(), name, m.group()))

            matches.sort(key=lambda x: x[0], reverse=True)
            for start, end, name, original in matches:
                replacement = f"[REDACTED:{name}]"
                result = result[:start] + replacement + result[end:]
                all_redactions.append(
                    Redaction(
                        pattern_name=name,
                        original=original,
                        replacement=replacement,
                        start=start,
                        end=end,
                    )
                )

        return ScrubResult(sanitized=result, redactions=all_redactions)

    def audit_log(self) -> list[Redaction]:
        return self._base.audit_log()
