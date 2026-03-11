"""OpenAI GPT provider adapter."""

from __future__ import annotations

import time
from collections.abc import AsyncIterator

from .provider import LLMProvider
from .types import Chunk, CompletionConfig, CompletionResult, Message


class OpenAIProvider(LLMProvider):
    """LLM provider using the OpenAI SDK."""

    name = "openai"

    def __init__(self, api_key: str = "", model: str = "gpt-4o") -> None:
        import openai

        self._client = openai.AsyncOpenAI(api_key=api_key or None)
        self._default_model = model

    async def complete(
        self, messages: list[Message], config: CompletionConfig
    ) -> CompletionResult:
        model = config.model or self._default_model
        msgs = [{"role": m.role.value, "content": m.content} for m in messages]
        kwargs: dict = {
            "model": model,
            "max_tokens": config.max_tokens,
            "temperature": config.temperature,
            "messages": msgs,
        }
        if config.stop_sequences:
            kwargs["stop"] = config.stop_sequences
        if config.json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        t0 = time.monotonic()
        resp = await self._client.chat.completions.create(**kwargs)
        latency = (time.monotonic() - t0) * 1000
        choice = resp.choices[0]
        usage = resp.usage
        return CompletionResult(
            content=choice.message.content or "",
            model=resp.model,
            input_tokens=usage.prompt_tokens if usage else 0,
            output_tokens=usage.completion_tokens if usage else 0,
            finish_reason=choice.finish_reason or "stop",
            latency_ms=latency,
        )

    async def stream(
        self, messages: list[Message], config: CompletionConfig
    ) -> AsyncIterator[Chunk]:
        model = config.model or self._default_model
        msgs = [{"role": m.role.value, "content": m.content} for m in messages]
        stream = await self._client.chat.completions.create(
            model=model,
            max_tokens=config.max_tokens,
            temperature=config.temperature,
            messages=msgs,
            stream=True,
        )
        async for event in stream:
            delta = event.choices[0].delta if event.choices else None
            finish = event.choices[0].finish_reason if event.choices else None
            if delta and delta.content:
                yield Chunk(content=delta.content)
            if finish:
                yield Chunk(content="", finish_reason=finish)

    async def ping(self) -> bool:
        try:
            await self._client.chat.completions.create(
                model=self._default_model,
                max_tokens=1,
                messages=[{"role": "user", "content": "ping"}],
            )
            return True
        except Exception:
            return False
