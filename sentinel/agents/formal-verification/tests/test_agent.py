from sentinel_agents.types import DiffEvent, DiffFile, DiffHunk, ScanConfig
from sentinel_fv.agent import FormalVerificationAgent


def _make_event(files=None):
    return DiffEvent(
        scan_id="scan_test",
        project_id="proj_1",
        commit_hash="abc123",
        branch="main",
        author="dev@test.com",
        timestamp="2026-03-15T12:00:00Z",
        files=files or [],
        scan_config=ScanConfig(
            security_level="standard", license_policy="MIT", quality_threshold=0.7
        ),
    )


def test_agent_metadata():
    agent = FormalVerificationAgent()
    assert agent.name == "formal-verification"
    assert agent.version == "0.1.0"


def test_empty_diff_returns_no_findings():
    agent = FormalVerificationAgent()
    result = agent.run_scan(_make_event())
    assert result.status == "completed"
    assert result.findings == []


def test_health_reports_healthy():
    agent = FormalVerificationAgent()
    health = agent.health()
    assert health.status == "healthy"
    assert health.name == "formal-verification"
