from sentinel_aidetector.trace import SignalDetail, TraceBuilder


def test_overall_score_sums_contributions():
    tb = TraceBuilder(
        entropy=SignalDetail(weight=0.25, raw_value=3.0, probability=0.8, contribution=0.20),
        uniformity=SignalDetail(weight=0.20, raw_value=0.6, probability=0.6, contribution=0.12),
        markers=SignalDetail(weight=0.35, raw_value=2.0, probability=0.8, contribution=0.28),
        timing=SignalDetail(weight=0.20, raw_value=50.0, probability=0.5, contribution=0.10),
    )
    assert abs(tb.overall_score() - 0.70) < 0.01


def test_overall_score_clamps_to_1():
    tb = TraceBuilder(
        entropy=SignalDetail(weight=0.25, raw_value=1.0, probability=1.0, contribution=0.9),
        markers=SignalDetail(weight=0.35, raw_value=5.0, probability=1.0, contribution=0.9),
    )
    assert tb.overall_score() == 1.0


def test_overall_score_empty_signals():
    tb = TraceBuilder()
    assert tb.overall_score() == 0.0


def test_to_signals_dict_uses_camel_case():
    tb = TraceBuilder(
        entropy=SignalDetail(
            weight=0.25, raw_value=3.5, probability=0.8, contribution=0.20,
            detail={"tokenEntropy": 3.2, "structureEntropy": 4.0, "namingEntropy": 3.3},
        ),
    )
    d = tb.to_signals_dict()
    assert "entropy" in d
    sig = d["entropy"]
    assert sig["rawValue"] == 3.5  # camelCase, not raw_value
    assert sig["weight"] == 0.25
    assert sig["probability"] == 0.8
    assert sig["contribution"] == 0.20
    assert sig["detail"]["tokenEntropy"] == 3.2


def test_to_extra_nests_under_trace():
    tb = TraceBuilder(
        tool_name="copilot",
        prompt_category="code-completion",
        entropy=SignalDetail(weight=0.25, raw_value=3.0, probability=0.8, contribution=0.20),
    )
    extra = tb.to_extra()
    assert "trace" in extra
    trace = extra["trace"]
    assert trace["toolName"] == "copilot"
    assert trace["promptCategory"] == "code-completion"
    assert trace["promptHash"] is None
    assert abs(trace["overallScore"] - 0.20) < 0.01
    assert "entropy" in trace["signals"]


def test_to_signals_dict_omits_none_signals():
    tb = TraceBuilder(
        markers=SignalDetail(weight=0.35, raw_value=1.0, probability=0.4, contribution=0.14),
    )
    d = tb.to_signals_dict()
    assert "markers" in d
    assert "entropy" not in d
    assert "uniformity" not in d
    assert "timing" not in d
