from sentinel_agents.types import DiffEvent, DiffFile, DiffHunk, ScanConfig
from sentinel_security.agent import SecurityAgent


def _make_event(files: list[DiffFile]) -> DiffEvent:
    return DiffEvent(
        scan_id="scan_test",
        project_id="proj_1",
        commit_hash="abc123",
        branch="main",
        author="dev@test.com",
        timestamp="2026-03-09T12:00:00Z",
        files=files,
        scan_config=ScanConfig(
            security_level="standard", license_policy="MIT", quality_threshold=0.7
        ),
    )


def test_detects_insecure_defaults():
    files = [
        DiffFile(
            path="settings.py",
            language="python",
            hunks=[
                DiffHunk(
                    old_start=1,
                    old_count=1,
                    new_start=1,
                    new_count=3,
                    content="+DEBUG = True\n+SECRET_KEY = 'mysecretkey123456'\n",
                )
            ],
            ai_score=0.9,
        )
    ]
    agent = SecurityAgent()
    result = agent.run_scan(_make_event(files))
    assert result.status == "completed"
    assert len(result.findings) >= 2
    titles = [f.title for f in result.findings]
    assert any("DEBUG" in t for t in titles)
    assert any("secret" in t.lower() for t in titles)


def test_detects_suspicious_packages():
    files = [
        DiffFile(
            path="app.py",
            language="python",
            hunks=[
                DiffHunk(
                    old_start=1,
                    old_count=0,
                    new_start=1,
                    new_count=1,
                    content="+import requets\n",
                )
            ],
            ai_score=0.95,
        )
    ]
    agent = SecurityAgent()
    result = agent.run_scan(_make_event(files))
    assert result.status == "completed"
    suspicious = [f for f in result.findings if f.category == "hallucinated-dep"]
    assert len(suspicious) >= 1
    assert suspicious[0].severity.value == "critical"


def test_detects_deprecated_apis():
    files = [
        DiffFile(
            path="utils.py",
            language="python",
            hunks=[
                DiffHunk(
                    old_start=1,
                    old_count=0,
                    new_start=1,
                    new_count=1,
                    content="+from cgi import parse_qs\n",
                )
            ],
            ai_score=0.8,
        )
    ]
    agent = SecurityAgent()
    result = agent.run_scan(_make_event(files))
    deprecated = [f for f in result.findings if f.category == "deprecated-api"]
    assert len(deprecated) >= 1


def test_clean_code_returns_no_findings():
    files = [
        DiffFile(
            path="clean.py",
            language="python",
            hunks=[
                DiffHunk(
                    old_start=1,
                    old_count=0,
                    new_start=1,
                    new_count=2,
                    content="+import os\n+print('hello')\n",
                )
            ],
            ai_score=0.5,
        )
    ]
    agent = SecurityAgent()
    result = agent.run_scan(_make_event(files))
    assert result.status == "completed"
    assert len(result.findings) == 0
