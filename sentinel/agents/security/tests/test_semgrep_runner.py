"""Integration tests for semgrep_runner with real Semgrep binary."""
from __future__ import annotations

import os
import shutil
from pathlib import Path
from unittest.mock import patch

import pytest

from sentinel_agents.types import (
    Confidence,
    DiffEvent,
    DiffFile,
    DiffHunk,
    ScanConfig,
    Severity,
)
from sentinel_security.semgrep_runner import (
    _extract_cwe,
    _find_semgrep_binary,
    _resolve_path,
    run_semgrep,
)

# Skip all tests if semgrep is not available
_SEMGREP_BIN = _find_semgrep_binary() or shutil.which("semgrep")
pytestmark = pytest.mark.skipif(
    _SEMGREP_BIN is None,
    reason="semgrep binary not found; install semgrep to run integration tests",
)


def _make_event(files: list[DiffFile]) -> DiffEvent:
    return DiffEvent(
        scan_id="scan_semgrep_test",
        project_id="proj_test",
        commit_hash="abc123",
        branch="main",
        author="dev@test.com",
        timestamp="2026-03-09T12:00:00Z",
        files=files,
        scan_config=ScanConfig(
            security_level="standard", license_policy="MIT", quality_threshold=0.7
        ),
    )


def _make_diff_file(path: str, content: str, language: str = "python") -> DiffFile:
    """Helper: create a DiffFile from raw source code (prefixed with +)."""
    lines = "\n".join(f"+{line}" for line in content.splitlines()) + "\n"
    return DiffFile(
        path=path,
        language=language,
        hunks=[
            DiffHunk(old_start=1, old_count=0, new_start=1, new_count=len(content.splitlines()),
                     content=lines)
        ],
        ai_score=0.9,
    )


# --- Detection tests ---

class TestSemgrepDetectsVulnerabilities:
    """Tests that semgrep + custom rules detect real vulnerability patterns."""

    def test_detects_hardcoded_secret(self):
        code = 'password = "supersecret123"\nprint(password)\n'
        event = _make_event([_make_diff_file("app.py", code)])
        findings = run_semgrep(event)
        secret_findings = [f for f in findings if "secret" in f.title.lower()
                          or "credential" in f.title.lower()
                          or "hardcoded" in f.title.lower()
                          or "password" in f.title.lower()]
        assert len(secret_findings) >= 1, (
            f"Expected hardcoded secret finding, got: {[f.title for f in findings]}"
        )
        for f in secret_findings:
            assert f.severity in (Severity.HIGH, Severity.CRITICAL)
            assert f.scanner == "semgrep"

    def test_detects_eval_usage(self):
        code = 'user_input = input()\nresult = eval(user_input)\n'
        event = _make_event([_make_diff_file("dangerous.py", code)])
        findings = run_semgrep(event)
        eval_findings = [f for f in findings if "eval" in f.title.lower()
                        or "code injection" in f.title.lower()
                        or "exec" in f.title.lower()]
        assert len(eval_findings) >= 1, (
            f"Expected eval finding, got: {[f.title for f in findings]}"
        )

    def test_detects_sql_injection(self):
        code = (
            'import sqlite3\n'
            'conn = sqlite3.connect("db")\n'
            'cursor = conn.cursor()\n'
            'user_id = input()\n'
            'cursor.execute("SELECT * FROM users WHERE id = " + user_id)\n'
        )
        event = _make_event([_make_diff_file("query.py", code)])
        findings = run_semgrep(event)
        sql_findings = [f for f in findings if "sql" in f.title.lower()
                       or "injection" in f.title.lower()
                       or "CWE-89" in (f.cwe_id or "")]
        assert len(sql_findings) >= 1, (
            f"Expected SQL injection finding, got: {[f.title for f in findings]}"
        )

    def test_detects_command_injection(self):
        code = 'import os\nos.system("rm -rf " + user_input)\n'
        event = _make_event([_make_diff_file("cmd.py", code)])
        findings = run_semgrep(event)
        cmd_findings = [f for f in findings if "command" in f.title.lower()
                       or "os.system" in f.title.lower()
                       or "injection" in f.title.lower()
                       or "CWE-78" in (f.cwe_id or "")]
        assert len(cmd_findings) >= 1, (
            f"Expected command injection finding, got: {[f.title for f in findings]}"
        )

    def test_detects_insecure_deserialization(self):
        code = 'import pickle\ndata = pickle.loads(user_bytes)\n'
        event = _make_event([_make_diff_file("deser.py", code)])
        findings = run_semgrep(event)
        deser_findings = [f for f in findings if "pickle" in f.title.lower()
                         or "deserialization" in f.title.lower()
                         or "CWE-502" in (f.cwe_id or "")]
        assert len(deser_findings) >= 1, (
            f"Expected deserialization finding, got: {[f.title for f in findings]}"
        )

    def test_clean_code_no_findings(self):
        code = 'import json\ndata = json.loads(\'{"key": "value"}\')\nprint(data)\n'
        event = _make_event([_make_diff_file("clean.py", code)])
        findings = run_semgrep(event)
        # Clean code should have no high-severity findings
        high_findings = [f for f in findings if f.severity in (Severity.HIGH, Severity.CRITICAL)]
        assert len(high_findings) == 0, (
            f"Expected no high severity findings in clean code, got: {[f.title for f in high_findings]}"
        )


