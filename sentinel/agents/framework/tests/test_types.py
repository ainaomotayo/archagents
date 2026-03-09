from __future__ import annotations

from sentinel_agents.types import (
    DiffEvent,
    Finding,
    FindingEvent,
    AgentHealth,
    Severity,
    Confidence,
)


def test_diff_event_from_dict():
    raw = {
        "scanId": "scan_123",
        "payload": {
            "projectId": "proj_1",
            "commitHash": "abc123",
            "branch": "main",
            "author": "dev@test.com",
            "timestamp": "2026-03-09T12:00:00Z",
            "files": [
                {
                    "path": "src/index.ts",
                    "language": "typescript",
                    "hunks": [
                        {
                            "oldStart": 1,
                            "oldCount": 5,
                            "newStart": 1,
                            "newCount": 8,
                            "content": "+new line",
                        }
                    ],
                    "aiScore": 0.85,
                }
            ],
            "scanConfig": {
                "securityLevel": "strict",
                "licensePolicy": "MIT",
                "qualityThreshold": 0.8,
            },
        },
    }
    event = DiffEvent.from_dict(raw)
    assert event.scan_id == "scan_123"
    assert event.project_id == "proj_1"
    assert len(event.files) == 1
    assert event.files[0].path == "src/index.ts"
    assert event.files[0].hunks[0].new_count == 8
    assert event.files[0].ai_score == 0.85
    assert event.scan_config.security_level == "strict"


def test_finding_to_dict():
    finding = Finding(
        type="security",
        file="src/api.ts",
        line_start=47,
        line_end=49,
        severity=Severity.HIGH,
        confidence=Confidence.HIGH,
        title="SQL Injection",
        description="Unparameterized query",
        remediation="Use parameterized queries",
        category="injection",
        scanner="semgrep",
        cwe_id="CWE-89",
    )
    d = finding.to_dict()
    assert d["type"] == "security"
    assert d["severity"] == "high"
    assert d["lineStart"] == 47
    assert d["cweId"] == "CWE-89"


def test_finding_event_to_dict():
    finding = Finding(
        type="security",
        file="src/api.ts",
        line_start=10,
        line_end=12,
        severity=Severity.MEDIUM,
        confidence=Confidence.MEDIUM,
        title="Test",
    )
    event = FindingEvent(
        scan_id="scan_456",
        agent_name="security",
        findings=[finding],
        agent_version="0.1.0",
        ruleset_version="rules-2026.03.09",
        ruleset_hash="sha256:abc",
        status="completed",
        duration_ms=1234,
    )
    d = event.to_dict()
    assert d["scanId"] == "scan_456"
    assert d["agentName"] == "security"
    assert len(d["findings"]) == 1
    assert d["agentResult"]["findingCount"] == 1
    assert d["agentResult"]["durationMs"] == 1234
    assert d["agentResult"]["status"] == "completed"


def test_agent_health():
    health = AgentHealth(name="security", version="0.1.0", status="healthy")
    assert health.name == "security"
    assert health.status == "healthy"
