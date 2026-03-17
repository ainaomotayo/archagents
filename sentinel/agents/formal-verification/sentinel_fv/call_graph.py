"""AST-based call-graph builder with neighbor resolution."""
from __future__ import annotations

import ast
from collections import deque
from dataclasses import dataclass, field


@dataclass
class CallGraph:
    callees: dict[str, set[str]] = field(default_factory=dict)
    callers: dict[str, set[str]] = field(default_factory=dict)
    function_ranges: dict[str, tuple[int, int]] = field(default_factory=dict)


def build_call_graph(tree: ast.Module) -> CallGraph:
    """Build a call graph from top-level function definitions in an AST module."""
    cg = CallGraph()

    # First pass: collect all defined function names and their ranges
    defined: set[str] = set()
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            defined.add(node.name)
            cg.function_ranges[node.name] = (
                node.lineno,
                node.end_lineno or node.lineno,
            )

    # Second pass: find calls within each function
    for node in ast.iter_child_nodes(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue

        func_name = node.name
        cg.callees.setdefault(func_name, set())

        for child in ast.walk(node):
            if not isinstance(child, ast.Call):
                continue
            callee_name = _get_call_name(child)
            if callee_name is None or callee_name not in defined:
                continue

            cg.callees[func_name].add(callee_name)
            cg.callers.setdefault(callee_name, set())
            cg.callers[callee_name].add(func_name)

    return cg


def _get_call_name(call: ast.Call) -> str | None:
    """Extract simple function name from a Call node."""
    if isinstance(call.func, ast.Name):
        return call.func.id
    return None


def get_neighbors(cg: CallGraph, changed_functions: set[str], depth: int = 1) -> set[str]:
    """BFS to find neighbors (callers + callees) up to given depth."""
    visited: set[str] = set()
    queue: deque[tuple[str, int]] = deque()

    for fn in changed_functions:
        queue.append((fn, 0))

    while queue:
        current, d = queue.popleft()
        if d >= depth:
            continue

        # Collect callees
        for callee in cg.callees.get(current, set()):
            if callee not in changed_functions and callee not in visited:
                visited.add(callee)
                queue.append((callee, d + 1))

        # Collect callers
        for caller in cg.callers.get(current, set()):
            if caller not in changed_functions and caller not in visited:
                visited.add(caller)
                queue.append((caller, d + 1))

    return visited
