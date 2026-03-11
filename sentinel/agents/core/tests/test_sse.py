"""Tests for SSE publisher with mocked Redis."""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock

import pytest

from agent_core.streaming.sse import SSEPublisher
from agent_core.streaming.types import EventType, StreamEvent


class MockRedis:
    """Minimal async Redis mock for stream operations."""

    def __init__(self) -> None:
        self._streams: dict[str, list[tuple[str, dict[str, str]]]] = {}
        self._counter = 0
        self._ttls: dict[str, int] = {}

    async def xadd(self, key: str, fields: dict[str, str]) -> str:
        self._counter += 1
        stream_id = f"1709312400000-{self._counter}"
        if key not in self._streams:
            self._streams[key] = []
        self._streams[key].append((stream_id, fields))
        return stream_id

    async def xread(
        self,
        streams: dict[str, str],
        count: int = 100,
        block: int = 0,
    ) -> list[tuple[str, list[tuple[str, dict[str, str]]]]]:
        result = []
        for key, cursor in streams.items():
            if key not in self._streams:
                continue
            entries = []
            for sid, fields in self._streams[key]:
                if sid > cursor:
                    entries.append((sid, fields))
                    if len(entries) >= count:
                        break
            if entries:
                result.append((key, entries))
        return result

    async def expire(self, key: str, seconds: int) -> None:
        self._ttls[key] = seconds


@pytest.fixture
def mock_redis() -> MockRedis:
    return MockRedis()


@pytest.fixture
def publisher(mock_redis: MockRedis) -> SSEPublisher:
    return SSEPublisher(mock_redis)


class TestStreamEvent:
    def test_to_sse_format(self) -> None:
        event = StreamEvent(
            event_type=EventType.FINDING_NEW,
            data={"agent": "security", "severity": "HIGH"},
            id="123-0",
        )
        sse = event.to_sse()
        assert "event: finding.new" in sse
        assert "id: 123-0" in sse
        assert '"agent": "security"' in sse

    def test_to_redis_roundtrip(self) -> None:
        event = StreamEvent(
            event_type=EventType.SCAN_PROGRESS,
            data={"phase": "pass1", "agents_done": 3},
        )
        redis_data = event.to_redis()
        assert redis_data["event_type"] == "scan.progress"
        parsed = json.loads(redis_data["data"])
        assert parsed["phase"] == "pass1"

    def test_from_redis(self) -> None:
        fields = {
            b"event_type": b"agent.started",
            b"data": b'{"agent": "security"}',
        }
        event = StreamEvent.from_redis("100-1", fields)
        assert event.event_type == EventType.AGENT_STARTED
        assert event.data["agent"] == "security"
        assert event.id == "100-1"


class TestSSEPublisher:
    @pytest.mark.asyncio
    async def test_publish(self, publisher: SSEPublisher, mock_redis: MockRedis) -> None:
        event = StreamEvent(
            event_type=EventType.FINDING_NEW,
            data={"title": "SQL injection"},
        )
        stream_id = await publisher.publish("scan-1", event)
        assert stream_id.startswith("1709312400000-")
        assert event.id == stream_id
        assert "sentinel.sse:scan-1" in mock_redis._streams

    @pytest.mark.asyncio
    async def test_subscribe_reads_events(
        self, publisher: SSEPublisher, mock_redis: MockRedis
    ) -> None:
        # Publish 3 events
        for i in range(3):
            await publisher.publish(
                "scan-1",
                StreamEvent(
                    event_type=EventType.FINDING_NEW,
                    data={"index": i},
                ),
            )

        # Subscribe and read
        events = []
        async for event in publisher.subscribe("scan-1"):
            events.append(event)
            if len(events) >= 3:
                break
        assert len(events) == 3
        assert events[0].data["index"] == 0
        assert events[2].data["index"] == 2

    @pytest.mark.asyncio
    async def test_subscribe_last_event_id(
        self, publisher: SSEPublisher, mock_redis: MockRedis
    ) -> None:
        # Publish 3 events
        ids = []
        for i in range(3):
            sid = await publisher.publish(
                "scan-1",
                StreamEvent(event_type=EventType.FINDING_NEW, data={"i": i}),
            )
            ids.append(sid)

        # Subscribe starting after the first event
        events = []
        async for event in publisher.subscribe("scan-1", last_event_id=ids[0]):
            events.append(event)
            if len(events) >= 2:
                break
        assert len(events) == 2
        assert events[0].data["i"] == 1
        assert events[1].data["i"] == 2

    @pytest.mark.asyncio
    async def test_set_ttl(self, publisher: SSEPublisher, mock_redis: MockRedis) -> None:
        await publisher.set_ttl("scan-1", 7200)
        assert mock_redis._ttls["sentinel.sse:scan-1"] == 7200

    @pytest.mark.asyncio
    async def test_publish_scan_completed(
        self, publisher: SSEPublisher, mock_redis: MockRedis
    ) -> None:
        summary = {"total_findings": 18, "enriched": 5}
        stream_id = await publisher.publish_scan_completed("scan-1", summary)
        assert stream_id
        # TTL should be set
        assert "sentinel.sse:scan-1" in mock_redis._ttls
        assert mock_redis._ttls["sentinel.sse:scan-1"] == SSEPublisher.DEFAULT_TTL
