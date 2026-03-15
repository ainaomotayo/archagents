"""Tests for MinHash/LSH fuzzy matching integration."""

import os
import tempfile

from sentinel_agents.types import DiffEvent, DiffFile, DiffHunk, ScanConfig
from sentinel_license.fingerprint_db import FingerprintDB, FingerprintRecord
from sentinel_license.minhash import compute_minhash


def _make_event(code: str, path: str = "file.py") -> DiffEvent:
    return DiffEvent(
        scan_id="scan_test",
        project_id="proj_1",
        commit_hash="abc",
        branch="main",
        author="dev@test.com",
        timestamp="2026-03-09T12:00:00Z",
        files=[
            DiffFile(
                path=path,
                language="python",
                hunks=[
                    DiffHunk(
                        old_start=1,
                        old_count=0,
                        new_start=1,
                        new_count=1,
                        content=code,
                    )
                ],
                ai_score=0.9,
            )
        ],
        scan_config=ScanConfig(
            security_level="standard",
            license_policy="MIT",
            quality_threshold=0.7,
        ),
    )


def test_tokenize_window_returns_set():
    """_tokenize_window returns a non-empty set of string n-grams."""
    from sentinel_license.fingerprint import _tokenize_window

    code = "def hello():\n    return 42\n"
    tokens = _tokenize_window(code, "python")
    assert isinstance(tokens, set)
    assert len(tokens) > 0
    # Each element should be a string
    for t in tokens:
        assert isinstance(t, str)


def test_fuzzy_match_finds_similar_code():
    """Store original code minhash, scan modified version, expect fuzzy match."""
    import sentinel_license.fingerprint as fp_mod
    from sentinel_license.fingerprint import (
        _tokenize_window,
        fingerprint_code,
        hash_fragment,
        normalize_code,
    )

    # Original code (12+ lines)
    original_code = """\
def calculate_total(items, tax_rate):
    subtotal = 0
    for item in items:
        price = item.get_price()
        quantity = item.get_quantity()
        subtotal += price * quantity
    tax_amount = subtotal * tax_rate
    discount = compute_discount(subtotal)
    total = subtotal + tax_amount - discount
    if total < 0:
        total = 0
    return total
"""

    # Modified version (one variable renamed: price -> cost, and cost * quantity)
    # This keeps most 3-grams the same, yielding high but sub-1.0 similarity
    modified_code = """\
def calculate_total(items, tax_rate):
    subtotal = 0
    for item in items:
        cost = item.get_price()
        quantity = item.get_quantity()
        subtotal += cost * quantity
    tax_amount = subtotal * tax_rate
    discount = compute_discount(subtotal)
    total = subtotal + tax_amount - discount
    if total < 0:
        total = 0
    return total
"""

    # Compute fingerprint for original code (first 10 lines window)
    original_lines = original_code.splitlines()[:10]
    original_window = "\n".join(original_lines)
    normalized = normalize_code(original_window)
    fprint = hash_fragment(normalized)

    # Compute minhash for original
    original_tokens = _tokenize_window(original_window, "python")
    original_sig = compute_minhash(original_tokens)

    # Create temp DB with original fingerprint + minhash
    original_db = fp_mod._fingerprint_db
    original_lsh_index = fp_mod._lsh_index
    original_lsh_records = fp_mod._lsh_records
    original_lsh_sigs = fp_mod._lsh_sigs

    with tempfile.TemporaryDirectory() as tmp:
        db_path = os.path.join(tmp, "test_fuzzy.db")
        test_db = FingerprintDB(db_path)
        record = FingerprintRecord(
            hash=fprint,
            source_url="https://github.com/example/calc-lib",
            package_name="calc-lib",
            ecosystem="pypi",
            spdx_license="GPL",
            package_version="1.0.0",
        )
        test_db.store_minhash(fprint, original_sig, record)

        # Load LSH index from DB
        from sentinel_license.minhash import LSHIndex

        lsh_index, lsh_records, lsh_sigs = test_db.load_lsh_index()

        # Monkey-patch the module
        fp_mod._fingerprint_db = test_db
        fp_mod._lsh_index = lsh_index
        fp_mod._lsh_records = lsh_records
        fp_mod._lsh_sigs = lsh_sigs

        try:
            # Build diff event with modified code
            lines = [f"+{line}" for line in modified_code.splitlines()]
            code = "\n".join(lines) + "\n"
            event = _make_event(code)

            findings = fingerprint_code(event)

            # Should find at least one fuzzy match
            fuzzy_findings = [
                f for f in findings if f.extra.get("matchType") == "fuzzy"
            ]
            assert len(fuzzy_findings) >= 1, (
                f"Expected fuzzy match, got findings: {findings}"
            )
            f = fuzzy_findings[0]
            assert f.extra["similarityScore"] >= 0.5
            assert f.extra["similarityScore"] < 1.0
            assert "calc-lib" in f.title
        finally:
            fp_mod._fingerprint_db = original_db
            fp_mod._lsh_index = original_lsh_index
            fp_mod._lsh_records = original_lsh_records
            fp_mod._lsh_sigs = original_lsh_sigs
            test_db.close()
