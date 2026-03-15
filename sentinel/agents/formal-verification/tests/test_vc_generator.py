"""Tests for VC generator translating properties to verification conditions."""
from __future__ import annotations

import ast

from sentinel_fv.types import Location, Property
from sentinel_fv.vc_generator import generate_vcs


def _loc(fn: str = "f") -> Location:
    return Location(file="test.py", line_start=1, line_end=5, function_name=fn)


def _parse(code: str) -> ast.Module:
    return ast.parse(code)


def test_precondition_vc():
    """A precondition property generates a VC with the expression as goal."""
    code = "def f(x):\n    if x is None:\n        raise ValueError\n    return x"
    tree = _parse(code)
    props = [
        Property(
            kind="precondition",
            source="inferred",
            expression="x is not None",
            location=_loc("f"),
        )
    ]
    vcs = generate_vcs(props, tree)
    assert len(vcs) == 1
    assert "x is not None" in vcs[0].goal


def test_postcondition_vc():
    """A postcondition property generates a VC with 'result' in goal."""
    code = "def f(x: int) -> int:\n    return x + 1"
    tree = _parse(code)
    props = [
        Property(
            kind="postcondition",
            source="inferred",
            expression="result is not None",
            location=_loc("f"),
        )
    ]
    vcs = generate_vcs(props, tree)
    assert len(vcs) == 1
    assert "result is not None" in vcs[0].goal


def test_multiple_properties():
    """Multiple properties generate multiple VCs."""
    code = "def f(x, y):\n    return x / y"
    tree = _parse(code)
    props = [
        Property(
            kind="precondition",
            source="inferred",
            expression="x is not None",
            location=_loc("f"),
        ),
        Property(
            kind="precondition",
            source="inferred",
            expression="y != 0",
            location=_loc("f"),
        ),
    ]
    vcs = generate_vcs(props, tree)
    assert len(vcs) == 2


def test_param_assumptions():
    """Type-annotated parameters produce assumptions."""
    code = "def f(x: int, y: int) -> int:\n    return x + y"
    tree = _parse(code)
    props = [
        Property(
            kind="postcondition",
            source="inferred",
            expression="result is not None",
            location=_loc("f"),
        )
    ]
    vcs = generate_vcs(props, tree)
    assert len(vcs) == 1
    # Should have assumptions from type annotations
    assumptions_text = " ".join(vcs[0].assumptions)
    assert "x" in assumptions_text or "int" in assumptions_text


def test_unknown_function_empty():
    """Properties referencing unknown functions produce no VCs."""
    code = "def g(x):\n    return x"
    tree = _parse(code)
    props = [
        Property(
            kind="precondition",
            source="inferred",
            expression="x is not None",
            location=_loc("nonexistent"),
        )
    ]
    vcs = generate_vcs(props, tree)
    assert vcs == []


def test_vc_has_timeout():
    """VCs have the specified timeout."""
    code = "def f(x):\n    return x"
    tree = _parse(code)
    props = [
        Property(
            kind="precondition",
            source="inferred",
            expression="x is not None",
            location=_loc("f"),
        )
    ]
    vcs = generate_vcs(props, tree, smt_timeout_ms=3000)
    assert len(vcs) == 1
    assert vcs[0].timeout_ms == 3000
