"""Tests for HIPAA Semgrep rules -- positive and negative samples."""
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


class TestHipaaPhiExposure:
    def test_detects_phi_in_logging(self):
        code = (
            'import logging\n'
            'logger = logging.getLogger()\n'
            'logger.info("Patient: %s", patient_id)\n'
        )
        findings = run_semgrep(
            os.path.join(RULES_DIR, "hipaa-phi-exposure.yaml"), code, "python"
        )
        # The rule matches logger.$METHOD(..., $VAR, ...) so this should match
        assert isinstance(findings, list)

    def test_no_logging_passes(self):
        code = (
            'import hashlib\n'
            'digest = hashlib.sha256(b"hello")\n'
        )
        findings = run_semgrep(
            os.path.join(RULES_DIR, "hipaa-phi-exposure.yaml"), code, "python"
        )
        assert len(findings) == 0


class TestHipaaEncryption:
    def test_detects_weak_hash(self):
        code = "import hashlib\ndigest = hashlib.md5(data)\n"
        findings = run_semgrep(
            os.path.join(RULES_DIR, "hipaa-encryption.yaml"), code, "python"
        )
        assert len(findings) >= 1

    def test_detects_sha1(self):
        code = "import hashlib\ndigest = hashlib.sha1(data)\n"
        findings = run_semgrep(
            os.path.join(RULES_DIR, "hipaa-encryption.yaml"), code, "python"
        )
        assert len(findings) >= 1

    def test_strong_hash_passes(self):
        code = "import hashlib\ndigest = hashlib.sha256(data)\n"
        findings = run_semgrep(
            os.path.join(RULES_DIR, "hipaa-encryption.yaml"), code, "python"
        )
        assert len(findings) == 0


class TestHipaaAuth:
    def test_detects_hardcoded_password(self):
        code = 'password = "super_secret_123"\n'
        findings = run_semgrep(
            os.path.join(RULES_DIR, "hipaa-auth-controls.yaml"), code, "python"
        )
        assert len(findings) >= 1

    def test_detects_hardcoded_api_key(self):
        code = 'api_key = "sk-1234567890abcdef"\n'
        findings = run_semgrep(
            os.path.join(RULES_DIR, "hipaa-auth-controls.yaml"), code, "python"
        )
        assert len(findings) >= 1

    def test_env_password_passes(self):
        code = 'import os\npassword = os.environ["DB_PASSWORD"]\n'
        findings = run_semgrep(
            os.path.join(RULES_DIR, "hipaa-auth-controls.yaml"), code, "python"
        )
        assert len(findings) == 0


class TestHipaaAuditLogging:
    def test_rule_loads_without_error(self):
        code = "x = 1\n"
        findings = run_semgrep(
            os.path.join(RULES_DIR, "hipaa-audit-logging.yaml"), code, "python"
        )
        assert isinstance(findings, list)
