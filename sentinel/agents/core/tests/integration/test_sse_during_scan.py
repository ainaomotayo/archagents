"""Integration tests for SSE event publishing during orchestrated scans.

Verifies that the ScanOrchestrator publishes the expected SSE events
at each pipeline stage via a mock SSEPublisher.
"""

from __future__ import annotations

import asyncio
import json
import os
from unittest.mock import AsyncMock, MagicMock

import pytest

from sentinel_agents.base import BaseAgent
from sentinel_agents.types import (
    Confidence,
    DiffEvent,
    Finding,
    Severity,
)
from sentinel_agents.orchestrator import ScanOrchestrator
from agent_core.streaming.types import EventType, StreamEvent

FIXTURES = os.path.join(os.path.dirname(__file__), "..", "fixtures")


def _load_diff_event(name: str) -> DiffEvent:
    with open(os.path.join(FIXTURES, name)) as f:
        data = json.load(f)
    return DiffEvent.from_dict(data)


class SimpleAgent(BaseAgent):
    name = "simple"
    version = "0.1.0"

    def process(self, event: DiffEvent) -> list[Finding]:
        return [
            Finding(
                type="security", file="test.py", line_start=1, line_end=1,
                severity=Severity.LOW, confidence=Confidence.LOW,
                title="Test finding", description="test",
                remediation="fix", category="test", scanner="simple",
            )
        ]


class TestSSEDuringScan:
    def test_sse_events_published(self):
        """SSE publisher should receive progress events during scan."""
        sse = AsyncMock()
        sse.publish = AsyncMock(return_value="1-0")
        sse.publish_scan_completed = AsyncMock(return_value="99-0")

        agents = [SimpleAgent()]
        orchestrator = ScanOrchestrator(agents=agents, sse_publisher=sse)
        event = _load_diff_event("known_bad_diff.json")

        asyncio.run(orchestrator.run_scan(event))

        # Should have called publish at least for:
        # 1. scan start (pass1 progress)
        # 2. agent completed
        # 3. pass1_complete progress
        # 4. scan_completed
        assert sse.publish.call_count >= 2
        assert sse.publish_scan_completed.call_count == 1

    def test_sse_progress_event_data(self):
        """Progress events should contain phase, agents_done, findings count."""
        published_events: list[StreamEvent] = []

        async def capture_publish(scan_id: str, event: StreamEvent) -> str:
            published_events.append(event)
            return "1-0"

        sse = AsyncMock()
        sse.publish = AsyncMock(side_effect=capture_publish)
        sse.publish_scan_completed = AsyncMock(return_value="99-0")

        agents = [SimpleAgent()]
        orchestrator = ScanOrchestrator(agents=agents, sse_publisher=sse)
        event = _load_diff_event("known_bad_diff.json")

        asyncio.run(orchestrator.run_scan(event))

        # First event should be scan start progress
        assert len(published_events) >= 1
        first = published_events[0]
        assert first.event_type == EventType.SCAN_PROGRESS
        assert "phase" in first.data

    def test_agent_completed_events(self):
        """Each agent should emit a AGENT_COMPLETED SSE event."""
        published_events: list[StreamEvent] = []

        async def capture_publish(scan_id: str, event: StreamEvent) -> str:
            published_events.append(event)
            return "1-0"

        sse = AsyncMock()
        sse.publish = AsyncMock(side_effect=capture_publish)
        sse.publish_scan_completed = AsyncMock(return_value="99-0")

        agents = [SimpleAgent()]
        orchestrator = ScanOrchestrator(agents=agents, sse_publisher=sse)
        event = _load_diff_event("known_bad_diff.json")

        asyncio.run(orchestrator.run_scan(event))

        agent_completed = [
            e for e in published_events
            if e.event_type == EventType.AGENT_COMPLETED
        ]
        assert len(agent_completed) == 1
        assert agent_completed[0].data["agent"] == "simple"

    def test_scan_completed_event(self):
        """Scan completion should publish summary with finding count."""
        sse = AsyncMock()
        sse.publish = AsyncMock(return_value="1-0")
        sse.publish_scan_completed = AsyncMock(return_value="99-0")

        agents = [SimpleAgent()]
        orchestrator = ScanOrchestrator(agents=agents, sse_publisher=sse)
        event = _load_diff_event("known_bad_diff.json")

        asyncio.run(orchestrator.run_scan(event))

        sse.publish_scan_completed.assert_called_once()
        call_args = sse.publish_scan_completed.call_args
        assert call_args[0][0] == "scan-bad-001"  # scan_id
        summary = call_args[0][1]
        assert "total_findings" in summary

    def test_no_sse_publisher_does_not_crash(self):
        """Orchestrator without SSE publisher should work fine."""
        agents = [SimpleAgent()]
        orchestrator = ScanOrchestrator(agents=agents, sse_publisher=None)
        event = _load_diff_event("known_bad_diff.json")

        result = asyncio.run(orchestrator.run_scan(event))

        assert result.status == "completed"
        assert len(result.findings) == 1

    def test_sse_failure_does_not_crash_scan(self):
        """If SSE publish fails, scan should still complete."""
        sse = AsyncMock()
        sse.publish = AsyncMock(side_effect=ConnectionError("Redis down"))
        sse.publish_scan_completed = AsyncMock(side_effect=ConnectionError("Redis down"))

        agents = [SimpleAgent()]
        orchestrator = ScanOrchestrator(agents=agents, sse_publisher=sse)
        event = _load_diff_event("known_bad_diff.json")

        result = asyncio.run(orchestrator.run_scan(event))

        # Scan should complete despite SSE failures
        assert result.status == "completed"
        assert len(result.findings) == 1
