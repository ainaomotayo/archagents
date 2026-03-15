"""Tests for tree-sitter AST parsing and extraction."""

import pytest

from agent_core.analysis.treesitter import (
    Comment,
    FunctionNode,
    Identifier,
    detect_language,
    extract_comments,
    extract_functions,
    extract_identifiers,
    parse_code,
)


class TestLanguageDetection:
    @pytest.mark.parametrize(
        "path,expected",
        [
            ("main.py", "python"),
            ("app.js", "javascript"),
            ("app.jsx", "javascript"),
            ("app.ts", "typescript"),
            ("app.tsx", "tsx"),
            ("main.go", "go"),
            ("lib.rs", "rust"),
            ("App.java", "java"),
            ("app.rb", "ruby"),
            ("main.c", "c"),
            ("main.h", "c"),
            ("unknown.xyz", None),
        ],
    )
    def test_detect_language(self, path: str, expected: str | None) -> None:
        assert detect_language(path) == expected


class TestParsePython:
    def test_parse_returns_root(self) -> None:
        root = parse_code("x = 1", "python")
        assert root.type == "module"

    def test_extract_functions(self) -> None:
        code = """
def foo(x, y):
    return x + y

def bar():
    pass
"""
        root = parse_code(code, "python")
        fns = extract_functions(root, "python")
        assert len(fns) == 2
        assert fns[0].name == "foo"
        assert fns[1].name == "bar"
        assert fns[0].line_start < fns[1].line_start

    def test_extract_function_parameters(self) -> None:
        code = "def greet(name, age):\n    pass\n"
        root = parse_code(code, "python")
        fns = extract_functions(root, "python")
        assert len(fns) == 1
        assert "name" in fns[0].parameters
        assert "age" in fns[0].parameters

    def test_extract_comments(self) -> None:
        code = "# This is a comment\nx = 1\n# Another comment\n"
        root = parse_code(code, "python")
        comments = extract_comments(root)
        assert len(comments) == 2
        assert "This is a comment" in comments[0].text

    def test_extract_identifiers(self) -> None:
        code = "def foo():\n    pass\nclass Bar:\n    pass\n"
        root = parse_code(code, "python")
        idents = extract_identifiers(root)
        names = [i.name for i in idents]
        assert "foo" in names
        assert "Bar" in names


class TestParseJavaScript:
    def test_extract_functions(self) -> None:
        code = "function add(a, b) { return a + b; }\n"
        root = parse_code(code, "javascript")
        fns = extract_functions(root, "javascript")
        assert len(fns) == 1
        assert fns[0].name == "add"

    def test_extract_comments(self) -> None:
        code = "// line comment\n/* block comment */\nvar x = 1;\n"
        root = parse_code(code, "javascript")
        comments = extract_comments(root)
        assert len(comments) == 2


class TestParseTypeScript:
    def test_extract_functions(self) -> None:
        code = "function greet(name: string): string { return name; }\n"
        root = parse_code(code, "typescript")
        fns = extract_functions(root, "typescript")
        assert len(fns) == 1
        assert fns[0].name == "greet"


class TestParseGo:
    def test_extract_functions(self) -> None:
        code = "package main\nfunc Add(a int, b int) int { return a + b }\n"
        root = parse_code(code, "go")
        fns = extract_functions(root, "go")
        assert len(fns) == 1
        assert fns[0].name == "Add"

    def test_extract_comments(self) -> None:
        code = "package main\n// comment here\nfunc main() {}\n"
        root = parse_code(code, "go")
        comments = extract_comments(root)
        assert len(comments) == 1


class TestParseRust:
    def test_extract_functions(self) -> None:
        code = "fn add(a: i32, b: i32) -> i32 { a + b }\n"
        root = parse_code(code, "rust")
        fns = extract_functions(root, "rust")
        assert len(fns) == 1
        assert fns[0].name == "add"


class TestParseJava:
    def test_extract_functions(self) -> None:
        code = """
class Calculator {
    public int add(int a, int b) {
        return a + b;
    }
}
"""
        root = parse_code(code, "java")
        fns = extract_functions(root, "java")
        assert len(fns) == 1
        assert fns[0].name == "add"


class TestUnsupportedLanguage:
    def test_raises_for_unknown(self) -> None:
        with pytest.raises(ValueError, match="Unsupported"):
            parse_code("code", "brainfuck")
