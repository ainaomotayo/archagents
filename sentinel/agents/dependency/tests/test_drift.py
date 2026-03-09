from sentinel_agents.types import DiffEvent, DiffFile, DiffHunk, ScanConfig
from sentinel_dependency.drift_detector import detect_drift, extract_imports


def _make_event(code: str, path: str = "app.py", lang: str = "python") -> DiffEvent:
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
                    DiffHunk(old_start=1, old_count=0, new_start=1, new_count=1, content=code)
                ],
                ai_score=0.9,
            )
        ],
        scan_config=ScanConfig(
            security_level="standard", license_policy="MIT", quality_threshold=0.7
        ),
    )


def test_extract_python_imports():
    imports = extract_imports(_make_event("+import requests\n+from flask import Flask\n"))
    pkgs = [i[0] for i in imports]
    assert "requests" in pkgs
    assert "flask" in pkgs


def test_extract_js_imports():
    imports = extract_imports(
        _make_event(
            "+const axios = require('axios')\n+import lodash from 'lodash'\n",
            path="app.js",
            lang="javascript",
        )
    )
    pkgs = [i[0] for i in imports]
    assert "axios" in pkgs
    assert "lodash" in pkgs


def test_detect_drift_flags_overlapping_dep():
    event = _make_event("+import axios\n", path="app.js", lang="javascript")
    findings = detect_drift(event, existing_deps={"got"})  # got is same category as axios
    assert len(findings) >= 1
    assert findings[0].category == "architectural-drift"
    assert "got" in findings[0].description


def test_detect_drift_no_flag_for_existing():
    event = _make_event("+import requests\n")
    findings = detect_drift(event, existing_deps={"requests"})
    assert len(findings) == 0


def test_detect_drift_no_flag_for_unrelated():
    event = _make_event("+import os\n")
    findings = detect_drift(event, existing_deps={"requests"})
    assert len(findings) == 0
