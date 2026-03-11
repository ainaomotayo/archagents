"""Tests for LLM provider registry and fallback chain."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock

import pytest

from agent_core.llm.provider import (
    FallbackProvider,
    LLMProvider,
    ProviderRegistry,
)
from agent_core.llm.types import (
    Chunk,
    CompletionConfig,
    CompletionResult,
    Message,
    Role,
)


class MockProvider(LLMProvider):
    """Test provider that returns canned responses."""

    def __init__(self, name: str = "mock", fail: bool = False) -> None:
        self.name = name
        self._fail = fail
        self.call_count = 0

    async def complete(
        self, messages: list[Message], config: CompletionConfig
    ) -> CompletionResult:
        self.call_count += 1
        if self._fail:
            raise RuntimeError(f"{self.name} failed")
        return CompletionResult(
            content=f"response from {self.name}",
            model="test-model",
            input_tokens=10,
            output_tokens=5,
        )

    async def stream(
        self, messages: list[Message], config: CompletionConfig
    ) -> AsyncIterator[Chunk]:
        self.call_count += 1
        if self._fail:
            raise RuntimeError(f"{self.name} stream failed")
        yield Chunk(content="hello ")
        yield Chunk(content="world", finish_reason="stop")

    async def ping(self) -> bool:
        return not self._fail


# --- ProviderRegistry ---


class TestProviderRegistry:
    def test_register_and_resolve(self) -> None:
        reg = ProviderRegistry()
        reg.register("mock", lambda **kw: MockProvider("mock"))
        reg.set_default("mock")
        provider = reg.resolve()
        assert provider.name == "mock"

    def test_resolve_per_org(self) -> None:
        reg = ProviderRegistry()
        reg.register("a", lambda **kw: MockProvider("a"))
        reg.register("b", lambda **kw: MockProvider("b"))
        reg.set_default("a")
        reg.set_org_provider("org-1", "b")
        assert reg.resolve("org-1").name == "b"
        assert reg.resolve("org-2").name == "a"

    def test_resolve_no_default_raises(self) -> None:
        reg = ProviderRegistry()
        with pytest.raises(RuntimeError, match="No default"):
            reg.resolve()

    def test_set_default_unregistered_raises(self) -> None:
        reg = ProviderRegistry()
        with pytest.raises(KeyError, match="not registered"):
            reg.set_default("nope")

    def test_set_org_unregistered_raises(self) -> None:
        reg = ProviderRegistry()
        with pytest.raises(KeyError, match="not registered"):
            reg.set_org_provider("org-1", "nope")

    def test_with_fallback(self) -> None:
        reg = ProviderRegistry()
        reg.register("a", lambda **kw: MockProvider("a"))
        reg.register("b", lambda **kw: MockProvider("b"))
        fb = reg.with_fallback("a", "b")
        assert isinstance(fb, FallbackProvider)

    def test_with_fallback_unknown_raises(self) -> None:
        reg = ProviderRegistry()
        reg.register("a", lambda **kw: MockProvider("a"))
        with pytest.raises(KeyError):
            reg.with_fallback("a", "nope")

    def test_registered_list(self) -> None:
        reg = ProviderRegistry()
        reg.register("a", lambda **kw: MockProvider("a"))
        reg.register("b", lambda **kw: MockProvider("b"))
        assert set(reg.registered) == {"a", "b"}


# --- FallbackProvider ---


class TestFallbackProvider:
    def test_empty_providers_raises(self) -> None:
        with pytest.raises(ValueError, match="At least one"):
            FallbackProvider([])

    @pytest.mark.asyncio
    async def test_primary_succeeds(self) -> None:
        primary = MockProvider("primary")
        fb = FallbackProvider([primary])
        msgs = [Message(role=Role.USER, content="hi")]
        result = await fb.complete(msgs, CompletionConfig())
        assert result.content == "response from primary"
        assert primary.call_count == 1

    @pytest.mark.asyncio
    async def test_fallback_on_failure(self) -> None:
        failing = MockProvider("failing", fail=True)
        backup = MockProvider("backup")
        fb = FallbackProvider([failing, backup], max_retries=0)
        msgs = [Message(role=Role.USER, content="hi")]
        result = await fb.complete(msgs, CompletionConfig())
        assert result.content == "response from backup"

    @pytest.mark.asyncio
    async def test_all_fail_raises(self) -> None:
        f1 = MockProvider("f1", fail=True)
        f2 = MockProvider("f2", fail=True)
        fb = FallbackProvider([f1, f2], max_retries=0)
        msgs = [Message(role=Role.USER, content="hi")]
        with pytest.raises(RuntimeError, match="All providers failed"):
            await fb.complete(msgs, CompletionConfig())

    @pytest.mark.asyncio
    async def test_retry_then_succeed(self) -> None:
        """Provider fails first attempt, succeeds on retry."""

        class FlakeyProvider(LLMProvider):
            name = "flakey"

            def __init__(self) -> None:
                self.attempts = 0

            async def complete(self, messages, config):
                self.attempts += 1
                if self.attempts == 1:
                    raise RuntimeError("transient")
                return CompletionResult(content="ok", model="m")

            async def stream(self, messages, config):
                yield Chunk(content="ok")

            async def ping(self):
                return True

        flakey = FlakeyProvider()
        fb = FallbackProvider([flakey], max_retries=1, base_delay=0.01)
        msgs = [Message(role=Role.USER, content="hi")]
        result = await fb.complete(msgs, CompletionConfig())
        assert result.content == "ok"
        assert flakey.attempts == 2

    @pytest.mark.asyncio
    async def test_stream_fallback(self) -> None:
        failing = MockProvider("failing", fail=True)
        backup = MockProvider("backup")
        fb = FallbackProvider([failing, backup])
        msgs = [Message(role=Role.USER, content="hi")]
        chunks = []
        async for chunk in fb.stream(msgs, CompletionConfig()):
            chunks.append(chunk.content)
        assert "hello " in chunks

    @pytest.mark.asyncio
    async def test_ping_returns_true_if_any(self) -> None:
        f1 = MockProvider("f1", fail=True)
        f2 = MockProvider("f2")
        fb = FallbackProvider([f1, f2])
        assert await fb.ping() is True

    @pytest.mark.asyncio
    async def test_ping_returns_false_if_none(self) -> None:
        f1 = MockProvider("f1", fail=True)
        fb = FallbackProvider([f1])
        assert await fb.ping() is False
