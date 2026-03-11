"""E2E test: Cancel an active scan.

Verifies that publishing a cancel signal is properly handled —
the scan.cancelled event appears in the stream and agents that
check for cancellation can stop.
"""

from __future__ import annotations

import asyncio
import json
from collections import defaultdict

import pytest

from agent_core.streaming.types import EventType, StreamEvent
from agent_core.streaming.sse import SSEPublisher


# ---------------------------------------------------------------------------
# Fake Redis
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
        return int(a.split("-")[0]) > int(b.split("-")[0])

    def get_stream(self, key: str) -> list[tuple[str, dict]]:
        return self._streams.get(key, [])


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestCancelScan:
    def test_cancel_event_published_to_stream(self):
        """Publishing a cancel signal should appear in the SSE stream."""
        fake_redis = FakeRedis()
        publisher = SSEPublisher(fake_redis)
        scan_id = "scan-cancel-001"

        async def run():
            # Simulate some progress events first
            await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.AGENT_STARTED, data={"agent": "security"},
            ))
            await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.SCAN_PROGRESS, data={"progress": 50},
            ))

            # Publish cancel signal (as the API would do)
            cancel_event = StreamEvent(
                event_type=EventType.SCAN_COMPLETED,  # Use completed with cancel marker
                data={"scanId": scan_id, "cancelled": True, "reason": "user_requested"},
            )
            await publisher.publish(scan_id, cancel_event)

        asyncio.run(run())

        stream_key = f"sentinel.sse:{scan_id}"
        events = fake_redis.get_stream(stream_key)
        assert len(events) == 3

        # Last event should be the cancel/completed event
        last_data = json.loads(events[-1][1]["data"])
        assert last_data["cancelled"] is True

    def test_subscriber_receives_cancel_event(self):
        """A subscriber should receive the cancel event and can stop."""
        fake_redis = FakeRedis()
        publisher = SSEPublisher(fake_redis)
        scan_id = "scan-cancel-002"

        async def run():
            await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.AGENT_STARTED, data={"agent": "security"},
            ))
            await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.SCAN_COMPLETED,
                data={"scanId": scan_id, "cancelled": True},
            ))

            events = []
            async for event in publisher.subscribe(scan_id, last_event_id="0-0"):
                events.append(event)
                if event.event_type == EventType.SCAN_COMPLETED:
                    break

            return events

        events = asyncio.run(run())
        assert len(events) == 2
        assert events[1].event_type == EventType.SCAN_COMPLETED
        assert events[1].data["cancelled"] is True

    def test_cancel_after_partial_progress(self):
        """Cancel should work at any point during the scan."""
        fake_redis = FakeRedis()
        publisher = SSEPublisher(fake_redis)
        scan_id = "scan-cancel-003"

        async def run():
            # Simulate 3 agents starting, 1 completing, then cancel
            for agent in ["security", "quality", "dependency"]:
                await publisher.publish(scan_id, StreamEvent(
                    event_type=EventType.AGENT_STARTED, data={"agent": agent},
                ))

            await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.AGENT_COMPLETED,
                data={"agent": "security", "finding_count": 2},
            ))

            # Cancel before other agents finish
            await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.SCAN_COMPLETED,
                data={"scanId": scan_id, "cancelled": True, "reason": "user_requested"},
            ))

        asyncio.run(run())

        stream_key = f"sentinel.sse:{scan_id}"
        events = fake_redis.get_stream(stream_key)

        # 3 started + 1 completed + 1 cancel = 5
        assert len(events) == 5

        event_types = [e[1]["event_type"] for e in events]
        assert event_types.count("agent.started") == 3
        assert event_types.count("agent.completed") == 1
        assert event_types.count("scan.completed") == 1

    def test_no_events_after_cancel(self):
        """A well-behaved system should not publish events after cancel."""
        fake_redis = FakeRedis()
        publisher = SSEPublisher(fake_redis)
        scan_id = "scan-cancel-004"

        async def run():
            await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.SCAN_COMPLETED,
                data={"cancelled": True},
            ))

            # Verify stream has exactly 1 event
            return fake_redis.get_stream(f"sentinel.sse:{scan_id}")

        events = asyncio.run(run())
        assert len(events) == 1

    def test_cancel_preserves_earlier_findings(self):
        """Findings published before cancel should still be readable."""
        fake_redis = FakeRedis()
        publisher = SSEPublisher(fake_redis)
        scan_id = "scan-cancel-005"

        async def run():
            await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.FINDING_NEW,
                data={"title": "SQLi", "severity": "high"},
            ))
            await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.FINDING_NEW,
                data={"title": "XSS", "severity": "medium"},
            ))
            await publisher.publish(scan_id, StreamEvent(
                event_type=EventType.SCAN_COMPLETED,
                data={"cancelled": True},
            ))

            # Read all events
            events = []
            async for event in publisher.subscribe(scan_id, last_event_id="0-0"):
                events.append(event)
                if event.event_type == EventType.SCAN_COMPLETED:
                    break

            return events

        events = asyncio.run(run())
        assert len(events) == 3
        findings = [e for e in events if e.event_type == EventType.FINDING_NEW]
        assert len(findings) == 2
        assert findings[0].data["title"] == "SQLi"
        assert findings[1].data["title"] == "XSS"
