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
    "ERROR": Severity.HIGH,
    "WARNING": Severity.MEDIUM,
    "INFO": Severity.LOW,
}


def run_semgrep(event: DiffEvent) -> list[Finding]:
    """Run Semgrep on diff files. Returns empty list if semgrep not available."""
    if not shutil.which("semgrep"):
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

        try:
            result = subprocess.run(
                ["semgrep", "--json", "--config", "auto", "--no-git-ignore", tmpdir],
                capture_output=True,
                text=True,
                timeout=60,
            )
            if result.returncode not in (0, 1):  # 1 = findings found
                logger.warning(
                    "Semgrep exited with code %d: %s", result.returncode, result.stderr[:500]
                )
                return []

            output = json.loads(result.stdout)
            for match in output.get("results", []):
                severity = SEVERITY_MAP.get(
                    match.get("extra", {}).get("severity", ""), Severity.LOW
                )
                findings.append(
                    Finding(
                        type="security",
                        file=_resolve_path(match.get("path", ""), tmpdir, event),
                        line_start=match.get("start", {}).get("line", 0),
                        line_end=match.get("end", {}).get("line", 0),
                        severity=severity,
                        confidence=Confidence.HIGH,
                        title=match.get("extra", {}).get("message", ""),
                        description=match.get("extra", {}).get("message", ""),
                        remediation="",
                        category=match.get("extra", {}).get("metadata", {}).get(
                            "category", "security"
                        ),
                        scanner="semgrep",
                        cwe_id=_extract_cwe(match),
                    )
                )
        except subprocess.TimeoutExpired:
            logger.warning("Semgrep timed out after 60s")
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning("Failed to parse Semgrep output: %s", e)

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
