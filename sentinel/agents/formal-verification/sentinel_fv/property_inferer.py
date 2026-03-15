"""Property inference from Python AST patterns."""
from __future__ import annotations

import ast

from sentinel_fv.types import Location, Property


def infer_properties(tree: ast.Module, filename: str) -> list[Property]:
    """Walk the AST and infer properties from common code patterns."""
    properties: list[Property] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            properties.extend(_infer_from_function(node, filename))

    return properties


def _infer_from_function(func: ast.FunctionDef | ast.AsyncFunctionDef, filename: str) -> list[Property]:
    props: list[Property] = []
    loc = Location(
        file=filename,
        line_start=func.lineno,
        line_end=func.end_lineno or func.lineno,
        function_name=func.name,
    )

    for node in ast.walk(func):
        # Pattern 1: if x is None: raise ...
        if isinstance(node, ast.If):
            prop = _check_none_guard(node, loc)
            if prop:
                props.append(prop)

            # Pattern 3: if not isinstance(x, T): raise ...
            prop = _check_isinstance_guard(node, loc)
            if prop:
                props.append(prop)

        # Pattern 2: assert EXPR
        if isinstance(node, ast.Assert):
            expr_str = ast.unparse(node.test)
            props.append(Property(
                kind="precondition",
                source="inferred",
                expression=expr_str,
                location=loc,
            ))

        # Pattern 4: Division by variable
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Div, ast.FloorDiv, ast.Mod)):
            divisor = node.right
            if isinstance(divisor, ast.Name):
                props.append(Property(
                    kind="precondition",
                    source="inferred",
                    expression=f"{divisor.id} != 0",
                    location=loc,
                ))

    # Pattern 5: Return type annotation (non-None)
    if func.returns is not None:
        ret_str = ast.unparse(func.returns)
        if ret_str != "None":
            props.append(Property(
                kind="postcondition",
                source="inferred",
                expression="result is not None",
                location=loc,
            ))

    return props


def _check_none_guard(node: ast.If, loc: Location) -> Property | None:
    """Detect `if x is None: raise`."""
    test = node.test
    if not isinstance(test, ast.Compare):
        return None
    if len(test.ops) != 1 or not isinstance(test.ops[0], ast.Is):
        return None
    if not isinstance(test.comparators[0], ast.Constant) or test.comparators[0].value is not None:
        return None
    if not isinstance(test.left, ast.Name):
        return None
    # Check body contains a Raise
    if not any(isinstance(stmt, ast.Raise) for stmt in node.body):
        return None

    var_name = test.left.id
    return Property(
        kind="precondition",
        source="inferred",
        expression=f"{var_name} is not None",
        location=loc,
    )


def _check_isinstance_guard(node: ast.If, loc: Location) -> Property | None:
    """Detect `if not isinstance(x, T): raise`."""
    test = node.test
    if not isinstance(test, ast.UnaryOp) or not isinstance(test.op, ast.Not):
        return None
    call = test.operand
    if not isinstance(call, ast.Call):
        return None
    if not (isinstance(call.func, ast.Name) and call.func.id == "isinstance"):
        return None
    if len(call.args) != 2:
        return None
    # Check body contains a Raise
    if not any(isinstance(stmt, ast.Raise) for stmt in node.body):
        return None

    expr_str = ast.unparse(call)
    return Property(
        kind="precondition",
        source="inferred",
        expression=expr_str,
        location=loc,
    )
