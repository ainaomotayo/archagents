from __future__ import annotations

import hashlib
import re

from sentinel_agents.types import DiffEvent, Finding, Severity, Confidence

# Simulated OSS fingerprint database (in production, this would be a real database)
# Maps normalized code hash -> (source_url, license)
KNOWN_OSS_HASHES: dict[str, tuple[str, str]] = {
    # These would be populated from scanning top OSS repos
    # Format: hash -> (source_url, license)
}


def normalize_code(code: str) -> str:
    """Normalize code for fingerprinting: strip whitespace, comments, blank lines."""
    lines = []
    for line in code.splitlines():
        stripped = line.strip()
        # Skip empty lines and common comment styles
        if not stripped:
            continue
        if stripped.startswith(("#", "//", "/*", "*", "*/", "'''", '"""')):
            continue
        # Normalize whitespace
        normalized = re.sub(r"\s+", " ", stripped)
        lines.append(normalized)
    return "\n".join(lines)


def hash_fragment(code: str) -> str:
    """Hash a normalized code fragment."""
    return hashlib.sha256(code.encode()).hexdigest()[:16]


def fingerprint_code(event: DiffEvent) -> list[Finding]:
    """Fingerprint added code fragments against known OSS corpus."""
    findings: list[Finding] = []

    for diff_file in event.files:
        added_lines: list[str] = []
        start_line = 0

        for hunk in diff_file.hunks:
            current_line = hunk.new_start
            for raw_line in hunk.content.splitlines():
                if raw_line.startswith("+") and not raw_line.startswith("+++"):
                    if not added_lines:
                        start_line = current_line
                    added_lines.append(raw_line[1:])
                    current_line += 1
                elif raw_line.startswith("-"):
                    continue
                else:
                    current_line += 1

        if len(added_lines) < 5:
            continue  # Too short to fingerprint meaningfully

        # Fingerprint sliding windows of 10 lines
        window_size = 10
        for i in range(0, len(added_lines) - window_size + 1, 5):
            window = "\n".join(added_lines[i : i + window_size])
            normalized = normalize_code(window)
            if not normalized:
                continue
            fprint = hash_fragment(normalized)

            if fprint in KNOWN_OSS_HASHES:
                source, license_name = KNOWN_OSS_HASHES[fprint]
                findings.append(
                    Finding(
                        type="license",
                        file=diff_file.path,
                        line_start=start_line + i,
                        line_end=start_line + i + window_size,
                        severity=(
                            Severity.HIGH
                            if license_name in ("GPL", "AGPL")
                            else Severity.MEDIUM
                        ),
                        confidence=Confidence.MEDIUM,
                        title=f"Code matches known OSS: {source}",
                        description=(
                            f"Code fragment matches {source} (license: {license_name})"
                        ),
                        category="copyleft-risk",
                        scanner="fingerprint",
                        extra={
                            "similarityScore": 1.0,
                            "sourceMatch": source,
                            "licenseDetected": license_name,
                            "findingType": "copyleft-risk",
                            "policyAction": "review",
                        },
                    )
                )

    return findings
