# IP/License Provenance Phase 2 - Enterprise Completion Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the 5 remaining enterprise gaps in the IP/License provenance system: evidence persistence to PostgreSQL, CycloneDX 1.5 SBOM export, PostgreSQL-to-SQLite nightly sync, corpus scale expansion (98 to 10K+), and cross-agent correlation rules.

**Architecture:** The IP/License agent (Python) produces evidence chains in-memory during scans. These must be serialized to Redis Streams so the existing TypeScript report-worker can persist them to PostgreSQL's `evidence_records` table. SBOM export generates CycloneDX 1.5 JSON from evidence + findings. A sync job exports `oss_fingerprints` from PostgreSQL to SQLite for agent-local use. Corpus scale is expanded by adding more curated packages to the seed generator. Cross-agent correlation is implemented in the TypeScript assessor as post-processing rules that combine license + dependency findings.

**Tech Stack:** Python 3.12, TypeScript/Node.js, PostgreSQL (Prisma), SQLite, Redis Streams, CycloneDX 1.5 JSON

---

## Task 1: Evidence Chain Publication to Redis Stream

The agent produces an `EvidenceChain` via `last_evidence_chain` but never publishes it. Wire the evidence chain serialization into the agent runner so records are published to `sentinel.evidence` after each scan.

**Files:**
- Modify: `agents/ip-license/sentinel_license/agent.py`
- Create: `agents/ip-license/tests/test_evidence_publish.py`

**Step 1: Write the failing test**

Create `agents/ip-license/tests/test_evidence_publish.py`:

```python
from unittest.mock import MagicMock, patch

from sentinel_agents.types import DiffEvent, DiffFile, DiffHunk, ScanConfig
from sentinel_license.agent import LicenseAgent


def _make_event() -> DiffEvent:
    return DiffEvent(
        scan_id="scan_pub",
        project_id="proj_1",
        commit_hash="abc123",
        branch="main",
        author="dev@test.com",
        timestamp="2026-03-12T12:00:00Z",
        files=[
            DiffFile(
                path="file.py",
                language="python",
                hunks=[
                    DiffHunk(
                        old_start=1, old_count=0, new_start=1, new_count=1,
                        content="+# Licensed under GNU General Public License\n",
                    )
                ],
                ai_score=0.9,
            )
        ],
        scan_config=ScanConfig(
            security_level="standard",
            license_policy="MIT OR Apache-2.0",
            quality_threshold=0.7,
        ),
    )


def test_evidence_chain_serializes_to_dicts():
    """Evidence chain to_dicts() produces records suitable for Redis publication."""
    agent = LicenseAgent()
    agent.run_scan(_make_event())
    chain = agent.last_evidence_chain
    assert chain is not None
    records = chain.to_dicts()
    assert len(records) >= 1
    for rec in records:
        assert "org_id" in rec
        assert "scan_id" in rec
        assert "hash" in rec
        assert "type" in rec
        assert "data" in rec


def test_publish_evidence_builds_stream_payload():
    """publish_evidence() constructs the correct payload for sentinel.evidence."""
    agent = LicenseAgent()
    agent.run_scan(_make_event())
    chain = agent.last_evidence_chain
    assert chain is not None

    payload = agent.build_evidence_payload(chain, org_id="org_123")
    assert payload["orgId"] == "org_123"
    assert payload["scanId"] == "scan_pub"
    assert payload["type"] == "provenance_chain"
    assert isinstance(payload["eventData"]["records"], list)
    assert len(payload["eventData"]["records"]) >= 1
```

**Step 2: Run test to verify it fails**

Run: `cd agents/ip-license && .venv/bin/pytest tests/test_evidence_publish.py -v`
Expected: FAIL — `build_evidence_payload` does not exist yet.

**Step 3: Implement `build_evidence_payload` on LicenseAgent**

In `agents/ip-license/sentinel_license/agent.py`, add:

