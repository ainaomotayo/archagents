from __future__ import annotations

import json
import logging
from typing import Any, Callable

import redis

logger = logging.getLogger(__name__)


class RedisEventProducer:
    """Publishes events to Redis Streams."""

    def __init__(self, redis_client: redis.Redis) -> None:
        self._redis = redis_client

    def publish(self, stream: str, data: dict[str, Any]) -> str:
        serialized = json.dumps(data)
        msg_id: bytes = self._redis.xadd(stream, {"data": serialized})
        return msg_id.decode() if isinstance(msg_id, bytes) else str(msg_id)


class RedisEventConsumer:
    """Consumes events from Redis Streams using consumer groups."""

    def __init__(
        self,
        redis_client: redis.Redis,
        stream: str,
        group: str,
        consumer: str,
    ) -> None:
        self._redis = redis_client
        self._stream = stream
        self._group = group
        self._consumer = consumer
        self._running = False

        # Create consumer group if it doesn't exist
        try:
            self._redis.xgroup_create(stream, group, id="0", mkstream=True)
        except redis.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise

    def consume(
        self,
        handler: Callable[[str, dict[str, Any]], None],
        block_ms: int = 5000,
        count: int = 10,
    ) -> None:
        """Block and consume messages, calling handler for each."""
        self._running = True
        while self._running:
            results = self._redis.xreadgroup(
                self._group,
                self._consumer,
                {self._stream: ">"},
                count=count,
                block=block_ms,
            )
            if not results:
                continue

            for stream_name, messages in results:
                for msg_id, fields in messages:
                    raw_id = msg_id.decode() if isinstance(msg_id, bytes) else str(msg_id)
                    raw_data = fields.get(b"data") or fields.get("data")
                    if raw_data is None:
                        continue
                    if isinstance(raw_data, bytes):
                        raw_data = raw_data.decode()
                    data = json.loads(raw_data)
                    handler(raw_id, data)
                    self._redis.xack(self._stream, self._group, msg_id)

    def stop(self) -> None:
        self._running = False
