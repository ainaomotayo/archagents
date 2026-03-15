"""Shared Redis caching with TTL and JSON serialization."""

from __future__ import annotations

import json
from typing import Any


class RedisCache:
    """Redis-backed cache with TTL and JSON serialization."""

    def __init__(self, redis_client: Any, prefix: str = "sentinel:cache") -> None:
        self._redis = redis_client
        self._prefix = prefix

    def _key(self, key: str) -> str:
        return f"{self._prefix}:{key}"

    async def get(self, key: str) -> Any | None:
        raw = await self._redis.get(self._key(key))
        if raw is None:
            return None
        return json.loads(raw)

    async def set(
        self, key: str, value: Any, ttl_seconds: int = 86400
    ) -> None:
        await self._redis.set(
            self._key(key),
            json.dumps(value, default=str),
            ex=ttl_seconds,
        )

    async def delete(self, key: str) -> None:
        await self._redis.delete(self._key(key))

    async def exists(self, key: str) -> bool:
        return bool(await self._redis.exists(self._key(key)))

    def get_sync(self, key: str) -> Any | None:
        raw = self._redis.get(self._key(key))
        if raw is None:
            return None
        return json.loads(raw)

    def set_sync(
        self, key: str, value: Any, ttl_seconds: int = 86400
    ) -> None:
        self._redis.set(
            self._key(key),
            json.dumps(value, default=str),
            ex=ttl_seconds,
        )
