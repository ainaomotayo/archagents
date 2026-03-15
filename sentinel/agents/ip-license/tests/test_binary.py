"""Tests for binary format detection."""

from sentinel_license.fingerprint import detect_binary


class TestBinaryDetection:
    def test_elf_detection(self):
        content = b"\x7fELF\x02\x01\x01\x00" + b"\x00" * 100
        result = detect_binary(content)
        assert result is not None
        assert result.format == "ELF"

    def test_macho_64_detection(self):
        content = b"\xfe\xed\xfa\xcf" + b"\x00" * 100
        result = detect_binary(content)
        assert result is not None
        assert result.format == "MachO"

    def test_pe_detection(self):
        content = b"MZ" + b"\x00" * 100
        result = detect_binary(content)
        assert result is not None
        assert result.format == "PE"

    def test_jar_detection(self):
        content = b"PK\x03\x04" + b"\x00" * 100
        result = detect_binary(content)
        assert result is not None
        assert result.format == "JAR"

    def test_wasm_detection(self):
        content = b"\x00asm\x01\x00\x00\x00" + b"\x00" * 100
        result = detect_binary(content)
        assert result is not None
        assert result.format == "WASM"

    def test_unknown_bytes_returns_none(self):
        content = b"Hello, World!" + b"\x00" * 100
        result = detect_binary(content)
        assert result is None

    def test_empty_content_returns_none(self):
        result = detect_binary(b"")
        assert result is None
