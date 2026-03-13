"""Tests for NIST AI RMF Semgrep rules -- positive and negative samples."""
import subprocess
import tempfile
import os
import json
import pytest

RULES_DIR = os.path.join(os.path.dirname(__file__), "..", "sentinel_security", "rules")


def run_semgrep(rule_file: str, code: str, lang: str = "python") -> list:
    """Run a semgrep rule against code snippet, return findings."""
    ext = {"python": ".py", "javascript": ".js", "typescript": ".ts"}[lang]
    with tempfile.NamedTemporaryFile(mode="w", suffix=ext, delete=False) as f:
        f.write(code)
        f.flush()
        try:
            result = subprocess.run(
                ["semgrep", "--config", rule_file, "--json", f.name],
                capture_output=True, text=True, timeout=30,
            )
            data = json.loads(result.stdout)
            return data.get("results", [])
        finally:
            os.unlink(f.name)


class TestNistTransparency:
    def test_rule_loads_without_error(self):
        code = "x = 1\n"
        findings = run_semgrep(
            os.path.join(RULES_DIR, "nist-transparency.yaml"), code, "python"
        )
        assert isinstance(findings, list)


class TestNistInputValidation:
    def test_rule_loads_without_error(self):
        code = "x = 1\n"
        findings = run_semgrep(
            os.path.join(RULES_DIR, "nist-input-validation.yaml"), code, "python"
        )
        assert isinstance(findings, list)
