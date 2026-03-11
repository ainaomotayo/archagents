"""Tests for runner retry with exponential backoff."""

from __future__ import annotations

import time

import pytest

from sentinel_agents.runner import _retry_with_backoff


class TestRetryWithBackoff:
    def test_succeeds_first_try(self) -> None:
        result = _retry_with_backoff(lambda: 42, max_retries=3, base_delay=0.01)
        assert result == 42

    def test_retries_on_failure(self) -> None:
        attempts = []

        def flakey():
            attempts.append(1)
            if len(attempts) < 3:
                raise RuntimeError("transient")
            return "ok"

        result = _retry_with_backoff(flakey, max_retries=3, base_delay=0.01)
        assert result == "ok"
        assert len(attempts) == 3

    def test_raises_after_max_retries(self) -> None:
        def always_fail():
            raise RuntimeError("permanent")

        with pytest.raises(RuntimeError, match="permanent"):
            _retry_with_backoff(always_fail, max_retries=2, base_delay=0.01)

    def test_exponential_backoff_timing(self) -> None:
        attempts = []
        times = []

        def fail_twice():
            times.append(time.monotonic())
            attempts.append(1)
            if len(attempts) <= 2:
                raise RuntimeError("fail")
            return "ok"

        result = _retry_with_backoff(fail_twice, max_retries=3, base_delay=0.05)
        assert result == "ok"
        assert len(times) == 3
        # First retry delay ~0.05s, second ~0.1s
        delay1 = times[1] - times[0]
        delay2 = times[2] - times[1]
        assert delay1 >= 0.04
        assert delay2 >= 0.08

    def test_passes_args(self) -> None:
        def add(a, b):
            return a + b

        result = _retry_with_backoff(add, 3, 4, max_retries=0, base_delay=0.01)
        assert result == 7