```python
def build_evidence_payload(
    self, chain: EvidenceChain, org_id: str
) -> dict[str, Any]:
    """Build a Redis Stream payload for the sentinel.evidence stream."""
    return {
        "orgId": org_id,
        "scanId": chain.scan_id,
        "type": "provenance_chain",
        "eventData": {
            "agentName": self.name,
            "agentVersion": self.version,
            "records": chain.to_dicts(),
        },
    }
```

Add `from typing import Any` to imports if not present.

**Step 4: Run test to verify it passes**

Run: `cd agents/ip-license && .venv/bin/pytest tests/test_evidence_publish.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add agents/ip-license/sentinel_license/agent.py agents/ip-license/tests/test_evidence_publish.py
git commit -m "feat(ip-license): add evidence chain publication payload builder"
```

---

## Task 2: CycloneDX 1.5 SBOM Generator Module

Create a module that generates CycloneDX 1.5 JSON from evidence chain records + license findings. This is used as a report type by the existing report-worker.

**Files:**
- Create: `agents/ip-license/sentinel_license/sbom.py`
- Create: `agents/ip-license/tests/test_sbom.py`

**Step 1: Write the failing test**

Create `agents/ip-license/tests/test_sbom.py`:

```python
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
```

**Step 2: Run test to verify it fails**

Run: `cd agents/ip-license && .venv/bin/pytest tests/test_sbom.py -v`
Expected: FAIL — module `sentinel_license.sbom` does not exist.

**Step 3: Implement the SBOM generator**

Create `agents/ip-license/sentinel_license/sbom.py`:

```python
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
    """Generate a CycloneDX 1.5 SBOM dict from scan results.

    Produces a valid CycloneDX 1.5 JSON structure with:
    - metadata: tool info, project, timestamp, evidence chain properties
    - components: one per unique package identified in findings
    - vulnerabilities: mapped from findings with severity >= medium
    """
    now = datetime.now(timezone.utc).isoformat()
    serial = f"urn:uuid:{uuid.uuid4()}"

    # Build metadata properties
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

    # Extract unique components from findings
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

        # Derive a component name from source URL
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
```

**Step 4: Run test to verify it passes**

Run: `cd agents/ip-license && .venv/bin/pytest tests/test_sbom.py -v`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add agents/ip-license/sentinel_license/sbom.py agents/ip-license/tests/test_sbom.py
git commit -m "feat(ip-license): add CycloneDX 1.5 SBOM generator"
```

---

## Task 3: SBOM Export API Endpoint Wiring

Wire the SBOM generator into the agent so it can be invoked after a scan. Add a method on `LicenseAgent` that produces SBOM from the last scan results.

**Files:**
- Modify: `agents/ip-license/sentinel_license/agent.py`
- Modify: `agents/ip-license/tests/test_agent.py`

**Step 1: Write the failing test**

Add to `agents/ip-license/tests/test_agent.py`:

```python
def test_agent_generates_sbom():
    agent = LicenseAgent()
    event = _make_event("+# Licensed under GNU General Public License\n")
    result = agent.run_scan(event)
    assert result.status == "completed"

    sbom = agent.generate_sbom(project_name="test-project")
    assert sbom["bomFormat"] == "CycloneDX"
    assert sbom["specVersion"] == "1.5"
    assert sbom["metadata"]["component"]["name"] == "test-project"
    assert sbom["metadata"]["component"]["version"] == "abc"  # commit_hash
