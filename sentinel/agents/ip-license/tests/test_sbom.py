import json

from sentinel_agents.types import Confidence, Finding, Severity
from sentinel_license.evidence import EvidenceChain, ProvenanceEvent
from sentinel_license.sbom import generate_cyclonedx_sbom


def _make_chain_and_findings():
    chain = EvidenceChain(org_id="org_1", scan_id="scan_1")
    chain.append(ProvenanceEvent(
        event_type="license_detection",
        data={"licenseDetected": "MIT", "file": "src/utils.js", "line": 1},
    ))
    chain.append(ProvenanceEvent(
        event_type="fingerprint_match",
        data={"source": "https://github.com/lodash/lodash", "similarity": 0.95, "license": "MIT"},
    ))

    findings = [
        Finding(
            type="license",
            file="src/utils.js",
            line_start=1,
            line_end=10,
            severity=Severity.LOW,
            confidence=Confidence.HIGH,
            title="MIT license detected",
            description="MIT license header found",
            category="copyleft-risk",
            scanner="spdx",
            extra={
                "licenseDetected": "MIT",
                "ecosystem": "npm",
                "sourceMatch": "https://github.com/lodash/lodash",
                "packageVersion": "4.17.21",
            },
        ),
    ]
    return chain, findings


def test_generates_valid_cyclonedx_structure():
    chain, findings = _make_chain_and_findings()
    sbom = generate_cyclonedx_sbom(
        scan_id="scan_1",
        project_name="my-project",
        commit_hash="abc123",
        findings=findings,
        evidence_chain=chain,
    )
    assert sbom["bomFormat"] == "CycloneDX"
    assert sbom["specVersion"] == "1.5"
    assert "metadata" in sbom
    assert "components" in sbom
    assert isinstance(sbom["components"], list)


def test_components_from_findings():
    chain, findings = _make_chain_and_findings()
    sbom = generate_cyclonedx_sbom(
        scan_id="scan_1",
        project_name="my-project",
        commit_hash="abc123",
        findings=findings,
        evidence_chain=chain,
    )
    assert len(sbom["components"]) >= 1
    comp = sbom["components"][0]
    assert comp["type"] == "library"
    assert "licenses" in comp


def test_evidence_in_properties():
    chain, findings = _make_chain_and_findings()
    sbom = generate_cyclonedx_sbom(
        scan_id="scan_1",
        project_name="my-project",
        commit_hash="abc123",
        findings=findings,
        evidence_chain=chain,
    )
    props = sbom.get("metadata", {}).get("properties", [])
    prop_names = [p["name"] for p in props]
    assert "sentinel:scanId" in prop_names
    assert "sentinel:commitHash" in prop_names
    assert "sentinel:evidenceChainLength" in prop_names


def test_serializes_to_valid_json():
    chain, findings = _make_chain_and_findings()
    sbom = generate_cyclonedx_sbom(
        scan_id="scan_1",
        project_name="my-project",
        commit_hash="abc123",
        findings=findings,
        evidence_chain=chain,
    )
    json_str = json.dumps(sbom)
    parsed = json.loads(json_str)
    assert parsed["bomFormat"] == "CycloneDX"


def test_empty_findings_produces_empty_components():
    sbom = generate_cyclonedx_sbom(
        scan_id="scan_empty",
        project_name="empty-project",
        commit_hash="000",
        findings=[],
        evidence_chain=None,
    )
    assert sbom["components"] == []
    assert sbom["bomFormat"] == "CycloneDX"


def test_purl_generation():
    from sentinel_license.sbom import _build_purl
    assert _build_purl("npm", "lodash", "4.17.21") == "pkg:npm/lodash@4.17.21"
    assert _build_purl("PyPI", "flask", "3.0.0") == "pkg:pypi/flask@3.0.0"
    assert _build_purl("crates.io", "serde", "1.0") == "pkg:cargo/serde@1.0"
    assert _build_purl("Go", "gin", "") == "pkg:golang/gin"
