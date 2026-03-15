"""Cross-language schema compatibility test.

Validates that Python TraceBuilder output matches the TypeScript
TraceSignals interface field names (camelCase convention).
"""

import json
from sentinel_aidetector.trace import SignalDetail, TraceBuilder


# These are the exact keys expected by the TypeScript TraceSignals interface
EXPECTED_SIGNAL_KEYS = {"weight", "rawValue", "probability", "contribution", "detail"}
EXPECTED_TRACE_KEYS = {"toolName", "promptHash", "promptCategory", "overallScore", "signals"}


def test_trace_output_matches_typescript_shape():
    """TraceBuilder output must have exact keys expected by TS interface."""
    tb = TraceBuilder(
        tool_name="copilot",
        prompt_hash="abc123",
        prompt_category="code-completion",
        entropy=SignalDetail(
            weight=0.25, raw_value=3.5, probability=0.8, contribution=0.20,
            detail={"tokenEntropy": 3.2, "structureEntropy": 4.0, "namingEntropy": 3.3},
        ),
        uniformity=SignalDetail(weight=0.20, raw_value=0.6, probability=0.6, contribution=0.12),
        markers=SignalDetail(
            weight=0.35, raw_value=2.0, probability=0.8, contribution=0.28,
            detail={"tools": ["copilot"], "matchCount": 2},
        ),
        timing=SignalDetail(
            weight=0.20, raw_value=50.0, probability=0.5, contribution=0.10,
            detail={"linesChanged": 50, "isBurst": False, "sizeUniformity": 0.3},
        ),
    )
    extra = tb.to_extra()
    trace = extra["trace"]

    # Validate top-level trace keys
    assert set(trace.keys()) == EXPECTED_TRACE_KEYS

    # Validate each signal has the correct keys
    for signal_name, signal_data in trace["signals"].items():
        assert set(signal_data.keys()) == EXPECTED_SIGNAL_KEYS, (
            f"Signal '{signal_name}' has keys {set(signal_data.keys())}, "
            f"expected {EXPECTED_SIGNAL_KEYS}"
        )


def test_trace_output_is_json_serializable():
    """TraceBuilder output must serialize to valid JSON (no Python-only types)."""
    tb = TraceBuilder(
        tool_name="chatgpt",
        markers=SignalDetail(
            weight=0.35, raw_value=1.0, probability=0.4, contribution=0.14,
            detail={"tools": ["chatgpt"], "matchCount": 1},
        ),
        timing=SignalDetail(
            weight=0.20, raw_value=100.0, probability=0.7, contribution=0.14,
            detail={"linesChanged": 100, "isBurst": True, "sizeUniformity": 0.8},
        ),
    )
    extra = tb.to_extra()
    # Must not raise
    json_str = json.dumps(extra)
    # Must round-trip cleanly
    parsed = json.loads(json_str)
    assert parsed["trace"]["toolName"] == "chatgpt"
    assert parsed["trace"]["signals"]["timing"]["detail"]["isBurst"] is True
