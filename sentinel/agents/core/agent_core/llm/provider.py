"""LLM provider abstraction: base interface, registry, and fallback chain."""

from __future__ import annotations

import asyncio
import logging
import time
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator, Callable
from typing import Any

from .types import Chunk, CompletionConfig, CompletionResult, Message

logger = logging.getLogger(__name__)


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    name: str = "unnamed"

    @abstractmethod
    async def complete(
        self, messages: list[Message], config: CompletionConfig
    ) -> CompletionResult:
        ...

    @abstractmethod
    async def stream(
        self, messages: list[Message], config: CompletionConfig
    ) -> AsyncIterator[Chunk]:
        ...
        yield  # pragma: no cover

    @abstractmethod
    async def ping(self) -> bool:
        ...


class FallbackProvider(LLMProvider):
    """Chains multiple providers with automatic failover."""

    name = "fallback"

    def __init__(
        self,
        providers: list[LLMProvider],
        max_retries: int = 1,
        base_delay: float = 1.0,
    ) -> None:
        if not providers:
            raise ValueError("At least one provider is required")
        self._providers = providers
        self._max_retries = max_retries
        self._base_delay = base_delay

    async def complete(
        self, messages: list[Message], config: CompletionConfig
    ) -> CompletionResult:
        last_error: Exception | None = None
        for provider in self._providers:
            for attempt in range(self._max_retries + 1):
                try:
                    return await provider.complete(messages, config)
                except Exception as exc:
                    last_error = exc
                    logger.warning(
                        "Provider %s attempt %d failed: %s",
                        provider.name,
                        attempt + 1,
                        exc,
                    )
                    if attempt < self._max_retries:
                        delay = self._base_delay * (2**attempt)
                        await asyncio.sleep(delay)
        raise RuntimeError(
            f"All providers failed. Last error: {last_error}"
        ) from last_error

    async def stream(
        self, messages: list[Message], config: CompletionConfig
    ) -> AsyncIterator[Chunk]:
        last_error: Exception | None = None
        for provider in self._providers:
            try:
                async for chunk in provider.stream(messages, config):
                    yield chunk
                return
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "Stream provider %s failed: %s", provider.name, exc
                )
        raise RuntimeError(
            f"All stream providers failed. Last error: {last_error}"
        ) from last_error

    async def ping(self) -> bool:
        for provider in self._providers:
            if await provider.ping():
                return True
        return False


class ProviderRegistry:
    """Registry for LLM provider factories, resolved per-org."""

    def __init__(self) -> None:
        self._factories: dict[str, Callable[..., LLMProvider]] = {}
        self._org_config: dict[str, str] = {}  # org_id -> provider_name
        self._default: str = ""

    def register(
        self, name: str, factory: Callable[..., LLMProvider]
    ) -> None:
        self._factories[name] = factory

    def set_default(self, name: str) -> None:
        if name not in self._factories:
            raise KeyError(f"Provider '{name}' not registered")
        self._default = name

    def set_org_provider(self, org_id: str, provider_name: str) -> None:
        if provider_name not in self._factories:
            raise KeyError(f"Provider '{provider_name}' not registered")
        self._org_config[org_id] = provider_name

    def resolve(self, org_id: str = "", **kwargs: Any) -> LLMProvider:
        name = self._org_config.get(org_id, self._default)
        if not name:
            raise RuntimeError("No default provider configured")
        factory = self._factories[name]
        return factory(**kwargs)

    def with_fallback(
        self, primary: str, *fallbacks: str, **kwargs: Any
    ) -> FallbackProvider:
        names = [primary, *fallbacks]
        providers = []
        for n in names:
            if n not in self._factories:
                raise KeyError(f"Provider '{n}' not registered")
            providers.append(self._factories[n](**kwargs))
        return FallbackProvider(providers)

    @property
    def registered(self) -> list[str]:
        return list(self._factories.keys())
