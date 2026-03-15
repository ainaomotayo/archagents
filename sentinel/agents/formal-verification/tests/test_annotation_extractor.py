"""Tests for annotation extractor."""
import ast
import textwrap

from sentinel_fv.annotation_extractor import extract_annotations


def _parse(code: str) -> ast.Module:
    return ast.parse(textwrap.dedent(code))


def test_decorator_precondition():
    tree = _parse("""
        @precondition("x > 0")
        def foo(x):
            return x
    """)
    props = extract_annotations(tree, "foo.py")
    assert len(props) == 1
    assert props[0].kind == "precondition"
    assert props[0].expression == "x > 0"
    assert props[0].source == "annotated"
    assert props[0].confidence == "high"


def test_decorator_postcondition():
    tree = _parse("""
        @postcondition("result >= 0")
        def bar(x):
            return abs(x)
    """)
    props = extract_annotations(tree, "bar.py")
    assert len(props) == 1
    assert props[0].kind == "postcondition"
    assert props[0].expression == "result >= 0"


def test_docstring_requires_ensures():
    tree = _parse('''
        def baz(x, y):
            """Do something.

            :requires: x > 0
            :ensures: result != None
            """
            return x + y
    ''')
    props = extract_annotations(tree, "baz.py")
    kinds = {p.kind for p in props}
    assert "precondition" in kinds
    assert "postcondition" in kinds
    exprs = {p.expression for p in props}
    assert "x > 0" in exprs
    assert "result != None" in exprs


def test_docstring_only_mode():
    tree = _parse('''
        @precondition("x > 0")
        def foo(x):
            """
            :requires: x > 0
            """
            return x
    ''')
    props = extract_annotations(tree, "foo.py", style="docstring")
    # Should only get the docstring one
    assert len(props) == 1
    assert props[0].source == "annotated"


def test_decorator_only_mode():
    tree = _parse('''
        @precondition("x > 0")
        def foo(x):
            """
            :requires: x > 0
            """
            return x
    ''')
    props = extract_annotations(tree, "foo.py", style="decorator")
    assert len(props) == 1
    assert props[0].expression == "x > 0"


def test_invariant_decorator():
    tree = _parse("""
        @invariant("self.count >= 0")
        def update(self):
            self.count += 1
    """)
    props = extract_annotations(tree, "inv.py")
    assert len(props) == 1
    assert props[0].kind == "invariant"
    assert props[0].expression == "self.count >= 0"


def test_no_annotations():
    tree = _parse("""
        def plain(x):
            return x + 1
    """)
    props = extract_annotations(tree, "plain.py")
    assert props == []


def test_multiple_decorators():
    tree = _parse("""
        @precondition("x > 0")
        @precondition("x < 100")
        @postcondition("result > 0")
        def bounded(x):
            return x * 2
    """)
    props = extract_annotations(tree, "bounded.py")
    assert len(props) == 3
    pre = [p for p in props if p.kind == "precondition"]
    post = [p for p in props if p.kind == "postcondition"]
    assert len(pre) == 2
    assert len(post) == 1
