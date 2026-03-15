"""Abstract interpretation with Interval and Nullness domains."""
from __future__ import annotations

import enum
import math
import re
import time
from dataclasses import dataclass

from sentinel_fv.types import Counterexample, VerificationCondition, VerificationResult


# ---------------------------------------------------------------------------
# Interval domain
# ---------------------------------------------------------------------------

@dataclass
class Interval:
    lo: float
    hi: float

    def contains(self, value: float) -> bool:
        return self.lo <= value <= self.hi

    def excludes(self, value: float) -> bool:
        return not self.contains(value)

    @classmethod
    def top(cls) -> Interval:
        return cls(lo=-math.inf, hi=math.inf)

    @classmethod
    def bottom(cls) -> Interval:
        return cls(lo=math.inf, hi=-math.inf)


class IntervalDomain:
    def join(self, a: Interval, b: Interval) -> Interval:
        return Interval(lo=min(a.lo, b.lo), hi=max(a.hi, b.hi))

    def meet(self, a: Interval, b: Interval) -> Interval:
        return Interval(lo=max(a.lo, b.lo), hi=min(a.hi, b.hi))

    def widen(self, a: Interval, b: Interval) -> Interval:
        lo = -math.inf if b.lo < a.lo else a.lo
        hi = math.inf if b.hi > a.hi else a.hi
        return Interval(lo=lo, hi=hi)


# ---------------------------------------------------------------------------
# Nullness domain
# ---------------------------------------------------------------------------

class Nullness(enum.Enum):
    NONNULL = "NONNULL"
    NULL = "NULL"
    MAYBE_NULL = "MAYBE_NULL"

    def may_be_null(self) -> bool:
        return self in (Nullness.NULL, Nullness.MAYBE_NULL)


class NullnessDomain:
    def join(self, a: Nullness, b: Nullness) -> Nullness:
        if a == b:
            return a
        return Nullness.MAYBE_NULL

    def meet(self, a: Nullness, b: Nullness) -> Nullness:
        if a == b:
            return a
        # If one is MAYBE_NULL, take the more specific
        if a == Nullness.MAYBE_NULL:
            return b
        if b == Nullness.MAYBE_NULL:
            return a
        # NONNULL meet NULL -> bottom (contradiction), return NONNULL as safe default
        return Nullness.NONNULL


# ---------------------------------------------------------------------------
# Abstract Interpreter
# ---------------------------------------------------------------------------

# Regex patterns
_NONNULL_GOAL = re.compile(r"(\w+)\s*(?:is not None|!= None)")
_BOUNDS_GOAL = re.compile(r"(-?\d+)\s*<=\s*(\w+)\s*<=\s*(-?\d+)")
_NONZERO_GOAL = re.compile(r"(\w+)\s*!=\s*0")

_NULLNESS_ASSUMPTION = re.compile(r"(\w+)\s*=\s*(NONNULL|NULL|MAYBE_NULL)")
_INTERVAL_ASSUMPTION = re.compile(r"(\w+)\s+in\s+\[(-?\d+),\s*(-?\d+)\]")


class AbstractInterpreter:
    """Lightweight abstract interpreter using Nullness and Interval domains."""

    def check(self, vc: VerificationCondition) -> VerificationResult:
        start = time.monotonic_ns()
        goal = vc.goal

        # Try nullness analysis first
        m = _NONNULL_GOAL.search(goal)
        if m:
            var = m.group(1)
            nullness = self._resolve_nullness(var, vc.assumptions)
            if nullness is not None:
                elapsed = (time.monotonic_ns() - start) // 1_000_000
                if not nullness.may_be_null():
                    return VerificationResult(
                        status="verified", stage="abstract_interp", duration_ms=elapsed
                    )
                else:
                    return VerificationResult(
                        status="violated",
                        stage="abstract_interp",
                        duration_ms=elapsed,
                        counterexample=Counterexample(
                            variable_assignments={var: "None"}
                        ),
                    )

        # Try interval / bounds analysis
        m = _BOUNDS_GOAL.search(goal)
        if m:
            lo_goal = int(m.group(1))
            var = m.group(2)
            hi_goal = int(m.group(3))
            interval = self._resolve_interval(var, vc.assumptions)
            if interval is not None:
                elapsed = (time.monotonic_ns() - start) // 1_000_000
                if interval.lo >= lo_goal and interval.hi <= hi_goal:
                    return VerificationResult(
                        status="verified", stage="abstract_interp", duration_ms=elapsed
                    )
                else:
                    return VerificationResult(
                        status="violated",
                        stage="abstract_interp",
                        duration_ms=elapsed,
                        counterexample=Counterexample(
                            variable_assignments={
                                var: str(interval.lo if interval.lo < lo_goal else interval.hi)
                            }
                        ),
                    )

        # Try nonzero analysis
        m = _NONZERO_GOAL.search(goal)
        if m:
            var = m.group(1)
            interval = self._resolve_interval(var, vc.assumptions)
            if interval is not None:
                elapsed = (time.monotonic_ns() - start) // 1_000_000
                if interval.excludes(0):
                    return VerificationResult(
                        status="verified", stage="abstract_interp", duration_ms=elapsed
                    )
                else:
                    return VerificationResult(
                        status="violated",
                        stage="abstract_interp",
                        duration_ms=elapsed,
                        counterexample=Counterexample(
                            variable_assignments={var: "0"}
                        ),
                    )

        # Undecided
        elapsed = (time.monotonic_ns() - start) // 1_000_000
        return VerificationResult(
            status="undecided", stage="abstract_interp", duration_ms=elapsed
        )

    def _resolve_nullness(self, var: str, assumptions: list[str]) -> Nullness | None:
        for assumption in assumptions:
            m = _NULLNESS_ASSUMPTION.search(assumption)
            if m and m.group(1) == var:
                return Nullness(m.group(2))
        return None

    def _resolve_interval(self, var: str, assumptions: list[str]) -> Interval | None:
        for assumption in assumptions:
            m = _INTERVAL_ASSUMPTION.search(assumption)
            if m and m.group(1) == var:
                return Interval(lo=float(m.group(2)), hi=float(m.group(3)))
        return None
