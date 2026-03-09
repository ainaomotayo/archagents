"""Tests for the main QualityAgent."""

from sentinel_agents.types import (
    Confidence,
    DiffEvent,
    DiffFile,
    DiffHunk,
    ScanConfig,
    Severity,
)

from sentinel_quality.agent import QualityAgent


def _make_event(files: list[DiffFile]) -> DiffEvent:
    return DiffEvent(
        scan_id="test-scan-1",
        project_id="proj-1",
        commit_hash="abc123",
        branch="main",
        author="dev@test.com",
        timestamp="2026-03-09T00:00:00Z",
        files=files,
        scan_config=ScanConfig(
            security_level="standard",
            license_policy="",
            quality_threshold=0.7,
        ),
    )


def _complex_python_hunk() -> str:
    """Generate a hunk with a complex function."""
    lines = [
        "@@ -0,0 +1,20 @@",
        "+def complex_func(a, b, c):",
        "+    if a > 0:",
        "+        if b > 0:",
        "+            for i in range(c):",
        "+                if i > 10 and a > 5:",
        "+                    while i > 0:",
        "+                        if a or b:",
        "+                            try:",
        "+                                process(i)",
        "+                            except ValueError:",
        "+                                pass",
        "+                            except TypeError:",
        "+                                pass",
        "+                        i -= 1",
        "+    elif c > 0:",
        "+        return c",
        "+    return None",
    ]
    return "\n".join(lines)


class TestQualityAgent:
    def test_agent_metadata(self):
        agent = QualityAgent()
        assert agent.name == "quality"
        assert agent.version == "0.1.0"

    def test_process_empty_event(self):
        agent = QualityAgent()
        event = _make_event([])
        findings = agent.process(event)
        assert findings == []

    def test_complexity_finding_generated(self):
        agent = QualityAgent()
        event = _make_event([
            DiffFile(
                path="src/handler.py",
                language="python",
                hunks=[
                    DiffHunk(
                        old_start=0,
                        old_count=0,
                        new_start=1,
                        new_count=20,
                        content=_complex_python_hunk(),
                    )
                ],
                ai_score=0.9,
            )
        ])
        findings = agent.process(event)
        complexity_findings = [f for f in findings if f.category == "complexity"]
        assert len(complexity_findings) >= 1
        assert complexity_findings[0].type == "quality"
        assert complexity_findings[0].severity in (Severity.MEDIUM, Severity.HIGH)

    def test_coverage_gap_finding_generated(self):
        agent = QualityAgent()
        event = _make_event([
            DiffFile(
                path="src/new_module.py",
                language="python",
                hunks=[
                    DiffHunk(
                        old_start=0,
                        old_count=0,
                        new_start=1,
                        new_count=1,
                        content="@@ -0,0 +1,1 @@\n+x = 1\n",
                    )
                ],
                ai_score=0.5,
            )
        ])
        findings = agent.process(event)
        coverage_findings = [f for f in findings if f.category == "test-coverage"]
        assert len(coverage_findings) == 1
        assert coverage_findings[0].file == "src/new_module.py"
        assert coverage_findings[0].confidence == Confidence.MEDIUM

    def test_no_coverage_gap_when_test_present(self):
        agent = QualityAgent()
        event = _make_event([
            DiffFile(
                path="src/module.py",
                language="python",
                hunks=[
                    DiffHunk(0, 0, 1, 1, "@@ -0,0 +1,1 @@\n+x = 1\n")
                ],
                ai_score=0.5,
            ),
            DiffFile(
                path="tests/test_module.py",
                language="python",
                hunks=[
                    DiffHunk(0, 0, 1, 1, "@@ -0,0 +1,1 @@\n+def test_x(): pass\n")
                ],
                ai_score=0.0,
            ),
        ])
        findings = agent.process(event)
        coverage_findings = [f for f in findings if f.category == "test-coverage"]
        assert len(coverage_findings) == 0

    def test_all_findings_have_quality_type(self):
        agent = QualityAgent()
        event = _make_event([
            DiffFile(
                path="src/handler.py",
                language="python",
                hunks=[
                    DiffHunk(0, 0, 1, 20, _complex_python_hunk())
                ],
                ai_score=0.9,
            )
        ])
        findings = agent.process(event)
        for f in findings:
            assert f.type == "quality"
            assert f.scanner == "quality-agent"
