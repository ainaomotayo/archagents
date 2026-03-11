"""Mandatory PII/Secret scrubber — runs before any code is sent to an LLM.

This module is **non-configurable** and **cannot be disabled**.  Every piece of
code destined for an LLM call MUST pass through ``scrub()`` first.

Integrates with ``agent_core.scrubbing.ScrubberRegistry`` when available,
adding LLM-specific patterns (prompt injection markers, system prompts).
Falls back to standalone scrubbing if agent_core is not installed.
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

# LLM-specific patterns — prompt injection and system prompt markers
_LLM_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("PROMPT_INJECTION", re.compile(
        r"(?i)((?:ignore|forget|disregard)\s+(?:all\s+)?(?:previous|above|prior)\s+"
        r"(?:instructions?|prompts?|rules?))"
    )),
    ("SYSTEM_PROMPT", re.compile(
        r"(<<\s*(?:SYS|SYSTEM)\s*>>[\s\S]*?<<\s*/(?:SYS|SYSTEM)\s*>>)"
    )),
    ("ROLE_OVERRIDE", re.compile(
        r"(?i)(you\s+are\s+(?:now|no\s+longer)\s+(?:a|an|the)\s+\w+)"
    )),
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _try_scrubber_registry(code: str) -> ScrubResult | None:
    """Try to use agent_core.scrubbing.ScrubberRegistry if available.

    Returns None if agent_core is not installed or registry fails.
    """
    try:
        from agent_core.scrubbing.registry import ScrubberRegistry

        registry = ScrubberRegistry()
        # Register LLM-specific patterns
        registry.register("llm-review", {
            "PROMPT_INJECTION": (
                r"(?i)(?:ignore|forget|disregard)\s+(?:all\s+)?(?:previous|above|prior)\s+"
                r"(?:instructions?|prompts?|rules?)"
            ),
            "SYSTEM_PROMPT": r"<<\s*(?:SYS|SYSTEM)\s*>>[\s\S]*?<<\s*/(?:SYS|SYSTEM)\s*>>",
            "ROLE_OVERRIDE": r"(?i)you\s+are\s+(?:now|no\s+longer)\s+(?:a|an|the)\s+\w+",
        })

        result = registry.scrub("llm-review", code)
        # Convert to our ScrubResult format
        redactions = [
            Redaction(
                type=r.pattern_name,
                line_number=code[:r.start].count("\n") + 1,
                original_length=len(r.original),
                replacement=r.replacement,
            )
            for r in result.redactions
        ]
        return ScrubResult(
            sanitized_code=result.sanitized,
            redactions=redactions,
            redaction_count=len(redactions),
        )
    except (ImportError, Exception):
        return None


def scrub(
    code: str,
    *,
    include_llm_patterns: bool = True,
    use_registry: bool = False,
) -> ScrubResult:
    """Mandatory PII/secret scrubber.  Cannot be disabled.

    Parameters
    ----------
    code:
        Source code (or any text) that will be sent to an LLM.
    include_llm_patterns:
        If True (default), also scrub LLM-specific patterns like prompt
        injection markers.
    use_registry:
        If True, delegate to ``agent_core.scrubbing.ScrubberRegistry``
        (layered: base patterns + LLM-specific). Falls back to standalone
        scrubbing if agent_core is not installed.

    Returns
    -------
    ScrubResult
        Contains the sanitised text, a list of ``Redaction`` records, and a
        count of how many redactions were applied.
    """
    # Use agent_core registry when explicitly requested
    if use_registry and include_llm_patterns:
        registry_result = _try_scrubber_registry(code)
        if registry_result is not None:
            return registry_result

    # Default: standalone scrubbing
    redactions: list[Redaction] = []
    sanitized = code

    patterns = list(_PATTERNS)
    if include_llm_patterns:
        patterns.extend(_LLM_PATTERNS)

    for pattern_name, regex in patterns:
        replacement_tag = f"[REDACTED:{pattern_name}]"

        while True:
            match = regex.search(sanitized)
            if match is None:
                break

            if match.lastindex and match.lastindex >= 1:
                start, end = match.start(1), match.end(1)
                matched_text = match.group(1)
            else:
                start, end = match.start(0), match.end(0)
                matched_text = match.group(0)

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
