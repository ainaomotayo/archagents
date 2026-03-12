"""Tests for SQLite fingerprint database module."""

from __future__ import annotations

import json
import os
import tempfile

import pytest

from sentinel_license.fingerprint_db import FingerprintDB, FingerprintRecord


@pytest.fixture
def db():
    """Create a temporary FingerprintDB for each test."""
    with tempfile.TemporaryDirectory() as tmp:
        db_path = os.path.join(tmp, "test.db")
        fdb = FingerprintDB(db_path)
        yield fdb
        fdb.close()


def _make_record(
    hash_val: str = "abc123",
    source_url: str = "https://github.com/lodash/lodash",
    package_name: str = "lodash",
    ecosystem: str = "npm",
    spdx_license: str | None = "MIT",
    package_version: str | None = "4.17.21",
    file_path: str | None = "src/chunk.js",
    line_start: int | None = 10,
    line_end: int | None = 25,
) -> FingerprintRecord:
    return FingerprintRecord(
        hash=hash_val,
        source_url=source_url,
        package_name=package_name,
        ecosystem=ecosystem,
        spdx_license=spdx_license,
        package_version=package_version,
        file_path=file_path,
        line_start=line_start,
        line_end=line_end,
    )


class TestFingerprintDB:
    def test_create_db_creates_schema(self, db: FingerprintDB):
        """New DB has count() == 0."""
        assert db.count() == 0

    def test_insert_and_lookup_exact(self, db: FingerprintDB):
        """Insert a record and look it up by hash; verify all fields."""
        rec = _make_record()
        db.insert(rec)

        result = db.lookup("abc123")
        assert result is not None
        assert result.hash == "abc123"
        assert result.source_url == "https://github.com/lodash/lodash"
        assert result.package_name == "lodash"
        assert result.ecosystem == "npm"
        assert result.spdx_license == "MIT"
        assert result.package_version == "4.17.21"
        assert result.file_path == "src/chunk.js"
        assert result.line_start == 10
        assert result.line_end == 25

    def test_lookup_returns_none_for_unknown(self, db: FingerprintDB):
        """Unknown hash returns None."""
        assert db.lookup("nonexistent_hash") is None

    def test_bulk_insert(self, db: FingerprintDB):
        """Insert 1000 records, verify count and spot-check lookup."""
        records = [
            _make_record(
                hash_val=f"hash_{i:04d}",
                package_name=f"pkg-{i}",
                source_url=f"https://example.com/pkg-{i}",
            )
            for i in range(1000)
        ]
        db.bulk_insert(records)

        assert db.count() == 1000

        # Spot-check a few
        r = db.lookup("hash_0500")
        assert r is not None
        assert r.package_name == "pkg-500"

    def test_upsert_does_not_duplicate(self, db: FingerprintDB):
        """Insert same record twice, count stays 1."""
        rec = _make_record()
        db.insert(rec)
        db.insert(rec)
        assert db.count() == 1

    def test_search_by_package(self, db: FingerprintDB):
        """Insert 3 records (2 lodash npm, 1 express npm), search lodash returns 2."""
        db.insert(_make_record(hash_val="h1", package_name="lodash", ecosystem="npm"))
        db.insert(_make_record(hash_val="h2", package_name="lodash", ecosystem="npm"))
        db.insert(_make_record(hash_val="h3", package_name="express", ecosystem="npm"))

        results = db.search_by_package("lodash", "npm")
        assert len(results) == 2
        assert all(r.package_name == "lodash" for r in results)

    def test_import_from_legacy_json(self, db: FingerprintDB):
        """Write legacy JSON to temp file, import, verify records."""
        legacy = {
            "fingerprints": {
                "aabbccdd": ["https://github.com/lodash/lodash", "MIT"],
                "11223344": ["https://github.com/expressjs/express", "MIT"],
                "deadbeef": ["https://github.com/facebook/react", "MIT"],
            }
        }
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False
        ) as f:
            json.dump(legacy, f)
            json_path = f.name

        try:
            count = db.import_legacy_json(json_path)
            assert count == 3
            assert db.count() == 3

            rec = db.lookup("aabbccdd")
            assert rec is not None
            assert rec.source_url == "https://github.com/lodash/lodash"
            assert rec.package_name == "lodash"
            assert rec.spdx_license == "MIT"
        finally:
            os.unlink(json_path)
