"""Tests for adaptive confidence calibration."""

import pytest

from agent_core.correlation.confidence import CalibrationRecord, ConfidenceCalibrator


class TestCalibrationRecord:
    def test_cold_start_precision(self) -> None:
        record = CalibrationRecord()
        assert record.precision == 0.5

    def test_perfect_precision(self) -> None:
        record = CalibrationRecord(total=10, accurate=10)
        assert record.precision == 1.0

    def test_mixed_precision(self) -> None:
        record = CalibrationRecord(total=10, accurate=7)
        assert record.precision == 0.7


class TestConfidenceCalibrator:
    def test_cold_start_no_change(self) -> None:
        cal = ConfidenceCalibrator()
        finding = {"confidence": "medium", "category": "sql-injection"}
        result = cal.calibrate(finding, "security")
        # Cold start (50%) -> no change
        assert result["confidence"] == "medium"
        assert result["calibrated"] is True

    def test_high_precision_boosts(self) -> None:
        cal = ConfidenceCalibrator()
        # Build up high precision
        for _ in range(10):
            cal.record_feedback("security", "sql-injection", was_accurate=True)

        finding = {"confidence": "medium", "category": "sql-injection"}
        result = cal.calibrate(finding, "security")
        assert result["confidence"] == "high"

    def test_low_precision_degrades(self) -> None:
        cal = ConfidenceCalibrator()
        # Build up low precision (many false positives)
        for _ in range(8):
            cal.record_feedback("ai-detector", "ai-generated", was_accurate=False)
        for _ in range(2):
            cal.record_feedback("ai-detector", "ai-generated", was_accurate=True)

        finding = {"confidence": "medium", "category": "ai-generated"}
        result = cal.calibrate(finding, "ai-detector")
        assert result["confidence"] == "low"

    def test_low_precision_needs_minimum_samples(self) -> None:
        cal = ConfidenceCalibrator()
        # Only 3 samples (below threshold of 5)
        for _ in range(3):
            cal.record_feedback("agent", "cat", was_accurate=False)

        finding = {"confidence": "medium", "category": "cat"}
        result = cal.calibrate(finding, "agent")
        # Not enough samples to degrade
        assert result["confidence"] == "medium"

    def test_already_high_stays_high(self) -> None:
        cal = ConfidenceCalibrator()
        for _ in range(10):
            cal.record_feedback("security", "", was_accurate=True)

        finding = {"confidence": "high", "category": ""}
        result = cal.calibrate(finding, "security")
        assert result["confidence"] == "high"  # can't go above high

    def test_already_low_stays_low(self) -> None:
        cal = ConfidenceCalibrator()
        for _ in range(10):
            cal.record_feedback("agent", "", was_accurate=False)

        finding = {"confidence": "low", "category": ""}
        result = cal.calibrate(finding, "agent")
        assert result["confidence"] == "low"

    def test_get_precision(self) -> None:
        cal = ConfidenceCalibrator()
        assert cal.get_precision("agent") == 0.5  # cold start
        cal.record_feedback("agent", "", was_accurate=True)
        cal.record_feedback("agent", "", was_accurate=False)
        assert cal.get_precision("agent") == 0.5

    def test_precision_per_category(self) -> None:
        cal = ConfidenceCalibrator()
        cal.record_feedback("security", "sqli", was_accurate=True)
        cal.record_feedback("security", "sqli", was_accurate=True)
        cal.record_feedback("security", "xss", was_accurate=False)

        assert cal.get_precision("security", "sqli") == 1.0
        assert cal.get_precision("security", "xss") == 0.0

    def test_agent_precision_in_result(self) -> None:
        cal = ConfidenceCalibrator()
        cal.record_feedback("sec", "cat", was_accurate=True)
        finding = {"confidence": "medium", "category": "cat"}
        result = cal.calibrate(finding, "sec")
        assert "agent_precision" in result
        assert result["agent_precision"] == 1.0
