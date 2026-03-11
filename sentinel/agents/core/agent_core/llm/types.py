"""Shared types for LLM provider abstraction."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class Role(str, Enum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


@dataclass
class Message:
    role: Role
    content: str


@dataclass
class CompletionConfig:
    model: str = ""
    max_tokens: int = 4096
    temperature: float = 0.0
    stop_sequences: list[str] = field(default_factory=list)
    json_mode: bool = False
    timeout_seconds: float = 60.0
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class CompletionResult:
    content: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    finish_reason: str = "stop"
    latency_ms: float = 0.0


@dataclass
class Chunk:
    content: str
    finish_reason: str | None = None
