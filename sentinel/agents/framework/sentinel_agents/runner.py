from __future__ import annotations

import json
import logging
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading

import redis

from sentinel_agents.base import BaseAgent
from sentinel_agents.events import RedisEventConsumer, RedisEventProducer
from sentinel_agents.types import DiffEvent

logger = logging.getLogger(__name__)


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

    # Start health check server in background
    health_port = int(os.environ.get("HEALTH_PORT", "8081"))
    _start_health_server(agent, health_port)

    logger.info("Agent %s v%s started, consuming from sentinel.diffs", agent.name, agent.version)

    def handle_event(msg_id: str, data: dict) -> None:
        event = DiffEvent.from_dict(data)
        logger.info("Processing scan %s", event.scan_id)
        result = agent.run_scan(event)
        producer.publish("sentinel.findings", result.to_dict())
        logger.info(
            "Scan %s complete: %d findings, status=%s",
            event.scan_id,
            len(result.findings),
            result.status,
        )

    consumer.consume(handle_event)


def _start_health_server(agent: BaseAgent, port: int) -> None:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            health = agent.health()
            self.send_response(200 if health.status == "healthy" else 503)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps(
                    {
                        "name": health.name,
                        "version": health.version,
                        "status": health.status,
                        "detail": health.detail,
                    }
                ).encode()
            )

        def log_message(self, format, *args) -> None:
            pass  # Suppress HTTP logs

    server = HTTPServer(("0.0.0.0", port), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    logger.info("Health server listening on :%d", port)
