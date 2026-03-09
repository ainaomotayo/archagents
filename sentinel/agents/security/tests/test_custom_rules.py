from sentinel_agents.types import DiffEvent, DiffFile, DiffHunk, ScanConfig
from sentinel_security.custom_rules import run_custom_rules


def _make_event_with_code(path: str, language: str, code: str) -> DiffEvent:
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
                language=language,
                hunks=[
                    DiffHunk(
                        old_start=1,
                        old_count=0,
                        new_start=1,
                        new_count=1,
                        content=f"+{code}\n",
                    )
                ],
                ai_score=0.9,
            )
        ],
        scan_config=ScanConfig(
            security_level="standard", license_policy="MIT", quality_threshold=0.7
        ),
    )


def test_eval_detection():
    findings = run_custom_rules(_make_event_with_code("x.py", "python", "result = eval(user_input)"))
    assert any(f.cwe_id == "CWE-95" for f in findings)


def test_os_system_detection():
    findings = run_custom_rules(_make_event_with_code("x.py", "python", "os.system(cmd)"))
    assert any(f.cwe_id == "CWE-78" for f in findings)


def test_ssl_verify_false():
    findings = run_custom_rules(
        _make_event_with_code("x.py", "python", "requests.get(url, verify=False)")
    )
    assert any(f.cwe_id == "CWE-295" for f in findings)


def test_js_suspicious_package():
    findings = run_custom_rules(
        _make_event_with_code("x.js", "javascript", "const x = require('crossenv')")
    )
    assert any(f.category == "hallucinated-dep" for f in findings)


def test_math_random_detection():
    findings = run_custom_rules(
        _make_event_with_code("x.js", "javascript", "const id = Math.random()")
    )
    assert any(f.cwe_id == "CWE-338" for f in findings)
