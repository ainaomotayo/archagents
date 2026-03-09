"""Mandatory PII/Secret scrubber — runs before any code is sent to an LLM.

This module is **non-configurable** and **cannot be disabled**.  Every piece of
code destined for an LLM call MUST pass through ``scrub()`` first.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Redaction:
    """A single redaction event recorded for audit purposes."""

    type: str  # e.g. "AWS_KEY", "EMAIL", "JWT", …
    line_number: int
    original_length: int
    replacement: str  # e.g. "[REDACTED:AWS_KEY]"


@dataclass
class ScrubResult:
    """The result of scrubbing a piece of code."""

    sanitized_code: str
    redactions: list[Redaction] = field(default_factory=list)
    redaction_count: int = 0


# ---------------------------------------------------------------------------
# Pattern definitions
# ---------------------------------------------------------------------------

# Each entry: (pattern_name, compiled_regex)
# The regex MUST contain exactly one capturing group (or use group 0) that
# covers the sensitive portion to be replaced.

_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    # AWS access key IDs (always start with AKIA and are 20 chars)
    ("AWS_KEY", re.compile(r"(?<![A-Za-z0-9])(AKIA[0-9A-Z]{16})(?![A-Za-z0-9])")),
    # JWT tokens (three base64url segments separated by dots)
    ("JWT", re.compile(
        r"(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})"
    )),
    # Private key blocks (PEM-encoded)
    ("PRIVATE_KEY", re.compile(
        r"(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"
        r"[\s\S]*?"
        r"-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)"
    )),
    # Connection strings
    ("CONNECTION_STRING", re.compile(
        r"((?:postgres|postgresql|mysql|mongodb|mongodb\+srv|redis)://\S+)"
    )),
    # SSN (US Social Security Number) — xxx-xx-xxxx
    ("SSN", re.compile(r"(?<![0-9])(\d{3}-\d{2}-\d{4})(?![0-9])")),
    # Email addresses
    ("EMAIL", re.compile(r"([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)")),
    # IPv4 addresses — skip localhost (127.0.0.1) and unspecified (0.0.0.0)
    ("IP_ADDRESS", re.compile(
        r"(?<![0-9])"
        r"(?!127\.0\.0\.1)(?!0\.0\.0\.0)"
        r"(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})"
        r"(?![0-9])"
    )),
    # Generic API key / secret assignments  (long hex or base64 in quotes)
    ("API_KEY", re.compile(
        r"(?i)(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token|password)"
        r"\s*[=:]\s*"
        r"""[\"']([A-Za-z0-9+/=_-]{20,})[\"']"""
    )),
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def scrub(code: str) -> ScrubResult:
    """Mandatory PII/secret scrubber.  Cannot be disabled.

    Parameters
    ----------
    code:
        Source code (or any text) that will be sent to an LLM.

    Returns
    -------
    ScrubResult
        Contains the sanitised text, a list of ``Redaction`` records, and a
        count of how many redactions were applied.
    """
    redactions: list[Redaction] = []
    sanitized = code

    for pattern_name, regex in _PATTERNS:
        replacement_tag = f"[REDACTED:{pattern_name}]"

        # We need to track line numbers, so we iterate over matches manually.
        # After each replacement the string changes length, so we restart the
        # search from the beginning each time (simple and correct for the
        # expected input sizes).
        while True:
            match = regex.search(sanitized)
            if match is None:
                break

            # Determine which group holds the sensitive value.
            # For patterns with a capturing group, use group(1); otherwise group(0).
            if match.lastindex and match.lastindex >= 1:
                start, end = match.start(1), match.end(1)
                matched_text = match.group(1)
            else:
                start, end = match.start(0), match.end(0)
                matched_text = match.group(0)

            # For the API_KEY pattern we only redact the value inside quotes,
            # not the key name.  The captured group already isolates the value.

            line_number = sanitized[:start].count("\n") + 1

            redactions.append(Redaction(
                type=pattern_name,
                line_number=line_number,
                original_length=len(matched_text),
                replacement=replacement_tag,
            ))

            sanitized = sanitized[:start] + replacement_tag + sanitized[end:]

    return ScrubResult(
        sanitized_code=sanitized,
        redactions=redactions,
        redaction_count=len(redactions),
    )