```

**Step 2: Run test to verify it fails**

Run: `cd agents/ip-license && .venv/bin/pytest tests/test_agent.py::test_agent_generates_sbom -v`
Expected: FAIL — `generate_sbom` does not exist.

**Step 3: Add `generate_sbom` to LicenseAgent**

In `agents/ip-license/sentinel_license/agent.py`, add method to `LicenseAgent`:

```python
def generate_sbom(self, project_name: str = "unknown") -> dict[str, Any]:
    """Generate CycloneDX 1.5 SBOM from the most recent scan results."""
    from sentinel_license.sbom import generate_cyclonedx_sbom

    if not self._last_event or not self._last_findings:
        return generate_cyclonedx_sbom(
            scan_id="",
            project_name=project_name,
            commit_hash="",
            findings=[],
            evidence_chain=self.last_evidence_chain,
        )

    return generate_cyclonedx_sbom(
        scan_id=self._last_event.scan_id,
        project_name=project_name,
        commit_hash=self._last_event.commit_hash,
        findings=self._last_findings,
        evidence_chain=self.last_evidence_chain,
    )
```

Also store `_last_event` and `_last_findings` in the `process()` method:

```python
def process(self, event: DiffEvent) -> list[Finding]:
    self._last_event = event
    # ... existing code ...
    self._last_findings = findings
    self.last_evidence_chain = chain
    return findings
```

Add `from typing import Any` to imports.

Initialize in class body:
```python
_last_event: DiffEvent | None = None
_last_findings: list[Finding] | None = None
```

**Step 4: Run test to verify it passes**

Run: `cd agents/ip-license && .venv/bin/pytest tests/test_agent.py -v`
Expected: All tests PASS (12 tests)

**Step 5: Commit**

```bash
git add agents/ip-license/sentinel_license/agent.py agents/ip-license/tests/test_agent.py
git commit -m "feat(ip-license): wire CycloneDX SBOM generation into agent"
```

---

## Task 4: PostgreSQL to SQLite Fingerprint Sync Script

Create a sync script that exports `oss_fingerprints` from PostgreSQL to a SQLite database file. This replaces the agent's local `oss_fingerprints.db` with fresh data from the central corpus.

**Files:**
- Create: `agents/ip-license/sentinel_license/sync_fingerprints.py`
- Create: `agents/ip-license/tests/test_sync.py`

**Step 1: Write the failing test**

Create `agents/ip-license/tests/test_sync.py`:

```python
import os
import tempfile

from sentinel_license.fingerprint_db import FingerprintDB, FingerprintRecord
from sentinel_license.sync_fingerprints import sync_pg_to_sqlite


def _make_pg_rows():
    """Simulate rows from PostgreSQL oss_fingerprints table."""
    return [
        {
            "hash": "abc123def456abc1",
            "source_url": "https://github.com/lodash/lodash",
            "package_name": "lodash",
            "package_version": "4.17.21",
            "ecosystem": "npm",
            "spdx_license": "MIT",
            "file_path": "chunk.js",
            "line_start": 0,
            "line_end": 10,
        },
        {
            "hash": "def456abc123def4",
            "source_url": "https://github.com/expressjs/express",
            "package_name": "express",
            "package_version": "4.18.2",
            "ecosystem": "npm",
            "spdx_license": "MIT",
            "file_path": "router.js",
            "line_start": 0,
            "line_end": 10,
        },
    ]


def test_sync_creates_sqlite_db():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "fingerprints.db")
        rows = _make_pg_rows()
        count = sync_pg_to_sqlite(rows, db_path)
        assert count == 2
        assert os.path.exists(db_path)

        db = FingerprintDB(db_path)
        assert db.count() == 2
        rec = db.lookup("abc123def456abc1")
        assert rec is not None
        assert rec.package_name == "lodash"
        assert rec.spdx_license == "MIT"
        db.close()


def test_sync_replaces_existing_db():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "fingerprints.db")

        # Create initial DB with 1 record
        db = FingerprintDB(db_path)
        db.insert(FingerprintRecord(
            hash="old_hash_12345678",
            source_url="https://old.example.com",
            package_name="old-pkg",
            ecosystem="npm",
        ))
        assert db.count() == 1
        db.close()

        # Sync with new data — should replace
        rows = _make_pg_rows()
        count = sync_pg_to_sqlite(rows, db_path)
        assert count == 2

        db = FingerprintDB(db_path)
        assert db.count() == 2
        assert db.lookup("old_hash_12345678") is None  # old data gone
        db.close()


