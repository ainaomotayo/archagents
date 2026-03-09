from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod

from sentinel_agents.types import AgentHealth, DiffEvent, Finding, FindingEvent

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    """Abstract base class for all SENTINEL analysis agents."""

    name: str = "unnamed"
    version: str = "0.0.0"
    ruleset_version: str = "rules-0.0.0"
    ruleset_hash: str = ""

    @abstractmethod
    def process(self, event: DiffEvent) -> list[Finding]:
        """Analyze a diff event and return findings."""
        ...

    def health(self) -> AgentHealth:
        """Return agent health status."""
        return AgentHealth(
            name=self.name,
            version=self.version,
            status="healthy",
        )

    def run_scan(self, event: DiffEvent) -> FindingEvent:
        """Execute process() with timing and error handling. Returns FindingEvent."""
        start = time.monotonic()
        try:
            findings = self.process(event)
            duration_ms = int((time.monotonic() - start) * 1000)
            return FindingEvent(
                scan_id=event.scan_id,
                agent_name=self.name,
                findings=findings,
                agent_version=self.version,
                ruleset_version=self.ruleset_version,
                ruleset_hash=self.ruleset_hash,
                status="completed",
                duration_ms=duration_ms,
            )
        except Exception as exc:
            duration_ms = int((time.monotonic() - start) * 1000)
            logger.exception("Agent %s failed processing scan %s", self.name, event.scan_id)
            return FindingEvent(
                scan_id=event.scan_id,
                agent_name=self.name,
                findings=[],
                agent_version=self.version,
                ruleset_version=self.ruleset_version,
                ruleset_hash=self.ruleset_hash,
                status="error",
                duration_ms=duration_ms,
                error_detail=str(exc),
            )