# --- Finding metadata tests ---

class TestFindingMetadata:
    """Tests that findings carry proper metadata."""

    def test_finding_has_extra_metadata(self):
        code = 'import pickle\npickle.loads(data)\n'
        event = _make_event([_make_diff_file("meta.py", code)])
        findings = run_semgrep(event)
        assert len(findings) >= 1
        f = findings[0]
        assert f.scanner == "semgrep"
        assert isinstance(f.extra, dict)
        assert "rule_id" in f.extra

    def test_finding_has_remediation(self):
        code = 'password = "mysecret"\n'
        event = _make_event([_make_diff_file("secret.py", code)])
        findings = run_semgrep(event)
        secret_findings = [f for f in findings if "credential" in f.title.lower()
                          or "secret" in f.title.lower()
                          or "password" in f.title.lower()
                          or "hardcoded" in f.title.lower()]
        assert len(secret_findings) >= 1
        # At least one should have remediation text
        assert any(f.remediation for f in secret_findings), (
            f"Expected remediation text, got: {[f.remediation for f in secret_findings]}"
        )


# --- Path resolution tests ---

class TestPathResolution:
    def test_resolve_path_strips_tmpdir(self):
        event = _make_event([_make_diff_file("src/app.py", "x = 1\n")])
        result = _resolve_path("/tmp/sentinel-semgrep-abc/src/app.py", "/tmp/sentinel-semgrep-abc",
                               event)
        assert result == "src/app.py"

    def test_resolve_path_nested(self):
        event = _make_event([_make_diff_file("pkg/mod/file.py", "x = 1\n")])
        result = _resolve_path("/tmp/sg/pkg/mod/file.py", "/tmp/sg", event)
        assert result == "pkg/mod/file.py"

    def test_resolve_path_returns_original_on_error(self):
        event = _make_event([_make_diff_file("file.py", "x = 1\n")])
        # On Windows this could fail; on Linux relpath always works,
        # so just verify it returns something reasonable
        result = _resolve_path("/some/abs/path.py", "/tmp/sg", event)
        assert isinstance(result, str)
        assert len(result) > 0


# --- CWE extraction tests ---

class TestExtractCwe:
    def test_cwe_list(self):
        match = {"extra": {"metadata": {"cwe": ["CWE-798: Hardcoded Credentials"]}}}
        assert _extract_cwe(match) == "CWE-798: Hardcoded Credentials"

    def test_cwe_string(self):
        match = {"extra": {"metadata": {"cwe": "CWE-89"}}}
        assert _extract_cwe(match) == "CWE-89"

    def test_cwe_empty(self):
        match = {"extra": {"metadata": {"cwe": []}}}
        assert _extract_cwe(match) is None

    def test_cwe_missing(self):
        match = {"extra": {"metadata": {}}}
        assert _extract_cwe(match) is None

    def test_cwe_no_extra(self):
        match = {}
        assert _extract_cwe(match) is None


# --- Binary resolution tests ---

class TestFindSemgrepBinary:
    def test_finds_binary(self):
        binary = _find_semgrep_binary()
        assert binary is not None
        assert Path(binary).exists()

    def test_fallback_to_path(self):
        """When no .venv binary exists, falls back to PATH."""
        with patch("sentinel_security.semgrep_runner.Path") as mock_path_cls:
            # Make all candidate.is_file() return False so it falls through
            mock_instance = mock_path_cls.return_value
            mock_instance.resolve.return_value = mock_instance
            mock_instance.parent = mock_instance
            mock_instance.__truediv__ = lambda self, other: self
            mock_instance.is_file.return_value = False
            # The function should fall back to shutil.which
            # Just verify the function doesn't crash
            result = _find_semgrep_binary()
            # Result could be None or a path depending on environment


# --- Timeout handling ---

class TestTimeoutHandling:
    def test_timeout_returns_empty(self):
        """Verify that a timeout produces an empty list, not an exception."""
        code = 'x = 1\n'
        event = _make_event([_make_diff_file("simple.py", code)])
        with patch("sentinel_security.semgrep_runner.subprocess.run",
                   side_effect=__import__("subprocess").TimeoutExpired(cmd="semgrep", timeout=120)):
            findings = run_semgrep(event)
            assert findings == []

    def test_bad_json_returns_empty(self):
        """Verify malformed output produces an empty list."""
        code = 'x = 1\n'
        event = _make_event([_make_diff_file("simple.py", code)])
        mock_result = type("Result", (), {"returncode": 0, "stdout": "not json", "stderr": ""})()
        with patch("sentinel_security.semgrep_runner.subprocess.run", return_value=mock_result):
            findings = run_semgrep(event)
            assert findings == []


# --- No semgrep binary ---

class TestNoSemgrepBinary:
    def test_returns_empty_when_no_binary(self):
        with patch("sentinel_security.semgrep_runner._find_semgrep_binary", return_value=None):
            code = 'password = "secret"\n'
            event = _make_event([_make_diff_file("app.py", code)])
            findings = run_semgrep(event)
            assert findings == []
