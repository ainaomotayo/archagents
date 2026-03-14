"""Sync OSS fingerprints between PostgreSQL and local SQLite database.

Provides two directions:
- ``sync_pg_to_sqlite``: Pull from PG → atomic replace local SQLite (nightly cron)
- ``seed_pg_from_sqlite``: Push local seed DB → PG (initial population)
- CLI entry-point via ``python -m sentinel_license.sync_fingerprints``
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
        db = FingerprintDB(output_path)
        db.close()
        return 0

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

        for i in range(0, len(records), BATCH_SIZE):
            db.bulk_insert(records[i : i + BATCH_SIZE])

        db.close()
        os.replace(tmp_path, output_path)
        logger.info("Synced %d fingerprints to %s", len(records), output_path)
        return len(records)

    except Exception:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise


def seed_pg_from_sqlite(db_path: str) -> list[dict[str, Any]]:
    """Read the local SQLite seed DB and return rows suitable for PG bulk insert.

    Returns a list of dicts matching the OssFingerprint schema columns.
    The caller is responsible for inserting into PostgreSQL (e.g. via Prisma
    ``createMany`` or raw SQL ``COPY``).
    """
    db = FingerprintDB(db_path)
    rows = db._conn.execute("SELECT * FROM fingerprints").fetchall()
    result = []
    for row in rows:
        result.append({
            "hash": row["hash"],
            "source_url": row["source_url"],
            "package_name": row["package_name"],
            "package_version": row["package_version"],
            "ecosystem": row["ecosystem"],
            "spdx_license": row["spdx_license"],
            "file_path": row["file_path"],
            "line_start": row["line_start"],
            "line_end": row["line_end"],
        })
    db.close()
    logger.info("Read %d fingerprints from %s for PG seeding", len(result), db_path)
    return result


def cli_sync() -> None:
    """CLI entry point: fetch fingerprints from PG and write to local SQLite.

    Requires DATABASE_URL env var pointing to PostgreSQL.
    Usage: python -m sentinel_license.sync_fingerprints
    """
    import sys

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL environment variable is required", file=sys.stderr)
        sys.exit(1)

    from sentinel_license.fingerprint import _resolve_data_path
    output_path = _resolve_data_path("oss_fingerprints.db")

    try:
        import psycopg2
    except ImportError:
        print("ERROR: psycopg2 not installed. Install with: pip install psycopg2-binary", file=sys.stderr)
        sys.exit(1)

    conn = psycopg2.connect(db_url)
    conn.cursor().execute("SET search_path TO public")
    cur = conn.cursor()
    cur.execute(
        "SELECT hash, source_url, package_name, package_version, "
        "ecosystem, spdx_license, file_path, line_start, line_end "
        "FROM oss_fingerprints"
    )
    columns = [desc[0] for desc in cur.description]
    rows = [dict(zip(columns, row)) for row in cur.fetchall()]
    conn.close()

    count = sync_pg_to_sqlite(rows, output_path)
    print(f"Synced {count} fingerprints from PostgreSQL to {output_path}")


if __name__ == "__main__":
    cli_sync()
