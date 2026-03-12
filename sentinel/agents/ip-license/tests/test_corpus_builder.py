"""Tests for the OSS corpus builder module."""

from __future__ import annotations

import os
import tempfile

import pytest

from sentinel_license.corpus_builder import (
    REGISTRY_URLS,
    RegistryPackage,
    build_corpus_for_package,
    fingerprint_source_file,
)
from sentinel_license.fingerprint_db import FingerprintDB


def test_fingerprint_source_file_python():
    """20-line Python merge_sort returns non-empty list of 16-char hex strings."""
    code = """\
def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    return merge(left, right)

def merge(left, right):
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    result.extend(left[i:])
    return result
"""
    fps = fingerprint_source_file(code, "python")
    assert len(fps) > 0
    for fp in fps:
        assert len(fp) == 16
        int(fp, 16)  # must be valid hex


def test_fingerprint_source_file_javascript():
    """12-line JS quickSort returns non-empty list."""
    code = """\
function quickSort(arr) {
    if (arr.length <= 1) return arr;
    const pivot = arr[0];
    const left = [];
    const right = [];
    for (let i = 1; i < arr.length; i++) {
        if (arr[i] < pivot) left.push(arr[i]);
        else right.push(arr[i]);
    }
    return [...quickSort(left), pivot, ...quickSort(right)];
}
module.exports = quickSort;
"""
    fps = fingerprint_source_file(code, "javascript")
    assert len(fps) > 0
    for fp in fps:
        assert len(fp) == 16
        int(fp, 16)


def test_fingerprint_deterministic():
    """Same input gives same output."""
    code = """\
def example():
    a = 1
    b = 2
    c = a + b
    d = c * 2
    e = d - 1
    f = e + 3
    g = f * 4
    h = g - 5
    i = h + 6
    return i
"""
    fps1 = fingerprint_source_file(code, "python")
    fps2 = fingerprint_source_file(code, "python")
    assert fps1 == fps2


def test_registry_urls_defined():
    """All 6 ecosystems present in REGISTRY_URLS."""
    expected = {"npm", "PyPI", "crates.io", "Maven", "RubyGems", "Go"}
    assert expected == set(REGISTRY_URLS.keys())


def test_build_corpus_for_package_local():
    """Create temp DB, RegistryPackage, code dict, returns count > 0 and DB has records."""
    code = """\
def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr

def selection_sort(arr):
    n = len(arr)
    for i in range(n):
        min_idx = i
        for j in range(i + 1, n):
            if arr[j] < arr[min_idx]:
                min_idx = j
        arr[i], arr[min_idx] = arr[min_idx], arr[i]
    return arr
"""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name

    try:
        db = FingerprintDB(db_path)
        pkg = RegistryPackage(
            name="sort-utils",
            version="1.0.0",
            ecosystem="PyPI",
            spdx_license="MIT",
            source_url="https://github.com/example/sort-utils",
        )
        source_files = {"sort_utils/sort.py": code}
        count = build_corpus_for_package(db, pkg, source_files)
        assert count > 0
        assert db.count() > 0
        db.close()
    finally:
        os.unlink(db_path)
