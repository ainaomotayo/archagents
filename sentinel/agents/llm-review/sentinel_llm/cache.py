"""Redis-based result caching for LLM review findings.

Caches LLM results keyed by a SHA-256 content hash with a configurable
TTL (default 30 days) so repeated reviews of identical code are instant.

Supports ``agent_core.cache.RedisCache`` as backend when available.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from sentinel_agents.types import Confidence, Finding, Severity

logger = logging.getLogger(__name__)

_DEFAULT_TTL_DAYS = 30
_SECONDS_PER_DAY = 86_400
_KEY_PREFIX = "sentinel:llm-review:cache:"


class ReviewCache:
    """Async Redis-backed cache for LLM review results.

    Can be initialised with either:
    - A raw Redis client (``redis_client``)
    - An ``agent_core.cache.RedisCache`` instance (``core_cache``)
    """

    def __init__(
        self,
        redis_client: Any = None,
        *,
        core_cache: Any = None,
    ) -> None:
        self._redis = redis_client
        self._core_cache = core_cache

    @classmethod
    def from_core_cache(cls, core_cache: Any) -> ReviewCache:
        """Create a ReviewCache backed by ``agent_core.cache.RedisCache``."""
        return cls(core_cache=core_cache)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def get(self, content_hash: str) -> list[Finding] | None:
        """Return cached findings for *content_hash*, or ``None`` on miss."""
        # Try agent_core cache first
        if self._core_cache is not None:
            try:
                data = await self._core_cache.get(content_hash)
                if data is None:
                    return None
                return [_finding_from_dict(d) for d in data]
            except Exception:
                logger.warning("Core cache GET failed", exc_info=True)
                return None

        # Fallback to raw Redis
        key = f"{_KEY_PREFIX}{content_hash}"
        try:
            raw = await self._redis.get(key)
        except Exception:
            logger.warning("Redis GET failed for %s", key, exc_info=True)
            return None

        if raw is None:
            return None

        try:
            data = json.loads(raw)
            return [_finding_from_dict(d) for d in data]
        except Exception:
            logger.warning("Failed to deserialise cached findings", exc_info=True)
            return None

    async def set(
        self,
        content_hash: str,
        findings: list[Finding],
        ttl_days: int = _DEFAULT_TTL_DAYS,
    ) -> None:
        """Store *findings* under *content_hash* with the given TTL."""
        ttl_seconds = ttl_days * _SECONDS_PER_DAY
        payload = [_finding_to_dict(f) for f in findings]

        # Try agent_core cache first
        if self._core_cache is not None:
            try:
                await self._core_cache.set(content_hash, payload, ttl_seconds=ttl_seconds)
                return
            except Exception:
                logger.warning("Core cache SET failed", exc_info=True)
                return

        # Fallback to raw Redis
        key = f"{_KEY_PREFIX}{content_hash}"
        try:
            await self._redis.set(key, json.dumps(payload), ex=ttl_seconds)
        except Exception:
            logger.warning("Redis SET failed for %s", key, exc_info=True)

    # ------------------------------------------------------------------
    # Hashing helper
    # ------------------------------------------------------------------

    @staticmethod
    def hash_content(code: str) -> str:
        """Return the SHA-256 hex digest of *code*."""
        return hashlib.sha256(code.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Internal serialisation helpers
# ---------------------------------------------------------------------------

def _finding_to_dict(f: Finding) -> dict[str, Any]:
    return {
        "type": f.type,
        "file": f.file,
        "line_start": f.line_start,
        "line_end": f.line_end,
        "severity": f.severity.value,
        "confidence": f.confidence.value,
        "title": f.title,
        "description": f.description,
        "remediation": f.remediation,
        "category": f.category,
        "scanner": f.scanner,
        "cwe_id": f.cwe_id,
    }


def _finding_from_dict(d: dict[str, Any]) -> Finding:
    return Finding(
        type=d["type"],
        file=d["file"],
        line_start=d["line_start"],
        line_end=d["line_end"],
        severity=Severity(d["severity"]),
        confidence=Confidence(d["confidence"]),
        title=d.get("title", ""),
        description=d.get("description", ""),
        remediation=d.get("remediation", ""),
        category=d.get("category", ""),
        scanner=d.get("scanner", "llm-review"),
        cwe_id=d.get("cwe_id"),
    )
