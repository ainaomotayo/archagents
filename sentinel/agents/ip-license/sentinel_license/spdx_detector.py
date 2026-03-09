from __future__ import annotations

import re

from sentinel_agents.types import DiffEvent, Finding, Severity, Confidence

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


def detect_licenses(event: DiffEvent, allowed_policy: str = "") -> list[Finding]:
    """Scan added code for license headers and SPDX identifiers."""
    findings: list[Finding] = []
    allowed = (
        {lic.strip() for lic in allowed_policy.split(" OR ") if lic.strip()}
        if allowed_policy
        else set()
    )

    for diff_file in event.files:
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

                    detected = (
                        license_id or match.group(1) if match.lastindex else license_id
                    )
                    if not detected:
                        continue

                    # Determine finding type
                    ft = finding_type
                    if ft is None and detected in COPYLEFT_LICENSES:
                        ft = "copyleft-risk"
                    elif ft is None and allowed and detected not in allowed:
                        ft = "policy-violation"
                    elif ft is None:
                        continue  # Allowed or permissive license, no finding

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
