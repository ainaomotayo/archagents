"""CycloneDX 1.5 SBOM generator from evidence chain + license findings."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sentinel_agents.types import Finding
from sentinel_license.evidence import EvidenceChain


def generate_cyclonedx_sbom(
    *,
    scan_id: str,
    project_name: str,
    commit_hash: str,
    findings: list[Finding],
    evidence_chain: EvidenceChain | None = None,
) -> dict[str, Any]:
    """Generate a CycloneDX 1.5 SBOM dict from scan results."""
    now = datetime.now(timezone.utc).isoformat()
    serial = f"urn:uuid:{uuid.uuid4()}"

    properties: list[dict[str, str]] = [
        {"name": "sentinel:scanId", "value": scan_id},
        {"name": "sentinel:commitHash", "value": commit_hash},
        {"name": "sentinel:generatedAt", "value": now},
    ]
    if evidence_chain is not None:
        properties.append({
            "name": "sentinel:evidenceChainLength",
            "value": str(len(evidence_chain.records)),
        })
        if evidence_chain.records:
            properties.append({
                "name": "sentinel:evidenceChainHead",
                "value": evidence_chain.records[-1].hash,
            })

    components = _extract_components(findings)

    sbom: dict[str, Any] = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "serialNumber": serial,
        "version": 1,
        "metadata": {
            "timestamp": now,
            "tools": {
                "components": [
                    {
                        "type": "application",
                        "name": "sentinel-ip-license",
                        "version": "0.3.0",
                        "author": "Sentinel",
                    }
                ]
            },
            "component": {
                "type": "application",
                "name": project_name,
                "version": commit_hash,
            },
            "properties": properties,
        },
        "components": components,
    }

    return sbom


def _extract_components(findings: list[Finding]) -> list[dict[str, Any]]:
    """Deduplicate and build CycloneDX component entries from findings."""
    seen: set[str] = set()
    components: list[dict[str, Any]] = []

    for f in findings:
        extra = f.extra or {}
        source = extra.get("sourceMatch") or extra.get("registryUrl", "")
        ecosystem = extra.get("ecosystem", "")
        license_id = extra.get("licenseDetected") or extra.get("registryLicense", "")
        version = extra.get("packageVersion") or extra.get("registryVersion", "")

        if source:
            name = source.rstrip("/").rsplit("/", 1)[-1]
        else:
            name = f.file

        key = f"{ecosystem}:{name}:{version}"
        if key in seen:
            continue
        seen.add(key)

        component: dict[str, Any] = {
            "type": "library",
            "name": name,
            "bom-ref": key,
        }
        if version:
            component["version"] = version
        if ecosystem:
            component["purl"] = _build_purl(ecosystem, name, version)
        if license_id:
            component["licenses"] = [{"license": {"id": license_id}}]
        if source:
            component["externalReferences"] = [
                {"type": "vcs", "url": source}
            ]

        components.append(component)

    return components


def _build_purl(ecosystem: str, name: str, version: str) -> str:
    """Build a Package URL (purl) string."""
    eco_map = {
        "npm": "npm",
        "PyPI": "pypi",
        "crates.io": "cargo",
        "Maven": "maven",
        "RubyGems": "gem",
        "Go": "golang",
    }
    purl_type = eco_map.get(ecosystem, ecosystem.lower())
    purl = f"pkg:{purl_type}/{name}"
    if version:
        purl += f"@{version}"
    return purl
