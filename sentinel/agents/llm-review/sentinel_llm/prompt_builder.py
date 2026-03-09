"""Structured prompt construction for LLM code reviews.

Builds prompts for two review types:
- Security verification of escalated code
- License / IP analysis
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Token budget helpers
# ---------------------------------------------------------------------------

DEFAULT_MAX_TOKENS = 50_000


def truncate_to_budget(text: str, max_tokens: int = DEFAULT_MAX_TOKENS) -> str:
    """Truncate *text* so it fits within an approximate token budget.

    Uses the rough heuristic of 1 token ~= 4 characters.  If the text
    exceeds the budget, it is truncated and a marker is appended.
    """
    max_chars = max_tokens * 4
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    return truncated + "\n\n[TRUNCATED — content exceeded token budget]"


# ---------------------------------------------------------------------------
# Security review prompt
# ---------------------------------------------------------------------------

_SECURITY_SYSTEM = """\
You are a senior application-security engineer performing a code review.
Analyze the provided code for security vulnerabilities and produce a JSON
array of findings.  Each finding MUST be a JSON object with these fields:

  - "title": short summary (string)
  - "description": detailed explanation (string)
  - "severity": one of "critical", "high", "medium", "low", "info"
  - "confidence": one of "high", "medium", "low"
  - "line_start": first affected line number (integer, 1-based)
  - "line_end": last affected line number (integer, 1-based)
  - "category": CWE category or short label (string)
  - "cwe_id": CWE identifier if applicable, e.g. "CWE-79" (string or null)
  - "remediation": suggested fix (string)

If no issues are found, return an empty JSON array: []

Respond ONLY with the JSON array — no markdown fences, no commentary.
"""


def build_security_review_prompt(code: str, file_path: str, language: str) -> str:
    """Return a structured prompt asking the LLM to review *code* for security issues."""
    user_content = (
        f"File: {file_path}\n"
        f"Language: {language}\n\n"
        f"```\n{code}\n```"
    )
    user_content = truncate_to_budget(user_content)
    return f"{_SECURITY_SYSTEM}\n---\n{user_content}"


# ---------------------------------------------------------------------------
# License / IP review prompt
# ---------------------------------------------------------------------------

_LICENSE_SYSTEM = """\
You are a software-license compliance analyst.  Analyze the provided code
for license and intellectual-property concerns.  Produce a JSON array of
findings.  Each finding MUST be a JSON object with these fields:

  - "title": short summary (string)
  - "description": detailed explanation (string)
  - "severity": one of "critical", "high", "medium", "low", "info"
  - "confidence": one of "high", "medium", "low"
  - "line_start": first affected line number (integer, 1-based)
  - "line_end": last affected line number (integer, 1-based)
  - "category": license name or label (string)
  - "remediation": suggested fix (string)

If no issues are found, return an empty JSON array: []

Respond ONLY with the JSON array — no markdown fences, no commentary.
"""


def build_license_review_prompt(code: str, file_path: str) -> str:
    """Return a structured prompt asking the LLM to analyze license/IP implications."""
    user_content = (
        f"File: {file_path}\n\n"
        f"```\n{code}\n```"
    )
    user_content = truncate_to_budget(user_content)
    return f"{_LICENSE_SYSTEM}\n---\n{user_content}"
