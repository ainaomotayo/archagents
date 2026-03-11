"""Tests for prompt_builder module."""

from __future__ import annotations

from sentinel_llm.prompt_builder import (
    build_license_review_prompt,
    build_review_prompt,
    build_security_review_prompt,
    get_available_templates,
    truncate_to_budget,
)


# ---------------------------------------------------------------------------
# truncate_to_budget
# ---------------------------------------------------------------------------

def test_truncate_short_text_unchanged():
    text = "short text"
    assert truncate_to_budget(text, max_tokens=100) == text


def test_truncate_exact_budget_unchanged():
    # 10 tokens * 4 chars = 40 chars
    text = "a" * 40
    assert truncate_to_budget(text, max_tokens=10) == text


def test_truncate_over_budget():
    text = "a" * 100
    result = truncate_to_budget(text, max_tokens=10)  # 40 char budget
    assert len(result) < len(text)
    assert result.startswith("a" * 40)
    assert "[TRUNCATED" in result


def test_truncate_default_budget_large_text():
    # Default is 50k tokens = 200k chars; text under that should pass through
    text = "x" * 1000
    assert truncate_to_budget(text) == text


# ---------------------------------------------------------------------------
# build_security_review_prompt (backward compat)
# ---------------------------------------------------------------------------

def test_security_prompt_contains_code():
    prompt = build_security_review_prompt("print('hi')", "app.py", "python")
    assert "print('hi')" in prompt


def test_security_prompt_contains_file_path():
    prompt = build_security_review_prompt("code", "src/main.rs", "rust")
    assert "src/main.rs" in prompt


def test_security_prompt_contains_language():
    prompt = build_security_review_prompt("code", "app.py", "python")
    assert "python" in prompt


def test_security_prompt_requests_json():
    prompt = build_security_review_prompt("code", "app.py", "python")
    assert "JSON" in prompt


def test_security_prompt_mentions_severity():
    prompt = build_security_review_prompt("code", "app.py", "python")
    assert "severity" in prompt.lower()


# ---------------------------------------------------------------------------
# build_license_review_prompt (backward compat)
# ---------------------------------------------------------------------------

def test_license_prompt_contains_code():
    prompt = build_license_review_prompt("import gpl_lib", "lib.py")
    assert "import gpl_lib" in prompt


def test_license_prompt_contains_file_path():
    prompt = build_license_review_prompt("code", "vendor/lib.c")
    assert "vendor/lib.c" in prompt


def test_license_prompt_requests_json():
    prompt = build_license_review_prompt("code", "lib.py")
    assert "JSON" in prompt


def test_license_prompt_mentions_license():
    prompt = build_license_review_prompt("code", "lib.py")
    assert "license" in prompt.lower()


# ---------------------------------------------------------------------------
# Multi-template support
# ---------------------------------------------------------------------------

def test_available_templates():
    templates = get_available_templates()
    assert "security" in templates
    assert "license" in templates
    assert "architecture" in templates
    assert "performance" in templates


def test_architecture_prompt():
    prompt = build_review_prompt("class God:", "big.py", "python", "architecture")
    assert "architect" in prompt.lower()
    assert "class God:" in prompt


def test_performance_prompt():
    prompt = build_review_prompt("for x in items:", "slow.py", "python", "performance")
    assert "performance" in prompt.lower()
    assert "for x in items:" in prompt


def test_unknown_template_falls_back_to_security():
    prompt = build_review_prompt("code", "f.py", "python", "nonexistent")
    # Should fall back to security template
    assert "security" in prompt.lower()


def test_build_review_prompt_without_language():
    prompt = build_review_prompt("code", "f.txt")
    assert "f.txt" in prompt
    assert "Language" not in prompt
