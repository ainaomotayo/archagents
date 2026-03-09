from __future__ import annotations

from sentinel_agents.base import BaseAgent
from sentinel_agents.types import DiffEvent, DiffFile, Finding, ScanConfig, Severity, Confidence


class MockAgent(BaseAgent):
    name = "mock-agent"
    version = "1.0.0"
    ruleset_version = "rules-test"
    ruleset_hash = "sha256:test"

    def __init__(self, findings: list[Finding] | None = None, should_fail: bool = False):
        self._findings = findings or []
        self._should_fail = should_fail

    def process(self, event: DiffEvent) -> list[Finding]:
        if self._should_fail:
            raise RuntimeError("Agent processing failed")
        return self._findings


def _make_event() -> DiffEvent:
    return DiffEvent(
        scan_id="scan_test",
        project_id="proj_1",
        commit_hash="abc123",
        branch="main",
        author="dev@test.com",
        timestamp="2026-03-09T12:00:00Z",
        files=[DiffFile(path="test.py", language="python", hunks=[], ai_score=0.5)],
        scan_config=ScanConfig(
            security_level="standard", license_policy="MIT", quality_threshold=0.7
        ),
    )


def test_run_scan_returns_completed():
    finding = Finding(
        type="security",
        file="test.py",
        line_start=1,
        line_end=5,
        severity=Severity.HIGH,
        confidence=Confidence.HIGH,
        title="Test finding",
    )
    agent = MockAgent(findings=[finding])
    result = agent.run_scan(_make_event())
    assert result.status == "completed"
    assert result.agent_name == "mock-agent"
    assert len(result.findings) == 1
    assert result.duration_ms >= 0


def test_run_scan_handles_error():
    agent = MockAgent(should_fail=True)
    result = agent.run_scan(_make_event())
    assert result.status == "error"
    assert result.error_detail == "Agent processing failed"
    assert len(result.findings) == 0


def test_health_returns_healthy():
    agent = MockAgent()
    health = agent.health()
    assert health.name == "mock-agent"
    assert health.version == "1.0.0"
    assert health.status == "healthy"
