from sentinel_aidetector.stylometric import analyze_entropy, analyze_naming_uniformity


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
