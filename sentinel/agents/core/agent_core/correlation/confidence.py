"""Adaptive confidence calibration based on historical accuracy."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

_CONFIDENCE_ORDER = ["low", "medium", "high"]


@dataclass
class CalibrationRecord:
    total: int = 0
    accurate: int = 0

    @property
    def precision(self) -> float:
        if self.total == 0:
            return 0.5  # cold start: assume 50%
        return self.accurate / self.total


class ConfidenceCalibrator:
    """Adjusts finding confidence based on agent's historical accuracy."""

    def __init__(self, redis_client: Any = None) -> None:
        self._redis = redis_client
        # In-memory fallback: {agent_name:category -> CalibrationRecord}
        self._records: dict[str, CalibrationRecord] = {}

    def _key(self, agent_name: str, category: str = "") -> str:
        return f"{agent_name}:{category}" if category else agent_name

    def calibrate(
        self,
        finding: dict[str, Any],
        agent_name: str,
    ) -> dict[str, Any]:
        """Adjust finding confidence based on historical precision."""
        category = finding.get("category", "")
        key = self._key(agent_name, category)
        record = self._records.get(key, CalibrationRecord())
        precision = record.precision

        current_conf = finding.get("confidence", "medium").lower()
        idx = (
            _CONFIDENCE_ORDER.index(current_conf)
            if current_conf in _CONFIDENCE_ORDER
            else 1
        )

        # Adjust: high precision -> boost, low precision -> degrade
        if precision >= 0.8:
            idx = min(idx + 1, len(_CONFIDENCE_ORDER) - 1)
        elif precision < 0.3 and record.total >= 5:
            idx = max(idx - 1, 0)

        result = dict(finding)
        result["confidence"] = _CONFIDENCE_ORDER[idx]
        result["calibrated"] = True
        result["agent_precision"] = round(precision, 3)
        return result

    def record_feedback(
        self,
        agent_name: str,
        category: str,
        was_accurate: bool,
    ) -> None:
        """Record whether a finding was confirmed or dismissed."""
        key = self._key(agent_name, category)
        if key not in self._records:
            self._records[key] = CalibrationRecord()
        self._records[key].total += 1
        if was_accurate:
            self._records[key].accurate += 1

    def get_precision(self, agent_name: str, category: str = "") -> float:
        """Get current precision for an agent/category."""
        key = self._key(agent_name, category)
        record = self._records.get(key, CalibrationRecord())
        return record.precision
