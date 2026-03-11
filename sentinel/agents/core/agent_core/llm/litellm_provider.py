"""LiteLLM provider adapter — supports 100+ providers."""

from __future__ import annotations

import time
from collections.abc import AsyncIterator

from .provider import LLMProvider
from .types import Chunk, CompletionConfig, CompletionResult, Message


class LiteLLMProvider(LLMProvider):
    """LLM provider using LiteLLM for 100+ backend providers."""

    name = "litellm"

    def __init__(self, model: str = "gpt-4o", **kwargs: object) -> None:
        self._default_model = model
        self._kwargs = kwargs

    async def complete(
        self, messages: list[Message], config: CompletionConfig
    ) -> CompletionResult:
        import litellm

        model = config.model or self._default_model
        msgs = [{"role": m.role.value, "content": m.content} for m in messages]
        t0 = time.monotonic()
        resp = await litellm.acompletion(
            model=model,
            messages=msgs,
            max_tokens=config.max_tokens,
            temperature=config.temperature,
            stop=config.stop_sequences or None,
            timeout=config.timeout_seconds,
            **self._kwargs,
        )
        latency = (time.monotonic() - t0) * 1000
        choice = resp.choices[0]
        usage = resp.usage
        return CompletionResult(
            content=choice.message.content or "",
            model=resp.model or model,
            input_tokens=usage.prompt_tokens if usage else 0,
            output_tokens=usage.completion_tokens if usage else 0,
            finish_reason=choice.finish_reason or "stop",
            latency_ms=latency,
        )

    async def stream(
        self, messages: list[Message], config: CompletionConfig
    ) -> AsyncIterator[Chunk]:
        import litellm

        model = config.model or self._default_model
        msgs = [{"role": m.role.value, "content": m.content} for m in messages]
        resp = await litellm.acompletion(
            model=model,
            messages=msgs,
            max_tokens=config.max_tokens,
            temperature=config.temperature,
            stream=True,
            timeout=config.timeout_seconds,
            **self._kwargs,
        )
        async for event in resp:
            delta = event.choices[0].delta if event.choices else None
            finish = event.choices[0].finish_reason if event.choices else None
            if delta and delta.content:
                yield Chunk(content=delta.content)
            if finish:
                yield Chunk(content="", finish_reason=finish)

    async def ping(self) -> bool:
        try:
            import litellm

            await litellm.acompletion(
                model=self._default_model,
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=1,
            )
            return True
        except Exception:
            return False
