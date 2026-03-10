"""Query OSV.dev for known CVEs in dependencies."""
from __future__ import annotations

import logging
import time
from typing import Any

import requests as http_requests  # avoid shadowing popular-package name

from sentinel_agents.types import Confidence, Finding, Severity

from sentinel_dependency.manifest_parser import DependencyDeclaration

logger = logging.getLogger(__name__)

OSV_QUERY_URL = "https://api.osv.dev/v1/query"
OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch"
REQUEST_TIMEOUT = 10  # seconds
MAX_RETRIES = 2
BATCH_SIZE = 100  # OSV recommends batches of up to 1000, but keep moderate

# ---------------------------------------------------------------------------
# Ecosystem mapping
# ---------------------------------------------------------------------------

_ECOSYSTEM_MAP: dict[str, str] = {
    "PyPI": "PyPI",
    "npm": "npm",
    "Go": "Go",
    "crates.io": "crates.io",
    "Maven": "Maven",
    "RubyGems": "RubyGems",
    # Aliases for convenience
    "python": "PyPI",
    "py": "PyPI",
    "javascript": "npm",
    "js": "npm",
    "typescript": "npm",
    "ts": "npm",
    "go": "Go",
    "rust": "crates.io",
    "java": "Maven",
    "ruby": "RubyGems",
}


def _map_ecosystem(ecosystem: str) -> str:
    """Map an ecosystem string to OSV-recognised name."""
    return _ECOSYSTEM_MAP.get(ecosystem, ecosystem)


# ---------------------------------------------------------------------------
# Severity mapping
# ---------------------------------------------------------------------------

def _cvss_to_severity(score: float | None) -> Severity:
    """Map a CVSS score to SENTINEL Severity."""
    if score is None:
        return Severity.MEDIUM
    if score >= 9.0:
        return Severity.CRITICAL
    if score >= 7.0:
        return Severity.HIGH
    if score >= 4.0:
        return Severity.MEDIUM
    if score >= 0.1:
        return Severity.LOW
    return Severity.INFO


def _osv_severity_to_sentinel(osv_severity: list[dict[str, str]] | None) -> tuple[Severity, float | None]:
    """Extract CVSS score and map to SENTINEL Severity from OSV severity list."""
    if not osv_severity:
        return Severity.MEDIUM, None
    for entry in osv_severity:
        score_str = entry.get("score")
        if score_str:
            # CVSS vector string — extract base score if present
            # OSV may also provide a numeric score directly
            try:
                score = float(score_str)
                return _cvss_to_severity(score), score
            except ValueError:
                pass
        # Try type-based mapping
        stype = entry.get("type", "")
        if stype == "CVSS_V3":
            # Parse CVSS vector for score — not trivial, use severity as fallback
            pass
    return Severity.MEDIUM, None


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------

def _extract_cve_ids(aliases: list[str] | None) -> list[str]:
    """Return CVE-* identifiers from aliases list."""
    if not aliases:
        return []
    return [a for a in aliases if a.startswith("CVE-")]


def _extract_fixed_versions(affected: list[dict] | None) -> list[str]:
    """Extract fixed versions from OSV affected ranges."""
    fixed: list[str] = []
    if not affected:
        return fixed
    for entry in affected:
        for rng in entry.get("ranges", []):
            for event in rng.get("events", []):
                if "fixed" in event:
                    fixed.append(event["fixed"])
    return fixed


def _extract_cvss_from_severity(severity_list: list[dict] | None) -> float | None:
    """Try to extract a numeric CVSS score from OSV severity entries."""
    if not severity_list:
        return None
    for entry in severity_list:
        score_str = entry.get("score", "")
        try:
            return float(score_str)
        except (ValueError, TypeError):
            pass
        # Try to extract from CVSS vector string if present
        vector = entry.get("score", "")
        if "/" in vector:
            # Cannot reliably parse CVSS vector without a library; skip
            pass
    return None


_DB_SEVERITY_MAP: dict[str, Severity] = {
    "CRITICAL": Severity.CRITICAL,
    "HIGH": Severity.HIGH,
    "MODERATE": Severity.MEDIUM,
    "MEDIUM": Severity.MEDIUM,
    "LOW": Severity.LOW,
}


