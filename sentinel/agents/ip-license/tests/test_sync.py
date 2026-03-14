import os
import tempfile

from sentinel_license.fingerprint_db import FingerprintDB, FingerprintRecord
from sentinel_license.sync_fingerprints import sync_pg_to_sqlite


def _make_pg_rows():
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

        db = FingerprintDB(db_path)
        db.insert(FingerprintRecord(
            hash="old_hash_12345678",
            source_url="https://old.example.com",
            package_name="old-pkg",
            ecosystem="npm",
        ))
        assert db.count() == 1
        db.close()

        rows = _make_pg_rows()
        count = sync_pg_to_sqlite(rows, db_path)
        assert count == 2

        db = FingerprintDB(db_path)
        assert db.count() == 2
        assert db.lookup("old_hash_12345678") is None
        db.close()


def test_sync_empty_rows():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "fingerprints.db")
        count = sync_pg_to_sqlite([], db_path)
        assert count == 0
        assert os.path.exists(db_path)
