"""AST-based cyclomatic complexity analysis using tree-sitter."""

from __future__ import annotations

from dataclasses import dataclass

from .treesitter import FunctionNode, extract_functions, parse_code


@dataclass
class ComplexityResult:
    function_name: str
    line_start: int
    line_end: int
    complexity: int


# Decision node types that increment cyclomatic complexity per language
_DECISION_NODES: dict[str, set[str]] = {
    "python": {
        "if_statement", "elif_clause", "for_statement", "while_statement",
        "except_clause", "with_statement", "assert_statement",
        "boolean_operator",  # and/or
        "conditional_expression",  # ternary
        "match_statement", "case_clause",
    },
    "javascript": {
        "if_statement", "for_statement", "for_in_statement",
        "while_statement", "do_statement", "switch_case",
        "catch_clause", "ternary_expression",
        "binary_expression",  # filtered to && and ||
    },
    "typescript": {
        "if_statement", "for_statement", "for_in_statement",
        "while_statement", "do_statement", "switch_case",
        "catch_clause", "ternary_expression",
        "binary_expression",
    },
    "tsx": {
        "if_statement", "for_statement", "for_in_statement",
        "while_statement", "do_statement", "switch_case",
        "catch_clause", "ternary_expression",
        "binary_expression",
    },
    "go": {
        "if_statement", "for_statement", "expression_case",
        "default_case", "type_case",
        "binary_expression",
    },
    "rust": {
        "if_expression", "for_expression", "while_expression",
        "loop_expression", "match_arm",
        "binary_expression",
    },
    "java": {
        "if_statement", "for_statement", "enhanced_for_statement",
        "while_statement", "do_statement", "switch_block_statement_group",
        "catch_clause", "ternary_expression",
        "binary_expression",
    },
    "ruby": {
        "if", "elsif", "unless", "while", "until", "for",
        "when", "rescue",
    },
    "c": {
        "if_statement", "for_statement", "while_statement",
        "do_statement", "case_statement",
        "conditional_expression",
        "binary_expression",
    },
    "cpp": {
        "if_statement", "for_statement", "while_statement",
        "do_statement", "case_statement",
        "conditional_expression",
        "binary_expression",
    },
}

# Binary operators that count as decisions
_LOGICAL_OPERATORS = {"&&", "||", "and", "or"}


def calculate_complexity(code: str, language: str) -> list[ComplexityResult]:
    """Calculate cyclomatic complexity for each function in the code."""
    root = parse_code(code, language)
    functions = extract_functions(root, language)
    results = []
    decision_types = _DECISION_NODES.get(language, set())

    for fn in functions:
        # Re-parse just the function body for accurate node walking
        fn_root = parse_code(fn.body_text, language)
        complexity = 1  # base complexity
        complexity += _count_decisions(fn_root, decision_types)
        results.append(
            ComplexityResult(
                function_name=fn.name,
                line_start=fn.line_start,
                line_end=fn.line_end,
                complexity=complexity,
            )
        )
    return results


def _count_decisions(node: object, decision_types: set[str]) -> int:
    """Recursively count decision nodes in the AST."""
    count = 0
    # node is a tree_sitter.Node but we use duck typing
    if node.type in decision_types:  # type: ignore[union-attr]
        if node.type == "binary_expression":  # type: ignore[union-attr]
            # Only count logical operators
            op_node = node.child_by_field_name("operator")  # type: ignore[union-attr]
            if op_node and op_node.text.decode("utf-8") in _LOGICAL_OPERATORS:
                count += 1
        else:
            count += 1
    for child in node.children:  # type: ignore[union-attr]
        count += _count_decisions(child, decision_types)
    return count
