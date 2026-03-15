"""VC generator translating properties to verification conditions."""
from __future__ import annotations

import ast

from sentinel_fv.types import Property, VerificationCondition


def generate_vcs(
    properties: list[Property],
    tree: ast.Module,
    smt_timeout_ms: int = 5000,
) -> list[VerificationCondition]:
    """Generate verification conditions from properties and an AST.

    For each property, find the matching function in the AST,
    extract assumptions from type hints and early-return guards,
    and convert the property expression to a goal.
    """
    # Build function lookup: name -> FunctionDef
    func_lookup: dict[str, ast.FunctionDef | ast.AsyncFunctionDef] = {}
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            func_lookup[node.name] = node

    vcs: list[VerificationCondition] = []

    for prop in properties:
        func_name = prop.location.function_name
        func_node = func_lookup.get(func_name)
        if func_node is None:
            continue

        assumptions = _extract_assumptions(func_node)
        goal = prop.expression

        vc = VerificationCondition(
            property=prop,
            assumptions=assumptions,
            goal=goal,
            timeout_ms=smt_timeout_ms,
        )
        vcs.append(vc)

    return vcs


def _extract_assumptions(func: ast.FunctionDef | ast.AsyncFunctionDef) -> list[str]:
    """Extract assumptions from function signature and early guards."""
    assumptions: list[str] = []

    # From type annotations on parameters
    for arg in func.args.args:
        if arg.annotation is not None:
            type_str = ast.unparse(arg.annotation)
            assumptions.append(f"{arg.arg}: {type_str}")

    # From early-return guards (if x is None: raise / return)
    for stmt in func.body:
        if isinstance(stmt, ast.If):
            guard = _extract_guard_assumption(stmt)
            if guard:
                assumptions.append(guard)
        elif isinstance(stmt, ast.Assert):
            assumptions.append(ast.unparse(stmt.test))
        else:
            # Stop at first non-guard statement
            break

    return assumptions


def _extract_guard_assumption(node: ast.If) -> str | None:
    """Extract assumption from an early guard pattern.

    Patterns:
      - if x is None: raise -> assumption: x is not None (after guard)
      - if not isinstance(x, T): raise -> assumption: isinstance(x, T)
    """
    # Check body is raise/return (a guard)
    is_guard = any(isinstance(s, (ast.Raise, ast.Return)) for s in node.body)
    if not is_guard:
        return None

    test = node.test

    # Pattern: if x is None -> after guard, x is not None
    if isinstance(test, ast.Compare) and len(test.ops) == 1:
        if isinstance(test.ops[0], ast.Is):
            if isinstance(test.comparators[0], ast.Constant) and test.comparators[0].value is None:
                if isinstance(test.left, ast.Name):
                    return f"{test.left.id} = NONNULL"

    # Pattern: if not isinstance(x, T) -> after guard, isinstance(x, T)
    if isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not):
        call = test.operand
        if isinstance(call, ast.Call) and isinstance(call.func, ast.Name):
            if call.func.id == "isinstance":
                return ast.unparse(call)

    return None
