from sentinel_aidetector.stylometric import (
    ASTEntropy,
    analyze_ast_entropy,
    analyze_entropy,
    analyze_naming_uniformity,
)


def test_entropy_empty_string():
    assert analyze_entropy("") == 0.0


def test_entropy_single_repeated_token():
    # All same token -> entropy = 0
    code = "foo foo foo foo foo"
    assert analyze_entropy(code) == 0.0


def test_entropy_distinct_tokens():
    # Many distinct tokens -> higher entropy
    code = "alpha beta gamma delta epsilon zeta eta theta iota kappa"
    entropy = analyze_entropy(code)
    assert entropy > 3.0


def test_entropy_realistic_code():
    code = """
def calculate_total(items):
    total = 0
    for item in items:
        price = item.get_price()
        quantity = item.get_quantity()
        total += price * quantity
    return total
"""
    entropy = analyze_entropy(code)
    assert entropy > 0.0


def test_uniformity_empty():
    assert analyze_naming_uniformity("") == 0.0


def test_uniformity_too_few_identifiers():
    # Only 2 unique non-keyword identifiers -> returns 0.0
    code = "ab = cd"
    assert analyze_naming_uniformity(code) == 0.0


def test_uniformity_all_snake_case():
    # All snake_case -> high uniformity
    code = """
my_variable = get_data()
user_name = parse_input()
file_path = build_path()
error_count = check_errors()
"""
    uniformity = analyze_naming_uniformity(code)
    assert uniformity >= 0.8


def test_uniformity_mixed_styles():
    # Mix of camelCase, snake_case, PascalCase -> lower uniformity
    code = """
myVariable = getData()
user_name = parse_input()
FilePath = BuildPath()
errorCount = checkErrors()
TOTAL_MAX = compute_result()
"""
    uniformity = analyze_naming_uniformity(code)
    assert uniformity < 0.8


class TestASTEntropy:
    def test_ast_entropy_python(self):
        code = """
def calculate_total(items):
    total = 0
    for item in items:
        if item.price > 0:
            total += item.price
    return total
"""
        result = analyze_ast_entropy(code, "python")
        assert isinstance(result, ASTEntropy)
        assert result.token_entropy > 0.0
        assert result.structure_entropy > 0.0
        assert result.combined > 0.0

    def test_ast_entropy_javascript(self):
        code = "function hello() {\n  const x = 1;\n  return x;\n}\n"
        result = analyze_ast_entropy(code, "javascript")
        assert result.token_entropy > 0.0
        assert result.structure_entropy > 0.0

    def test_ast_entropy_unsupported_language(self):
        code = "some code here"
        result = analyze_ast_entropy(code, "cobol")
        # Falls back to token-only: all three are the same
        assert result.token_entropy == result.structure_entropy
        assert result.token_entropy == result.naming_entropy

    def test_ast_entropy_empty(self):
        result = analyze_ast_entropy("", "python")
        assert result.combined == 0.0

    def test_combined_is_weighted_average(self):
        code = "def foo():\n    x = 1\n    y = 2\n    return x + y\n"
        result = analyze_ast_entropy(code, "python")
        expected = (
            0.4 * result.token_entropy
            + 0.35 * result.structure_entropy
            + 0.25 * result.naming_entropy
        )
        assert abs(result.combined - expected) < 0.01
