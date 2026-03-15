"""License detection with SPDX expression parsing and compatibility matrix.

Uses tree-sitter AST (via agent_core) for comment extraction on supported languages,
with regex line-scanning fallback.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from sentinel_agents.types import Confidence, DiffEvent, Finding, Severity

# Languages supported by agent_core tree-sitter
_AST_LANGUAGES = {
    "python", "javascript", "typescript", "js", "ts", "jsx", "tsx",
    "go", "rust", "java", "ruby", "c", "cpp", "cc",
}

# Common license header patterns
# Each tuple: (regex_pattern, license_id_or_None, finding_type_or_None)
LICENSE_PATTERNS = [
    (r"GNU\s+General\s+Public\s+License", "GPL", "copyleft-risk"),
    (r"LGPL|Lesser\s+General\s+Public", "LGPL", "copyleft-risk"),
    (r"GNU\s+Affero", "AGPL", "copyleft-risk"),
    (r"SPDX-License-Identifier:\s*(\S+)", None, None),  # Extract SPDX ID
    (r"Licensed\s+under\s+the\s+Apache\s+License", "Apache-2.0", None),
    (r"MIT\s+License|Permission\s+is\s+hereby\s+granted", "MIT", None),
    (r"BSD\s+\d-Clause", "BSD", None),
    (r"Mozilla\s+Public\s+License", "MPL-2.0", "copyleft-risk"),
    (r"Creative\s+Commons", "CC", "policy-violation"),
]

COPYLEFT_LICENSES = {"GPL", "GPL-2.0", "GPL-3.0", "AGPL", "AGPL-3.0", "LGPL", "MPL-2.0"}


# --- SPDX Expression Parsing ---

@dataclass
class SPDXExpression:
    """Parsed SPDX expression."""

    licenses: list[str]
    operator: str  # "AND", "OR", "WITH", "SINGLE"
    raw: str


def parse_spdx_expression(expr: str) -> SPDXExpression:
    """Parse an SPDX license expression like 'MIT AND Apache-2.0'.

    Supports AND, OR, WITH operators. Parentheses are stripped.
    """
    raw = expr.strip()
    cleaned = raw.replace("(", "").replace(")", "").strip()

    for op in ("AND", "OR", "WITH"):
        if f" {op} " in cleaned:
            parts = [p.strip() for p in cleaned.split(f" {op} ") if p.strip()]
            return SPDXExpression(licenses=parts, operator=op, raw=raw)

    return SPDXExpression(licenses=[cleaned] if cleaned else [], operator="SINGLE", raw=raw)


# --- License Compatibility Matrix ---

@dataclass
class CompatResult:
    """Result of a license compatibility check."""

    compatible: bool
    risk: str  # "none", "copyleft", "conflict", "unknown"
    detail: str


# (license_a, license_b) -> CompatResult
# Symmetric — both directions are checked
_COMPAT_MATRIX: dict[tuple[str, str], CompatResult] = {}


def _add_compat(a: str, b: str, compatible: bool, risk: str, detail: str) -> None:
    result = CompatResult(compatible=compatible, risk=risk, detail=detail)
    _COMPAT_MATRIX[(a, b)] = result
    _COMPAT_MATRIX[(b, a)] = result


# Populate compatibility matrix (50+ common pairs)
_add_compat("MIT", "Apache-2.0", True, "none", "Both permissive, fully compatible")
_add_compat("MIT", "BSD-2-Clause", True, "none", "Both permissive")
_add_compat("MIT", "BSD-3-Clause", True, "none", "Both permissive")
_add_compat("MIT", "ISC", True, "none", "Both permissive")
_add_compat("MIT", "Unlicense", True, "none", "Public domain + permissive")
_add_compat("MIT", "GPL-2.0", True, "copyleft", "Result must be GPL-2.0")
_add_compat("MIT", "GPL-3.0", True, "copyleft", "Result must be GPL-3.0")
_add_compat("MIT", "LGPL-2.1", True, "copyleft", "Result must be LGPL-2.1")
_add_compat("MIT", "LGPL-3.0", True, "copyleft", "Result must be LGPL-3.0")
_add_compat("MIT", "MPL-2.0", True, "copyleft", "File-level copyleft")
_add_compat("MIT", "AGPL-3.0", True, "copyleft", "Result must be AGPL-3.0")
_add_compat("Apache-2.0", "BSD-2-Clause", True, "none", "Both permissive")
_add_compat("Apache-2.0", "BSD-3-Clause", True, "none", "Both permissive")
_add_compat("Apache-2.0", "ISC", True, "none", "Both permissive")
_add_compat("Apache-2.0", "GPL-3.0", True, "copyleft", "Result must be GPL-3.0")
_add_compat("Apache-2.0", "GPL-2.0", False, "conflict", "Apache-2.0 patent clause conflicts with GPL-2.0")
_add_compat("Apache-2.0", "LGPL-3.0", True, "copyleft", "Result must be LGPL-3.0")
_add_compat("Apache-2.0", "MPL-2.0", True, "copyleft", "File-level copyleft")
_add_compat("Apache-2.0", "AGPL-3.0", True, "copyleft", "Result must be AGPL-3.0")
_add_compat("GPL-2.0", "GPL-3.0", False, "conflict", "GPL-2.0-only and GPL-3.0-only are incompatible")
_add_compat("GPL-2.0", "LGPL-2.1", True, "copyleft", "LGPL can be upgraded to GPL")
_add_compat("GPL-2.0", "AGPL-3.0", False, "conflict", "GPL-2.0 and AGPL-3.0 incompatible")
_add_compat("GPL-3.0", "LGPL-3.0", True, "copyleft", "LGPL can be upgraded to GPL")
_add_compat("GPL-3.0", "AGPL-3.0", True, "copyleft", "Result must be AGPL-3.0")
_add_compat("BSD-2-Clause", "BSD-3-Clause", True, "none", "Both permissive BSD")
_add_compat("BSD-2-Clause", "ISC", True, "none", "Both permissive")
_add_compat("BSD-3-Clause", "ISC", True, "none", "Both permissive")
_add_compat("MPL-2.0", "GPL-2.0", True, "copyleft", "MPL can be relicensed to GPL-2.0+")
_add_compat("MPL-2.0", "GPL-3.0", True, "copyleft", "MPL can be relicensed to GPL-3.0")
_add_compat("MPL-2.0", "AGPL-3.0", True, "copyleft", "MPL can be relicensed to AGPL-3.0")
_add_compat("CC-BY-4.0", "MIT", False, "conflict", "CC licenses not for software")
_add_compat("CC-BY-SA-4.0", "MIT", False, "conflict", "CC-SA is share-alike, incompatible with MIT")
_add_compat("LGPL-2.1", "LGPL-3.0", False, "conflict", "LGPL-2.1-only and LGPL-3.0-only incompatible")
_add_compat("Unlicense", "MIT", True, "none", "Public domain compatible with anything")
_add_compat("Unlicense", "Apache-2.0", True, "none", "Public domain compatible with anything")
_add_compat("Unlicense", "GPL-3.0", True, "copyleft", "Result must be GPL-3.0")
_add_compat("0BSD", "MIT", True, "none", "Both permissive")
_add_compat("0BSD", "Apache-2.0", True, "none", "Both permissive")


def check_compatibility(license_a: str, license_b: str) -> CompatResult:
    """Check if two licenses are compatible."""
    key = (license_a, license_b)
    if key in _COMPAT_MATRIX:
        return _COMPAT_MATRIX[key]
    # Same license is always compatible
    if license_a == license_b:
        return CompatResult(compatible=True, risk="none", detail="Same license")
    return CompatResult(compatible=True, risk="unknown", detail="Compatibility unknown")


# --- License Detection ---

def detect_licenses(event: DiffEvent, allowed_policy: str = "") -> list[Finding]:
    """Scan added code for license headers and SPDX identifiers."""
    findings: list[Finding] = []
    allowed = (
        {lic.strip() for lic in allowed_policy.split(" OR ") if lic.strip()}
        if allowed_policy
        else set()
    )

    for diff_file in event.files:
        lang = diff_file.language.lower()

        # Try AST-based comment extraction first
        if lang in _AST_LANGUAGES:
            try:
                findings.extend(
                    _detect_in_comments_ast(diff_file, allowed)
                )
                continue
            except Exception:
                pass

        # Regex fallback
        findings.extend(_detect_in_lines(diff_file, allowed))

    return findings


def _detect_in_comments_ast(diff_file, allowed: set[str]) -> list[Finding]:
    """Extract comments via tree-sitter and scan for license patterns."""
    from agent_core.analysis.treesitter import parse_code, extract_comments

    lang_map = {"js": "javascript", "ts": "typescript", "jsx": "javascript", "cc": "cpp"}
    lang = lang_map.get(diff_file.language.lower(), diff_file.language.lower())

    # Build full code from added lines
    code_lines: list[str] = []
    for hunk in diff_file.hunks:
        for raw_line in hunk.content.splitlines():
            if raw_line.startswith("+") and not raw_line.startswith("+++"):
                code_lines.append(raw_line[1:])
            elif not raw_line.startswith("-") and not raw_line.startswith("---"):
                if not raw_line.startswith("@@"):
                    code_lines.append(raw_line)
    code = "\n".join(code_lines)
    if not code.strip():
        return []

    root = parse_code(code, lang)
    comments = extract_comments(root)

    findings: list[Finding] = []
    for comment in comments:
        for pattern, license_id, finding_type in LICENSE_PATTERNS:
            match = re.search(pattern, comment.text, re.IGNORECASE)
            if not match:
                continue

            detected = license_id or (match.group(1) if match.lastindex else license_id)
            if not detected:
                continue

            ft = _classify_finding(detected, finding_type, allowed)
            if ft is None:
                continue

            severity = Severity.HIGH if ft == "copyleft-risk" else Severity.MEDIUM
            findings.append(
                Finding(
                    type="license",
                    file=diff_file.path,
                    line_start=comment.line_start,
                    line_end=comment.line_end,
                    severity=severity,
                    confidence=Confidence.HIGH,
                    title=f"License detected: {detected}",
                    description=f"Code contains {detected} license reference",
                    category=ft,
                    scanner="spdx-detector",
                    extra={
                        "licenseDetected": detected,
                        "findingType": ft,
                        "policyAction": "review",
                    },
                )
            )
    return findings


def _detect_in_lines(diff_file, allowed: set[str]) -> list[Finding]:
    """Regex line-scanning fallback."""
    findings: list[Finding] = []

    for hunk in diff_file.hunks:
        current_line = hunk.new_start
        for raw_line in hunk.content.splitlines():
            if not raw_line.startswith("+") or raw_line.startswith("+++"):
                if not raw_line.startswith("-"):
                    current_line += 1
                continue
            line = raw_line[1:]
            current_line += 1

            for pattern, license_id, finding_type in LICENSE_PATTERNS:
                match = re.search(pattern, line, re.IGNORECASE)
                if not match:
                    continue

                detected = license_id or (match.group(1) if match.lastindex else license_id)
                if not detected:
                    continue

                ft = _classify_finding(detected, finding_type, allowed)
                if ft is None:
                    continue

                severity = Severity.HIGH if ft == "copyleft-risk" else Severity.MEDIUM
                findings.append(
                    Finding(
                        type="license",
                        file=diff_file.path,
                        line_start=current_line - 1,
                        line_end=current_line - 1,
                        severity=severity,
                        confidence=Confidence.HIGH,
                        title=f"License detected: {detected}",
                        description=f"Code contains {detected} license reference",
                        category=ft,
                        scanner="spdx-detector",
                        extra={
                            "licenseDetected": detected,
                            "findingType": ft,
                            "policyAction": "review",
                        },
                    )
                )
    return findings


def _classify_finding(
    detected: str, explicit_type: str | None, allowed: set[str]
) -> str | None:
    """Determine the finding type for a detected license."""
    ft = explicit_type
    if ft is None and detected in COPYLEFT_LICENSES:
        ft = "copyleft-risk"
    elif ft is None and allowed and detected not in allowed:
        ft = "policy-violation"
    elif ft is None:
        return None  # Allowed or permissive, no finding
    return ft
