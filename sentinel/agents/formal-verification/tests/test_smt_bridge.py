"""Tests for the Z3 SMT bridge."""
from __future__ import annotations

import pytest

from sentinel_fv.smt_bridge import SMTBridge, vc_to_z3_check
from sentinel_fv.types import Location, Property, VerificationCondition


def _loc() -> Location:
    return Location(file="test.py", line_start=1, line_end=5, function_name="f")


def _vc(
    goal: str,
    assumptions: list[str] | None = None,
    timeout_ms: int = 5000,
) -> VerificationCondition:
    return VerificationCondition(
        property=Property(
            kind="assertion",
            source="inferred",
            expression=goal,
            location=_loc(),
        ),
        assumptions=assumptions or [],
        goal=goal,
        timeout_ms=timeout_ms,
    )


def test_proves_nonzero():
    """x > 5 implies x != 0."""
    vc = _vc("x != 0", assumptions=["x > 5"])
    result = vc_to_z3_check(vc)
    assert result.status == "verified"
    assert result.stage == "smt"


def test_finds_counterexample():
    """x >= 0 does NOT imply x > 0 (counterexample: x = 0)."""
    vc = _vc("x > 0", assumptions=["x >= 0"])
    result = vc_to_z3_check(vc)
    assert result.status == "violated"
    assert result.counterexample is not None
    assert "x" in result.counterexample.variable_assignments


def test_proves_bounds():
    """x >= 0 and x <= 100 implies x >= 0."""
    vc = _vc("x >= 0", assumptions=["x >= 0 and x <= 100"])
    result = vc_to_z3_check(vc)
    assert result.status == "verified"


def test_timeout_status():
    """Extremely short timeout should produce timeout or a result."""
    vc = _vc("x != 0", assumptions=["x > 5"], timeout_ms=1)
    result = vc_to_z3_check(vc)
    # With such a simple problem z3 may still solve it; accept either
    assert result.status in ("verified", "timeout")


def test_nonnull():
    """x != 0 with x == 5 should be verified."""
    vc = _vc("x != 0", assumptions=["x == 5"])
    result = vc_to_z3_check(vc)
    assert result.status == "verified"


@pytest.mark.asyncio
async def test_async_batch():
    """Batch verification of two VCs."""
    vc1 = _vc("x != 0", assumptions=["x > 5"])
    vc2 = _vc("x > 0", assumptions=["x >= 0"])
    bridge = SMTBridge(pool_size=2, timeout_ms=5000)
    try:
        results = await bridge.verify_batch([vc1, vc2])
        assert len(results) == 2
        assert results[0].status == "verified"
        assert results[1].status == "violated"
    finally:
        bridge.shutdown()


@pytest.mark.asyncio
async def test_empty_batch():
    """Empty batch returns empty list."""
    bridge = SMTBridge(pool_size=1, timeout_ms=5000)
    try:
        results = await bridge.verify_batch([])
        assert results == []
    finally:
        bridge.shutdown()
