"""SSE publisher backed by Redis Streams."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Any

from .types import EventType, StreamEvent

logger = logging.getLogger(__name__)


class SSEPublisher:
    """Publish and subscribe to scan events via Redis Streams."""

    STREAM_PREFIX = "sentinel.sse"
    DEFAULT_TTL = 3600  # 1 hour

    def __init__(self, redis_client: Any) -> None:
        self._redis = redis_client

    def _stream_key(self, scan_id: str) -> str:
        return f"{self.STREAM_PREFIX}:{scan_id}"

    async def publish(self, scan_id: str, event: StreamEvent) -> str:
        """Publish an event to the scan's SSE stream. Returns stream ID."""
        key = self._stream_key(scan_id)
        stream_id = await self._redis.xadd(key, event.to_redis())
        if isinstance(stream_id, bytes):
            stream_id = stream_id.decode("utf-8")
        event.id = stream_id
        return stream_id

    async def subscribe(
        self,
        scan_id: str,
        last_event_id: str = "0-0",
        poll_ms: int = 1000,
    ) -> AsyncIterator[StreamEvent]:
        """Subscribe to events, starting after last_event_id."""
        key = self._stream_key(scan_id)
        cursor = last_event_id

        while True:
            entries = await self._redis.xread(
                {key: cursor}, count=100, block=poll_ms
            )
            if entries:
                for _stream_name, messages in entries:
                    for msg_id, fields in messages:
                        if isinstance(msg_id, bytes):
                            msg_id = msg_id.decode("utf-8")
                        decoded_fields = {
                            (k.decode("utf-8") if isinstance(k, bytes) else k):
                            (v.decode("utf-8") if isinstance(v, bytes) else v)
                            for k, v in fields.items()
                        }
                        event = StreamEvent(
                            event_type=EventType(decoded_fields["event_type"]),
                            data=json.loads(decoded_fields["data"]),
                            id=msg_id,
                        )
                        cursor = msg_id
                        yield event
            else:
                # No new events — yield control
                await asyncio.sleep(0)

    async def set_ttl(self, scan_id: str, ttl_seconds: int | None = None) -> None:
        """Set TTL on the stream after scan completion."""
        key = self._stream_key(scan_id)
        ttl = ttl_seconds or self.DEFAULT_TTL
        await self._redis.expire(key, ttl)

    async def publish_scan_completed(
        self, scan_id: str, summary: dict[str, Any]
    ) -> str:
        """Publish scan.completed event and set TTL."""
        event = StreamEvent(
            event_type=EventType.SCAN_COMPLETED,
            data=summary,
        )
        stream_id = await self.publish(scan_id, event)
        await self.set_ttl(scan_id)
        return stream_id
