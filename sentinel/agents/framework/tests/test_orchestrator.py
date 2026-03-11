"""Tests for ScanOrchestrator two-pass execution."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from sentinel_agents.base import BaseAgent
from sentinel_agents.orchestrator import ScanOrchestrator, ScanResult
from sentinel_agents.types import (
    Confidence,
    DiffEvent,
    DiffFile,
    DiffHunk,
    Finding,
    FindingEvent,
    ScanConfig,
    Severity,
)


def _make_event(scan_id: str = "scan-1") -> DiffEvent:
    return DiffEvent(
        scan_id=scan_id,
        project_id="proj-1",
        commit_hash="abc123",
        branch="main",
        author="dev",
        timestamp="2026-03-11T00:00:00Z",
        files=[
            DiffFile(
                path="src/auth.py",
                language="python",
                hunks=[DiffHunk(0, 0, 1, 10, "def login(): pass")],
                ai_score=0.0,
            )
        ],
        scan_config=ScanConfig(
            security_level="standard",
            license_policy="",
            quality_threshold=0.7,
        ),
    )


class StubAgent(BaseAgent):
    """Agent that returns canned findings."""

    def __init__(self, name: str, findings: list[Finding] | None = None, fail: bool = False) -> None:
        self.name = name
        self.version = "0.1.0"
        self.ruleset_version = "test"
        self.ruleset_hash = ""
        self._findings = findings or []
        self._fail = fail

    def process(self, event: DiffEvent) -> list[Finding]:
        if self._fail:
            raise RuntimeError(f"{self.name} crashed")
        return self._findings


class TestOrchestrator:
    @pytest.mark.asyncio
    async def test_single_agent_completes(self) -> None:
        finding = Finding(
            type="security",
            file="src/auth.py",
            line_start=1,
            line_end=5,
            severity=Severity.HIGH,
            confidence=Confidence.HIGH,
            title="SQL injection",
        )
        agent = StubAgent("security", [finding])
        orch = ScanOrchestrator(agents=[agent])
        result = await orch.run_scan(_make_event())

        assert result.status == "completed"
        assert len(result.findings) == 1
        assert result.findings[0]["title"] == "SQL injection"
        assert result.duration_ms >= 0

    @pytest.mark.asyncio
    async def test_multiple_agents_parallel(self) -> None:
        agents = [
            StubAgent("security", [
                Finding("security", "a.py", 1, 5, Severity.HIGH, Confidence.HIGH, "vuln"),
            ]),
            StubAgent("quality", [
                Finding("quality", "a.py", 1, 10, Severity.MEDIUM, Confidence.MEDIUM, "complex"),
            ]),
            StubAgent("policy", []),
        ]
        orch = ScanOrchestrator(agents=agents)
        result = await orch.run_scan(_make_event())

        assert result.status == "completed"
        assert len(result.findings) == 2
        assert len(result.agent_results) == 3

    @pytest.mark.asyncio
    async def test_agent_failure_partial_status(self) -> None:
        agents = [
            StubAgent("security", [
                Finding("security", "a.py", 1, 5, Severity.HIGH, Confidence.HIGH, "vuln"),
            ]),
            StubAgent("failing", fail=True),
        ]
        orch = ScanOrchestrator(agents=agents)
        result = await orch.run_scan(_make_event())

        assert result.status == "partial"
        assert len(result.findings) == 1  # only from working agent
        error_results = [r for r in result.agent_results if r.status == "error"]
        assert len(error_results) == 1

    @pytest.mark.asyncio
    async def test_all_agents_fail(self) -> None:
        agents = [StubAgent("a", fail=True), StubAgent("b", fail=True)]
        orch = ScanOrchestrator(agents=agents)
        result = await orch.run_scan(_make_event())

        assert result.status == "error"
        assert len(result.findings) == 0

    @pytest.mark.asyncio
    async def test_correlation_engine_called(self) -> None:
        agents = [
            StubAgent("security", [
                Finding("security", "a.py", 1, 5, Severity.HIGH, Confidence.HIGH, "vuln"),
            ]),
            StubAgent("quality", [
                Finding("quality", "a.py", 1, 10, Severity.MEDIUM, Confidence.MEDIUM, "complex"),
            ]),
        ]
        mock_engine = MagicMock()
        mock_engine.correlate.return_value = []

        orch = ScanOrchestrator(agents=agents, correlation_engine=mock_engine)
        result = await orch.run_scan(_make_event())

        mock_engine.correlate.assert_called_once()
        call_args = mock_engine.correlate.call_args
        assert len(call_args[0][0]) == 2  # 2 findings passed to correlate

    @pytest.mark.asyncio
    async def test_sse_events_published(self) -> None:
        agent = StubAgent("security", [
            Finding("security", "a.py", 1, 5, Severity.HIGH, Confidence.HIGH, "vuln"),
        ])
        mock_sse = AsyncMock()
        mock_sse.publish = AsyncMock(return_value="123-0")
        mock_sse.publish_scan_completed = AsyncMock(return_value="123-1")

        orch = ScanOrchestrator(agents=[agent], sse_publisher=mock_sse)
        result = await orch.run_scan(_make_event())

        # Should have published: progress (start) + agent_completed + progress (complete) + scan_completed
        assert mock_sse.publish.call_count >= 2
        assert mock_sse.publish_scan_completed.call_count == 1

    @pytest.mark.asyncio
    async def test_llm_escalation_only_for_flagged(self) -> None:
        """LLM agent only runs when correlation flags escalation."""
        from agent_core.correlation.types import EnrichedFinding

        agents = [
            StubAgent("security", [
                Finding("security", "a.py", 1, 5, Severity.HIGH, Confidence.HIGH, "vuln"),
            ]),
        ]

        # Mock correlation that flags escalation
        mock_engine = MagicMock()
        ef = EnrichedFinding(
            type="security", file="a.py", line_start=1, line_end=5,
            severity="critical", confidence="high", title="vuln",
            escalate_to_llm=True,
        )
        mock_engine.correlate.return_value = [ef]

        llm_agent = StubAgent("llm-review", [
            Finding("llm-review", "a.py", 1, 5, Severity.HIGH, Confidence.HIGH, "llm finding"),
        ])

        orch = ScanOrchestrator(
            agents=agents, correlation_engine=mock_engine, llm_agent=llm_agent
        )
        result = await orch.run_scan(_make_event())

        # LLM agent should have run and added its finding
        assert len(result.findings) == 2
        llm_findings = [f for f in result.findings if f.get("title") == "llm finding"]
        assert len(llm_findings) == 1

    @pytest.mark.asyncio
    async def test_no_llm_escalation_when_not_flagged(self) -> None:
        agents = [
            StubAgent("security", [
                Finding("security", "a.py", 1, 5, Severity.HIGH, Confidence.HIGH, "vuln"),
            ]),
            StubAgent("quality", [
                Finding("quality", "b.py", 20, 30, Severity.LOW, Confidence.LOW, "minor"),
            ]),
        ]

        # Correlation returns findings but none flagged for escalation
        mock_engine = MagicMock()
        mock_engine.correlate.return_value = []

        llm_agent = StubAgent("llm-review", [
            Finding("llm-review", "a.py", 1, 5, Severity.HIGH, Confidence.HIGH, "llm"),
        ])

        orch = ScanOrchestrator(
            agents=agents, correlation_engine=mock_engine, llm_agent=llm_agent
        )
        result = await orch.run_scan(_make_event())

        # LLM should NOT have run
        assert len(result.findings) == 2
        assert all(f.get("title") != "llm" for f in result.findings)

    @pytest.mark.asyncio
    async def test_scan_result_fields(self) -> None:
        agent = StubAgent("security", [])
        orch = ScanOrchestrator(agents=[agent])
        result = await orch.run_scan(_make_event("scan-42"))

        assert result.scan_id == "scan-42"
        assert isinstance(result.duration_ms, int)
        assert result.status == "completed"
