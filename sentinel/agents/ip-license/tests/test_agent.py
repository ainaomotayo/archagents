from sentinel_agents.types import DiffEvent, DiffFile, DiffHunk, ScanConfig
from sentinel_license.agent import LicenseAgent


def _make_event(code: str, path: str = "file.py", lang: str = "python") -> DiffEvent:
    return DiffEvent(
        scan_id="scan_test",
        project_id="proj_1",
        commit_hash="abc",
        branch="main",
        author="dev@test.com",
        timestamp="2026-03-09T12:00:00Z",
        files=[
            DiffFile(
                path=path,
                language=lang,
                hunks=[
                    DiffHunk(
                        old_start=1, old_count=0, new_start=1, new_count=1, content=code
                    )
                ],
                ai_score=0.9,
            )
        ],
        scan_config=ScanConfig(
            security_level="standard",
            license_policy="MIT OR Apache-2.0",
            quality_threshold=0.7,
        ),
    )


def test_detects_gpl_license():
    result = LicenseAgent().run_scan(
        _make_event("+# Licensed under GNU General Public License\n")
    )
    assert result.status == "completed"
    gpl = [f for f in result.findings if "GPL" in f.title]
    assert len(gpl) >= 1
    assert gpl[0].severity.value == "high"


def test_detects_spdx_identifier():
    result = LicenseAgent().run_scan(
        _make_event("+# SPDX-License-Identifier: AGPL-3.0\n")
    )
    assert result.status == "completed"
    findings = [f for f in result.findings if "AGPL" in f.title]
    assert len(findings) >= 1


def test_clean_code_no_license_findings():
    result = LicenseAgent().run_scan(_make_event("+import os\n+print('hello')\n"))
    assert result.status == "completed"
    license_findings = [f for f in result.findings if f.type == "license"]
    assert len(license_findings) == 0


def test_agent_metadata():
    agent = LicenseAgent()
    assert agent.name == "ip-license"
    assert agent.version == "0.3.0"


def test_health():
    health = LicenseAgent().health()
    assert health.status == "healthy"
    assert health.name == "ip-license"


def test_run_scan_returns_finding_event():
    result = LicenseAgent().run_scan(
        _make_event("+# Mozilla Public License 2.0\n")
    )
    assert result.scan_id == "scan_test"
    assert result.agent_name == "ip-license"
    assert result.status == "completed"
    assert result.duration_ms >= 0


def test_agent_produces_evidence_chain():
    event = _make_event("+# Licensed under GNU General Public License\n")
    agent = LicenseAgent()
    result = agent.run_scan(event)
    assert result.status == "completed"
    evidence = agent.last_evidence_chain
    assert evidence is not None
    assert len(evidence.records) > 0
    assert evidence.verify() is True
    assert evidence.records[0].prev_hash is None  # genesis


def test_evidence_chain_links_multiple_findings():
    # Code with both GPL license header AND enough lines for fingerprinting
    lines = ["+# Licensed under GNU General Public License"]
    lines.extend([f"+def func_{i}(): return {i}" for i in range(12)])
    code = "\n".join(lines) + "\n"
    agent = LicenseAgent()
    result = agent.run_scan(_make_event(code))
    assert result.status == "completed"
    chain = agent.last_evidence_chain
    assert chain is not None
    if len(chain.records) >= 2:
        assert chain.records[1].prev_hash == chain.records[0].hash
    assert chain.verify() is True
