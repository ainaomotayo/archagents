"""MinHash signatures and Locality-Sensitive Hashing for fuzzy code similarity."""

from __future__ import annotations

import hashlib
import struct
from dataclasses import dataclass

_MAX_HASH = (1 << 32) - 1


@dataclass
class MinHashSignature:
    """A MinHash signature consisting of minimum hash values."""

    values: list[int]

    def similarity(self, other: MinHashSignature) -> float:
        """Estimated Jaccard similarity (count of matching values / total)."""
        if len(self.values) != len(other.values):
            raise ValueError("Signatures must have the same length")
        if not self.values:
            return 0.0
        matches = sum(a == b for a, b in zip(self.values, other.values))
        return matches / len(self.values)


def compute_minhash(tokens: set[str], num_hashes: int = 128) -> MinHashSignature:
    """Compute a MinHash signature for a set of tokens.

    For each of *num_hashes* hash functions (keyed by seed), compute the
    minimum hash value across all tokens.  Empty sets yield all-MAX values.
    """
    if not tokens:
        return MinHashSignature(values=[_MAX_HASH] * num_hashes)

    values: list[int] = []
    for seed in range(num_hashes):
        min_val = _MAX_HASH
        for token in tokens:
            h = hashlib.md5(
                f"{seed}:{token}".encode(), usedforsecurity=False
            ).digest()
            val = struct.unpack("<I", h[:4])[0]
            if val < min_val:
                min_val = val
        values.append(min_val)
    return MinHashSignature(values=values)


def jaccard_similarity(a: set[str], b: set[str]) -> float:
    """Exact Jaccard similarity between two sets."""
    union = a | b
    if not union:
        return 0.0
    return len(a & b) / len(union)


class LSHIndex:
    """Locality-Sensitive Hashing index for approximate nearest-neighbour queries."""

    def __init__(self, num_bands: int = 16, rows_per_band: int = 8) -> None:
        self.num_bands = num_bands
        self.rows_per_band = rows_per_band
        # Each band maps a bucket hash -> set of doc_ids
        self._buckets: list[dict[int, set[str]]] = [
            {} for _ in range(num_bands)
        ]

    def _band_hash(self, band_vals: list[int]) -> int:
        packed = struct.pack(f"<{len(band_vals)}I", *band_vals)
        h = hashlib.md5(packed, usedforsecurity=False).digest()
        return struct.unpack("<I", h[:4])[0]

    def insert(self, doc_id: str, sig: MinHashSignature) -> None:
        """Insert a document signature into the index."""
        for band_idx in range(self.num_bands):
            start = band_idx * self.rows_per_band
            end = start + self.rows_per_band
            band_vals = sig.values[start:end]
            bh = self._band_hash(band_vals)
            bucket = self._buckets[band_idx]
            if bh not in bucket:
                bucket[bh] = set()
            bucket[bh].add(doc_id)

    def query(self, sig: MinHashSignature) -> set[str]:
        """Return all doc_ids that share at least one band bucket with *sig*."""
        candidates: set[str] = set()
        for band_idx in range(self.num_bands):
            start = band_idx * self.rows_per_band
            end = start + self.rows_per_band
            band_vals = sig.values[start:end]
            bh = self._band_hash(band_vals)
            bucket = self._buckets[band_idx]
            if bh in bucket:
                candidates |= bucket[bh]
        return candidates
