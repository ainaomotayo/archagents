"""Tests for the full FormalVerificationAgent pipeline."""
from sentinel_agents.types import DiffEvent, DiffFile, DiffHunk, ScanConfig
from sentinel_fv.agent import FormalVerificationAgent


def _make_scan_config():
    return ScanConfig(
        security_level="standard", license_policy="MIT", quality_threshold=0.7
    )


def _make_event(files=None):
    return DiffEvent(
        scan_id="scan_test",
        project_id="proj_1",
        commit_hash="abc123",
        branch="main",
        author="dev@test.com",
        timestamp="2026-03-15T12:00:00Z",
        files=files or [],
        scan_config=_make_scan_config(),
    )


def _make_diff_file(path, content, new_start=1, new_count=None):
    lines = content.split("\n")
    if new_count is None:
        new_count = len(lines)
    hunk = DiffHunk(
        old_start=0, old_count=0, new_start=new_start, new_count=new_count,
        content=content,
    )
    lang = "python" if path.endswith(".py") else "unknown"
    return DiffFile(path=path, language=lang, hunks=[hunk], ai_score=0.5)


# ---- 1. Metadata ----

def test_agent_metadata():
    agent = FormalVerificationAgent()
    assert agent.name == "formal-verification"
    assert agent.version == "0.1.0"


# ---- 2. Empty diff ----

def test_empty_diff_no_findings():
    agent = FormalVerificationAgent()
    event = _make_event()
    findings = agent.process(event)
    assert findings == []


# ---- 3. Health ----

def test_health_healthy():
    agent = FormalVerificationAgent()
    health = agent.health()
    assert health.status == "healthy"
    assert health.name == "formal-verification"


# ---- 4. Division by zero detection ----

def test_detects_division_by_zero():
    content = "+def divide(a, b):\n+    return a / b\n"
    diff_file = _make_diff_file("math_utils.py", content, new_start=1, new_count=2)
    agent = FormalVerificationAgent()
    findings = agent.process(_make_event([diff_file]))
    assert len(findings) >= 1
    cats = [f.category for f in findings]
    assert any("division" in c or "zero" in c for c in cats), f"Expected division/zero in {cats}"


# ---- 5. Skips non-Python ----

def test_skips_non_python():
    content = "+fn main() {\n+    println!(\"hello\");\n+}\n"
    diff_file = _make_diff_file("main.rs", content)
    agent = FormalVerificationAgent()
    findings = agent.process(_make_event([diff_file]))
    assert findings == []


# ---- 6. Finding format ----

def test_finding_format():
    content = "+def divide(a, b):\n+    return a / b\n"
    diff_file = _make_diff_file("calc.py", content, new_start=1, new_count=2)
    agent = FormalVerificationAgent()
    findings = agent.process(_make_event([diff_file]))
    assert len(findings) >= 1
    f = findings[0]
    assert f.scanner == "sentinel-formal-verification"
    assert f.file == "calc.py"
    assert f.type in ("security", "quality")
    assert f.category  # non-empty


# ---- 7. Multiple files ----

def test_multiple_files():
    content1 = "+def divide(a, b):\n+    return a / b\n"
    content2 = "+def greet(name):\n+    if name is None:\n+        raise ValueError\n+    return 'hi ' + name\n"
    f1 = _make_diff_file("a.py", content1, new_start=1, new_count=2)
    f2 = _make_diff_file("b.py", content2, new_start=1, new_count=4)
    agent = FormalVerificationAgent()
    findings = agent.process(_make_event([f1, f2]))
    files_with_findings = {f.file for f in findings}
    # At minimum, division-by-zero in a.py should produce a finding
    assert "a.py" in files_with_findings


# ---- 8. Annotated postcondition ----

def test_annotated_postcondition():
    content = (
        "+from typing import *\n"
        "+def compute(x: int) -> int:\n"
        "+    \"\"\"\n"
        "+    :ensures: result is not None\n"
        "+    \"\"\"\n"
        "+    return x * 2\n"
    )
    diff_file = _make_diff_file("comp.py", content, new_start=1, new_count=6)
    agent = FormalVerificationAgent()
    findings = agent.process(_make_event([diff_file]))
    # The annotated postcondition may or may not produce a finding depending on
    # AI/SMT analysis — but the pipeline should not crash
    assert isinstance(findings, list)


# ---- 9. Status always completed ----

def test_status_always_completed():
    agent = FormalVerificationAgent()
    result = agent.run_scan(_make_event())
    assert result.status == "completed"
    assert result.findings == []
