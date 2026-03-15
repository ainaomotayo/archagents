"""Tests for call-graph builder."""
import ast
import textwrap

from sentinel_fv.call_graph import CallGraph, build_call_graph, get_neighbors


def _parse(code: str) -> ast.Module:
    return ast.parse(textwrap.dedent(code))


def test_simple_call():
    tree = _parse("""
        def a():
            b()

        def b():
            pass
    """)
    cg = build_call_graph(tree)
    assert "b" in cg.callees["a"]
    assert "a" in cg.callers["b"]


def test_no_calls():
    tree = _parse("""
        def a():
            pass

        def b():
            pass
    """)
    cg = build_call_graph(tree)
    assert cg.callees.get("a", set()) == set()
    assert cg.callees.get("b", set()) == set()


def test_multiple_calls():
    tree = _parse("""
        def a():
            b()
            c()

        def b():
            pass

        def c():
            pass
    """)
    cg = build_call_graph(tree)
    assert cg.callees["a"] == {"b", "c"}


def test_transitive_not_at_depth_1():
    tree = _parse("""
        def a():
            b()

        def b():
            c()

        def c():
            pass
    """)
    cg = build_call_graph(tree)
    neighbors = get_neighbors(cg, {"a"}, depth=1)
    assert "b" in neighbors
    assert "c" not in neighbors


def test_depth_2_transitive():
    tree = _parse("""
        def a():
            b()

        def b():
            c()

        def c():
            pass
    """)
    cg = build_call_graph(tree)
    neighbors = get_neighbors(cg, {"a"}, depth=2)
    assert "b" in neighbors
    assert "c" in neighbors


def test_callers_included():
    tree = _parse("""
        def a():
            b()

        def b():
            pass
    """)
    cg = build_call_graph(tree)
    # Starting from b, neighbors should include a (caller)
    neighbors = get_neighbors(cg, {"b"}, depth=1)
    assert "a" in neighbors


def test_self_recursion():
    tree = _parse("""
        def factorial(n):
            if n <= 1:
                return 1
            return n * factorial(n - 1)
    """)
    cg = build_call_graph(tree)
    assert "factorial" in cg.callees["factorial"]


def test_function_ranges():
    code = textwrap.dedent("""
        def foo():
            pass

        def bar():
            pass
    """).lstrip()
    tree = ast.parse(code)
    cg = build_call_graph(tree)
    assert "foo" in cg.function_ranges
    assert "bar" in cg.function_ranges
    foo_start, foo_end = cg.function_ranges["foo"]
    bar_start, bar_end = cg.function_ranges["bar"]
    assert foo_start >= 1
    assert foo_end >= foo_start
    assert bar_start > foo_end
