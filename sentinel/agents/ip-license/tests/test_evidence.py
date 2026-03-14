"""Tests for hash-linked evidence chain."""

from __future__ import annotations

from sentinel_license.evidence import (
    EvidenceChain,
    EvidenceRecord,
    ProvenanceEvent,
    compute_evidence_hash,
)


def test_compute_evidence_hash_deterministic():
    """Same data + prev_hash produce the same hash, length 64."""
    data = {"file": "main.py", "license": "MIT"}
    h1 = compute_evidence_hash(data, None)
    h2 = compute_evidence_hash(data, None)
    assert h1 == h2
    assert len(h1) == 64


def test_compute_evidence_hash_with_prev():
    """Different prev_hash produces a different output hash."""
    data = {"file": "main.py", "license": "MIT"}
    h_genesis = compute_evidence_hash(data, None)
    h_linked = compute_evidence_hash(data, "abc123")
    assert h_genesis != h_linked


def test_genesis_record_has_no_prev_hash():
    """First record in chain has prev_hash == None."""
    chain = EvidenceChain(org_id="org-1", scan_id="scan-1")
    event = ProvenanceEvent(event_type="license_detected", data={"license": "MIT"})
    rec = chain.append(event)
    assert rec.prev_hash is None


def test_chain_links_records():
    """Second record's prev_hash equals first record's hash."""
    chain = EvidenceChain(org_id="org-1", scan_id="scan-1")
    e1 = ProvenanceEvent(event_type="license_detected", data={"license": "MIT"})
    e2 = ProvenanceEvent(event_type="file_scanned", data={"file": "lib.py"})
    r1 = chain.append(e1)
    r2 = chain.append(e2)
    assert r2.prev_hash == r1.hash


def test_chain_verify_valid():
    """Chain with 3 records verifies True."""
    chain = EvidenceChain(org_id="org-1", scan_id="scan-1")
    for i in range(3):
        chain.append(ProvenanceEvent(event_type="step", data={"i": i}))
    assert chain.verify() is True


def test_chain_verify_detects_tamper():
    """Modifying data in first record causes verify to return False."""
    chain = EvidenceChain(org_id="org-1", scan_id="scan-1")
    for i in range(3):
        chain.append(ProvenanceEvent(event_type="step", data={"i": i}))
    # Tamper with the first record's data
    chain.records[0].data["i"] = 999
    assert chain.verify() is False


def test_chain_to_dicts():
    """to_dicts returns list of dicts with correct keys."""
    chain = EvidenceChain(org_id="org-1", scan_id="scan-1")
    chain.append(ProvenanceEvent(event_type="license_detected", data={"license": "MIT"}))
    result = chain.to_dicts()
    assert isinstance(result, list)
    assert len(result) == 1
    expected_keys = {"org_id", "scan_id", "type", "data", "hash", "prev_hash"}
    assert set(result[0].keys()) == expected_keys
    assert result[0]["org_id"] == "org-1"
    assert result[0]["scan_id"] == "scan-1"
    assert result[0]["type"] == "license_detected"
