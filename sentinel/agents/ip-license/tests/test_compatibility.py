"""Tests for SPDX expression parsing and license compatibility matrix."""

from sentinel_license.spdx_detector import (
    CompatResult,
    SPDXExpression,
    check_compatibility,
    parse_spdx_expression,
)


class TestSPDXExpressionParsing:
    def test_single_license(self):
        result = parse_spdx_expression("MIT")
        assert result.licenses == ["MIT"]
        assert result.operator == "SINGLE"

    def test_and_expression(self):
        result = parse_spdx_expression("MIT AND Apache-2.0")
        assert result.licenses == ["MIT", "Apache-2.0"]
        assert result.operator == "AND"

    def test_or_expression(self):
        result = parse_spdx_expression("MIT OR Apache-2.0")
        assert result.licenses == ["MIT", "Apache-2.0"]
        assert result.operator == "OR"

    def test_with_expression(self):
        result = parse_spdx_expression("Apache-2.0 WITH LLVM-exception")
        assert result.licenses == ["Apache-2.0", "LLVM-exception"]
        assert result.operator == "WITH"

    def test_strips_parentheses(self):
        result = parse_spdx_expression("(MIT OR Apache-2.0)")
        assert result.licenses == ["MIT", "Apache-2.0"]
        assert result.operator == "OR"

    def test_empty_string(self):
        result = parse_spdx_expression("")
        assert result.licenses == []

    def test_preserves_raw(self):
        result = parse_spdx_expression("  MIT AND Apache-2.0  ")
        assert result.raw == "MIT AND Apache-2.0"


class TestLicenseCompatibility:
    def test_mit_apache_compatible(self):
        result = check_compatibility("MIT", "Apache-2.0")
        assert result.compatible is True
        assert result.risk == "none"

    def test_mit_gpl3_copyleft(self):
        result = check_compatibility("MIT", "GPL-3.0")
        assert result.compatible is True
        assert result.risk == "copyleft"

    def test_apache2_gpl2_conflict(self):
        result = check_compatibility("Apache-2.0", "GPL-2.0")
        assert result.compatible is False
        assert result.risk == "conflict"

    def test_gpl2_gpl3_conflict(self):
        result = check_compatibility("GPL-2.0", "GPL-3.0")
        assert result.compatible is False
        assert result.risk == "conflict"

    def test_gpl3_agpl3_copyleft(self):
        result = check_compatibility("GPL-3.0", "AGPL-3.0")
        assert result.compatible is True
        assert result.risk == "copyleft"

    def test_same_license_always_compatible(self):
        result = check_compatibility("MIT", "MIT")
        assert result.compatible is True
        assert result.risk == "none"

    def test_unknown_pair_returns_unknown_risk(self):
        result = check_compatibility("CustomLicense", "OtherLicense")
        assert result.risk == "unknown"

    def test_symmetric(self):
        r1 = check_compatibility("MIT", "GPL-3.0")
        r2 = check_compatibility("GPL-3.0", "MIT")
        assert r1.compatible == r2.compatible
        assert r1.risk == r2.risk

    def test_bsd_permissive_pair(self):
        result = check_compatibility("BSD-2-Clause", "BSD-3-Clause")
        assert result.compatible is True
        assert result.risk == "none"

    def test_mpl_gpl3_copyleft(self):
        result = check_compatibility("MPL-2.0", "GPL-3.0")
        assert result.compatible is True
        assert result.risk == "copyleft"
