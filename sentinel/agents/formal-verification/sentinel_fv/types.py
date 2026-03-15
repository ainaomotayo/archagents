"""Core data types for the formal verification agent."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Location:
    file: str
    line_start: int
    line_end: int
    function_name: str


@dataclass
class Property:
    kind: str       # "precondition" | "postcondition" | "invariant" | "assertion"
    source: str     # "inferred" | "annotated"
    expression: str
    location: Location
    confidence: str = ""

    def __post_init__(self):
        if not self.confidence:
            self.confidence = "high" if self.source == "annotated" else "medium"


@dataclass
class VerificationCondition:
    property: Property
    assumptions: list[str] = field(default_factory=list)
    goal: str = ""
    timeout_ms: int = 5000


@dataclass
class Counterexample:
    variable_assignments: dict[str, str] = field(default_factory=dict)
    execution_path: list[str] = field(default_factory=list)

    def to_string(self) -> str:
        lines = []
        for var, val in self.variable_assignments.items():
            lines.append(f"  {var} = {val}")
        if self.execution_path:
            lines.append("  Path:")
            for step in self.execution_path:
                lines.append(f"    {step}")
        return "\n".join(lines)


@dataclass
class VerificationResult:
    status: str     # "verified" | "violated" | "undecided" | "timeout"
    stage: str      # "abstract_interp" | "smt"
    duration_ms: int = 0
    counterexample: Counterexample | None = None
