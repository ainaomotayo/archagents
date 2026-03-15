"""Tests for AST-based cyclomatic complexity."""

import pytest

from agent_core.analysis.complexity import ComplexityResult, calculate_complexity


class TestPythonComplexity:
    def test_simple_function(self) -> None:
        code = "def add(a, b):\n    return a + b\n"
        results = calculate_complexity(code, "python")
        assert len(results) == 1
        assert results[0].function_name == "add"
        assert results[0].complexity == 1  # no decisions

    def test_if_else(self) -> None:
        code = """
def check(x):
    if x > 0:
        return "positive"
    else:
        return "non-positive"
"""
        results = calculate_complexity(code, "python")
        assert results[0].complexity == 2  # 1 base + 1 if

    def test_multiple_branches(self) -> None:
        code = """
def classify(x):
    if x > 100:
        return "high"
    elif x > 50:
        return "medium"
    elif x > 0:
        return "low"
    else:
        return "none"
"""
        results = calculate_complexity(code, "python")
        assert results[0].complexity == 4  # 1 + if + 2 elif

    def test_loop_and_condition(self) -> None:
        code = """
def process(items):
    for item in items:
        if item > 0:
            print(item)
    while True:
        break
"""
        results = calculate_complexity(code, "python")
        assert results[0].complexity == 4  # 1 + for + if + while

    def test_boolean_operators(self) -> None:
        code = """
def check(a, b, c):
    if a and b or c:
        return True
"""
        results = calculate_complexity(code, "python")
        # 1 base + 1 if + 1 and + 1 or = 4
        assert results[0].complexity == 4

    def test_try_except(self) -> None:
        code = """
def safe_div(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return 0
    except TypeError:
        return None
"""
        results = calculate_complexity(code, "python")
        # 1 base + 2 except = 3
        assert results[0].complexity == 3

    def test_multiple_functions(self) -> None:
        code = """
def simple():
    return 1

def complex_fn(x):
    if x > 0:
        for i in range(x):
            if i % 2 == 0:
                print(i)
"""
        results = calculate_complexity(code, "python")
        assert len(results) == 2
        assert results[0].function_name == "simple"
        assert results[0].complexity == 1
        assert results[1].function_name == "complex_fn"
        assert results[1].complexity >= 4


class TestJavaScriptComplexity:
    def test_simple(self) -> None:
        code = "function add(a, b) { return a + b; }\n"
        results = calculate_complexity(code, "javascript")
        assert len(results) == 1
        assert results[0].complexity == 1

    def test_conditionals(self) -> None:
        code = """
function check(x) {
    if (x > 0) {
        return true;
    } else if (x < 0) {
        return false;
    }
    for (let i = 0; i < x; i++) {
        console.log(i);
    }
}
"""
        results = calculate_complexity(code, "javascript")
        # 1 + if + else if + for = 4
        assert results[0].complexity >= 3


class TestGoComplexity:
    def test_simple(self) -> None:
        code = "package main\nfunc add(a int, b int) int { return a + b }\n"
        results = calculate_complexity(code, "go")
        assert len(results) == 1
        assert results[0].complexity == 1

    def test_if_for(self) -> None:
        code = """package main
func process(items []int) {
    for _, item := range items {
        if item > 0 {
            fmt.Println(item)
        }
    }
}
"""
        results = calculate_complexity(code, "go")
        assert results[0].complexity >= 3  # 1 + for + if


class TestRustComplexity:
    def test_match(self) -> None:
        code = """
fn classify(x: i32) -> &str {
    match x {
        0 => "zero",
        1..=10 => "small",
        _ => "big",
    }
}
"""
        results = calculate_complexity(code, "rust")
        assert results[0].complexity >= 3  # 1 + match arms


class TestJavaComplexity:
    def test_method(self) -> None:
        code = """
class Calc {
    public int process(int x) {
        if (x > 0) {
            for (int i = 0; i < x; i++) {
                x += i;
            }
        }
        return x;
    }
}
"""
        results = calculate_complexity(code, "java")
        assert len(results) == 1
        assert results[0].complexity >= 3
