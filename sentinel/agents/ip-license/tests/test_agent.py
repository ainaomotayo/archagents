from unittest.mock import patch

from sentinel_agents.types import DiffEvent, DiffFile, DiffHunk, ScanConfig
from sentinel_license.agent import LicenseAgent
from sentinel_license.registry_lookup import PackageInfo


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


def test_agent_enriches_findings_with_registry():
    """Registry lookup enriches fingerprint findings with authoritative metadata."""
    from sentinel_agents.types import Confidence, Finding, Severity

    mock_info = PackageInfo(
        name="lodash",
        version="4.17.21",
        ecosystem="npm",
        spdx_license="MIT",
        source_url="https://github.com/lodash/lodash",
        tarball_url="https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz",
    )

    # Build a finding that looks like a fingerprint match with ecosystem info
    fp_finding = Finding(
        type="license",
        file="src/utils.js",
        line_start=10,
        line_end=20,
        severity=Severity.MEDIUM,
        confidence=Confidence.MEDIUM,
        title="Code matches known OSS: https://github.com/lodash/lodash",
        description="Code fragment matches lodash",
        category="copyleft-risk",
        scanner="fingerprint",
        extra={
            "similarityScore": 1.0,
            "sourceMatch": "https://github.com/lodash/lodash",
            "licenseDetected": "MIT",
            "findingType": "copyleft-risk",
            "policyAction": "review",
            "packageVersion": "4.17.21",
            "ecosystem": "npm",
            "matchType": "exact",
        },
    )

    with patch("sentinel_license.agent.fetch_package_info", return_value=mock_info):
        LicenseAgent._enrich_with_registry_metadata([fp_finding])

    assert fp_finding.extra["registryLicense"] == "MIT"
    assert fp_finding.extra["registryVersion"] == "4.17.21"
    assert fp_finding.extra["registryUrl"] == "https://github.com/lodash/lodash"


def test_agent_enrichment_skips_on_registry_failure():
    """Registry failures must not break the scan — findings are returned unchanged."""
    from sentinel_agents.types import Confidence, Finding, Severity

    fp_finding = Finding(
        type="license",
        file="src/utils.js",
        line_start=10,
        line_end=20,
        severity=Severity.MEDIUM,
        confidence=Confidence.MEDIUM,
        title="Code matches known OSS: https://github.com/lodash/lodash",
        description="Code fragment matches lodash",
        category="copyleft-risk",
        scanner="fingerprint",
        extra={
            "sourceMatch": "https://github.com/lodash/lodash",
            "packageVersion": "4.17.21",
            "ecosystem": "npm",
        },
    )

    with patch(
        "sentinel_license.agent.fetch_package_info",
        side_effect=ConnectionError("network down"),
    ):
        LicenseAgent._enrich_with_registry_metadata([fp_finding])

    # Finding should be unchanged — no registryLicense key added
    assert "registryLicense" not in fp_finding.extra


def test_agent_enrichment_skips_findings_without_ecosystem():
    """Findings without ecosystem/sourceMatch should be silently skipped."""
    from sentinel_agents.types import Confidence, Finding, Severity

    finding = Finding(
        type="license",
        file="src/lib.py",
        line_start=1,
        line_end=1,
        severity=Severity.MEDIUM,
        confidence=Confidence.MEDIUM,
        title="GPL detected",
        description="GPL header found",
        category="copyleft-risk",
        scanner="spdx",
        extra={"licenseDetected": "GPL-3.0"},
    )

    with patch("sentinel_license.agent.fetch_package_info") as mock_fetch:
        LicenseAgent._enrich_with_registry_metadata([finding])
        mock_fetch.assert_not_called()

    assert "registryLicense" not in finding.extra
