"""Hash-linked evidence chain for code provenance audit trail."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ProvenanceEvent:
    """An event in the provenance audit trail."""

    event_type: str
    data: dict[str, Any]


@dataclass
class EvidenceRecord:
    """A single record in the evidence chain."""

    org_id: str
    scan_id: str
    type: str
    data: dict[str, Any]
    hash: str
    prev_hash: str | None


def compute_evidence_hash(data: dict, prev_hash: str | None) -> str:
    """Compute a SHA-256 hash for evidence data, chained to the previous hash.

    Mirrors the TypeScript implementation in packages/compliance/src/evidence/chain.ts.
    """
    payload = json.dumps(data, sort_keys=True, separators=(",", ":")) + (
        prev_hash if prev_hash is not None else "GENESIS"
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class EvidenceChain:
    """A hash-linked chain of evidence records for provenance auditing."""

    def __init__(self, org_id: str, scan_id: str) -> None:
        self.org_id = org_id
        self.scan_id = scan_id
        self.records: list[EvidenceRecord] = []

    def append(self, event: ProvenanceEvent) -> EvidenceRecord:
        """Append a provenance event to the chain and return the new record."""
        prev_hash = self.records[-1].hash if self.records else None
        record_hash = compute_evidence_hash(event.data, prev_hash)
        record = EvidenceRecord(
            org_id=self.org_id,
            scan_id=self.scan_id,
            type=event.event_type,
            data=event.data,
            hash=record_hash,
            prev_hash=prev_hash,
        )
        self.records.append(record)
        return record

    def verify(self) -> bool:
        """Walk the chain, recompute each hash, and check prev_hash links."""
        prev_hash: str | None = None
        for record in self.records:
            if record.prev_hash != prev_hash:
                return False
            expected = compute_evidence_hash(record.data, prev_hash)
            if record.hash != expected:
                return False
            prev_hash = record.hash
        return True

    def to_dicts(self) -> list[dict]:
        """Serialize records for API/DB storage."""
        return [
            {
                "org_id": r.org_id,
                "scan_id": r.scan_id,
                "type": r.type,
                "data": r.data,
                "hash": r.hash,
                "prev_hash": r.prev_hash,
            }
            for r in self.records
        ]
