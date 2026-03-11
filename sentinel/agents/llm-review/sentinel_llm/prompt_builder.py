"""Structured prompt construction for LLM code reviews.

Supports multiple review templates: security, license, architecture, performance.
Template selection based on review_type parameter.
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
# Template definitions
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

_ARCHITECTURE_SYSTEM = """\
You are a software architect reviewing code for architectural concerns.
Analyze the provided code for design problems including:
- Tight coupling between modules
- Violation of SOLID principles
- Missing abstractions or over-engineering
- Incorrect layering (e.g., business logic in presentation layer)
- God classes or overly complex methods

Produce a JSON array of findings.  Each finding MUST be a JSON object with:

  - "title": short summary (string)
  - "description": detailed explanation (string)
  - "severity": one of "critical", "high", "medium", "low", "info"
  - "confidence": one of "high", "medium", "low"
  - "line_start": first affected line number (integer, 1-based)
  - "line_end": last affected line number (integer, 1-based)
  - "category": architectural concern label (string)
  - "remediation": suggested fix (string)

If no issues are found, return an empty JSON array: []

Respond ONLY with the JSON array — no markdown fences, no commentary.
"""

_PERFORMANCE_SYSTEM = """\
You are a performance engineer reviewing code for performance concerns.
Analyze the provided code for issues including:
- N+1 query patterns
- Unnecessary memory allocations
- Missing caching opportunities
- Blocking I/O in async contexts
- Inefficient algorithms (O(n^2) when O(n log n) is possible)

Produce a JSON array of findings.  Each finding MUST be a JSON object with:

  - "title": short summary (string)
  - "description": detailed explanation (string)
  - "severity": one of "critical", "high", "medium", "low", "info"
  - "confidence": one of "high", "medium", "low"
  - "line_start": first affected line number (integer, 1-based)
  - "line_end": last affected line number (integer, 1-based)
  - "category": performance concern label (string)
  - "remediation": suggested fix (string)

If no issues are found, return an empty JSON array: []

Respond ONLY with the JSON array — no markdown fences, no commentary.
"""

_TEMPLATES: dict[str, str] = {
    "security": _SECURITY_SYSTEM,
    "license": _LICENSE_SYSTEM,
    "architecture": _ARCHITECTURE_SYSTEM,
    "performance": _PERFORMANCE_SYSTEM,
}


def get_available_templates() -> list[str]:
    """Return list of available review template names."""
    return list(_TEMPLATES.keys())


# ---------------------------------------------------------------------------
# Unified prompt builder
# ---------------------------------------------------------------------------

def build_review_prompt(
    code: str,
    file_path: str,
    language: str = "",
    review_type: str = "security",
) -> str:
    """Build a review prompt using the specified template.

    Parameters
    ----------
    code:
        The code to review.
    file_path:
        Path of the file being reviewed.
    language:
        Programming language (optional, included if provided).
    review_type:
        One of "security", "license", "architecture", "performance".
    """
    system = _TEMPLATES.get(review_type, _SECURITY_SYSTEM)
    parts = [f"File: {file_path}"]
    if language:
        parts.append(f"Language: {language}")
    parts.append(f"\n```\n{code}\n```")
    user_content = "\n".join(parts)
    user_content = truncate_to_budget(user_content)
    return f"{system}\n---\n{user_content}"


# ---------------------------------------------------------------------------
# Backward-compatible aliases
# ---------------------------------------------------------------------------

def build_security_review_prompt(code: str, file_path: str, language: str) -> str:
    """Return a structured prompt asking the LLM to review *code* for security issues."""
    return build_review_prompt(code, file_path, language, "security")


def build_license_review_prompt(code: str, file_path: str) -> str:
    """Return a structured prompt asking the LLM to analyze license/IP implications."""
    return build_review_prompt(code, file_path, review_type="license")
