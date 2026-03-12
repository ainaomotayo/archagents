"""Sync OSS fingerprints from PostgreSQL rows to a local SQLite database."""
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
