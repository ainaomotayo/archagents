"""Annotation extractor for decorators and docstrings."""
from __future__ import annotations

import ast
import re

from sentinel_fv.types import Location, Property

_DECORATOR_KINDS = {"precondition", "postcondition", "invariant"}
_REQUIRES_RE = re.compile(r":requires:\s*(.+)")
_ENSURES_RE = re.compile(r":ensures:\s*(.+)")


def extract_annotations(
    tree: ast.Module, filename: str, style: str = "both"
) -> list[Property]:
    """Extract annotated properties from decorators and/or docstrings.

    Args:
        tree: Parsed AST module.
        filename: Source file path.
        style: "decorator", "docstring", or "both".
    """
    properties: list[Property] = []

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue

        loc = Location(
            file=filename,
            line_start=node.lineno,
            line_end=node.end_lineno or node.lineno,
            function_name=node.name,
        )

        if style in ("decorator", "both"):
            properties.extend(_extract_decorators(node, loc))

        if style in ("docstring", "both"):
            properties.extend(_extract_docstring(node, loc))

    return properties


def _extract_decorators(
    func: ast.FunctionDef | ast.AsyncFunctionDef, loc: Location
) -> list[Property]:
    props: list[Property] = []
    for dec in func.decorator_list:
        if not isinstance(dec, ast.Call):
            continue
        if not isinstance(dec.func, ast.Name):
            continue
        kind = dec.func.id
        if kind not in _DECORATOR_KINDS:
            continue
        if not dec.args:
            continue
        arg = dec.args[0]
        if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
            props.append(Property(
                kind=kind,
                source="annotated",
                expression=arg.value,
                location=loc,
            ))
    return props


def _extract_docstring(
    func: ast.FunctionDef | ast.AsyncFunctionDef, loc: Location
) -> list[Property]:
    props: list[Property] = []
    docstring = ast.get_docstring(func)
    if not docstring:
        return props

    for match in _REQUIRES_RE.finditer(docstring):
        props.append(Property(
            kind="precondition",
            source="annotated",
            expression=match.group(1).strip(),
            location=loc,
        ))

    for match in _ENSURES_RE.finditer(docstring):
        props.append(Property(
            kind="postcondition",
            source="annotated",
            expression=match.group(1).strip(),
            location=loc,
        ))

    return props
