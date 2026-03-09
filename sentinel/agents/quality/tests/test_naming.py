"""Tests for the naming consistency analyzer."""

from sentinel_quality.naming import (
    NamingResult,
    NamingStyle,
    analyze_naming_consistency,
    classify_style,
)


class TestClassifyStyle:
    def test_snake_case(self):
        assert classify_style("my_variable") == NamingStyle.SNAKE_CASE
        assert classify_style("get_data") == NamingStyle.SNAKE_CASE
        assert classify_style("process_items") == NamingStyle.SNAKE_CASE

    def test_single_lowercase_word_is_snake(self):
        assert classify_style("count") == NamingStyle.SNAKE_CASE
        assert classify_style("data") == NamingStyle.SNAKE_CASE

    def test_camel_case(self):
        assert classify_style("myVariable") == NamingStyle.CAMEL_CASE
        assert classify_style("getData") == NamingStyle.CAMEL_CASE
        assert classify_style("processItems") == NamingStyle.CAMEL_CASE

    def test_pascal_case(self):
        assert classify_style("MyClass") == NamingStyle.PASCAL_CASE
        assert classify_style("HttpClient") == NamingStyle.PASCAL_CASE
        assert classify_style("DataProcessor") == NamingStyle.PASCAL_CASE

    def test_upper_snake(self):
        assert classify_style("MAX_SIZE") == NamingStyle.UPPER_SNAKE
        assert classify_style("HTTP_OK") == NamingStyle.UPPER_SNAKE
        assert classify_style("DEFAULT_TIMEOUT") == NamingStyle.UPPER_SNAKE

    def test_single_char_is_unknown(self):
        assert classify_style("x") == NamingStyle.UNKNOWN
        assert classify_style("") == NamingStyle.UNKNOWN

    def test_dunder_is_unknown(self):
        assert classify_style("__init__") == NamingStyle.UNKNOWN
        assert classify_style("__name__") == NamingStyle.UNKNOWN


class TestAnalyzeNamingConsistency:
    def test_all_snake_case_python(self):
        code = """
def get_user():
    user_name = "alice"
    user_age = 30
    return user_name
"""
        result = analyze_naming_consistency(code, "python")
        assert result.consistency_score >= 0.9
        assert result.dominant_style == NamingStyle.SNAKE_CASE

    def test_mixed_styles_low_score(self):
        code = """
def getData():
    pass

def process_items():
    pass

userName = "alice"
user_age = 30
"""
        result = analyze_naming_consistency(code, "python")
        assert result.consistency_score < 0.8
        assert len(result.identifiers) >= 2

    def test_empty_code_neutral(self):
        result = analyze_naming_consistency("", "python")
        assert result.consistency_score == 1.0
        assert result.dominant_style == NamingStyle.UNKNOWN

    def test_trivial_code_neutral(self):
        result = analyze_naming_consistency("# just a comment\n", "python")
        assert result.consistency_score == 1.0

    def test_only_constants_consistent(self):
        code = """
MAX_SIZE = 100
DEFAULT_TIMEOUT = 30
HTTP_OK = 200
"""
        result = analyze_naming_consistency(code, "python")
        assert result.consistency_score == 1.0

    def test_python_convention_snake_case(self):
        code = """
def calculate_total():
    item_count = 10
    total_price = 0
    tax_rate = 0.1
"""
        result = analyze_naming_consistency(code, "python")
        assert result.dominant_style == NamingStyle.SNAKE_CASE
        assert result.consistency_score >= 0.9

    def test_javascript_camel_case(self):
        code = """
function getData() {}
const userName = "alice";
let itemCount = 10;
"""
        result = analyze_naming_consistency(code, "javascript")
        assert result.dominant_style == NamingStyle.CAMEL_CASE
        assert result.consistency_score >= 0.9

    def test_javascript_mixed_with_snake(self):
        code = """
function getData() {}
const user_name = "alice";
let item_count = 10;
"""
        result = analyze_naming_consistency(code, "javascript")
        # Should detect mixed styles
        assert result.consistency_score < 1.0

    def test_constants_dont_penalize_score(self):
        """UPPER_SNAKE constants should not reduce the consistency score."""
        code = """
def get_user():
    max_retries = 3

MAX_SIZE = 100
DEFAULT_TIMEOUT = 30
"""
        result = analyze_naming_consistency(code, "python")
        # The non-constant identifiers are all snake_case
        assert result.consistency_score >= 0.9
        assert result.dominant_style == NamingStyle.SNAKE_CASE

    def test_typescript_support(self):
        code = """
const fetchData = async () => {};
let userName = "test";
"""
        result = analyze_naming_consistency(code, "typescript")
        assert result.dominant_style == NamingStyle.CAMEL_CASE