def _parse_vulns(
    vulns: list[dict[str, Any]],
    dep: DependencyDeclaration,
) -> list[Finding]:
    """Convert OSV vulnerability objects into SENTINEL Findings."""
    findings: list[Finding] = []

    for vuln in vulns:
        vuln_id = vuln.get("id", "unknown")
        summary = vuln.get("summary", vuln.get("details", "No description available"))
        aliases = vuln.get("aliases", [])
        cve_ids = _extract_cve_ids(aliases)
        cve_id = cve_ids[0] if cve_ids else vuln_id

        # Try CVSS numeric score first, then database_specific severity string
        severity_list = vuln.get("severity")
        cvss_score = _extract_cvss_from_severity(severity_list)
        if cvss_score is not None:
            severity = _cvss_to_severity(cvss_score)
        else:
            db_sev = vuln.get("database_specific", {}).get("severity", "")
            severity = _DB_SEVERITY_MAP.get(db_sev.upper(), Severity.MEDIUM)

        # Extract CWE from database_specific
        cwe_ids = vuln.get("database_specific", {}).get("cwe_ids", [])
        cwe_id_str = cwe_ids[0] if cwe_ids else None

        fixed_versions = _extract_fixed_versions(vuln.get("affected"))
        fix_str = ", ".join(fixed_versions) if fixed_versions else "No fix available"

        findings.append(
            Finding(
                type="dependency",
                file=dep.file_path,
                line_start=dep.line_number,
                line_end=dep.line_number,
                severity=severity,
                confidence=Confidence.HIGH,
                title=f"{cve_id}: {dep.package_name}@{dep.version or 'unknown'}",
                description=summary[:500] if summary else "",
                remediation=f"Upgrade {dep.package_name} to {fix_str}",
                category="cve",
                scanner="osv-scanner",
                cwe_id=cwe_id_str,
                extra={
                    "package": dep.package_name,
                    "findingType": "cve",
                    "cveId": cve_id,
                    "cvssScore": cvss_score,
                    "fixedVersion": fix_str,
                    "affectedVersions": dep.version or "unknown",
                    "osvId": vuln_id,
                },
            )
        )

    return findings


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def _post_with_retry(url: str, payload: dict, retries: int = MAX_RETRIES) -> dict | None:
    """POST JSON to *url* with retries on transient errors."""
    for attempt in range(retries + 1):
        try:
            resp = http_requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
            if resp.status_code == 429:
                wait = min(2 ** attempt, 8)
                logger.warning("OSV rate-limited (429), backing off %ds", wait)
                time.sleep(wait)
                continue
            if resp.status_code >= 500:
                logger.warning("OSV server error %d, retrying", resp.status_code)
                time.sleep(1)
                continue
            resp.raise_for_status()
            return resp.json()
        except http_requests.exceptions.Timeout:
            logger.warning("OSV request timed out (attempt %d/%d)", attempt + 1, retries + 1)
        except http_requests.exceptions.ConnectionError:
            logger.warning("OSV connection error (attempt %d/%d)", attempt + 1, retries + 1)
        except http_requests.exceptions.RequestException as exc:
            logger.warning("OSV request failed: %s", exc)
            break  # non-retryable
        except ValueError:
            logger.warning("OSV returned non-JSON response")
            break
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_query(dep: DependencyDeclaration) -> dict:
    """Build an OSV query dict for a single dependency."""
    ecosystem = _map_ecosystem(dep.ecosystem)
    q: dict[str, Any] = {"package": {"name": dep.package_name, "ecosystem": ecosystem}}
    if dep.version:
        q["version"] = dep.version
    return q


def build_batch_queries(deps: list[DependencyDeclaration]) -> dict:
    """Build an OSV batch query payload."""
    return {"queries": [build_query(d) for d in deps]}


OSV_VULN_URL = "https://api.osv.dev/v1/vulns"


def _fetch_vuln_details(vuln_id: str) -> dict | None:
    """Fetch full vulnerability details by ID."""
    try:
        resp = http_requests.get(f"{OSV_VULN_URL}/{vuln_id}", timeout=REQUEST_TIMEOUT)
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return None


def query_osv_batch(deps: list[DependencyDeclaration]) -> list[Finding]:
    """Query OSV.dev for a list of dependencies.

    Uses the batch API to identify which deps have vulns, then fetches
    full details for each vulnerability (batch only returns IDs).

    Returns a list of Findings for any known vulnerabilities.
    """
    if not deps:
        return []

    all_findings: list[Finding] = []

    # Process in batches
    for start in range(0, len(deps), BATCH_SIZE):
        batch = deps[start : start + BATCH_SIZE]
        payload = build_batch_queries(batch)
        data = _post_with_retry(OSV_BATCH_URL, payload)

        if data is None:
            logger.warning("OSV batch query failed for %d packages, skipping", len(batch))
            continue

        results = data.get("results", [])
        for dep, result in zip(batch, results):
            vuln_stubs = result.get("vulns", [])
            if not vuln_stubs:
                continue

            # Batch API returns abbreviated results (id + modified only).
            # Check if the first vuln has full details (summary/affected).
            if vuln_stubs[0].get("summary") or vuln_stubs[0].get("affected"):
                # Full details already present (may happen in future API versions)
                all_findings.extend(_parse_vulns(vuln_stubs, dep))
            else:
                # Fetch full details for each vuln
                full_vulns: list[dict] = []
                for stub in vuln_stubs:
                    vuln_id = stub.get("id", "")
                    if not vuln_id:
                        continue
                    detail = _fetch_vuln_details(vuln_id)
                    if detail:
                        full_vulns.append(detail)
                if full_vulns:
                    all_findings.extend(_parse_vulns(full_vulns, dep))

    return all_findings


def query_osv_single(dep: DependencyDeclaration) -> list[Finding]:
    """Query OSV.dev for a single dependency. Useful for testing."""
    payload = build_query(dep)
    data = _post_with_retry(OSV_QUERY_URL, payload)
    if data is None:
        return []
    vulns = data.get("vulns", [])
    return _parse_vulns(vulns, dep)


def scan_dependencies(deps: list[DependencyDeclaration]) -> list[Finding]:
    """Main entry point: filter deps with versions and query OSV.

    Skips dependencies without a concrete version since OSV needs one to
    check for vulnerabilities.
    """
    with_version = [d for d in deps if d.version]
    if not with_version:
        return []
    return query_osv_batch(with_version)
