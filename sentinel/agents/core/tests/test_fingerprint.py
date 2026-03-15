"""Tests for AST-normalized code fingerprinting."""

import json
import tempfile
from pathlib import Path

import pytest

from agent_core.analysis.fingerprint import FingerprintDB, fingerprint_code


class TestFingerprinting:
    def test_same_code_same_fingerprint(self) -> None:
        code = "def add(a, b):\n    return a + b\n"
        fp1 = fingerprint_code(code, "python")
        fp2 = fingerprint_code(code, "python")
        assert fp1 == fp2

    def test_different_variable_names_same_fingerprint(self) -> None:
        code1 = "def add(a, b):\n    return a + b\n"
        code2 = "def sum(x, y):\n    return x + y\n"
        fp1 = fingerprint_code(code1, "python")
        fp2 = fingerprint_code(code2, "python")
        assert fp1 == fp2

    def test_different_logic_different_fingerprint(self) -> None:
        code1 = "def add(a, b):\n    return a + b\n"
        code2 = "def add(a, b):\n    return a * b\n"
        fp1 = fingerprint_code(code1, "python")
        fp2 = fingerprint_code(code2, "python")
        assert fp1 != fp2

    def test_different_string_literals_same_fingerprint(self) -> None:
        code1 = 'x = "hello"\n'
        code2 = 'x = "world"\n'
        fp1 = fingerprint_code(code1, "python")
        fp2 = fingerprint_code(code2, "python")
        assert fp1 == fp2

    def test_javascript_normalization(self) -> None:
        code1 = "function add(a, b) { return a + b; }\n"
        code2 = "function sum(x, y) { return x + y; }\n"
        fp1 = fingerprint_code(code1, "javascript")
        fp2 = fingerprint_code(code2, "javascript")
        assert fp1 == fp2

    def test_fingerprint_is_sha256_hex(self) -> None:
        fp = fingerprint_code("x = 1\n", "python")
        assert len(fp) == 64  # sha256 hex length
        assert all(c in "0123456789abcdef" for c in fp)


class TestFingerprintDB:
    def test_add_and_lookup(self) -> None:
        db = FingerprintDB()
        db.add("abc123", "lodash", "4.17.21")
        match = db.lookup("abc123")
        assert match is not None
        assert match.library == "lodash"
        assert match.version == "4.17.21"
        assert match.similarity == 1.0

    def test_lookup_miss(self) -> None:
        db = FingerprintDB()
        assert db.lookup("nonexistent") is None

    def test_len(self) -> None:
        db = FingerprintDB()
        assert len(db) == 0
        db.add("fp1", "lib1")
        db.add("fp2", "lib2")
        assert len(db) == 2

    def test_save_and_load(self) -> None:
        db = FingerprintDB()
        db.add("fp1", "react", "18.0.0")
        db.add("fp2", "vue", "3.0.0")

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
            path = f.name

        db.save(path)

        db2 = FingerprintDB()
        db2.load(path)
        assert len(db2) == 2
        match = db2.lookup("fp1")
        assert match is not None
        assert match.library == "react"
        Path(path).unlink()
