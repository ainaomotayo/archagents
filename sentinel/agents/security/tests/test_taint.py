"""Tests for taint analysis module."""

from sentinel_agents.types import DiffFile, DiffHunk

from sentinel_security.taint import (
    TaintContext,
    TaintFlow,
    analyze_taint,
    _check_taint_introduction,
    _trace_flows,
    TAINT_SOURCES,
    TAINT_SINKS,
)


def _make_diff_file(code: str, path: str = "app.py", language: str = "python") -> DiffFile:
    added = "\n".join(f"+{line}" for line in code.split("\n"))
    return DiffFile(
        path=path,
        language=language,
        hunks=[
            DiffHunk(
                old_start=0, old_count=0,
                new_start=1, new_count=code.count("\n") + 1,
                content=added,
            )
        ],
        ai_score=0.5,
    )


# ---------------------------------------------------------------------------
# Basic taint flow detection
# ---------------------------------------------------------------------------

class TestPythonTaintFlows:
    def test_input_to_eval(self):
        code = (
            "user_data = input('Enter: ')\n"
            "result = eval(user_data)"
        )
        diff_file = _make_diff_file(code)
        findings = analyze_taint(diff_file)

        assert len(findings) >= 1
        assert findings[0].category == "taint-flow"
        assert "input" in findings[0].title
        assert "eval" in findings[0].title

    def test_request_to_exec(self):
        code = (
            "cmd = request.args.get('cmd')\n"
            "exec(cmd)"
        )
        diff_file = _make_diff_file(code)
        findings = analyze_taint(diff_file)

        assert len(findings) >= 1
        assert "exec" in findings[0].title

    def test_request_to_subprocess(self):
        code = (
            "user_cmd = request.form.get('command')\n"
            "subprocess.call(user_cmd, shell=True)"
        )
        diff_file = _make_diff_file(code)
        findings = analyze_taint(diff_file)

        assert len(findings) >= 1
        assert "subprocess.call" in findings[0].title

    def test_env_to_sql(self):
        code = (
            "query = os.environ.get('QUERY')\n"
            "cursor.execute(query)"
        )
        diff_file = _make_diff_file(code)
        findings = analyze_taint(diff_file)

        assert len(findings) >= 1
        assert "cursor.execute" in findings[0].title

    def test_clean_code_no_taint(self):
        code = (
            "x = 42\n"
            "y = x + 1\n"
            "print(y)"
        )
        diff_file = _make_diff_file(code)
        findings = analyze_taint(diff_file)

        assert findings == []

    def test_no_flow_without_assignment(self):
        """Source exists but not assigned to a variable used in sink."""
        code = (
            "x = 42\n"
            "eval(x)"
        )
        diff_file = _make_diff_file(code)
        findings = analyze_taint(diff_file)

        assert findings == []


# ---------------------------------------------------------------------------
# Taint propagation
# ---------------------------------------------------------------------------

class TestTaintPropagation:
    def test_propagation_through_intermediate(self):
        code = (
            "raw = input('data')\n"
            "processed = raw.strip()\n"
            "eval(processed)"
        )
        diff_file = _make_diff_file(code)
        findings = analyze_taint(diff_file)

        assert len(findings) >= 1
        assert "processed" in findings[0].description

    def test_no_propagation_without_taint(self):
        code = (
            "raw = 'safe string'\n"
            "processed = raw.strip()\n"
            "eval(processed)"
        )
        diff_file = _make_diff_file(code)
        findings = analyze_taint(diff_file)

        assert findings == []


# ---------------------------------------------------------------------------
# JavaScript taint flows
# ---------------------------------------------------------------------------

class TestJavaScriptTaintFlows:
    def test_req_body_to_eval(self):
        code = (
            "const data = req.body.input\n"
            "eval(data)"
        )
        diff_file = _make_diff_file(code, path="handler.js", language="javascript")
        findings = analyze_taint(diff_file)

        assert len(findings) >= 1

    def test_req_query_to_innerhtml(self):
        code = (
            "const name = req.query.name\n"
            "el.innerHTML = name"
        )
        diff_file = _make_diff_file(code, path="view.js", language="javascript")
        findings = analyze_taint(diff_file)

        # innerHTML check looks for .innerHTML in line
        assert len(findings) >= 1


# ---------------------------------------------------------------------------
# Unsupported language
# ---------------------------------------------------------------------------

class TestUnsupportedLanguage:
    def test_go_returns_empty(self):
        code = "user := os.Getenv(\"INPUT\")\n"
        diff_file = _make_diff_file(code, path="main.go", language="go")
        findings = analyze_taint(diff_file)

        assert findings == []


# ---------------------------------------------------------------------------
# Finding structure
# ---------------------------------------------------------------------------

class TestFindingStructure:
    def test_finding_has_correct_fields(self):
        code = (
            "user_data = input('Enter: ')\n"
            "eval(user_data)"
        )
        diff_file = _make_diff_file(code)
        findings = analyze_taint(diff_file)

        assert len(findings) >= 1
        f = findings[0]
        assert f.type == "security"
        assert f.file == "app.py"
        assert f.severity.value == "high"
        assert f.confidence.value == "medium"
        assert f.scanner == "taint-analysis"
        assert f.cwe_id == "CWE-20"
        assert f.category == "taint-flow"
        assert f.line_start >= 1
        assert f.line_end >= f.line_start


# ---------------------------------------------------------------------------
# Trace internals
# ---------------------------------------------------------------------------

class TestTraceFlows:
    def test_direct_trace(self):
        code = "data = input('x')\neval(data)"
        flows = _trace_flows(code, TAINT_SOURCES["python"], TAINT_SINKS["python"], "test.py")
        assert len(flows) >= 1
        assert flows[0].source == "input"
        assert flows[0].sink == "eval"

    def test_empty_code(self):
        flows = _trace_flows("", TAINT_SOURCES["python"], TAINT_SINKS["python"], "test.py")
        assert flows == []

    def test_comments_skipped(self):
        code = "# data = input('x')\n# eval(data)"
        flows = _trace_flows(code, TAINT_SOURCES["python"], TAINT_SINKS["python"], "test.py")
        assert flows == []
