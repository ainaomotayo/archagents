"""E2E test: SSE client disconnect/reconnect with Last-Event-ID.

Verifies that after a simulated disconnect, a subscriber can resume
from where it left off using Last-Event-ID.
"""

from __future__ import annotations

import asyncio
import json
from collections import defaultdict

import pytest

from agent_core.streaming.types import EventType, StreamEvent
from agent_core.streaming.sse import SSEPublisher


# ---------------------------------------------------------------------------
# Fake Redis (shared with test_pipeline)
# ---------------------------------------------------------------------------

class FakeRedis:
    def __init__(self):
        self._streams: dict[str, list[tuple[str, dict]]] = defaultdict(list)
        self._counter = 0

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
        pass

    @staticmethod
    def _id_gt(a: str, b: str) -> bool:
        a_parts = a.split("-")
        b_parts = b.split("-")
        return int(a_parts[0]) > int(b_parts[0])


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestSSEReconnect:
    def test_subscribe_from_beginning(self):
        """Subscribing from 0-0 should yield all events."""
        fake_redis = FakeRedis()
        publisher = SSEPublisher(fake_redis)
        scan_id = "scan-reconnect-001"

        async def run():
            # Publish 3 events
            await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.AGENT_STARTED, data={"agent": "security"},
            ))
            await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.FINDING_NEW, data={"title": "SQLi"},
            ))
            await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.SCAN_COMPLETED, data={"total": 1},
            ))

            # Subscribe from beginning
            events = []
            async for event in publisher.subscribe(scan_id, last_event_id="0-0"):
                events.append(event)
                if event.event_type == EventType.SCAN_COMPLETED:
                    break

            return events

        events = asyncio.run(run())
        assert len(events) == 3
        assert events[0].event_type == EventType.AGENT_STARTED
        assert events[2].event_type == EventType.SCAN_COMPLETED

    def test_reconnect_with_last_event_id(self):
        """Subscribing with Last-Event-ID skips already-received events."""
        fake_redis = FakeRedis()
        publisher = SSEPublisher(fake_redis)
        scan_id = "scan-reconnect-002"

        async def run():
            # Publish 3 events, capture IDs
            id1 = await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.AGENT_STARTED, data={"agent": "security"},
            ))
            id2 = await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.FINDING_NEW, data={"title": "SQLi"},
            ))
            id3 = await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.SCAN_COMPLETED, data={"total": 1},
            ))

            # Subscribe from id1 — should only get event 2 and 3
            events = []
            async for event in publisher.subscribe(scan_id, last_event_id=id1):
                events.append(event)
                if event.event_type == EventType.SCAN_COMPLETED:
                    break

            return events

        events = asyncio.run(run())
        assert len(events) == 2
        assert events[0].event_type == EventType.FINDING_NEW
        assert events[1].event_type == EventType.SCAN_COMPLETED

    def test_reconnect_after_all_events(self):
        """Subscribing after all events should yield nothing new."""
        fake_redis = FakeRedis()
        publisher = SSEPublisher(fake_redis)
        scan_id = "scan-reconnect-003"

        async def run():
            await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.AGENT_STARTED, data={"agent": "security"},
            ))
            last_id = await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.SCAN_COMPLETED, data={"total": 0},
            ))

            # Subscribe after all events — xread returns None continuously.
            # The subscribe generator never terminates on its own, so we use
            # a short timeout to confirm no events arrive.
            events = []
            async def collect():
                async for event in publisher.subscribe(scan_id, last_event_id=last_id, poll_ms=10):
                    events.append(event)

            try:
                await asyncio.wait_for(collect(), timeout=0.1)
            except asyncio.TimeoutError:
                pass  # Expected — no events to yield

            return events

        events = asyncio.run(run())
        assert len(events) == 0

    def test_event_data_preserved_across_reconnect(self):
        """Event data should be identical before disconnect and after reconnect."""
        fake_redis = FakeRedis()
        publisher = SSEPublisher(fake_redis)
        scan_id = "scan-reconnect-004"

        original_data = {"title": "XSS", "severity": "high", "details": {"cwe": "CWE-79"}}

        async def run():
            await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.FINDING_NEW, data=original_data,
            ))
            await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.SCAN_COMPLETED, data={},
            ))

            events = []
            async for event in publisher.subscribe(scan_id, last_event_id="0-0"):
                events.append(event)
                if event.event_type == EventType.SCAN_COMPLETED:
                    break

            return events

        events = asyncio.run(run())
        assert len(events) == 2
        finding = events[0]
        assert finding.data["title"] == "XSS"
        assert finding.data["severity"] == "high"
        assert finding.data["details"]["cwe"] == "CWE-79"

    def test_sse_wire_format(self):
        """StreamEvent.to_sse() should produce valid SSE format."""
        event = StreamEvent(
            event_type=EventType.FINDING_NEW,
            data={"title": "Test"},
            id="42-0",
        )
        sse_text = event.to_sse()
        assert "event: finding.new\n" in sse_text
        assert "id: 42-0\n" in sse_text
        assert 'data: {"title": "Test"}\n' in sse_text
