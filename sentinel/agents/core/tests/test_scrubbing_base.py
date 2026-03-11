"""Tests for BaseScrubber mandatory patterns."""

import pytest

from agent_core.scrubbing.base import BaseScrubber


@pytest.fixture
def scrubber() -> BaseScrubber:
    return BaseScrubber()


class TestMandatoryPatterns:
    def test_aws_key(self, scrubber: BaseScrubber) -> None:
        text = "key = AKIAIOSFODNN7EXAMPLE"
        result = scrubber.scrub(text)
        assert "AKIA" not in result.sanitized
        assert "[REDACTED:AWS_KEY]" in result.sanitized
        assert len(result.redactions) == 1
        assert result.redactions[0].pattern_name == "AWS_KEY"

    def test_gcp_key(self, scrubber: BaseScrubber) -> None:
        text = "key = AIzaSyD-abcdefghijklmnopqrstuvwxyz12345"
        result = scrubber.scrub(text)
        assert "AIza" not in result.sanitized
        assert "[REDACTED:GCP_KEY]" in result.sanitized

    def test_private_key(self, scrubber: BaseScrubber) -> None:
        text = "-----BEGIN RSA PRIVATE KEY-----\nMIIE..."
        result = scrubber.scrub(text)
        assert "PRIVATE KEY" not in result.sanitized
        assert "[REDACTED:PRIVATE_KEY]" in result.sanitized

    def test_ec_private_key(self, scrubber: BaseScrubber) -> None:
        text = "-----BEGIN EC PRIVATE KEY-----"
        result = scrubber.scrub(text)
        assert "[REDACTED:PRIVATE_KEY]" in result.sanitized

    def test_jwt(self, scrubber: BaseScrubber) -> None:
        text = "auth eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc"
        result = scrubber.scrub(text)
        assert "eyJ" not in result.sanitized
        assert "[REDACTED:JWT]" in result.sanitized

    def test_connection_string_postgres(self, scrubber: BaseScrubber) -> None:
        text = "dsn = postgres://user:pass@host:5432/db"
        result = scrubber.scrub(text)
        assert "postgres://" not in result.sanitized
        assert "[REDACTED:CONNECTION_STRING]" in result.sanitized

    def test_connection_string_redis(self, scrubber: BaseScrubber) -> None:
        text = "url = redis://localhost:6379/0"
        result = scrubber.scrub(text)
        assert "redis://" not in result.sanitized

    def test_ssn(self, scrubber: BaseScrubber) -> None:
        text = "ssn: 123-45-6789"
        result = scrubber.scrub(text)
        assert "123-45-6789" not in result.sanitized
        assert "[REDACTED:SSN]" in result.sanitized

    def test_email(self, scrubber: BaseScrubber) -> None:
        text = "contact: user@example.com"
        result = scrubber.scrub(text)
        assert "user@example.com" not in result.sanitized
        assert "[REDACTED:EMAIL]" in result.sanitized

    def test_api_key(self, scrubber: BaseScrubber) -> None:
        text = "api_key = 'sk_live_abcdefghijklmnopqrstuvwx'"
        result = scrubber.scrub(text)
        assert "sk_live_" not in result.sanitized
        assert "[REDACTED:API_KEY]" in result.sanitized

    def test_bearer_token(self, scrubber: BaseScrubber) -> None:
        text = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9_long_enough_token"
        result = scrubber.scrub(text)
        assert "Bearer" not in result.sanitized or "[REDACTED" in result.sanitized

    def test_github_token(self, scrubber: BaseScrubber) -> None:
        text = "gh ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij"
        result = scrubber.scrub(text)
        assert "ghp_" not in result.sanitized
        assert "[REDACTED:GITHUB_TOKEN]" in result.sanitized


class TestNoFalsePositives:
    def test_normal_code(self, scrubber: BaseScrubber) -> None:
        code = """
def calculate_sum(a, b):
    result = a + b
    return result

class MyClass:
    def __init__(self):
        self.value = 42
"""
        result = scrubber.scrub(code)
        assert result.sanitized == code
        assert result.redactions == []

    def test_normal_numbers(self, scrubber: BaseScrubber) -> None:
        text = "port = 8080, count = 1234567890"
        result = scrubber.scrub(text)
        assert result.redactions == []

    def test_normal_url(self, scrubber: BaseScrubber) -> None:
        text = "url = https://api.example.com/v1/data"
        result = scrubber.scrub(text)
        assert result.redactions == []


class TestMultipleSecrets:
    def test_multiple_in_one_string(self, scrubber: BaseScrubber) -> None:
        text = (
            "aws = AKIAIOSFODNN7EXAMPLE "
            "email = user@test.com "
            "dsn = postgres://u:p@h/d"
        )
        result = scrubber.scrub(text)
        assert len(result.redactions) >= 3
        pattern_names = {r.pattern_name for r in result.redactions}
        assert "AWS_KEY" in pattern_names
        assert "EMAIL" in pattern_names
        assert "CONNECTION_STRING" in pattern_names


class TestAuditLog:
    def test_audit_log_accumulates(self) -> None:
        scrubber = BaseScrubber()
        scrubber.scrub("key = AKIAIOSFODNN7EXAMPLE")
        scrubber.scrub("email = user@test.com")
        log = scrubber.audit_log()
        assert len(log) == 2

    def test_audit_log_reset(self) -> None:
        scrubber = BaseScrubber()
        scrubber.scrub("key = AKIAIOSFODNN7EXAMPLE")
        scrubber.reset_audit_log()
        assert scrubber.audit_log() == []

    def test_was_modified(self, scrubber: BaseScrubber) -> None:
        result = scrubber.scrub("normal code")
        assert result.was_modified is False
        result = scrubber.scrub("key = AKIAIOSFODNN7EXAMPLE")
        assert result.was_modified is True
