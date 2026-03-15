"""Tests for ScrubberRegistry layered scrubbing."""

import pytest

from agent_core.scrubbing.registry import ScrubberRegistry


@pytest.fixture
def registry() -> ScrubberRegistry:
    return ScrubberRegistry()


class TestLayeredScrubbing:
    def test_base_patterns_always_applied(self, registry: ScrubberRegistry) -> None:
        result = registry.scrub("unknown-agent", "key = AKIAIOSFODNN7EXAMPLE")
        assert "[REDACTED:AWS_KEY]" in result.sanitized

    def test_agent_specific_patterns(self, registry: ScrubberRegistry) -> None:
        registry.register("llm-review", {
            "PROMPT_INJECTION": r"<\|system\|>",
        })
        text = "found: <|system|> injection"
        result = registry.scrub("llm-review", text)
        assert "[REDACTED:PROMPT_INJECTION]" in result.sanitized

    def test_base_applied_before_agent(self, registry: ScrubberRegistry) -> None:
        """Base patterns fire first, then agent patterns on the result."""
        registry.register("test-agent", {
            "CUSTOM": r"CUSTOM_SECRET_\w+",
        })
        text = "aws=AKIAIOSFODNN7EXAMPLE custom=CUSTOM_SECRET_abc"
        result = registry.scrub("test-agent", text)
        assert "[REDACTED:AWS_KEY]" in result.sanitized
        assert "[REDACTED:CUSTOM]" in result.sanitized

    def test_no_agent_patterns_still_works(self, registry: ScrubberRegistry) -> None:
        result = registry.scrub("no-such-agent", "clean code")
        assert result.sanitized == "clean code"
        assert result.redactions == []

    def test_redactions_from_both_layers(self, registry: ScrubberRegistry) -> None:
        registry.register("my-agent", {
            "INTERNAL_TOKEN": r"INT_[A-Z]{20,}",
        })
        text = "aws=AKIAIOSFODNN7EXAMPLE tok=INT_ABCDEFGHIJKLMNOPQRSTU"
        result = registry.scrub("my-agent", text)
        names = {r.pattern_name for r in result.redactions}
        assert "AWS_KEY" in names
        assert "INTERNAL_TOKEN" in names


class TestAuditLog:
    def test_audit_log_from_base(self, registry: ScrubberRegistry) -> None:
        registry.scrub("any", "key = AKIAIOSFODNN7EXAMPLE")
        log = registry.audit_log()
        assert len(log) == 1
        assert log[0].pattern_name == "AWS_KEY"
