"""Tests for WAL checkpoint and RunnerStats."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from sentinel_agents.runner import RunnerStats, WALCheckpoint


class MockRedis:
    """Minimal Redis mock for hash operations."""

    def __init__(self) -> None:
        self._hashes: dict[str, dict[str, str]] = {}
        self._ttls: dict[str, int] = {}

    def hset(self, key: str, field: str, value: str) -> None:
        if key not in self._hashes:
            self._hashes[key] = {}
        self._hashes[key][field] = value

    def hget(self, key: str, field: str) -> str | None:
        return self._hashes.get(key, {}).get(field)

    def hdel(self, key: str, field: str) -> None:
        if key in self._hashes:
            self._hashes[key].pop(field, None)

    def expire(self, key: str, seconds: int) -> None:
        self._ttls[key] = seconds


class TestWALCheckpoint:
    def test_save_and_load(self) -> None:
        r = MockRedis()
        wal = WALCheckpoint(r)
        wal.save("scan-1", "security", "1234-0")
        assert wal.load("scan-1", "security") == "1234-0"

    def test_load_missing(self) -> None:
        r = MockRedis()
        wal = WALCheckpoint(r)
        assert wal.load("scan-1", "security") is None

    def test_clear(self) -> None:
        r = MockRedis()
        wal = WALCheckpoint(r)
        wal.save("scan-1", "security", "1234-0")
        wal.clear("scan-1", "security")
        assert wal.load("scan-1", "security") is None

    def test_ttl_set(self) -> None:
        r = MockRedis()
        wal = WALCheckpoint(r)
        wal.save("scan-1", "security", "1234-0")
        assert r._ttls.get("sentinel.wal:scan-1") == 3600

    def test_multiple_agents(self) -> None:
        r = MockRedis()
        wal = WALCheckpoint(r)
        wal.save("scan-1", "security", "100-0")
        wal.save("scan-1", "quality", "200-0")
        assert wal.load("scan-1", "security") == "100-0"
        assert wal.load("scan-1", "quality") == "200-0"


class TestRunnerStats:
    def test_initial_state(self) -> None:
        stats = RunnerStats()
        assert stats.scans_processed == 0
        assert stats.scans_failed == 0
        assert stats.latency_p99_ms == 0.0
        assert stats.last_error is None

    def test_latency_p99(self) -> None:
        stats = RunnerStats()
        for i in range(100):
            stats.latencies.append(float(i))
        # p99 of [0..99] should be ~99
        assert stats.latency_p99_ms >= 98.0

    def test_latency_single(self) -> None:
        stats = RunnerStats()
        stats.latencies.append(42.0)
        assert stats.latency_p99_ms == 42.0

    def test_latency_maxlen(self) -> None:
        stats = RunnerStats()
        for i in range(200):
            stats.latencies.append(float(i))
        assert len(stats.latencies) == 100  # capped at 100
