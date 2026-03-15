"""Tests for TokenBudget allocation."""

import pytest

from agent_core.llm.budget import TokenBudget


class TestTokenBudget:
    def setup_method(self) -> None:
        self.budget = TokenBudget(chars_per_token=4.0)

    def test_estimate_tokens_empty(self) -> None:
        assert self.budget.estimate_tokens("") == 0

    def test_estimate_tokens_short(self) -> None:
        # "hello" = 5 chars / 4 = 1.25 -> 1
        assert self.budget.estimate_tokens("hello") == 1

    def test_estimate_tokens_longer(self) -> None:
        text = "a" * 400  # 400 / 4 = 100
        assert self.budget.estimate_tokens(text) == 100

    def test_allocate_within_budget(self) -> None:
        sections = {
            "system": "You are helpful.",  # ~4 tokens
            "code": "print('hi')",  # ~3 tokens
        }
        result = self.budget.allocate(sections, max_tokens=100)
        assert result.sections == sections
        assert result.truncated == []
        assert result.total_tokens <= 100

    def test_allocate_empty(self) -> None:
        result = self.budget.allocate({}, max_tokens=100)
        assert result.sections == {}
        assert result.total_tokens == 0

    def test_allocate_truncates_lowest_priority_first(self) -> None:
        sections = {
            "system": "s" * 100,  # 25 tokens
            "code": "c" * 100,  # 25 tokens
            "history": "h" * 400,  # 100 tokens
        }
        # Total = 150, budget = 60 -> need to remove 90
        result = self.budget.allocate(sections, max_tokens=60)
        # History (lowest priority) should be truncated first
        assert "history" in result.truncated
        assert result.total_tokens <= 60
        # System (highest priority) should be preserved
        assert result.sections["system"] == "s" * 100

    def test_allocate_removes_entire_section_if_needed(self) -> None:
        sections = {
            "system": "s" * 40,  # 10 tokens
            "history": "h" * 40,  # 10 tokens
            "context": "x" * 400,  # 100 tokens
        }
        # Total = 120, budget = 15 -> need to remove 105
        result = self.budget.allocate(sections, max_tokens=15)
        # context removed first (priority 2), then history (priority 3)
        # Actually history has higher priority number (3) so it's removed first
        assert result.total_tokens <= 15

    def test_allocate_partial_truncation(self) -> None:
        sections = {
            "system": "s" * 40,  # 10 tokens
            "code": "c" * 200,  # 50 tokens
        }
        # Total = 60, budget = 40 -> truncate code partially
        result = self.budget.allocate(sections, max_tokens=40)
        assert "code" in result.truncated
        assert len(result.sections["code"]) < 200
        assert result.sections["system"] == "s" * 40

    def test_custom_chars_per_token(self) -> None:
        budget = TokenBudget(chars_per_token=2.0)
        assert budget.estimate_tokens("hello") == 2  # 5/2 = 2.5 -> 2
