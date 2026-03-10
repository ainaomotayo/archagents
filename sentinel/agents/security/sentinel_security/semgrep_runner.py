from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from sentinel_agents.types import Confidence, DiffEvent, Finding, Severity

logger = logging.getLogger(__name__)

SEVERITY_MAP = {
    "CRITICAL": Severity.CRITICAL,
    "ERROR": Severity.HIGH,
    "WARNING": Severity.MEDIUM,
    "INFO": Severity.LOW,
}

# Directory containing custom Semgrep YAML rules shipped with this package
_RULES_DIR = Path(__file__).resolve().parent / "rules"


def _find_semgrep_binary() -> str | None:
    """Locate the semgrep binary, preferring the project venv."""
    # Walk up from this file to find a .venv/bin/semgrep
    current = Path(__file__).resolve().parent
    for _ in range(6):  # up to 6 levels
        candidate = current / ".venv" / "bin" / "semgrep"
        if candidate.is_file():
            return str(candidate)
        current = current.parent

    # Fall back to PATH
    return shutil.which("semgrep")


def run_semgrep(event: DiffEvent) -> list[Finding]:
    """Run Semgrep on diff files. Returns empty list if semgrep not available."""
    semgrep_bin = _find_semgrep_binary()
    if not semgrep_bin:
        logger.warning("Semgrep binary not found, skipping Tier 1 scanning")
        return []

    findings: list[Finding] = []

    with tempfile.TemporaryDirectory(prefix="sentinel-semgrep-") as tmpdir:
        # Write diff content to temp files for scanning
        for diff_file in event.files:
            file_path = Path(tmpdir) / diff_file.path
            file_path.parent.mkdir(parents=True, exist_ok=True)
            # Extract added lines from hunks
            content_lines: list[str] = []
            for hunk in diff_file.hunks:
                for line in hunk.content.splitlines():
                    if line.startswith("+") and not line.startswith("+++"):
                        content_lines.append(line[1:])
                    elif not line.startswith("-"):
                        content_lines.append(line.lstrip(" "))
            file_path.write_text("\n".join(content_lines))

        # Build semgrep command with custom rules and optionally auto config
        cmd = [semgrep_bin, "--json", "--no-git-ignore"]

        # Add our custom rules directory if it exists and has rule files
        if _RULES_DIR.is_dir() and any(_RULES_DIR.glob("*.yaml")):
            cmd.extend(["--config", str(_RULES_DIR)])

        # Also include semgrep auto rules for broad coverage
        cmd.extend(["--config", "auto"])

        cmd.append(tmpdir)

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode not in (0, 1):  # 1 = findings found
                logger.warning(
                    "Semgrep exited with code %d: stderr=%s",
                    result.returncode,
                    result.stderr[:500],
                )
                return []

            output = json.loads(result.stdout)

            for match in output.get("results", []):
                extra_data = match.get("extra", {})
                metadata = extra_data.get("metadata", {})
                severity = SEVERITY_MAP.get(
                    extra_data.get("severity", ""), Severity.LOW
                )

                rule_id = match.get("check_id", "")
                message = extra_data.get("message", "")
                fix = extra_data.get("fix", "")
                references = metadata.get("references", [])
                technology = metadata.get("technology", [])

                # Build remediation from fix suggestion or message
                remediation = fix if fix else ""
                if not remediation and message:
                    # Try to extract remediation advice from message
                    for keyword in ("Use ", "Replace ", "Migrate ", "Instead"):
                        idx = message.find(keyword)
                        if idx != -1:
                            remediation = message[idx:]
                            break

                findings.append(
                    Finding(
                        type="security",
                        file=_resolve_path(match.get("path", ""), tmpdir, event),
                        line_start=match.get("start", {}).get("line", 0),
                        line_end=match.get("end", {}).get("line", 0),
                        severity=severity,
                        confidence=Confidence.HIGH,
                        title=message,
                        description=message,
                        remediation=remediation,
                        category=metadata.get("category", "security"),
                        scanner="semgrep",
                        cwe_id=_extract_cwe(match),
                        extra={
                            "rule_id": rule_id,
                            "references": references,
                            "technology": technology,
                        },
                    )
                )
        except subprocess.TimeoutExpired:
            logger.warning("Semgrep timed out after 120s")
        except json.JSONDecodeError as e:
            logger.warning("Failed to parse Semgrep JSON output: %s", e)
        except Exception as e:
            logger.error("Unexpected error running Semgrep: %s", e, exc_info=True)

    return findings


def _resolve_path(abs_path: str, tmpdir: str, event: DiffEvent) -> str:
    """Map temp file path back to original repo path."""
    try:
        return os.path.relpath(abs_path, tmpdir)
    except ValueError:
        return abs_path


def _extract_cwe(match: dict) -> str | None:
    metadata = match.get("extra", {}).get("metadata", {})
    cwe = metadata.get("cwe", [])
    if isinstance(cwe, list) and cwe:
        return cwe[0] if isinstance(cwe[0], str) else str(cwe[0])
    if isinstance(cwe, str):
        return cwe
    return None
