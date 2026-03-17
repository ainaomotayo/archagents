"""Tests for core data types."""
from sentinel_fv.types import (
    Counterexample,
    Location,
    Property,
    VerificationCondition,
    VerificationResult,
)


def test_property_creation():
    loc = Location(file="foo.py", line_start=10, line_end=12, function_name="bar")
    prop = Property(
        kind="precondition",
        source="inferred",
        expression="x is not None",
        location=loc,
    )
    assert prop.kind == "precondition"
    assert prop.source == "inferred"
    assert prop.expression == "x is not None"
    assert prop.location.file == "foo.py"
    assert prop.confidence == "medium"


def test_annotated_confidence_default():
    loc = Location(file="a.py", line_start=1, line_end=1, function_name="f")
    prop = Property(
        kind="postcondition",
        source="annotated",
        expression="result > 0",
        location=loc,
    )
    assert prop.confidence == "high"


def test_vc_creation():
    loc = Location(file="a.py", line_start=1, line_end=5, function_name="g")
    prop = Property(
        kind="invariant",
        source="inferred",
        expression="i >= 0",
        location=loc,
    )
    vc = VerificationCondition(
        property=prop,
        assumptions=["i = 0", "n > 0"],
        goal="i >= 0",
        timeout_ms=3000,
    )
    assert vc.property is prop
    assert len(vc.assumptions) == 2
    assert vc.goal == "i >= 0"
    assert vc.timeout_ms == 3000


def test_verified_result():
    result = VerificationResult(status="verified", stage="smt", duration_ms=42)
    assert result.status == "verified"
    assert result.stage == "smt"
    assert result.duration_ms == 42
    assert result.counterexample is None


def test_violated_result_with_counterexample():
    ce = Counterexample(
        variable_assignments={"x": "0", "y": "-1"},
        execution_path=["line 3: if x == 0", "line 4: return y / x"],
    )
    result = VerificationResult(
        status="violated", stage="smt", duration_ms=100, counterexample=ce
    )
    assert result.status == "violated"
    assert result.counterexample is not None
    assert result.counterexample.variable_assignments["x"] == "0"
    assert len(result.counterexample.execution_path) == 2


def test_counterexample_to_string():
    ce = Counterexample(
        variable_assignments={"x": "0", "y": "-1"},
        execution_path=["line 3: branch taken", "line 4: division"],
    )
    text = ce.to_string()
    assert "x = 0" in text
    assert "y = -1" in text
    assert "Path:" in text
    assert "line 3: branch taken" in text
