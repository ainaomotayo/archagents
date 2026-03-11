"""Tests for fallback provider chain behavior."""

from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator

import pytest

from agent_core.llm.provider import FallbackProvider, LLMProvider
from agent_core.llm.types import (
    Chunk,
    CompletionConfig,
    CompletionResult,
    Message,
    Role,
)


class TimingProvider(LLMProvider):
    """Provider that records when it was called for backoff testing."""

    name = "timing"

    def __init__(self, fail_count: int = 0) -> None:
        self._fail_count = fail_count
        self.attempts = 0
        self.call_times: list[float] = []

    async def complete(self, messages, config):
        self.attempts += 1
        self.call_times.append(time.monotonic())
        if self.attempts <= self._fail_count:
            raise RuntimeError("transient failure")
        return CompletionResult(content="ok", model="test")

    async def stream(self, messages, config):
        yield Chunk(content="ok")

    async def ping(self):
        return True


class TestFallbackBackoff:
    @pytest.mark.asyncio
    async def test_exponential_backoff_timing(self) -> None:
        provider = TimingProvider(fail_count=2)
        fb = FallbackProvider([provider], max_retries=2, base_delay=0.05)
        msgs = [Message(role=Role.USER, content="hi")]

        result = await fb.complete(msgs, CompletionConfig())
        assert result.content == "ok"
        assert provider.attempts == 3

        # Check delays: first retry ~0.05s, second ~0.1s
        if len(provider.call_times) == 3:
            delay1 = provider.call_times[1] - provider.call_times[0]
            delay2 = provider.call_times[2] - provider.call_times[1]
            assert delay1 >= 0.04  # ~0.05s
            assert delay2 >= 0.08  # ~0.1s (2x)

    @pytest.mark.asyncio
    async def test_max_retries_exhausted_falls_to_next(self) -> None:
        always_fail = TimingProvider(fail_count=999)
        backup = TimingProvider(fail_count=0)
        fb = FallbackProvider(
            [always_fail, backup], max_retries=1, base_delay=0.01
        )
        msgs = [Message(role=Role.USER, content="hi")]
        result = await fb.complete(msgs, CompletionConfig())
        assert result.content == "ok"
        assert always_fail.attempts == 2  # 1 + 1 retry
        assert backup.attempts == 1

    @pytest.mark.asyncio
    async def test_stream_no_retry_per_provider(self) -> None:
        """Stream falls through providers without retry per provider."""

        class FailStream(LLMProvider):
            name = "fail-stream"

            async def complete(self, messages, config):
                return CompletionResult(content="", model="")

            async def stream(self, messages, config):
                raise RuntimeError("stream broken")
                yield  # noqa: unreachable

            async def ping(self):
                return True

        class GoodStream(LLMProvider):
            name = "good-stream"

            async def complete(self, messages, config):
                return CompletionResult(content="", model="")

            async def stream(self, messages, config):
                yield Chunk(content="streamed")
                yield Chunk(content="", finish_reason="stop")

            async def ping(self):
                return True

        fb = FallbackProvider([FailStream(), GoodStream()])
        msgs = [Message(role=Role.USER, content="hi")]
        chunks = []
        async for c in fb.stream(msgs, CompletionConfig()):
            chunks.append(c.content)
        assert "streamed" in chunks
