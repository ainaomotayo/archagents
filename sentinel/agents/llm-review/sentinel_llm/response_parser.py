"""Parse structured LLM JSON responses into Finding objects.

Includes structured error extraction for the reflection loop.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from sentinel_agents.types import Confidence, Finding, Severity

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Severity / confidence mapping helpers
# ---------------------------------------------------------------------------

_SEVERITY_MAP: dict[str, Severity] = {s.value: s for s in Severity}
_CONFIDENCE_MAP: dict[str, Confidence] = {c.value: c for c in Confidence}


def _map_severity(raw: str) -> Severity:
    return _SEVERITY_MAP.get(raw.lower(), Severity.MEDIUM)


def _map_confidence(raw: str) -> Confidence:
    return _CONFIDENCE_MAP.get(raw.lower(), Confidence.MEDIUM)


# ---------------------------------------------------------------------------
# JSON extraction
# ---------------------------------------------------------------------------

def _extract_json_array(text: str) -> list[dict[str, Any]]:
    """Try to extract a JSON array from *text*, handling markdown fences."""
    # Strip markdown code fences if present
    cleaned = re.sub(r"```(?:json)?\s*", "", text)
    cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, list):
            return parsed
        return []
    except json.JSONDecodeError:
        pass

    # Try to find the first JSON array in the text
    match = re.search(r"\[[\s\S]*\]", cleaned)
    if match:
        try:
            parsed = json.loads(match.group())
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass

    return []


# ---------------------------------------------------------------------------
# Structured error extraction for reflection loop
# ---------------------------------------------------------------------------

def extract_parse_errors(response_text: str) -> str:
    """Extract structured error information from a failed parse attempt.

    Returns a human-readable error description that can be fed back to the LLM
    in the reflection loop.
    """
    if not response_text or not response_text.strip():
        return "Response was empty. Expected a JSON array of findings."

    # Try to parse and identify the specific error
    cleaned = re.sub(r"```(?:json)?\s*", "", response_text).strip()

    try:
        parsed = json.loads(cleaned)
        if not isinstance(parsed, list):
            return (
                f"Response parsed as JSON but was {type(parsed).__name__}, "
                f"not a list. Expected a JSON array of finding objects."
            )
        # Check if items are valid dicts
        for i, item in enumerate(parsed):
            if not isinstance(item, dict):
                return (
                    f"Item at index {i} is {type(item).__name__}, not a dict. "
                    f"Each finding must be a JSON object."
                )
            missing = []
            for field in ("title", "severity", "line_start"):
                if field not in item:
                    missing.append(field)
            if missing:
                return (
                    f"Item at index {i} is missing required fields: {', '.join(missing)}. "
                    f"Each finding needs: title, description, severity, confidence, "
                    f"line_start, line_end, category, remediation."
                )
        return "Response appeared valid but could not be processed."
    except json.JSONDecodeError as exc:
        # Find the first JSON array in the text
        match = re.search(r"\[[\s\S]*\]", cleaned)
        if match:
            try:
                json.loads(match.group())
            except json.JSONDecodeError as inner_exc:
                return (
                    f"Found JSON-like content but it has syntax errors: "
                    f"{inner_exc.msg} at position {inner_exc.pos}."
                )
        return (
            f"Response is not valid JSON: {exc.msg} at position {exc.pos}. "
            f"Expected a JSON array like: "
            f'[{{"title": "...", "severity": "high", ...}}]'
        )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_REVIEW_TYPE_MAP: dict[str, str] = {
    "security": "security",
    "license": "license",
    "architecture": "architecture",
    "performance": "performance",
}


def parse_llm_findings(
    response_text: str,
    file_path: str,
    review_type: str,
) -> list[Finding]:
    """Parse an LLM JSON response into a list of :class:`Finding` objects.

    Parameters
    ----------
    response_text:
        Raw text returned by the LLM (should be a JSON array).
    file_path:
        The file being reviewed — used as ``Finding.file``.
    review_type:
        ``"security"``, ``"license"``, ``"architecture"``, or ``"performance"``.

    Returns
    -------
    list[Finding]
        Parsed findings.  Returns an empty list on malformed input.
    """
    finding_type = _REVIEW_TYPE_MAP.get(review_type, review_type)
    items = _extract_json_array(response_text)
    findings: list[Finding] = []

    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            finding = Finding(
                type=finding_type,
                file=file_path,
                line_start=int(item.get("line_start", 1)),
                line_end=int(item.get("line_end", item.get("line_start", 1))),
                severity=_map_severity(str(item.get("severity", "medium"))),
                confidence=_map_confidence(str(item.get("confidence", "medium"))),
                title=str(item.get("title", "")),
                description=str(item.get("description", "")),
                remediation=str(item.get("remediation", "")),
                category=str(item.get("category", "")),
                scanner="llm-review",
                cwe_id=item.get("cwe_id"),
            )
            findings.append(finding)
        except Exception:
            logger.warning("Skipping malformed finding item: %s", item, exc_info=True)
            continue

    return findings