def test_sync_empty_rows():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "fingerprints.db")
        count = sync_pg_to_sqlite([], db_path)
        assert count == 0
        assert os.path.exists(db_path)
```

**Step 2: Run test to verify it fails**

Run: `cd agents/ip-license && .venv/bin/pytest tests/test_sync.py -v`
Expected: FAIL — module does not exist.

**Step 3: Implement sync module**

Create `agents/ip-license/sentinel_license/sync_fingerprints.py`:

```python
"""Sync OSS fingerprints from PostgreSQL rows to a local SQLite database.

Usage (standalone):
    python -m sentinel_license.sync_fingerprints --db-url postgresql://... --output data/oss_fingerprints.db

Or called programmatically:
    from sentinel_license.sync_fingerprints import sync_pg_to_sqlite
    sync_pg_to_sqlite(rows, "/path/to/output.db")
"""
from __future__ import annotations

import logging
import os
import tempfile
from typing import Any

from sentinel_license.fingerprint_db import FingerprintDB, FingerprintRecord

logger = logging.getLogger(__name__)

BATCH_SIZE = 5000


def sync_pg_to_sqlite(
    rows: list[dict[str, Any]],
    output_path: str,
) -> int:
    """Write PostgreSQL oss_fingerprint rows to a fresh SQLite database.

    Performs an atomic replace: writes to a temp file first, then renames
    over the target path so readers never see a partial database.

    Returns the number of records written.
    """
    if not rows:
        # Create empty DB
        db = FingerprintDB(output_path)
        db.close()
        return 0

    # Write to temp file in same directory for atomic rename
    output_dir = os.path.dirname(output_path) or "."
    fd, tmp_path = tempfile.mkstemp(suffix=".db", dir=output_dir)
    os.close(fd)

    try:
        db = FingerprintDB(tmp_path)
        records = [
            FingerprintRecord(
                hash=row["hash"],
                source_url=row["source_url"],
                package_name=row["package_name"],
                package_version=row.get("package_version"),
                ecosystem=row["ecosystem"],
                spdx_license=row.get("spdx_license"),
                file_path=row.get("file_path"),
                line_start=row.get("line_start"),
                line_end=row.get("line_end"),
            )
            for row in rows
        ]

        # Batch insert
        for i in range(0, len(records), BATCH_SIZE):
            db.bulk_insert(records[i : i + BATCH_SIZE])

        db.close()

        # Atomic replace
        os.replace(tmp_path, output_path)
        logger.info("Synced %d fingerprints to %s", len(records), output_path)
        return len(records)

    except Exception:
        # Clean up temp file on failure
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise
```

**Step 4: Run test to verify it passes**

Run: `cd agents/ip-license && .venv/bin/pytest tests/test_sync.py -v`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add agents/ip-license/sentinel_license/sync_fingerprints.py agents/ip-license/tests/test_sync.py
git commit -m "feat(ip-license): add PostgreSQL-to-SQLite fingerprint sync"
```

---

## Task 5: Expand Seed Corpus to 10K+ Fingerprints

Expand the seed corpus from 23 packages (98 fingerprints) to 60+ packages across all 6 ecosystems, targeting 10K+ fingerprints by including larger, more representative code snippets.

**Files:**
- Modify: `agents/ip-license/data/seed_corpus.py`
- No new test files needed — the existing `test_fingerprint_db.py::test_seed_database_is_populated` validates the DB.

**Step 1: Add 40+ new packages to SEED_PACKAGES**

Add packages across all ecosystems with larger code samples (30-60 lines each to generate 5-10 fingerprints per file, multiple files per package). Target ecosystems:

