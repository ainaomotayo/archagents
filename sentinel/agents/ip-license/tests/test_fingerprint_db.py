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


class TestSeedDB:
    """Tests for the shipped seed fingerprint database."""

    def test_seed_db_has_real_fingerprints(self):
        """The shipped seed DB should contain real fingerprints, not fake sequential hashes."""
        db_path = os.path.join(
            os.path.dirname(__file__), "..", "data", "oss_fingerprints.db"
        )
        if not os.path.exists(db_path):
            pytest.skip("Seed DB not yet built")
        db = FingerprintDB(db_path)
        assert db.count() >= 50  # At minimum 50 real fingerprints
        # Verify no fake sequential hashes exist
        for i in range(1, 59):
            fake_hash = f"a1b2c3d4e5f6{i:04x}"
            assert db.lookup(fake_hash) is None, f"Found fake hash: {fake_hash}"
        db.close()

    def test_seed_db_covers_all_ecosystems(self):
        """The seed DB should have fingerprints from all 6 target ecosystems."""
        db_path = os.path.join(
            os.path.dirname(__file__), "..", "data", "oss_fingerprints.db"
        )
        if not os.path.exists(db_path):
            pytest.skip("Seed DB not yet built")
        db = FingerprintDB(db_path)
        expected_ecosystems = {"npm", "PyPI", "crates.io", "Maven", "RubyGems", "Go"}
        for eco in expected_ecosystems:
            import sqlite3

            conn = sqlite3.connect(db_path)
            cur = conn.execute(
                "SELECT COUNT(*) FROM fingerprints WHERE ecosystem = ?", (eco,)
            )
            count = cur.fetchone()[0]
            conn.close()
            assert count > 0, f"No fingerprints for ecosystem: {eco}"
        db.close()

    def test_seed_db_has_minhash_signatures(self):
        """Seed DB should have minhash signatures for fuzzy matching."""
        db_path = os.path.join(
            os.path.dirname(__file__), "..", "data", "oss_fingerprints.db"
        )
        if not os.path.exists(db_path):
            pytest.skip("Seed DB not yet built")
        db = FingerprintDB(db_path)
        # Check minhash_signatures table has entries
        row = db._conn.execute(
            "SELECT COUNT(*) as c FROM minhash_signatures"
        ).fetchone()
        assert row["c"] > 0, "No minhash signatures in seed DB"
        db.close()

    def test_seed_db_has_valid_records(self):
        """Each record in the seed DB should have required fields populated."""
        db_path = os.path.join(
            os.path.dirname(__file__), "..", "data", "oss_fingerprints.db"
        )
        if not os.path.exists(db_path):
            pytest.skip("Seed DB not yet built")
        import sqlite3

        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT * FROM fingerprints").fetchall()
        for row in rows:
            assert row["hash"], "hash must not be empty"
            assert len(row["hash"]) == 16, f"hash should be 16 chars: {row['hash']}"
            assert row["source_url"], "source_url must not be empty"
            assert row["package_name"], "package_name must not be empty"
            assert row["ecosystem"], "ecosystem must not be empty"
        conn.close()
