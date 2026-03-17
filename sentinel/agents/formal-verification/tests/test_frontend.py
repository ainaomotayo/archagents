"""Tests for the LanguageFrontend protocol and PythonFrontend implementation."""
from sentinel_fv.frontend import PythonFrontend


def _frontend():
    return PythonFrontend()


# ---- supports ----

def test_supports_python():
    fe = _frontend()
    assert fe.supports("src/app.py") is True
    assert fe.supports("script.pyw") is True


def test_supports_rejects_non_python():
    fe = _frontend()
    assert fe.supports("main.rs") is False
    assert fe.supports("index.js") is False
    assert fe.supports("lib.go") is False
    assert fe.supports("file.txt") is False


# ---- analyze ----

_DIVISION_SOURCE = """\
def divide(a, b):
    return a / b
"""

_ANNOTATED_SOURCE = """\
def add(x: int, y: int) -> int:
    \"\"\"
    :ensures: result is not None
    \"\"\"
    return x + y
"""

_TWO_FUNCS = """\
def foo():
    pass

def bar():
    foo()
"""


def test_parse_and_extract():
    """Parsing source with division infers a division-by-zero precondition."""
    fe = _frontend()
    result = fe.analyze("math.py", _DIVISION_SOURCE)
    assert len(result.properties) > 0
    kinds = {p.kind for p in result.properties}
    assert "precondition" in kinds
    # Should find the b != 0 property
    exprs = {p.expression for p in result.properties}
    assert "b != 0" in exprs


def test_parse_with_annotations():
    """Annotations are extracted and present in properties."""
    fe = _frontend()
    result = fe.analyze("utils.py", _ANNOTATED_SOURCE)
    annotated = [p for p in result.properties if p.source == "annotated"]
    assert len(annotated) >= 1
    assert any("result is not None" in p.expression for p in annotated)


def test_annotations_override_inferred():
    """When annotation covers same (function, kind), inferred is dropped."""
    source = """\
def compute(x: int) -> int:
    \"\"\"
    :ensures: result is not None
    \"\"\"
    return x * 2
"""
    fe = _frontend()
    result = fe.analyze("comp.py", source)
    # Should have annotated postcondition but not inferred postcondition
    postconditions = [p for p in result.properties if p.kind == "postcondition"]
    assert len(postconditions) == 1
    assert postconditions[0].source == "annotated"


def test_call_graph_built():
    """Call graph contains function ranges and edges."""
    fe = _frontend()
    result = fe.analyze("module.py", _TWO_FUNCS)
    assert "foo" in result.call_graph.function_ranges
    assert "bar" in result.call_graph.function_ranges
    # bar calls foo
    assert "foo" in result.call_graph.callees.get("bar", set())


def test_vcs_generated():
    """VCs are generated for inferred properties."""
    fe = _frontend()
    result = fe.analyze("math.py", _DIVISION_SOURCE)
    assert len(result.vcs) > 0
    goals = {vc.goal for vc in result.vcs}
    assert "b != 0" in goals


def test_changed_functions_from_lines():
    """When changed_lines is provided, only overlapping functions are marked."""
    fe = _frontend()
    # foo is lines 1-2, bar is lines 4-5
    result = fe.analyze("module.py", _TWO_FUNCS, changed_lines={4, 5})
    assert "bar" in result.changed_functions
    assert "foo" not in result.changed_functions


def test_changed_functions_all_when_none():
    """When changed_lines is None, all functions are marked changed."""
    fe = _frontend()
    result = fe.analyze("module.py", _TWO_FUNCS, changed_lines=None)
    assert "foo" in result.changed_functions
    assert "bar" in result.changed_functions


def test_syntax_error_empty():
    """Syntax errors produce an empty AnalysisResult."""
    fe = _frontend()
    result = fe.analyze("bad.py", "def broken(:")
    assert result.properties == []
    assert result.vcs == []
    assert result.changed_functions == set()
