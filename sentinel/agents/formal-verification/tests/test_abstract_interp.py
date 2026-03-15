"""Tests for abstract interpretation with Interval and Nullness domains."""
from __future__ import annotations

import math

from sentinel_fv.abstract_interp import (
    AbstractInterpreter,
    Interval,
    IntervalDomain,
    Nullness,
    NullnessDomain,
)
from sentinel_fv.types import Location, Property, VerificationCondition


def _loc() -> Location:
    return Location(file="test.py", line_start=1, line_end=5, function_name="f")


def _vc(goal: str, assumptions: list[str] | None = None) -> VerificationCondition:
    return VerificationCondition(
        property=Property(
            kind="assertion",
            source="inferred",
            expression=goal,
            location=_loc(),
        ),
        assumptions=assumptions or [],
        goal=goal,
    )


# --- Interval tests ---


def test_interval_join():
    d = IntervalDomain()
    a = Interval(lo=0, hi=5)
    b = Interval(lo=3, hi=10)
    result = d.join(a, b)
    assert result.lo == 0
    assert result.hi == 10


def test_interval_meet():
    d = IntervalDomain()
    a = Interval(lo=0, hi=5)
    b = Interval(lo=3, hi=10)
    result = d.meet(a, b)
    assert result.lo == 3
    assert result.hi == 5


def test_interval_widen():
    d = IntervalDomain()
    a = Interval(lo=0, hi=5)
    b = Interval(lo=-1, hi=7)
    result = d.widen(a, b)
    # Widening: if b.lo < a.lo -> -inf, if b.hi > a.hi -> +inf
    assert result.lo == -math.inf
    assert result.hi == math.inf


def test_interval_contains():
    iv = Interval(lo=0, hi=10)
    assert iv.contains(5)
    assert iv.contains(0)
    assert iv.contains(10)
    assert not iv.contains(-1)
    assert not iv.contains(11)


# --- Nullness tests ---


def test_nullness_nonnull():
    assert not Nullness.NONNULL.may_be_null()


def test_nullness_null():
    assert Nullness.NULL.may_be_null()


def test_nullness_maybe_null():
    assert Nullness.MAYBE_NULL.may_be_null()


def test_nullness_join():
    d = NullnessDomain()
    assert d.join(Nullness.NONNULL, Nullness.NONNULL) == Nullness.NONNULL
    assert d.join(Nullness.NONNULL, Nullness.NULL) == Nullness.MAYBE_NULL
    assert d.join(Nullness.NULL, Nullness.NULL) == Nullness.NULL


# --- AbstractInterpreter tests ---


def test_ai_verifies_nonnull():
    vc = _vc("x is not None", assumptions=["x = NONNULL"])
    ai = AbstractInterpreter()
    result = ai.check(vc)
    assert result.status == "verified"


def test_ai_detects_null_violation():
    vc = _vc("x is not None", assumptions=["x = NULL"])
    ai = AbstractInterpreter()
    result = ai.check(vc)
    assert result.status == "violated"


def test_ai_verifies_bounds():
    vc = _vc("0 <= x <= 100", assumptions=["x in [0, 100]"])
    ai = AbstractInterpreter()
    result = ai.check(vc)
    assert result.status == "verified"


def test_ai_undecided_for_complex():
    vc = _vc("f(x) > g(y)", assumptions=["x > 0"])
    ai = AbstractInterpreter()
    result = ai.check(vc)
    assert result.status == "undecided"


def test_ai_stage_is_abstract_interp():
    vc = _vc("x is not None", assumptions=["x = NONNULL"])
    ai = AbstractInterpreter()
    result = ai.check(vc)
    assert result.stage == "abstract_interp"
