"""Tests for Anthropic provider with mocked SDK."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agent_core.llm.types import CompletionConfig, Message, Role


@pytest.mark.asyncio
async def test_anthropic_complete() -> None:
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text="Hello world")]
    mock_response.model = "claude-sonnet-4-20250514"
    mock_response.usage.input_tokens = 10
    mock_response.usage.output_tokens = 5
    mock_response.stop_reason = "end_turn"

    with patch("anthropic.AsyncAnthropic") as MockClient:
        instance = MockClient.return_value
        instance.messages.create = AsyncMock(return_value=mock_response)

        from agent_core.llm.anthropic import AnthropicProvider

        provider = AnthropicProvider(api_key="test-key")
        messages = [
            Message(role=Role.SYSTEM, content="Be helpful"),
            Message(role=Role.USER, content="Hi"),
        ]
        result = await provider.complete(messages, CompletionConfig())

        assert result.content == "Hello world"
        assert result.input_tokens == 10
        assert result.output_tokens == 5
        # Verify system message was extracted
        call_kwargs = instance.messages.create.call_args[1]
        assert call_kwargs["system"] == "Be helpful"
        assert len(call_kwargs["messages"]) == 1  # only user message


@pytest.mark.asyncio
async def test_anthropic_ping_success() -> None:
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text="")]
    mock_response.model = "test"
    mock_response.usage.input_tokens = 1
    mock_response.usage.output_tokens = 1
    mock_response.stop_reason = "end_turn"

    with patch("anthropic.AsyncAnthropic") as MockClient:
        instance = MockClient.return_value
        instance.messages.create = AsyncMock(return_value=mock_response)

        from agent_core.llm.anthropic import AnthropicProvider

        provider = AnthropicProvider(api_key="test-key")
        assert await provider.ping() is True


@pytest.mark.asyncio
async def test_anthropic_ping_failure() -> None:
    with patch("anthropic.AsyncAnthropic") as MockClient:
        instance = MockClient.return_value
        instance.messages.create = AsyncMock(side_effect=Exception("no auth"))

        from agent_core.llm.anthropic import AnthropicProvider

        provider = AnthropicProvider(api_key="bad-key")
        assert await provider.ping() is False
