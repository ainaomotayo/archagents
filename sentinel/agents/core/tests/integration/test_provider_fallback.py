"""Integration tests for LLM provider fallback chain.

Verifies that when a primary provider fails, the FallbackProvider
correctly falls through to the secondary.
"""

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


# ---------------------------------------------------------------------------
# Mock providers
# ---------------------------------------------------------------------------

class WorkingProvider(LLMProvider):
    name = "working"

    async def complete(self, messages, config):
        return CompletionResult(
            content="Hello from working provider",
            model="test-model",
            input_tokens=10,
            output_tokens=5,
        )

    async def stream(self, messages, config):
        yield Chunk(content="chunk1")
        yield Chunk(content="chunk2", finish_reason="stop")

    async def ping(self):
        return True


class FailingProvider(LLMProvider):
    name = "failing"

    async def complete(self, messages, config):
        raise ConnectionError("Provider unavailable")

    async def stream(self, messages, config):
        raise ConnectionError("Provider unavailable")
        yield  # pragma: no cover

    async def ping(self):
        return False


class RateLimitedProvider(LLMProvider):
    name = "rate-limited"

    def __init__(self):
        self.call_count = 0

    async def complete(self, messages, config):
        self.call_count += 1
        if self.call_count <= 2:
            raise RuntimeError("Rate limited")
        return CompletionResult(
            content="Recovered after rate limit",
            model="test-model",
            input_tokens=10,
            output_tokens=5,
        )

    async def stream(self, messages, config):
        yield Chunk(content="ok", done=True)

    async def ping(self):
        return True


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestProviderFallback:
    def test_primary_works(self):
        """When primary works, it is used directly."""
        fb = FallbackProvider([WorkingProvider()])
        messages = [Message(role=Role.USER, content="Hi")]
        config = CompletionConfig()

        result = asyncio.run(fb.complete(messages, config))

        assert result.content == "Hello from working provider"

    def test_fallback_to_secondary(self):
        """When primary fails, secondary is used."""
        fb = FallbackProvider([FailingProvider(), WorkingProvider()])
        messages = [Message(role=Role.USER, content="Hi")]
        config = CompletionConfig()

        result = asyncio.run(fb.complete(messages, config))

        assert result.content == "Hello from working provider"

    def test_all_providers_fail(self):
        """When all providers fail, RuntimeError is raised."""
        fb = FallbackProvider([FailingProvider(), FailingProvider()])
        messages = [Message(role=Role.USER, content="Hi")]
        config = CompletionConfig()

        with pytest.raises(RuntimeError, match="All providers failed"):
            asyncio.run(fb.complete(messages, config))

    def test_retry_with_backoff(self):
        """RateLimitedProvider recovers after retries."""
        rate_limited = RateLimitedProvider()
        fb = FallbackProvider([rate_limited], max_retries=3, base_delay=0.01)
        messages = [Message(role=Role.USER, content="Hi")]
        config = CompletionConfig()

        result = asyncio.run(fb.complete(messages, config))

        assert result.content == "Recovered after rate limit"
        assert rate_limited.call_count == 3

    def test_stream_fallback(self):
        """Stream falls back to secondary on primary failure."""
        fb = FallbackProvider([FailingProvider(), WorkingProvider()])
        messages = [Message(role=Role.USER, content="Hi")]
        config = CompletionConfig()

        async def collect():
            chunks = []
            async for chunk in fb.stream(messages, config):
                chunks.append(chunk)
            return chunks

        chunks = asyncio.run(collect())
        assert len(chunks) == 2
        assert chunks[0].content == "chunk1"

    def test_ping_fallback(self):
        """Ping returns True if any provider is reachable."""
        fb = FallbackProvider([FailingProvider(), WorkingProvider()])

        result = asyncio.run(fb.ping())
        assert result is True

    def test_ping_all_fail(self):
        """Ping returns False if no provider is reachable."""
        fb = FallbackProvider([FailingProvider(), FailingProvider()])

        result = asyncio.run(fb.ping())
        assert result is False


class TestProviderRegistry:
    def test_registry_resolve(self):
        """Registry resolves provider by org."""
        reg = ProviderRegistry()
        reg.register("working", lambda: WorkingProvider())
        reg.set_default("working")

        provider = reg.resolve("org-1")
        assert provider.name == "working"

    def test_registry_org_override(self):
        """Org-specific provider overrides default."""
        reg = ProviderRegistry()
        reg.register("working", lambda: WorkingProvider())
        reg.register("failing", lambda: FailingProvider())
        reg.set_default("working")
        reg.set_org_provider("org-special", "failing")

        default = reg.resolve("org-other")
        assert default.name == "working"

        special = reg.resolve("org-special")
        assert special.name == "failing"

    def test_registry_with_fallback(self):
        """Registry can build a fallback chain."""
        reg = ProviderRegistry()
        reg.register("primary", lambda: FailingProvider())
        reg.register("secondary", lambda: WorkingProvider())

        fb = reg.with_fallback("primary", "secondary")
        assert isinstance(fb, FallbackProvider)

        messages = [Message(role=Role.USER, content="Hi")]
        config = CompletionConfig()
        result = asyncio.run(fb.complete(messages, config))
        assert result.content == "Hello from working provider"

    def test_registry_no_default_raises(self):
        """Resolving without a default raises RuntimeError."""
        reg = ProviderRegistry()
        with pytest.raises(RuntimeError, match="No default provider"):
            reg.resolve("org-1")
