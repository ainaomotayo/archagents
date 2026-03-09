"""Tests for the LLMReviewAgent."""

from __future__ import annotations

import json
from unittest.mock import MagicMock

from sentinel_agents.types import (
    Confidence,
    DiffEvent,
    DiffFile,
    DiffHunk,
    ScanConfig,
    Severity,
)

from sentinel_llm.agent import LLMReviewAgent, _extract_added_code


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_event(code: str = 'print("hello")', path: str = "app.py", language: str = "python") -> DiffEvent:
    return DiffEvent(
        scan_id="scan-001",
        project_id="proj-001",
        commit_hash="abc123",
        branch="main",
        author="dev@test.com",
        timestamp="2026-01-01T00:00:00Z",
        files=[
            DiffFile(
                path=path,
                language=language,
                hunks=[
                    DiffHunk(
                        old_start=0, old_count=0,
                        new_start=1, new_count=1,
                        content=f"+{code}",
                    )
                ],
                ai_score=0.0,
            )
        ],
        scan_config=ScanConfig(
            security_level="standard",
            license_policy="",
            quality_threshold=0.7,
        ),
    )


def _mock_llm_response(findings_data: list[dict] | None = None) -> str:
    if findings_data is None:
        findings_data = [{
            "title": "Hardcoded secret",
            "description": "Secret found in code",
            "severity": "high",
            "confidence": "high",
            "line_start": 1,
            "line_end": 1,
            "category": "CWE-798",
            "cwe_id": "CWE-798",
            "remediation": "Use env vars",
        }]
    return json.dumps(findings_data)


# ---------------------------------------------------------------------------
# Full flow with mock LLM
# ---------------------------------------------------------------------------

def test_process_with_mock_llm():
    llm_fn = MagicMock(return_value=_mock_llm_response())
    agent = LLMReviewAgent(llm_fn=llm_fn)
    event = _make_event()

    findings = agent.process(event)

    assert len(findings) == 1
    assert findings[0].type == "security"
    assert findings[0].severity == Severity.HIGH
    assert findings[0].title == "Hardcoded secret"
    llm_fn.assert_called_once()


def test_process_no_findings():
    llm_fn = MagicMock(return_value="[]")
    agent = LLMReviewAgent(llm_fn=llm_fn)
    event = _make_event()

    findings = agent.process(event)

    assert findings == []


def test_process_multiple_files():
    llm_fn = MagicMock(return_value=_mock_llm_response())
    agent = LLMReviewAgent(llm_fn=llm_fn)
    event = _make_event()
    # Add a second file
    event.files.append(
        DiffFile(
            path="util.py",
            language="python",
            hunks=[DiffHunk(0, 0, 1, 1, "+import os")],
            ai_score=0.0,
        )
    )

    findings = agent.process(event)

    assert len(findings) == 2
    assert llm_fn.call_count == 2


# ---------------------------------------------------------------------------
# Scrubber integration
# ---------------------------------------------------------------------------

def test_scrubber_removes_secrets_before_llm():
    """Verify that secrets in the code are scrubbed before the LLM sees them."""
    captured_prompts: list[str] = []

    def capturing_llm(prompt: str) -> str:
        captured_prompts.append(prompt)
        return "[]"

    secret_code = 'api_key = "AKIAIOSFODNN7EXAMPLE"'
    agent = LLMReviewAgent(llm_fn=capturing_llm)
    event = _make_event(code=secret_code)

    agent.process(event)

    assert len(captured_prompts) == 1
    # The AWS key should have been scrubbed
    assert "AKIAIOSFODNN7EXAMPLE" not in captured_prompts[0]
    assert "[REDACTED:AWS_KEY]" in captured_prompts[0]


# ---------------------------------------------------------------------------
# No API key — graceful degradation
# ---------------------------------------------------------------------------

def test_no_llm_fn_returns_empty():
    agent = LLMReviewAgent(llm_fn=None)
    event = _make_event()

    findings = agent.process(event)

    assert findings == []


# ---------------------------------------------------------------------------
# LLM call failure
# ---------------------------------------------------------------------------

def test_llm_exception_returns_empty():
    llm_fn = MagicMock(side_effect=RuntimeError("API error"))
    agent = LLMReviewAgent(llm_fn=llm_fn)
    event = _make_event()

    findings = agent.process(event)

    assert findings == []


# ---------------------------------------------------------------------------
# Empty diff
# ---------------------------------------------------------------------------

def test_empty_hunk_skipped():
    llm_fn = MagicMock(return_value="[]")
    agent = LLMReviewAgent(llm_fn=llm_fn)
    event = DiffEvent(
        scan_id="scan-002",
        project_id="proj-001",
        commit_hash="def456",
        branch="main",
        author="dev@test.com",
        timestamp="2026-01-01T00:00:00Z",
        files=[
            DiffFile(
                path="empty.py",
                language="python",
                hunks=[DiffHunk(1, 1, 1, 0, "-removed line")],
                ai_score=0.0,
            )
        ],
        scan_config=ScanConfig("standard", "", 0.7),
    )

    findings = agent.process(event)

    assert findings == []
    llm_fn.assert_not_called()


# ---------------------------------------------------------------------------
# _extract_added_code helper
# ---------------------------------------------------------------------------

def test_extract_added_code():
    diff_file = DiffFile(
        path="test.py",
        language="python",
        hunks=[
            DiffHunk(1, 3, 1, 4, "+new_line_1\n old_line\n-removed\n+new_line_2"),
        ],
        ai_score=0.0,
    )
    result = _extract_added_code(diff_file)
    assert "new_line_1" in result
    assert "new_line_2" in result
    assert "removed" not in result


def test_extract_added_code_skips_plus_plus_plus():
    diff_file = DiffFile(
        path="test.py",
        language="python",
        hunks=[
            DiffHunk(0, 0, 1, 1, "+++ b/test.py\n+actual code"),
        ],
        ai_score=0.0,
    )
    result = _extract_added_code(diff_file)
    assert "actual code" in result
    assert "+++ b/test.py" not in result


# ---------------------------------------------------------------------------
# run_scan integration
# ---------------------------------------------------------------------------

def test_run_scan_returns_finding_event():
    llm_fn = MagicMock(return_value=_mock_llm_response())
    agent = LLMReviewAgent(llm_fn=llm_fn)
    event = _make_event()

    result = agent.run_scan(event)

    assert result.status == "completed"
    assert result.agent_name == "llm-review"
    assert len(result.findings) == 1


def test_agent_metadata():
    agent = LLMReviewAgent()
    assert agent.name == "llm-review"
    assert agent.version == "0.1.0"
