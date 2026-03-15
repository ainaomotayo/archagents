"""Local LLM provider adapter for Ollama/vLLM."""

from __future__ import annotations

import json
import time
from collections.abc import AsyncIterator

from .provider import LLMProvider
from .types import Chunk, CompletionConfig, CompletionResult, Message


class LocalProvider(LLMProvider):
    """LLM provider for local inference servers (Ollama, vLLM)."""

    name = "local"

    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        model: str = "llama3",
    ) -> None:
        import httpx

        self._client = httpx.AsyncClient(base_url=base_url, timeout=120.0)
        self._default_model = model

    async def complete(
        self, messages: list[Message], config: CompletionConfig
    ) -> CompletionResult:
        model = config.model or self._default_model
        msgs = [{"role": m.role.value, "content": m.content} for m in messages]
        t0 = time.monotonic()
        # Ollama-compatible /api/chat endpoint
        resp = await self._client.post(
            "/api/chat",
            json={
                "model": model,
                "messages": msgs,
                "stream": False,
                "options": {
                    "temperature": config.temperature,
                    "num_predict": config.max_tokens,
                },
            },
        )
        resp.raise_for_status()
        data = resp.json()
        latency = (time.monotonic() - t0) * 1000
        return CompletionResult(
            content=data.get("message", {}).get("content", ""),
            model=model,
            input_tokens=data.get("prompt_eval_count", 0),
            output_tokens=data.get("eval_count", 0),
            finish_reason="stop",
            latency_ms=latency,
        )

    async def stream(
        self, messages: list[Message], config: CompletionConfig
    ) -> AsyncIterator[Chunk]:
        model = config.model or self._default_model
        msgs = [{"role": m.role.value, "content": m.content} for m in messages]
        async with self._client.stream(
            "POST",
            "/api/chat",
            json={
                "model": model,
                "messages": msgs,
                "stream": True,
                "options": {
                    "temperature": config.temperature,
                    "num_predict": config.max_tokens,
                },
            },
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                data = json.loads(line)
                content = data.get("message", {}).get("content", "")
                if content:
                    yield Chunk(content=content)
                if data.get("done"):
                    yield Chunk(content="", finish_reason="stop")

    async def ping(self) -> bool:
        try:
            resp = await self._client.get("/api/tags")
            return resp.status_code == 200
        except Exception:
            return False
