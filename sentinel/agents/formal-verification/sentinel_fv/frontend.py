"""Language frontend protocol and Python implementation."""
from __future__ import annotations

import ast
import logging
from dataclasses import dataclass, field
from typing import Protocol

from sentinel_fv.annotation_extractor import extract_annotations
from sentinel_fv.call_graph import CallGraph, build_call_graph
from sentinel_fv.property_inferer import infer_properties
from sentinel_fv.types import Property, VerificationCondition
from sentinel_fv.vc_generator import generate_vcs

logger = logging.getLogger(__name__)


@dataclass
class AnalysisResult:
    properties: list[Property] = field(default_factory=list)
    vcs: list[VerificationCondition] = field(default_factory=list)
    call_graph: CallGraph = field(default_factory=CallGraph)
    changed_functions: set[str] = field(default_factory=set)


class LanguageFrontend(Protocol):
    def supports(self, filepath: str) -> bool: ...

    def analyze(
        self,
        filepath: str,
        source: str,
        changed_lines: set[int] | None = None,
        annotation_style: str = "both",
        smt_timeout_ms: int = 5000,
    ) -> AnalysisResult: ...


class PythonFrontend:
    """Frontend for Python source files."""

    def supports(self, filepath: str) -> bool:
        return filepath.endswith((".py", ".pyw"))

    def analyze(
        self,
        filepath: str,
        source: str,
        changed_lines: set[int] | None = None,
        annotation_style: str = "both",
        smt_timeout_ms: int = 5000,
    ) -> AnalysisResult:
        try:
            tree = ast.parse(source)
        except SyntaxError:
            logger.warning("Failed to parse %s", filepath)
            return AnalysisResult()

        call_graph = build_call_graph(tree)

        # Detect changed functions
        changed_functions: set[str] = set()
        if changed_lines:
            for func_name, (start, end) in call_graph.function_ranges.items():
                if any(start <= line <= end for line in changed_lines):
                    changed_functions.add(func_name)
        else:
            changed_functions = set(call_graph.function_ranges.keys())

        # Extract + merge properties
        annotated = extract_annotations(tree, filepath, style=annotation_style)
        inferred = infer_properties(tree, filepath)
        properties = _merge_properties(annotated, inferred)

        # Generate VCs
        vcs = generate_vcs(properties, tree, smt_timeout_ms=smt_timeout_ms)

        return AnalysisResult(
            properties=properties,
            vcs=vcs,
            call_graph=call_graph,
            changed_functions=changed_functions,
        )


def _merge_properties(
    annotated: list[Property], inferred: list[Property]
) -> list[Property]:
    """Merge annotated and inferred properties, preferring annotated."""
    annotated_keys = {(p.location.function_name, p.kind) for p in annotated}
    merged = list(annotated)
    for p in inferred:
        if (p.location.function_name, p.kind) not in annotated_keys:
            merged.append(p)
    return merged
