"""Tests for property inference engine."""
import ast
import textwrap

from sentinel_fv.property_inferer import infer_properties


def _parse(code: str) -> ast.Module:
    return ast.parse(textwrap.dedent(code))


def test_none_check():
    tree = _parse("""
        def foo(x):
            if x is None:
                raise ValueError("x must not be None")
            return x + 1
    """)
    props = infer_properties(tree, "foo.py")
    exprs = [p.expression for p in props if p.kind == "precondition"]
    assert any("x is not None" in e for e in exprs)


def test_assert_bounds():
    tree = _parse("""
        def bar(n):
            assert n > 0
            return n * 2
    """)
    props = infer_properties(tree, "bar.py")
    exprs = [p.expression for p in props if p.kind == "precondition"]
    assert any("n > 0" in e for e in exprs)


def test_division_by_zero():
    tree = _parse("""
        def divide(a, b):
            return a / b
    """)
    props = infer_properties(tree, "divide.py")
    exprs = [p.expression for p in props if p.kind == "precondition"]
    assert any("!= 0" in e for e in exprs)


def test_return_type_not_none():
    tree = _parse("""
        def greet(name: str) -> str:
            return "hello " + name
    """)
    props = infer_properties(tree, "greet.py")
    postconds = [p for p in props if p.kind == "postcondition"]
    assert any("result is not None" in p.expression for p in postconds)


def test_isinstance_guard():
    tree = _parse("""
        def process(x):
            if not isinstance(x, int):
                raise TypeError("expected int")
            return x * 2
    """)
    props = infer_properties(tree, "process.py")
    exprs = [p.expression for p in props if p.kind == "precondition"]
    assert any("isinstance(x, int)" in e for e in exprs)


def test_empty_function():
    tree = _parse("""
        def noop():
            pass
    """)
    props = infer_properties(tree, "noop.py")
    assert props == []


def test_multiple_functions():
    tree = _parse("""
        def f(x):
            assert x > 0
            return x

        def g(y):
            if y is None:
                raise ValueError
            return y
    """)
    props = infer_properties(tree, "multi.py")
    funcs = {p.location.function_name for p in props}
    assert "f" in funcs
    assert "g" in funcs


def test_location_lines():
    code = textwrap.dedent("""
        def foo(x):
            assert x > 0
            return x
    """).lstrip()
    tree = ast.parse(code)
    props = infer_properties(tree, "loc.py")
    assert len(props) >= 1
    for p in props:
        assert p.location.file == "loc.py"
        assert p.location.line_start >= 1
        assert p.location.line_end >= p.location.line_start
        assert p.location.function_name == "foo"