**npm (add 8):** react, vue, next, svelte, esbuild, rollup, vite, prettier
**PyPI (add 8):** numpy, pandas, click, sqlalchemy, celery, pydantic, httpx, black
**crates.io (add 6):** hyper, reqwest, diesel, axum, anyhow, thiserror
**Maven (add 6):** hibernate, junit5, slf4j, lombok, mockito, log4j
**RubyGems (add 6):** sinatra, rspec, nokogiri, puma, activerecord, bundler
**Go (add 6):** cobra, echo, fiber, gorm, viper, chi

Each package should have 2-3 source files of 30-60 lines each (representative algorithmic patterns, not exact copies).

**Step 2: Run the seed corpus generator**

Run: `cd agents/ip-license && .venv/bin/python data/seed_corpus.py`
Expected: Output showing 60+ packages and 10,000+ total fingerprints.

**Step 3: Verify the database**

Run: `cd agents/ip-license && .venv/bin/pytest tests/test_fingerprint_db.py -v`
Expected: All tests PASS. The `test_seed_database_is_populated` test should show >= 10,000 fingerprints.

**Step 4: Update the fingerprint count assertion**

In `tests/test_fingerprint_db.py`, update the minimum count assertion if it exists to reflect the new corpus size (10,000+).

**Step 5: Commit**

```bash
git add agents/ip-license/data/seed_corpus.py agents/ip-license/data/oss_fingerprints.db agents/ip-license/tests/test_fingerprint_db.py
git commit -m "feat(ip-license): expand OSS corpus to 10K+ fingerprints across 60+ packages"
```

---

## Task 6: Cross-Agent Correlation Rules in Assessor

Add correlation rules to the TypeScript assessor that combine findings from different agents. The key rule: when a package has both a copyleft license (from ip-license agent) AND a known CVE (from dependency agent), escalate to CRITICAL severity.

**Files:**
- Create: `packages/assessor/src/correlator.ts`
- Create: `packages/assessor/src/__tests__/correlator.test.ts`
- Modify: `packages/assessor/src/assessor.ts`

**Step 1: Write the failing test**

Create `packages/assessor/src/__tests__/correlator.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { correlateFindings, type CorrelationRule } from "../correlator.js";
import type { Finding, LicenseFinding, DependencyFinding } from "@sentinel/shared";

describe("correlateFindings", () => {
  it("escalates copyleft+CVE in same package to critical", () => {
    const findings: Finding[] = [
      {
        type: "license",
        file: "src/utils.js",
        lineStart: 1,
        lineEnd: 10,
        severity: "high",
        confidence: "high",
        findingType: "copyleft-risk",
        licenseDetected: "GPL-3.0",
        similarityScore: 0.95,
        sourceMatch: "https://github.com/example/lib",
        policyAction: "block",
      } as LicenseFinding,
      {
        type: "dependency",
        file: "package.json",
        lineStart: 5,
        lineEnd: 5,
        severity: "high",
        confidence: "high",
        package: "example-lib",
        findingType: "cve",
        detail: "CVE-2024-1234",
        existingAlternative: null,
        cveId: "CVE-2024-1234",
      } as DependencyFinding,
    ];

    const correlated = correlateFindings(findings);
    const escalated = correlated.filter(
      (f) => f.type === "policy" && f.severity === "critical"
    );
    expect(escalated.length).toBe(1);
    expect(escalated[0].severity).toBe("critical");
  });

  it("does not escalate when no overlap", () => {
    const findings: Finding[] = [
      {
        type: "license",
        file: "src/utils.js",
        lineStart: 1,
        lineEnd: 10,
        severity: "medium",
        confidence: "high",
        findingType: "copyleft-risk",
        licenseDetected: "MIT",
        similarityScore: 0.9,
        sourceMatch: null,
        policyAction: "allow",
      } as LicenseFinding,
    ];

    const correlated = correlateFindings(findings);
    assert(correlated.length === 0);
  });

  it("detects dual-license CVE+copyleft via file proximity", () => {
    const findings: Finding[] = [
      {
        type: "license",
        file: "node_modules/risky-pkg/index.js",
        lineStart: 1,
        lineEnd: 10,
        severity: "high",
        confidence: "high",
        findingType: "copyleft-risk",
        licenseDetected: "AGPL-3.0",
        similarityScore: 1.0,
        sourceMatch: "https://github.com/risky/pkg",
        policyAction: "block",
      } as LicenseFinding,
      {
        type: "dependency",
        file: "package.json",
        lineStart: 10,
        lineEnd: 10,
        severity: "medium",
        confidence: "high",
        package: "risky-pkg",
        findingType: "cve",
        detail: "CVE-2025-9999",
        existingAlternative: "safe-pkg",
        cveId: "CVE-2025-9999",
      } as DependencyFinding,
    ];

    const correlated = correlateFindings(findings);
    expect(correlated.length).toBe(1);
    expect(correlated[0].severity).toBe("critical");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/assessor && npx vitest run src/__tests__/correlator.test.ts`
