"""Anthropic Claude provider adapter."""

from __future__ import annotations

import time
from collections.abc import AsyncIterator

from .provider import LLMProvider
from .types import Chunk, CompletionConfig, CompletionResult, Message, Role


class AnthropicProvider(LLMProvider):
    """LLM provider using the Anthropic SDK."""

    name = "anthropic"

    def __init__(self, api_key: str = "", model: str = "claude-sonnet-4-20250514") -> None:
        import anthropic

        self._client = anthropic.AsyncAnthropic(
            api_key=api_key or None  # falls back to ANTHROPIC_API_KEY env
        )
        self._default_model = model

    async def complete(
        self, messages: list[Message], config: CompletionConfig
    ) -> CompletionResult:
        system_msgs = [m.content for m in messages if m.role == Role.SYSTEM]
        non_system = [
            {"role": m.role.value, "content": m.content}
            for m in messages
            if m.role != Role.SYSTEM
        ]
        model = config.model or self._default_model
        t0 = time.monotonic()
        resp = await self._client.messages.create(
            model=model,
            max_tokens=config.max_tokens,
            temperature=config.temperature,
            system="\n\n".join(system_msgs) if system_msgs else "",
            messages=non_system,
            stop_sequences=config.stop_sequences or [],
        )
        latency = (time.monotonic() - t0) * 1000
        return CompletionResult(
            content=resp.content[0].text if resp.content else "",
            model=resp.model,
            input_tokens=resp.usage.input_tokens,
            output_tokens=resp.usage.output_tokens,
            finish_reason=resp.stop_reason or "stop",
            latency_ms=latency,
        )

    async def stream(
        self, messages: list[Message], config: CompletionConfig
    ) -> AsyncIterator[Chunk]:
        system_msgs = [m.content for m in messages if m.role == Role.SYSTEM]
        non_system = [
            {"role": m.role.value, "content": m.content}
            for m in messages
            if m.role != Role.SYSTEM
        ]
        model = config.model or self._default_model
        async with self._client.messages.stream(
            model=model,
            max_tokens=config.max_tokens,
            temperature=config.temperature,
            system="\n\n".join(system_msgs) if system_msgs else "",
            messages=non_system,
        ) as stream:
            async for text in stream.text_stream:
                yield Chunk(content=text)
            yield Chunk(content="", finish_reason="stop")

    async def ping(self) -> bool:
        try:
            await self._client.messages.create(
                model=self._default_model,
                max_tokens=1,
                messages=[{"role": "user", "content": "ping"}],
            )
            return True
        except Exception:
            return False
