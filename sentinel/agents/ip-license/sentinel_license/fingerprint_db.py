"""SQLite-backed fingerprint database for OSS code detection.

Replaces the legacy JSON file approach with a proper database that supports
efficient lookups, bulk inserts, and package-based searching.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import struct
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class FingerprintRecord:
    """A single fingerprint entry mapping a code hash to its OSS origin."""

    hash: str
    source_url: str
    package_name: str
    ecosystem: str
    spdx_license: Optional[str] = None
    package_version: Optional[str] = None
    file_path: Optional[str] = None
    line_start: Optional[int] = None
    line_end: Optional[int] = None


_SCHEMA = """\
CREATE TABLE IF NOT EXISTS fingerprints (
    hash TEXT PRIMARY KEY,
    source_url TEXT NOT NULL,
    package_name TEXT NOT NULL,
    package_version TEXT,
    ecosystem TEXT NOT NULL,
    spdx_license TEXT,
    file_path TEXT,
    line_start INTEGER,
    line_end INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fp_package ON fingerprints(package_name, ecosystem);
CREATE INDEX IF NOT EXISTS idx_fp_license ON fingerprints(spdx_license);
CREATE TABLE IF NOT EXISTS minhash_signatures (
    hash TEXT PRIMARY KEY REFERENCES fingerprints(hash),
    signature BLOB NOT NULL
);
"""

_INSERT_SQL = """\
INSERT OR REPLACE INTO fingerprints
    (hash, source_url, package_name, package_version, ecosystem,
     spdx_license, file_path, line_start, line_end)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
"""


def _record_to_tuple(rec: FingerprintRecord) -> tuple:
    return (
        rec.hash,
        rec.source_url,
        rec.package_name,
        rec.package_version,
        rec.ecosystem,
        rec.spdx_license,
        rec.file_path,
        rec.line_start,
        rec.line_end,
    )


def _row_to_record(row: sqlite3.Row) -> FingerprintRecord:
    return FingerprintRecord(
        hash=row["hash"],
        source_url=row["source_url"],
        package_name=row["package_name"],
        ecosystem=row["ecosystem"],
        spdx_license=row["spdx_license"],
        package_version=row["package_version"],
        file_path=row["file_path"],
        line_start=row["line_start"],
        line_end=row["line_end"],
    )


class FingerprintDB:
    """SQLite-backed fingerprint database."""

    def __init__(self, db_path: str) -> None:
        self._conn = sqlite3.connect(db_path)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)

    def __enter__(self) -> FingerprintDB:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:  # noqa: ANN001
        self.close()

    def close(self) -> None:
        """Close the database connection."""
        self._conn.close()

    def insert(self, record: FingerprintRecord) -> None:
        """Insert or replace a single fingerprint record."""
        self._conn.execute(_INSERT_SQL, _record_to_tuple(record))
        self._conn.commit()

    def bulk_insert(self, records: list[FingerprintRecord]) -> None:
        """Insert multiple records in a single transaction."""
        self._conn.executemany(
            _INSERT_SQL, (_record_to_tuple(r) for r in records)
        )
        self._conn.commit()

    def lookup(self, hash_val: str) -> FingerprintRecord | None:
        """Look up a fingerprint by exact hash. Returns None if not found."""
        cur = self._conn.execute(
            "SELECT * FROM fingerprints WHERE hash = ?", (hash_val,)
        )
        row = cur.fetchone()
        return _row_to_record(row) if row else None

    def search_by_package(
        self, name: str, ecosystem: str
    ) -> list[FingerprintRecord]:
        """Search for fingerprints by package name and ecosystem."""
        cur = self._conn.execute(
            "SELECT * FROM fingerprints WHERE package_name = ? AND ecosystem = ?",
            (name, ecosystem),
        )
        return [_row_to_record(row) for row in cur.fetchall()]

    def count(self) -> int:
        """Return the total number of fingerprint records."""
        cur = self._conn.execute("SELECT COUNT(*) FROM fingerprints")
        return cur.fetchone()[0]

    def store_minhash(
        self,
        hash_val: str,
        sig: "MinHashSignature",
        record: FingerprintRecord,
    ) -> None:
        """Insert a fingerprint record AND its minhash signature."""
        from sentinel_license.minhash import MinHashSignature  # noqa: F811

        self._conn.execute(_INSERT_SQL, _record_to_tuple(record))
        blob = struct.pack(f"<{len(sig.values)}I", *sig.values)
        self._conn.execute(
            "INSERT OR REPLACE INTO minhash_signatures (hash, signature) VALUES (?, ?)",
            (hash_val, blob),
        )
        self._conn.commit()

    def load_lsh_index(
        self,
    ) -> tuple["LSHIndex", dict[str, FingerprintRecord], dict[str, "MinHashSignature"]]:
        """Load all minhash signatures, build an LSH index.

        Returns (LSHIndex, hash->FingerprintRecord, hash->MinHashSignature).
        """
        from sentinel_license.minhash import LSHIndex, MinHashSignature

        index = LSHIndex()
        records: dict[str, FingerprintRecord] = {}
        sigs: dict[str, MinHashSignature] = {}

        cur = self._conn.execute(
            "SELECT m.hash, m.signature, f.* "
            "FROM minhash_signatures m JOIN fingerprints f ON m.hash = f.hash"
        )
        for row in cur.fetchall():
            blob = row["signature"]
            num_values = len(blob) // 4
            values = list(struct.unpack(f"<{num_values}I", blob))
            sig = MinHashSignature(values=values)
            doc_id = row["hash"]
            records[doc_id] = _row_to_record(row)
            sigs[doc_id] = sig
            index.insert(doc_id, sig)

        return index, records, sigs

    def import_legacy_json(self, json_path: str) -> int:
        """Import fingerprints from legacy JSON format.

        Legacy format: {"fingerprints": {"hash": ["source_url", "license"], ...}}

        Returns the number of records imported.
        """
        with open(json_path, encoding="utf-8") as f:
            raw = json.load(f)

        entries = raw.get("fingerprints", {})
        records = []
        for hash_val, value in entries.items():
            try:
                source_url, license_id = value
            except (ValueError, TypeError):
                logger.warning("Skipping malformed entry %s: %r", hash_val, value)
                continue
            # Extract package name from source URL (last path segment)
            package_name = source_url.rstrip("/").rsplit("/", 1)[-1]
            # Guess ecosystem from URL
            ecosystem = "unknown"
            if "github.com" in source_url or "gitlab.com" in source_url:
                ecosystem = "github"

            records.append(
                FingerprintRecord(
                    hash=hash_val,
                    source_url=source_url,
                    package_name=package_name,
                    ecosystem=ecosystem,
                    spdx_license=license_id,
                )
            )

        self.bulk_insert(records)
        return len(records)
