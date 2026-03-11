"""E2E test: Full pipeline from diff event through agents, correlation, SSE.

Uses a FakeRedis implementation to simulate the full pipeline without
requiring a running Redis instance.
"""

from __future__ import annotations

import asyncio
import json
import os
from collections import defaultdict
from unittest.mock import AsyncMock

import pytest

from sentinel_agents.base import BaseAgent
from sentinel_agents.types import (
    Confidence,
    DiffEvent,
    Finding,
    Severity,
)
from sentinel_agents.orchestrator import ScanOrchestrator
from agent_core.correlation.engine import CorrelationEngine
from agent_core.streaming.types import EventType, StreamEvent
from agent_core.streaming.sse import SSEPublisher

FIXTURES = os.path.join(os.path.dirname(__file__), "..", "fixtures")


# ---------------------------------------------------------------------------
# Fake Redis for E2E testing
# ---------------------------------------------------------------------------

class FakeRedis:
    """Minimal Redis mock supporting streams (XADD, XREAD) and key-value."""

    def __init__(self):
        self._streams: dict[str, list[tuple[str, dict]]] = defaultdict(list)
        self._counter = 0
        self._ttls: dict[str, int] = {}

    async def xadd(self, key: str, data: dict[str, str]) -> str:
        self._counter += 1
        stream_id = f"{self._counter}-0"
        self._streams[key].append((stream_id, data))
        return stream_id

    async def xread(self, streams: dict[str, str], count: int = 100, block: int = 0) -> list:
        results = []
        for key, last_id in streams.items():
            messages = []
            for msg_id, fields in self._streams.get(key, []):
                if self._id_gt(msg_id, last_id):
                    messages.append((msg_id, fields))
            if messages:
                results.append((key, messages[:count]))
        return results if results else None

    async def expire(self, key: str, ttl: int) -> None:
        self._ttls[key] = ttl

    @staticmethod
    def _id_gt(a: str, b: str) -> bool:
        a_parts = a.split("-")
        b_parts = b.split("-")
        return int(a_parts[0]) > int(b_parts[0])

    def get_stream(self, key: str) -> list[tuple[str, dict]]:
        return self._streams.get(key, [])


# ---------------------------------------------------------------------------
# Test agents
# ---------------------------------------------------------------------------

class SecurityAgent(BaseAgent):
    name = "security"
    version = "0.1.0"

    def process(self, event):
        findings = []
        for f in event.files:
            for hunk in f.hunks:
                if "eval(" in hunk.content or "exec(" in hunk.content:
                    findings.append(Finding(
                        type="security", file=f.path, line_start=1, line_end=1,
                        severity=Severity.HIGH, confidence=Confidence.HIGH,
                        title="Dangerous eval/exec", description="eval/exec found",
                        remediation="Remove eval", category="CWE-95",
                        scanner="security",
                    ))
        return findings


class QualityAgent(BaseAgent):
    name = "quality"
    version = "0.1.0"

    def process(self, event):
        findings = []
        for f in event.files:
            for hunk in f.hunks:
                lines = [l for l in hunk.content.split("\n") if l.startswith("+")]
                if len(lines) > 10:
                    findings.append(Finding(
                        type="quality", file=f.path, line_start=1, line_end=len(lines),
                        severity=Severity.MEDIUM, confidence=Confidence.MEDIUM,
                        title="Large code addition", description="Many lines added",
                        remediation="Review for complexity", category="complexity",
                        scanner="quality",
                    ))
        return findings


def _load_diff_event(name: str) -> DiffEvent:
    with open(os.path.join(FIXTURES, name)) as f:
        data = json.load(f)
    return DiffEvent.from_dict(data)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestFullPipeline:
    def test_diff_to_findings_to_sse(self):
        """Full pipeline: diff -> agents -> correlation -> SSE events."""
        fake_redis = FakeRedis()
        sse = SSEPublisher(fake_redis)
        engine = CorrelationEngine()

        agents = [SecurityAgent(), QualityAgent()]
        orchestrator = ScanOrchestrator(
            agents=agents,
            correlation_engine=engine,
            sse_publisher=sse,
        )

        event = _load_diff_event("known_bad_diff.json")
        result = asyncio.run(orchestrator.run_scan(event))

        # Pipeline should complete
        assert result.status == "completed"
        assert result.scan_id == "scan-bad-001"

        # Agents should produce findings
        assert len(result.findings) > 0

        # SSE events should be in Redis stream
        stream_key = f"sentinel.sse:{event.scan_id}"
        events = fake_redis.get_stream(stream_key)
        assert len(events) > 0

        # Should have progress and completion events
        event_types = [e[1].get("event_type") for e in events]
        assert "scan.progress" in event_types
        assert "agent.completed" in event_types
        assert "scan.completed" in event_types

    def test_clean_diff_pipeline(self):
        """Clean diff should produce zero findings but still emit SSE events."""
        fake_redis = FakeRedis()
        sse = SSEPublisher(fake_redis)

        agents = [SecurityAgent(), QualityAgent()]
        orchestrator = ScanOrchestrator(agents=agents, sse_publisher=sse)

        event = _load_diff_event("clean_diff.json")
        result = asyncio.run(orchestrator.run_scan(event))

        assert result.status == "completed"
        assert len(result.findings) == 0

        # SSE events should still be published
        stream_key = f"sentinel.sse:{event.scan_id}"
        events = fake_redis.get_stream(stream_key)
        assert len(events) > 0

    def test_correlation_enriches_pipeline_results(self):
        """Findings from multiple agents should be correlated."""
        fake_redis = FakeRedis()
        sse = SSEPublisher(fake_redis)
        engine = CorrelationEngine()

        agents = [SecurityAgent(), QualityAgent()]
        orchestrator = ScanOrchestrator(
            agents=agents,
            correlation_engine=engine,
            sse_publisher=sse,
        )

        event = _load_diff_event("known_bad_diff.json")
        result = asyncio.run(orchestrator.run_scan(event))

        # Should have enriched findings
        assert len(result.enriched_findings) > 0

    def test_sse_stream_ttl_set_on_completion(self):
        """SSE stream should have TTL set after scan completion."""
        fake_redis = FakeRedis()
        sse = SSEPublisher(fake_redis)

        agents = [SecurityAgent()]
        orchestrator = ScanOrchestrator(agents=agents, sse_publisher=sse)

        event = _load_diff_event("known_bad_diff.json")
        asyncio.run(orchestrator.run_scan(event))

        stream_key = f"sentinel.sse:{event.scan_id}"
        assert stream_key in fake_redis._ttls
        assert fake_redis._ttls[stream_key] == SSEPublisher.DEFAULT_TTL

    def test_agent_results_tracked_individually(self):
        """Each agent's results should be individually tracked."""
        fake_redis = FakeRedis()
        sse = SSEPublisher(fake_redis)

        agents = [SecurityAgent(), QualityAgent()]
        orchestrator = ScanOrchestrator(agents=agents, sse_publisher=sse)

        event = _load_diff_event("known_bad_diff.json")
        result = asyncio.run(orchestrator.run_scan(event))

        assert len(result.agent_results) == 2
        agent_names = {r.agent_name for r in result.agent_results}
        assert "security" in agent_names
        assert "quality" in agent_names
