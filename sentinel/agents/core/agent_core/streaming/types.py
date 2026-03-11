"""Types for real-time event streaming."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class EventType(str, Enum):
    FINDING_NEW = "finding.new"
    FINDING_ENRICHED = "finding.enriched"
    FINDING_ESCALATED = "finding.escalated"
    AGENT_STARTED = "agent.started"
    AGENT_COMPLETED = "agent.completed"
    SCAN_PROGRESS = "scan.progress"
    SCAN_COMPLETED = "scan.completed"


@dataclass
class StreamEvent:
    event_type: EventType
    data: dict[str, Any]
    id: str = ""  # Redis stream ID or custom

    def to_sse(self) -> str:
        """Format as Server-Sent Event wire format."""
        lines = []
        lines.append(f"event: {self.event_type.value}")
        if self.id:
            lines.append(f"id: {self.id}")
        lines.append(f"data: {json.dumps(self.data)}")
        lines.append("")  # trailing newline
        return "\n".join(lines) + "\n"

    @classmethod
    def from_redis(cls, stream_id: str, fields: dict[bytes, bytes]) -> StreamEvent:
        """Parse a Redis stream entry into a StreamEvent."""
        event_type = EventType(fields[b"event_type"].decode("utf-8"))
        data = json.loads(fields[b"data"].decode("utf-8"))
        return cls(event_type=event_type, data=data, id=stream_id)

    def to_redis(self) -> dict[str, str]:
        """Serialize for Redis XADD."""
        return {
            "event_type": self.event_type.value,
            "data": json.dumps(self.data),
        }
