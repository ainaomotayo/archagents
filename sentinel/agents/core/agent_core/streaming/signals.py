"""Inter-agent signal types."""

from __future__ import annotations

from enum import Enum


class AgentSignal(str, Enum):
    STARTED = "started"
    COMPLETED = "completed"
    ERROR = "error"
    CANCELLED = "cancelled"
