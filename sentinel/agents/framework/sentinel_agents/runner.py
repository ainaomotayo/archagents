from __future__ import annotations

import json
import logging
import os
import time
import threading
from collections import deque
from http.server import HTTPServer, BaseHTTPRequestHandler

import redis

from sentinel_agents.base import BaseAgent
from sentinel_agents.events import RedisEventConsumer, RedisEventProducer
from sentinel_agents.types import DiffEvent

logger = logging.getLogger(__name__)

# Retry configuration
MAX_RETRIES = 3
BASE_DELAY = 1.0  # seconds


class RunnerStats:
    """Tracks runtime stats for structured health reporting."""

    def __init__(self) -> None:
        self.scans_processed: int = 0
        self.scans_failed: int = 0
        self.latencies: deque[float] = deque(maxlen=100)
        self.last_error: str | None = None
        self.queue_depth: int = 0

    @property
    def latency_p99_ms(self) -> float:
        if not self.latencies:
            return 0.0
        sorted_lat = sorted(self.latencies)
        idx = int(len(sorted_lat) * 0.99)
        return sorted_lat[min(idx, len(sorted_lat) - 1)]


class WALCheckpoint:
    """Write-Ahead Log for scan recovery using Redis hashes."""

    def __init__(self, redis_client: redis.Redis) -> None:
        self._redis = redis_client

    def save(self, scan_id: str, agent_name: str, last_msg_id: str) -> None:
        key = f"sentinel.wal:{scan_id}"
        self._redis.hset(key, agent_name, last_msg_id)
        self._redis.expire(key, 3600)  # 1 hour TTL

    def load(self, scan_id: str, agent_name: str) -> str | None:
        key = f"sentinel.wal:{scan_id}"
        val = self._redis.hget(key, agent_name)
        if val and isinstance(val, bytes):
            return val.decode()
        return val

    def clear(self, scan_id: str, agent_name: str) -> None:
        key = f"sentinel.wal:{scan_id}"
        self._redis.hdel(key, agent_name)


def _retry_with_backoff(
    fn,
    *args,
    max_retries: int = MAX_RETRIES,
    base_delay: float = BASE_DELAY,
):
    """Execute fn with exponential backoff retry on failure."""
    last_error = None
    for attempt in range(max_retries + 1):
        try:
            return fn(*args)
        except Exception as exc:
            last_error = exc
            if attempt < max_retries:
                delay = base_delay * (2 ** attempt)
                logger.warning(
                    "Attempt %d/%d failed: %s. Retrying in %.1fs",
                    attempt + 1, max_retries + 1, exc, delay,
                )
                time.sleep(delay)
            else:
                logger.error("All %d attempts failed: %s", max_retries + 1, exc)
    raise last_error  # type: ignore[misc]


def run_agent(agent: BaseAgent) -> None:
    """Run an agent as a long-lived service consuming from Redis Streams."""
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    redis_client = redis.from_url(redis_url)

    consumer = RedisEventConsumer(
        redis_client=redis_client,
        stream="sentinel.diffs",
        group=f"agent-{agent.name}",
        consumer=f"{agent.name}-0",
    )
    producer = RedisEventProducer(redis_client)
    wal = WALCheckpoint(redis_client)
    stats = RunnerStats()

    # Start health check server in background
    health_port = int(os.environ.get("HEALTH_PORT", "8081"))
    _start_health_server(agent, health_port, stats)

    logger.info("Agent %s v%s started, consuming from sentinel.diffs", agent.name, agent.version)

    def handle_event(msg_id: str, data: dict) -> None:
        event = DiffEvent.from_dict(data)
        logger.info("Processing scan %s", event.scan_id)

        # WAL checkpoint: record we started this message
        wal.save(event.scan_id, agent.name, msg_id)

        start = time.monotonic()
        try:
            result = _retry_with_backoff(agent.run_scan, event)
            producer.publish("sentinel.findings", result.to_dict())
            latency_ms = (time.monotonic() - start) * 1000
            stats.latencies.append(latency_ms)
            stats.scans_processed += 1
            logger.info(
                "Scan %s complete: %d findings, status=%s, %.0fms",
                event.scan_id,
                len(result.findings),
                result.status,
                latency_ms,
            )
        except Exception as exc:
            stats.scans_failed += 1
            stats.last_error = str(exc)
            logger.exception("Scan %s failed after retries: %s", event.scan_id, exc)
        finally:
            # Clear WAL on completion (success or final failure)
            wal.clear(event.scan_id, agent.name)

    consumer.consume(handle_event)


def _start_health_server(agent: BaseAgent, port: int, stats: RunnerStats | None = None) -> None:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            health = agent.health()
            body: dict = {
                "name": health.name,
                "version": health.version,
                "status": health.status,
                "detail": health.detail,
            }
            if stats:
                body["stats"] = {
                    "scans_processed": stats.scans_processed,
                    "scans_failed": stats.scans_failed,
                    "latency_p99_ms": round(stats.latency_p99_ms, 1),
                    "queue_depth": stats.queue_depth,
                    "last_error": stats.last_error,
                }
            self.send_response(200 if health.status == "healthy" else 503)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(body).encode())

        def log_message(self, format, *args) -> None:
            pass  # Suppress HTTP logs

    server = HTTPServer(("0.0.0.0", port), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    logger.info("Health server listening on :%d", port)
