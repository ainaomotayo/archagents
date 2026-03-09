"""Redis-based result caching for LLM review findings.

Caches LLM results keyed by a SHA-256 content hash with a configurable
TTL (default 30 days) so repeated reviews of identical code are instant.
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
    """Async Redis-backed cache for LLM review results."""

    def __init__(self, redis_client: Any) -> None:
        self._redis = redis_client

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def get(self, content_hash: str) -> list[Finding] | None:
        """Return cached findings for *content_hash*, or ``None`` on miss."""
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
        key = f"{_KEY_PREFIX}{content_hash}"
        ttl_seconds = ttl_days * _SECONDS_PER_DAY
        payload = json.dumps([_finding_to_dict(f) for f in findings])
        try:
            await self._redis.set(key, payload, ex=ttl_seconds)
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
