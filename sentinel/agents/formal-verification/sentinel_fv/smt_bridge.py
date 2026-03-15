"""Z3 SMT bridge with ProcessPoolExecutor parallel solving."""
from __future__ import annotations

import asyncio
import re
import time
from concurrent.futures import ProcessPoolExecutor
from typing import Any

import z3

from sentinel_fv.types import Counterexample, VerificationCondition, VerificationResult

# ---------------------------------------------------------------------------
# Regex helpers
# ---------------------------------------------------------------------------

_VAR_RE = re.compile(r"\b([a-zA-Z_]\w*)\b")
_CONSTRAINT_RE = re.compile(r"(\w+)\s*(>=|<=|!=|==|>|<)\s*(-?\d+(?:\.\d+)?)")
_KEYWORDS = frozenset({"and", "or", "not", "in", "is", "None", "True", "False"})

_OP_MAP = {
    ">=": lambda a, b: a >= b,
    "<=": lambda a, b: a <= b,
    ">": lambda a, b: a > b,
    "<": lambda a, b: a < b,
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
}


def _collect_vars(text: str) -> set[str]:
    """Extract variable names from text, excluding keywords and numeric literals."""
    names: set[str] = set()
    for m in _VAR_RE.finditer(text):
        name = m.group(1)
        if name not in _KEYWORDS and not name[0].isdigit():
            names.add(name)
    return names


def _parse_constraints(text: str, variables: dict[str, z3.ArithRef]) -> list[Any]:
    """Parse constraint text into Z3 expressions."""
    constraints: list[Any] = []
    # Split on 'and'
    parts = re.split(r"\s+and\s+", text)
    for part in parts:
        m = _CONSTRAINT_RE.search(part)
        if m:
            var_name = m.group(1)
            op_str = m.group(2)
            val = int(float(m.group(3)))
            if var_name in variables:
                op_fn = _OP_MAP[op_str]
                constraints.append(op_fn(variables[var_name], val))
    return constraints


def vc_to_z3_check(vc: VerificationCondition) -> VerificationResult:
    """Check a verification condition using Z3.

    Strategy: assert assumptions, negate goal, check for counterexample.
    - unsat   -> verified (no counterexample exists)
    - sat     -> violated (counterexample found)
    - unknown -> timeout
    """
    start = time.monotonic_ns()
    try:
        # Collect all variable names
        all_text = " ".join(vc.assumptions) + " " + vc.goal
        var_names = _collect_vars(all_text)

        # Create Z3 integer variables
        variables: dict[str, z3.ArithRef] = {}
        for name in var_names:
            variables[name] = z3.Int(name)

        solver = z3.Solver()
        solver.set("timeout", vc.timeout_ms)

        # Assert assumptions
        for assumption in vc.assumptions:
            for constraint in _parse_constraints(assumption, variables):
                solver.add(constraint)

        # Parse goal constraints and negate the conjunction
        goal_constraints = _parse_constraints(vc.goal, variables)
        if not goal_constraints:
            elapsed = (time.monotonic_ns() - start) // 1_000_000
            return VerificationResult(
                status="timeout", stage="smt", duration_ms=elapsed
            )

        # Negate the goal: if goal is conjunction, negation is disjunction of negations
        negated_goal = z3.Not(z3.And(*goal_constraints)) if len(goal_constraints) > 1 else z3.Not(goal_constraints[0])
        solver.add(negated_goal)

        check_result = solver.check()
        elapsed = (time.monotonic_ns() - start) // 1_000_000

        if check_result == z3.unsat:
            return VerificationResult(
                status="verified", stage="smt", duration_ms=elapsed
            )
        elif check_result == z3.sat:
            model = solver.model()
            assignments: dict[str, str] = {}
            for name, var in variables.items():
                val = model.evaluate(var, model_completion=True)
                assignments[name] = str(val)
            return VerificationResult(
                status="violated",
                stage="smt",
                duration_ms=elapsed,
                counterexample=Counterexample(variable_assignments=assignments),
            )
        else:
            return VerificationResult(
                status="timeout", stage="smt", duration_ms=elapsed
            )

    except Exception:
        elapsed = (time.monotonic_ns() - start) // 1_000_000
        return VerificationResult(
            status="timeout", stage="smt", duration_ms=elapsed
        )


def _check_vc_in_process(vc: VerificationCondition) -> VerificationResult:
    """Wrapper for use with ProcessPoolExecutor."""
    return vc_to_z3_check(vc)


class SMTBridge:
    """Manages parallel Z3 solving via ProcessPoolExecutor."""

    def __init__(self, pool_size: int = 4, timeout_ms: int = 5000) -> None:
        self._pool = ProcessPoolExecutor(max_workers=pool_size)
        self._timeout_ms = timeout_ms

    async def verify_batch(
        self, vcs: list[VerificationCondition]
    ) -> list[VerificationResult]:
        if not vcs:
            return []

        loop = asyncio.get_event_loop()
        futures = [
            loop.run_in_executor(self._pool, vc_to_z3_check, vc)
            for vc in vcs
        ]
        return list(await asyncio.gather(*futures))

    def shutdown(self) -> None:
        self._pool.shutdown(wait=False)