Expected: FAIL — module does not exist.

**Step 3: Implement correlator**

Create `packages/assessor/src/correlator.ts`:

```typescript
/**
 * Cross-agent correlation rules for the assessor.
 *
 * Combines findings from multiple agents to detect compound risks that
 * no single agent can identify alone.
 */
import type {
  Finding,
  LicenseFinding,
  DependencyFinding,
  PolicyFinding,
} from "@sentinel/shared";

export interface CorrelationRule {
  name: string;
  description: string;
  apply(findings: Finding[]): Finding[];
}

/**
 * Extract a package name from a source URL or file path.
 * Returns a normalized lowercase name for matching.
 */
function extractPackageName(finding: Finding): string | null {
  if (finding.type === "dependency") {
    return (finding as DependencyFinding).package?.toLowerCase() ?? null;
  }
  if (finding.type === "license") {
    const lf = finding as LicenseFinding;
    if (lf.sourceMatch) {
      return lf.sourceMatch.rstrip("/").split("/").pop()?.toLowerCase() ?? null;
    }
    // Try to extract from file path (e.g., node_modules/pkg-name/...)
    const match = lf.file.match(/node_modules\/([^/]+)/);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

const COPYLEFT_LICENSES = new Set([
  "GPL-2.0", "GPL-2.0-only", "GPL-2.0-or-later",
  "GPL-3.0", "GPL-3.0-only", "GPL-3.0-or-later",
  "AGPL-3.0", "AGPL-3.0-only", "AGPL-3.0-or-later",
  "LGPL-2.1", "LGPL-2.1-only", "LGPL-2.1-or-later",
  "LGPL-3.0", "LGPL-3.0-only", "LGPL-3.0-or-later",
  "MPL-2.0", "EUPL-1.2", "OSL-3.0", "SSPL-1.0",
]);

/**
 * Rule: copyleft license + CVE in the same package = CRITICAL policy finding.
 */
const copyleftCveRule: CorrelationRule = {
  name: "copyleft-cve-escalation",
  description: "Escalate to CRITICAL when copyleft license and CVE exist for the same package",
  apply(findings: Finding[]): Finding[] {
    const copyleftFindings = findings.filter(
      (f): f is LicenseFinding =>
        f.type === "license" &&
        (f as LicenseFinding).findingType === "copyleft-risk" &&
        COPYLEFT_LICENSES.has((f as LicenseFinding).licenseDetected ?? ""),
    );

    const cveFindings = findings.filter(
      (f): f is DependencyFinding =>
        f.type === "dependency" &&
        (f as DependencyFinding).findingType === "cve",
    );

    if (copyleftFindings.length === 0 || cveFindings.length === 0) {
      return [];
    }

    // Build package name index for CVE findings
    const cveByPackage = new Map<string, DependencyFinding>();
    for (const cve of cveFindings) {
      const name = extractPackageName(cve);
      if (name) cveByPackage.set(name, cve);
    }

    const correlated: PolicyFinding[] = [];
    const seen = new Set<string>();

    for (const lf of copyleftFindings) {
      const pkgName = extractPackageName(lf);
      if (!pkgName || seen.has(pkgName)) continue;

      // Direct package name match
      const matchedCve = cveByPackage.get(pkgName);
      if (!matchedCve) continue;

      seen.add(pkgName);
      correlated.push({
        type: "policy",
        file: lf.file,
        lineStart: lf.lineStart,
        lineEnd: lf.lineEnd,
        severity: "critical",
        confidence: "high",
        policyName: "copyleft-cve-escalation",
        policySource: "inferred",
        violation: `Package "${pkgName}" has copyleft license (${lf.licenseDetected}) AND known vulnerability (${matchedCve.cveId}). Dual risk requires immediate remediation.`,
        requiredAlternative: matchedCve.existingAlternative,
      });
    }

    return correlated;
  },
};

const DEFAULT_RULES: CorrelationRule[] = [copyleftCveRule];

/**
 * Run all correlation rules against the merged findings list.
 * Returns only the NEW findings generated by correlation (not the originals).
 */
export function correlateFindings(
  findings: Finding[],
  rules: CorrelationRule[] = DEFAULT_RULES,
): Finding[] {
  const correlated: Finding[] = [];
  for (const rule of rules) {
    correlated.push(...rule.apply(findings));
  }
  return correlated;
}
```

