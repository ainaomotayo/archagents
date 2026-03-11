"""Tests for cyclomatic complexity analysis."""

from sentinel_quality.complexity import ComplexityResult, calculate_complexity


class TestPythonComplexity:
    def test_simple_function(self):
        code = "def hello():\n    return 'hi'\n"
        results = calculate_complexity(code, "python")
        assert len(results) == 1
        assert results[0].function_name == "hello"
        assert results[0].complexity == 1  # baseline

    def test_function_with_if(self):
        code = (
            "def check(x):\n"
            "    if x > 0:\n"
            "        return True\n"
            "    return False\n"
        )
        results = calculate_complexity(code, "python")
        assert len(results) == 1
        assert results[0].complexity == 2  # 1 base + 1 if

    def test_function_with_multiple_branches(self):
        code = (
            "def classify(x):\n"
            "    if x > 100:\n"
            "        return 'high'\n"
            "    elif x > 50:\n"
            "        return 'medium'\n"
            "    elif x > 0:\n"
            "        return 'low'\n"
            "    else:\n"
            "        return 'none'\n"
        )
        results = calculate_complexity(code, "python")
        assert len(results) == 1
        # 1 base + 1 if + 2 elif = 4
        assert results[0].complexity == 4

    def test_function_with_loops_and_logic(self):
        code = (
            "def process(items):\n"
            "    for item in items:\n"
            "        if item and item.valid:\n"
            "            while item.pending:\n"
            "                item.tick()\n"
        )
        results = calculate_complexity(code, "python")
        assert len(results) == 1
        # 1 base + 1 for + 1 if + 1 and + 1 while = 5
        assert results[0].complexity == 5

    def test_function_with_try_except(self):
        code = (
            "def safe_parse(data):\n"
            "    try:\n"
            "        return parse(data)\n"
            "    except ValueError:\n"
            "        return None\n"
            "    except TypeError:\n"
            "        return None\n"
        )
        results = calculate_complexity(code, "python")
        assert len(results) == 1
        # 1 base + 2 except = 3
        assert results[0].complexity == 3

    def test_multiple_functions(self):
        code = (
            "def a():\n"
            "    return 1\n"
            "\n"
            "def b(x):\n"
            "    if x:\n"
            "        return 2\n"
            "    return 3\n"
        )
        results = calculate_complexity(code, "python")
        assert len(results) == 2
        assert results[0].function_name == "a"
        assert results[0].complexity == 1
        assert results[1].function_name == "b"
        assert results[1].complexity == 2

    def test_async_function(self):
        code = (
            "async def fetch(url):\n"
            "    if url:\n"
            "        return await get(url)\n"
        )
        results = calculate_complexity(code, "python")
        assert len(results) == 1
        assert results[0].function_name == "fetch"
        assert results[0].complexity == 2


class TestJavaScriptComplexity:
    def test_simple_function(self):
        code = "function hello() {\n  return 'hi';\n}\n"
        results = calculate_complexity(code, "javascript")
        assert len(results) == 1
        assert results[0].function_name == "hello"
        assert results[0].complexity == 1

    def test_function_with_conditions(self):
        code = (
            "function check(x) {\n"
            "  if (x > 0) {\n"
            "    return true;\n"
            "  } else if (x < 0) {\n"
            "    return false;\n"
            "  }\n"
            "}\n"
        )
        results = calculate_complexity(code, "javascript")
        assert len(results) == 1
        # 1 base + 1 if + 1 else if = 3
        assert results[0].complexity == 3

    def test_arrow_function(self):
        code = "const process = (x) => {\n  if (x) { return x; }\n}\n"
        results = calculate_complexity(code, "javascript")
        assert len(results) == 1
        # AST sees arrow functions as anonymous; accept either name
        assert results[0].function_name in ("process", "<anonymous>")
        assert results[0].complexity == 2

    def test_typescript_recognized(self):
        code = "function hello() {\n  return 1;\n}\n"
        results = calculate_complexity(code, "typescript")
        assert len(results) == 1

    def test_rust_supported(self):
        """Rust is now supported via tree-sitter AST."""
        code = "fn main() {\n  if true { return; }\n}\n"
        results = calculate_complexity(code, "rust")
        assert len(results) == 1
        assert results[0].function_name == "main"

    def test_unsupported_language_returns_empty(self):
        code = "some random code"
        results = calculate_complexity(code, "cobol")
        assert results == []


class TestASTLanguageSupport:
    """Verify tree-sitter AST complexity works for newly supported languages."""

    def test_go_function(self):
        code = 'package main\nfunc check(x int) int {\n  if x > 0 {\n    return x\n  }\n  return 0\n}\n'
        results = calculate_complexity(code, "go")
        assert len(results) == 1
        assert results[0].function_name == "check"
        assert results[0].complexity >= 2

    def test_java_method(self):
        code = (
            "class Foo {\n"
            "  int check(int x) {\n"
            "    if (x > 0) {\n"
            "      return x;\n"
            "    }\n"
            "    return 0;\n"
            "  }\n"
            "}\n"
        )
        results = calculate_complexity(code, "java")
        assert len(results) >= 1
        assert results[0].complexity >= 2

    def test_language_alias_js(self):
        code = "function f() { if (true) { return 1; } }\n"
        results = calculate_complexity(code, "js")
        assert len(results) == 1

    def test_language_alias_ts(self):
        code = "function f() { if (true) { return 1; } }\n"
        results = calculate_complexity(code, "ts")
        assert len(results) == 1
