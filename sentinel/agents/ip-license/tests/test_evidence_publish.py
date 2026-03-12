from unittest.mock import MagicMock, patch

from sentinel_agents.types import DiffEvent, DiffFile, DiffHunk, ScanConfig
from sentinel_license.agent import LicenseAgent


def _make_event() -> DiffEvent:
    return DiffEvent(
        scan_id="scan_pub",
        project_id="proj_1",
        commit_hash="abc123",
        branch="main",
        author="dev@test.com",
        timestamp="2026-03-12T12:00:00Z",
        files=[
            DiffFile(
                path="file.py",
                language="python",
                hunks=[
                    DiffHunk(
                        old_start=1, old_count=0, new_start=1, new_count=1,
                        content="+# Licensed under GNU General Public License\n",
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


def test_evidence_chain_serializes_to_dicts():
    agent = LicenseAgent()
    agent.run_scan(_make_event())
    chain = agent.last_evidence_chain
    assert chain is not None
    records = chain.to_dicts()
    assert len(records) >= 1
    for rec in records:
        assert "org_id" in rec
        assert "scan_id" in rec
        assert "hash" in rec
        assert "type" in rec
        assert "data" in rec


def test_publish_evidence_builds_stream_payload():
    agent = LicenseAgent()
    agent.run_scan(_make_event())
    chain = agent.last_evidence_chain
    assert chain is not None

    payload = agent.build_evidence_payload(chain, org_id="org_123")
    assert payload["orgId"] == "org_123"
    assert payload["scanId"] == "scan_pub"
    assert payload["type"] == "provenance_chain"
    assert isinstance(payload["eventData"]["records"], list)
    assert len(payload["eventData"]["records"]) >= 1
    assert payload["eventData"]["agentName"] == "ip-license"
    assert payload["eventData"]["agentVersion"] == "0.3.0"
