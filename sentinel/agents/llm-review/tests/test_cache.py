"""Tests for the ReviewCache module."""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock

from sentinel_agents.types import Confidence, Finding, Severity

from sentinel_llm.cache import ReviewCache, _finding_from_dict, _finding_to_dict


# ---------------------------------------------------------------------------
# hash_content
# ---------------------------------------------------------------------------

def test_hash_deterministic():
    h1 = ReviewCache.hash_content("hello world")
    h2 = ReviewCache.hash_content("hello world")
    assert h1 == h2


def test_hash_different_for_different_content():
    h1 = ReviewCache.hash_content("aaa")
    h2 = ReviewCache.hash_content("bbb")
    assert h1 != h2


def test_hash_is_sha256_hex():
    h = ReviewCache.hash_content("test")
    assert len(h) == 64  # SHA-256 hex digest
    assert all(c in "0123456789abcdef" for c in h)


# ---------------------------------------------------------------------------
# Cache hit / miss
# ---------------------------------------------------------------------------

def _sample_finding() -> Finding:
    return Finding(
        type="security",
        file="app.py",
        line_start=10,
        line_end=12,
        severity=Severity.HIGH,
        confidence=Confidence.HIGH,
        title="SQL Injection",
        description="desc",
        remediation="fix",
        category="CWE-89",
        scanner="llm-review",
        cwe_id="CWE-89",
    )


def test_cache_miss_returns_none():
    redis_mock = AsyncMock()
    redis_mock.get.return_value = None
    cache = ReviewCache(redis_mock)
    result = asyncio.run(cache.get("nonexistent_hash"))
    assert result is None


def test_cache_hit_returns_findings():
    finding = _sample_finding()
    serialised = json.dumps([_finding_to_dict(finding)])

    redis_mock = AsyncMock()
    redis_mock.get.return_value = serialised
    cache = ReviewCache(redis_mock)

    result = asyncio.run(cache.get("some_hash"))
    assert result is not None
    assert len(result) == 1
    assert result[0].title == "SQL Injection"
    assert result[0].severity == Severity.HIGH


def test_cache_set_calls_redis_with_ttl():
    redis_mock = AsyncMock()
    cache = ReviewCache(redis_mock)
    finding = _sample_finding()

    asyncio.run(cache.set("hash123", [finding], ttl_days=30))

    redis_mock.set.assert_called_once()
    call_args = redis_mock.set.call_args
    assert call_args[0][0] == "sentinel:llm-review:cache:hash123"
    assert call_args[1]["ex"] == 30 * 86400


def test_cache_set_custom_ttl():
    redis_mock = AsyncMock()
    cache = ReviewCache(redis_mock)

    asyncio.run(cache.set("hash456", [], ttl_days=7))

    call_args = redis_mock.set.call_args
    assert call_args[1]["ex"] == 7 * 86400


# ---------------------------------------------------------------------------
# Serialisation round-trip
# ---------------------------------------------------------------------------

def test_finding_serialisation_roundtrip():
    original = _sample_finding()
    d = _finding_to_dict(original)
    restored = _finding_from_dict(d)
    assert restored.type == original.type
    assert restored.file == original.file
    assert restored.severity == original.severity
    assert restored.confidence == original.confidence
    assert restored.title == original.title
    assert restored.cwe_id == original.cwe_id


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------

def test_cache_get_handles_redis_error():
    redis_mock = AsyncMock()
    redis_mock.get.side_effect = ConnectionError("Redis down")
    cache = ReviewCache(redis_mock)
    result = asyncio.run(cache.get("hash"))
    assert result is None


def test_cache_set_handles_redis_error():
    redis_mock = AsyncMock()
    redis_mock.set.side_effect = ConnectionError("Redis down")
    cache = ReviewCache(redis_mock)
    # Should not raise
    asyncio.run(cache.set("hash", []))


# ---------------------------------------------------------------------------
# Core cache backend
# ---------------------------------------------------------------------------

def test_core_cache_get():
    """ReviewCache can use agent_core.cache.RedisCache as backend."""
    finding = _sample_finding()
    core_mock = AsyncMock()
    core_mock.get.return_value = [_finding_to_dict(finding)]

    cache = ReviewCache.from_core_cache(core_mock)
    result = asyncio.run(cache.get("hash123"))

    assert result is not None
    assert len(result) == 1
    assert result[0].title == "SQL Injection"
    core_mock.get.assert_called_once_with("hash123")


def test_core_cache_set():
    """ReviewCache delegates set to core cache when available."""
    core_mock = AsyncMock()
    cache = ReviewCache.from_core_cache(core_mock)
    finding = _sample_finding()

    asyncio.run(cache.set("hash123", [finding], ttl_days=7))

    core_mock.set.assert_called_once()
    call_args = core_mock.set.call_args
    assert call_args[0][0] == "hash123"
    assert call_args[1]["ttl_seconds"] == 7 * 86400


def test_core_cache_miss():
    core_mock = AsyncMock()
    core_mock.get.return_value = None
    cache = ReviewCache.from_core_cache(core_mock)
    result = asyncio.run(cache.get("miss"))
    assert result is None


def test_core_cache_error_returns_none():
    core_mock = AsyncMock()
    core_mock.get.side_effect = ConnectionError("down")
    cache = ReviewCache.from_core_cache(core_mock)
    result = asyncio.run(cache.get("hash"))
    assert result is None