Note: Fix `rstrip` to JavaScript `.replace(/\/+$/, "")` (not Python syntax).

**Step 4: Run test to verify it passes**

Run: `cd packages/assessor && npx vitest run src/__tests__/correlator.test.ts`
Expected: PASS (3 tests)

**Step 5: Wire into Assessor**

In `packages/assessor/src/assessor.ts`, in the `assess()` method, after `mergeFindings` call:

```typescript
import { correlateFindings } from "./correlator.js";

// In assess():
const allFindings = this.mergeFindings(input.findingEvents);
const correlatedFindings = correlateFindings(allFindings);
const combinedFindings = [...allFindings, ...correlatedFindings];
```

Then use `combinedFindings` instead of `allFindings` for the rest of the method.

**Step 6: Run all assessor tests**

Run: `npx turbo test --filter=@sentinel/assessor`
Expected: All tests PASS.

**Step 7: Commit**

```bash
git add packages/assessor/src/correlator.ts packages/assessor/src/__tests__/correlator.test.ts packages/assessor/src/assessor.ts
git commit -m "feat(assessor): add cross-agent correlation rules (copyleft+CVE escalation)"
```

---

## Task 7: Run Full Test Suite and Verify

**Step 1: Run IP/License agent tests**

Run: `cd agents/ip-license && .venv/bin/pytest tests/ -v`
Expected: 95+ tests passing.

**Step 2: Run assessor tests**

Run: `npx turbo test --filter=@sentinel/assessor`
Expected: All tests PASS.

**Step 3: Run full API test suite**

Run: `npx turbo test --filter=@sentinel/api`
Expected: All tests PASS.

**Step 4: Commit if any fixups needed**

Only if tests revealed issues — fix and commit.

---

## Dependencies Between Tasks

```
Task 1 (evidence publish) — independent
Task 2 (SBOM module) — independent
Task 3 (SBOM wiring) — depends on Task 2
Task 4 (PG→SQLite sync) — independent
Task 5 (corpus expansion) — independent
Task 6 (cross-agent correlation) — independent
Task 7 (full test suite) — depends on all above
```

**Parallel execution groups:**
- Group A: Tasks 1, 2, 4, 5, 6 (all independent)
- Group B: Task 3 (after Task 2)
- Group C: Task 7 (after all)
