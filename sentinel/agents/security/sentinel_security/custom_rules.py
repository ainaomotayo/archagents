from __future__ import annotations

import re

from sentinel_agents.types import Confidence, DiffEvent, Finding, Severity

# Known hallucinated / typosquat-prone package names
SUSPICIOUS_PACKAGES: dict[str, list[str]] = {
    "python": [
        "python-dateutil2",
        "requets",
        "reqeusts",
        "beautifulsoup",
        "cv2-python",
        "sklearn-utils",
        "pandas-utils",
    ],
    "javascript": [
        "colorsss",
        "cross-env2",
        "event-stream-fake",
        "lodash.core",
        "babelcli",
        "crossenv",
        "d3.js",
        "gruntcli",
        "http-proxy.js",
        "jquery.js",
        "mariadb-connector",
        "mongose",
        "maborern",
        "node-hierarchical-softmax",
    ],
}

INSECURE_DEFAULTS: list[tuple[str, str, str]] = [
    (r"DEBUG\s*=\s*True", "DEBUG=True in production code", "CWE-489"),
    (r"verify\s*=\s*False", "SSL verification disabled", "CWE-295"),
    (r"CORS\(.*origins?\s*=\s*['\"]?\*", "Overly permissive CORS", "CWE-942"),
    (r"password\s*=\s*['\"](?!<REDACTED|\\{|\\$|%s)", "Hardcoded password", "CWE-798"),
    (r"api[_-]?key\s*=\s*['\"][a-zA-Z0-9]{16,}", "Hardcoded API key", "CWE-798"),
    (r"SECRET_KEY\s*=\s*['\"][^'\"]{8,}", "Hardcoded secret key", "CWE-798"),
    (r"eval\s*\(", "Use of eval()", "CWE-95"),
    (r"exec\s*\(", "Use of exec()", "CWE-95"),
    (r"__import__\s*\(", "Dynamic import via __import__", "CWE-95"),
    (r"subprocess\.call\s*\(.*shell\s*=\s*True", "Shell injection risk", "CWE-78"),
    (r"os\.system\s*\(", "Shell command via os.system", "CWE-78"),
]

DEPRECATED_APIS: list[tuple[str, str, str]] = [
    (r"from\s+cgi\s+import", "cgi module is deprecated (Python 3.13+)", "CWE-477"),
    (r"import\s+imp\b", "imp module is deprecated, use importlib", "CWE-477"),
    (r"import\s+optparse", "optparse is deprecated, use argparse", "CWE-477"),
    (r"Math\.random\(\)", "Math.random() is not cryptographically secure", "CWE-338"),
    (r"md5\(", "MD5 is cryptographically broken", "CWE-327"),
    (r"sha1\(", "SHA1 is cryptographically broken", "CWE-327"),
]


def run_custom_rules(event: DiffEvent) -> list[Finding]:
    """Run AI-specific custom security rules on diff content."""
    findings: list[Finding] = []

    for diff_file in event.files:
        added_lines = _extract_added_lines(diff_file)

        for line_num, line in added_lines:
            findings.extend(_check_insecure_defaults(diff_file.path, line_num, line))
            findings.extend(_check_deprecated_apis(diff_file.path, line_num, line))
            findings.extend(
                _check_suspicious_imports(diff_file.path, line_num, line, diff_file.language)
            )

    return findings


def _extract_added_lines(diff_file) -> list[tuple[int, str]]:
    """Extract added lines with their line numbers from hunks."""
    lines: list[tuple[int, str]] = []
    for hunk in diff_file.hunks:
        current_line = hunk.new_start
        for raw_line in hunk.content.splitlines():
            if raw_line.startswith("+") and not raw_line.startswith("+++"):
                lines.append((current_line, raw_line[1:]))
                current_line += 1
            elif raw_line.startswith("-"):
                continue  # deleted line, don't increment
            else:
                current_line += 1
    return lines


def _check_insecure_defaults(file: str, line_num: int, line: str) -> list[Finding]:
    findings: list[Finding] = []
    for pattern, desc, cwe in INSECURE_DEFAULTS:
        if re.search(pattern, line):
            findings.append(
                Finding(
                    type="security",
                    file=file,
                    line_start=line_num,
                    line_end=line_num,
                    severity=Severity.HIGH,
                    confidence=Confidence.HIGH,
                    title=f"Insecure default: {desc}",
                    description=f"AI-generated code contains {desc}",
                    remediation=f"Remove or secure the {desc.lower()}",
                    category="insecure-default",
                    scanner="custom-rules",
                    cwe_id=cwe,
                )
            )
    return findings


def _check_deprecated_apis(file: str, line_num: int, line: str) -> list[Finding]:
    findings: list[Finding] = []
    for pattern, desc, cwe in DEPRECATED_APIS:
        if re.search(pattern, line):
            findings.append(
                Finding(
                    type="security",
                    file=file,
                    line_start=line_num,
                    line_end=line_num,
                    severity=Severity.MEDIUM,
                    confidence=Confidence.HIGH,
                    title=f"Deprecated API: {desc}",
                    description=f"AI-generated code uses deprecated API: {desc}",
                    remediation="Replace with modern alternative",
                    category="deprecated-api",
                    scanner="custom-rules",
                    cwe_id=cwe,
                )
            )
    return findings


def _check_suspicious_imports(
    file: str, line_num: int, line: str, language: str
) -> list[Finding]:
    findings: list[Finding] = []
    lang_key = "python" if language in ("python", "py") else "javascript"
    suspicious = SUSPICIOUS_PACKAGES.get(lang_key, [])

    for pkg in suspicious:
        # Check Python imports
        if re.search(rf"(?:import|from)\s+{re.escape(pkg)}", line):
            findings.append(
                Finding(
                    type="security",
                    file=file,
                    line_start=line_num,
                    line_end=line_num,
                    severity=Severity.CRITICAL,
                    confidence=Confidence.MEDIUM,
                    title=f"Suspicious package: {pkg}",
                    description=f"Package '{pkg}' may be hallucinated or a typosquat",
                    remediation=f"Verify package '{pkg}' exists and is legitimate",
                    category="hallucinated-dep",
                    scanner="custom-rules",
                    cwe_id="CWE-829",
                )
            )
        # Check JS requires/imports
        if re.search(rf"""(?:require|from)\s*\(?['"]{re.escape(pkg)}['"]""", line):
            findings.append(
                Finding(
                    type="security",
                    file=file,
                    line_start=line_num,
                    line_end=line_num,
                    severity=Severity.CRITICAL,
                    confidence=Confidence.MEDIUM,
                    title=f"Suspicious package: {pkg}",
                    description=f"Package '{pkg}' may be hallucinated or a typosquat",
                    remediation=f"Verify package '{pkg}' exists and is legitimate",
                    category="hallucinated-dep",
                    scanner="custom-rules",
                    cwe_id="CWE-829",
                )
            )

    return findings
