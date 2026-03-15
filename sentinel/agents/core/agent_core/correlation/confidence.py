"""Adaptive confidence calibration based on historical accuracy."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

_CONFIDENCE_ORDER = ["low", "medium", "high"]
_REDIS_PREFIX = "sentinel.calibration"


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
    """Adjusts finding confidence based on agent's historical accuracy.

    Persists calibration data to Redis when a client is provided,
    with in-memory fallback for testing or standalone use.
    """

    def __init__(self, redis_client: Any = None) -> None:
        self._redis = redis_client
        # In-memory fallback: {agent_name:category -> CalibrationRecord}
        self._records: dict[str, CalibrationRecord] = {}

    def _key(self, agent_name: str, category: str = "") -> str:
        return f"{agent_name}:{category}" if category else agent_name

    def _redis_key(self, key: str) -> str:
        return f"{_REDIS_PREFIX}:{key}"

    def _load_record(self, key: str) -> CalibrationRecord:
        """Load record from Redis if available, otherwise in-memory."""
        if self._redis:
            try:
                raw = self._redis.get(self._redis_key(key))
                if raw:
                    data = json.loads(raw)
                    record = CalibrationRecord(
                        total=data.get("total", 0),
                        accurate=data.get("accurate", 0),
                    )
                    self._records[key] = record
                    return record
            except Exception:
                logger.debug("Redis read failed for calibration key %s", key)
        return self._records.get(key, CalibrationRecord())

    def _save_record(self, key: str, record: CalibrationRecord) -> None:
        """Persist record to Redis if available."""
        self._records[key] = record
        if self._redis:
            try:
                self._redis.set(
                    self._redis_key(key),
                    json.dumps({"total": record.total, "accurate": record.accurate}),
                )
            except Exception:
                logger.debug("Redis write failed for calibration key %s", key)

    def calibrate(
        self,
        finding: dict[str, Any],
        agent_name: str,
    ) -> dict[str, Any]:
        """Adjust finding confidence based on historical precision."""
        category = finding.get("category", "")
        key = self._key(agent_name, category)
        record = self._load_record(key)
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
        record = self._load_record(key)
        if record.total == 0 and record.accurate == 0 and key not in self._records:
            record = CalibrationRecord()
        record.total += 1
        if was_accurate:
            record.accurate += 1
        self._save_record(key, record)

    def get_precision(self, agent_name: str, category: str = "") -> float:
        """Get current precision for an agent/category."""
        key = self._key(agent_name, category)
        record = self._load_record(key)
        return record.precision
