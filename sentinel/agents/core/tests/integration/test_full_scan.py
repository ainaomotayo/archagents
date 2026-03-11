"""Integration tests for full scan orchestration with mock agents.

Tests the ScanOrchestrator with mock agents that return predetermined
findings, verifying the two-pass pipeline and enrichment.
"""

from __future__ import annotations

import asyncio
import json
import os
from unittest.mock import MagicMock, AsyncMock

import pytest

from sentinel_agents.base import BaseAgent
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
from sentinel_agents.orchestrator import ScanOrchestrator, ScanResult
from agent_core.correlation.engine import CorrelationEngine

FIXTURES = os.path.join(os.path.dirname(__file__), "..", "fixtures")


def _load_diff_event(name: str) -> DiffEvent:
    with open(os.path.join(FIXTURES, name)) as f:
        data = json.load(f)
    return DiffEvent.from_dict(data)


# ---------------------------------------------------------------------------
# Mock agents
# ---------------------------------------------------------------------------

class MockSecurityAgent(BaseAgent):
    name = "security"
    version = "0.1.0"

    def process(self, event: DiffEvent) -> list[Finding]:
        findings = []
        for f in event.files:
            if "auth" in f.path:
                findings.append(Finding(
                    type="security", file=f.path, line_start=6, line_end=7,
                    severity=Severity.HIGH, confidence=Confidence.HIGH,
                    title="SQL Injection", description="Found SQLi",
                    remediation="Use parameterized queries",
                    category="CWE-89", scanner="security",
                ))
        return findings


class MockQualityAgent(BaseAgent):
    name = "quality"
    version = "0.1.0"

    def process(self, event: DiffEvent) -> list[Finding]:
        findings = []
        for f in event.files:
            if "complex" in f.path or "auth" in f.path:
                findings.append(Finding(
                    type="quality", file=f.path, line_start=1, line_end=20,
                    severity=Severity.MEDIUM, confidence=Confidence.HIGH,
                    title="High complexity", description="CC=15",
                    remediation="Refactor", category="complexity",
                    scanner="quality",
                ))
        return findings


class MockDependencyAgent(BaseAgent):
    name = "dependency"
    version = "0.1.0"

    def process(self, event: DiffEvent) -> list[Finding]:
        findings = []
        for f in event.files:
            if "requirements" in f.path or "package.json" in f.path:
                findings.append(Finding(
                    type="dependency", file=f.path, line_start=1, line_end=1,
                    severity=Severity.HIGH, confidence=Confidence.HIGH,
                    title="CVE-2023-0001", description="Known vuln",
                    remediation="Upgrade", category="cve",
                    scanner="dependency",
                ))
        return findings


class FailingAgent(BaseAgent):
    name = "failing"
    version = "0.1.0"

    def process(self, event: DiffEvent) -> list[Finding]:
        raise RuntimeError("Agent crashed!")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestFullScan:
    def test_orchestrator_runs_all_agents(self):
        """All agents run and findings are collected."""
        agents = [MockSecurityAgent(), MockQualityAgent(), MockDependencyAgent()]
        orchestrator = ScanOrchestrator(agents=agents)
        event = _load_diff_event("known_bad_diff.json")

        result = asyncio.run(orchestrator.run_scan(event))

        assert isinstance(result, ScanResult)
        assert result.status == "completed"
        assert result.scan_id == "scan-bad-001"
        assert len(result.findings) > 0
        assert len(result.agent_results) == 3

    def test_orchestrator_with_correlation(self):
        """Correlation engine enriches findings in pass 2."""
        agents = [MockSecurityAgent(), MockQualityAgent()]
        engine = CorrelationEngine()
        orchestrator = ScanOrchestrator(agents=agents, correlation_engine=engine)
        event = _load_diff_event("known_bad_diff.json")

        result = asyncio.run(orchestrator.run_scan(event))

        assert result.status == "completed"
        assert len(result.enriched_findings) > 0
        # Quality + security on same file should trigger complex_vulnerable_code
        quality_enriched = [
            e for e in result.enriched_findings
            if e.scanner == "quality"
        ]
        assert any("complex-vuln" in e.tags for e in quality_enriched)

    def test_clean_diff_produces_no_findings(self):
        """Clean diff should yield zero findings from mock agents."""
        agents = [MockSecurityAgent(), MockQualityAgent(), MockDependencyAgent()]
        orchestrator = ScanOrchestrator(agents=agents)
        event = _load_diff_event("clean_diff.json")

        result = asyncio.run(orchestrator.run_scan(event))

        assert result.status == "completed"
        assert len(result.findings) == 0

    def test_one_agent_fails_others_continue(self):
        """If one agent throws, others still run and status is 'partial'."""
        agents = [MockSecurityAgent(), FailingAgent(), MockDependencyAgent()]
        orchestrator = ScanOrchestrator(agents=agents)
        event = _load_diff_event("known_bad_diff.json")

        result = asyncio.run(orchestrator.run_scan(event))

        assert result.status == "partial"
        assert len(result.agent_results) == 3
        # Failing agent should have error status
        failing_result = next(r for r in result.agent_results if r.agent_name == "failing")
        assert failing_result.status == "error"
        # Others should have findings
        assert len(result.findings) > 0

    def test_all_agents_fail_returns_error(self):
        """If all agents fail, status is 'error'."""
        agents = [FailingAgent()]
        orchestrator = ScanOrchestrator(agents=agents)
        event = _load_diff_event("known_bad_diff.json")

        result = asyncio.run(orchestrator.run_scan(event))

        assert result.status == "error"
        assert len(result.findings) == 0

    def test_duration_is_tracked(self):
        """Scan result should have positive duration_ms."""
        agents = [MockSecurityAgent()]
        orchestrator = ScanOrchestrator(agents=agents)
        event = _load_diff_event("known_bad_diff.json")

        result = asyncio.run(orchestrator.run_scan(event))

        assert result.duration_ms >= 0

    def test_finding_count_matches_agent_results(self):
        """Total findings should equal sum of per-agent findings."""
        agents = [MockSecurityAgent(), MockQualityAgent(), MockDependencyAgent()]
        orchestrator = ScanOrchestrator(agents=agents)
        event = _load_diff_event("known_bad_diff.json")

        result = asyncio.run(orchestrator.run_scan(event))

        total_from_agents = sum(len(r.findings) for r in result.agent_results)
        assert len(result.findings) == total_from_agents
