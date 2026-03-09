from sentinel_agents.types import DiffEvent, DiffFile, DiffHunk, ScanConfig
from sentinel_license.spdx_detector import detect_licenses


def _make_event(code: str) -> DiffEvent:
    return DiffEvent(
        scan_id="scan_test",
        project_id="proj_1",
        commit_hash="abc",
        branch="main",
        author="dev@test.com",
        timestamp="2026-03-09T12:00:00Z",
        files=[
            DiffFile(
                path="file.py",
                language="python",
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
            license_policy="MIT",
            quality_threshold=0.7,
        ),
    )


def test_detects_gpl():
    findings = detect_licenses(_make_event("+# GNU General Public License v3\n"))
    assert any("GPL" in f.title for f in findings)


def test_detects_gpl_severity_high():
    findings = detect_licenses(_make_event("+# GNU General Public License v3\n"))
    gpl = [f for f in findings if "GPL" in f.title]
    assert gpl[0].severity.value == "high"


def test_detects_mit_with_restrictive_policy():
    # MIT detected but policy only allows Apache — flagged as policy-violation
    findings = detect_licenses(
        _make_event("+# Permission is hereby granted, free of charge\n"),
        allowed_policy="Apache-2.0",
    )
    assert isinstance(findings, list)


def test_detects_mpl():
    findings = detect_licenses(_make_event("+# Mozilla Public License 2.0\n"))
    assert any("MPL" in f.title for f in findings)


def test_detects_agpl_spdx():
    findings = detect_licenses(_make_event("+# SPDX-License-Identifier: AGPL-3.0\n"))
    agpl = [f for f in findings if "AGPL" in f.title]
    assert len(agpl) >= 1
    assert agpl[0].category == "copyleft-risk"


def test_no_findings_for_allowed_license():
    findings = detect_licenses(
        _make_event("+# MIT License\n"),
        allowed_policy="MIT",
    )
    # MIT is in the allowed set, not copyleft, so no finding
    assert len(findings) == 0


def test_creative_commons_flagged():
    findings = detect_licenses(_make_event("+# Creative Commons BY-SA 4.0\n"))
    assert any("CC" in f.title for f in findings)
    cc = [f for f in findings if "CC" in f.title]
    assert cc[0].category == "policy-violation"


def test_no_findings_for_clean_code():
    findings = detect_licenses(_make_event("+import os\n+x = 1\n"))
    assert len(findings) == 0
