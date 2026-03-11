"""Taint analysis using tree-sitter AST with regex fallback.

Uses ``agent_core.analysis.treesitter`` for AST-based function boundary
extraction and cross-function taint tracking within the diff. Falls back
to regex-based line-by-line analysis when tree-sitter is unavailable or
the language is unsupported.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from sentinel_agents.types import Confidence, DiffFile, Finding, Severity

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Taint sources and sinks
# ---------------------------------------------------------------------------

# Functions/attributes that introduce tainted data
TAINT_SOURCES: dict[str, set[str]] = {
    "python": {
        "input", "request.args", "request.form", "request.json",
        "request.data", "request.headers", "request.cookies",
        "sys.argv", "os.environ", "os.getenv",
        "stdin.read", "stdin.readline",
    },
    "javascript": {
        "req.body", "req.params", "req.query", "req.headers",
        "req.cookies", "process.argv", "process.env",
        "document.location", "window.location",
        "document.getElementById", "document.querySelector",
    },
}

# Functions that are dangerous when called with tainted data
TAINT_SINKS: dict[str, set[str]] = {
    "python": {
        "eval", "exec", "compile", "__import__",
        "os.system", "os.popen", "subprocess.call",
        "subprocess.run", "subprocess.Popen",
        "cursor.execute", "connection.execute",
        "render_template_string",
    },
    "javascript": {
        "eval", "Function", "setTimeout", "setInterval",
        "document.write", "innerHTML",
        "child_process.exec", "child_process.execSync",
    },
}


@dataclass
class TaintFlow:
    """A detected taint flow from source to sink."""
    source: str
    source_line: int
    sink: str
    sink_line: int
    variable: str  # The variable carrying tainted data
    file: str


@dataclass
class TaintContext:
    """Tracks tainted variables within a scope."""
    tainted_vars: dict[str, tuple[str, int]] = field(default_factory=dict)
    # var_name -> (source_name, line_number)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze_taint(diff_file: DiffFile) -> list[Finding]:
    """Run taint analysis on a diff file.

    Uses tree-sitter AST when available to extract function boundaries for
    cross-function taint tracking. Falls back to regex-based analysis.
    """
    added_code = _extract_added_code(diff_file)
    if not added_code.strip():
        return []

    lang = _normalize_language(diff_file.language)
    if lang not in TAINT_SOURCES:
        return []

    sources = TAINT_SOURCES[lang]
    sinks = TAINT_SINKS[lang]

    # Try AST-enhanced analysis first
    ast_flows = _trace_flows_ast(added_code, lang, sources, sinks, diff_file.path)
    if ast_flows is not None:
        flows = ast_flows
    else:
        flows = _trace_flows(added_code, sources, sinks, diff_file.path)

    return [_flow_to_finding(flow) for flow in flows]


# ---------------------------------------------------------------------------
# AST-enhanced analysis via agent_core.analysis.treesitter
# ---------------------------------------------------------------------------

# Tree-sitter language names that map to our taint source/sink language keys
_AST_LANG_MAP: dict[str, str] = {
    "python": "python",
    "javascript": "javascript",
}


def _trace_flows_ast(
    code: str,
    lang: str,
    sources: set[str],
    sinks: set[str],
    file_path: str,
) -> list[TaintFlow] | None:
    """Try AST-based taint tracing using agent_core.analysis.treesitter.

    Returns None if tree-sitter is unavailable, allowing fallback to regex.
    Returns a list of TaintFlows on success (may be empty).
    """
    ts_lang = _AST_LANG_MAP.get(lang)
    if ts_lang is None:
        return None

    try:
        from agent_core.analysis.treesitter import extract_functions, parse_code
    except ImportError:
        return None

    try:
        root = parse_code(code, ts_lang)
        functions = extract_functions(root, ts_lang)
    except Exception:
        logger.debug("Tree-sitter parse failed for %s, falling back to regex", file_path)
        return None

    # Build a map of function name -> parameters (potential taint entry points)
    # and function name -> body text (for sink detection)
    all_flows: list[TaintFlow] = []

    # First: run standard regex-based flow detection on the full code
    all_flows.extend(_trace_flows(code, sources, sinks, file_path))

    # Second: cross-function analysis — if a function parameter comes from
    # a tainted source at the call site, trace through the function body
    for func in functions:
        if not func.parameters:
            continue

        # Check if this function is called with tainted args elsewhere
        call_pattern = re.compile(
            re.escape(func.name) + r"\s*\(([^)]*)\)"
        )
        lines = code.split("\n")
        for line_num, line in enumerate(lines, 1):
            match = call_pattern.search(line)
            if not match:
                continue

            args_text = match.group(1)
            args = [a.strip() for a in args_text.split(",") if a.strip()]

            # Check each argument against known tainted variables
            ctx = TaintContext()
            # Build taint context from lines before this call
            for prev_num, prev_line in enumerate(lines[:line_num - 1], 1):
                stripped = prev_line.strip()
                if stripped and not stripped.startswith("#") and not stripped.startswith("//"):
                    _check_taint_introduction(stripped, prev_num, sources, ctx)
                    _check_taint_propagation(stripped, prev_num, ctx)

            for i, arg in enumerate(args):
                if arg in ctx.tainted_vars:
                    source_name, source_line = ctx.tainted_vars[arg]
                    # Now check if the corresponding parameter flows to a sink
                    # inside the function body
                    if i < len(func.parameters):
                        param = func.parameters[i]
                        body_ctx = TaintContext()
                        body_ctx.tainted_vars[param] = (source_name, func.line_start)
                        body_flows: list[TaintFlow] = []
                        body_lines = func.body_text.split("\n")
                        for bline_num, bline in enumerate(body_lines, func.line_start):
                            stripped_b = bline.strip()
                            if stripped_b:
                                _check_taint_sink(
                                    stripped_b, bline_num, sinks,
                                    body_ctx, body_flows, file_path,
                                )
                                _check_taint_propagation(stripped_b, bline_num, body_ctx)

                        # Deduplicate against existing flows
                        existing = {(f.source, f.sink, f.variable) for f in all_flows}
                        for flow in body_flows:
                            key = (flow.source, flow.sink, flow.variable)
                            if key not in existing:
                                all_flows.append(flow)
                                existing.add(key)

    return all_flows


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _normalize_language(language: str) -> str:
    if language in ("python", "py"):
        return "python"
    if language in ("javascript", "js", "typescript", "ts", "jsx", "tsx"):
        return "javascript"
    return language


def _extract_added_code(diff_file: DiffFile) -> str:
    lines: list[str] = []
    for hunk in diff_file.hunks:
        for line in hunk.content.splitlines():
            if line.startswith("+") and not line.startswith("+++"):
                lines.append(line[1:])
    return "\n".join(lines)


def _trace_flows(
    code: str,
    sources: set[str],
    sinks: set[str],
    file_path: str,
) -> list[TaintFlow]:
    """Trace taint flows through variable assignments in code."""
    ctx = TaintContext()
    flows: list[TaintFlow] = []
    lines = code.split("\n")

    for line_num, line in enumerate(lines, 1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("//"):
            continue

        # Step 1: Check if this line introduces taint via assignment
        _check_taint_introduction(stripped, line_num, sources, ctx)

        # Step 2: Check if this line passes tainted data to a sink
        _check_taint_sink(stripped, line_num, sinks, ctx, flows, file_path)

        # Step 3: Check if taint propagates through assignment
        _check_taint_propagation(stripped, line_num, ctx)

    return flows


def _check_taint_introduction(
    line: str, line_num: int, sources: set[str], ctx: TaintContext
) -> None:
    """Check if a line assigns a taint source to a variable."""
    # Match patterns like: var = source(...), const var = source, let var = source
    assign_match = re.match(r"(?:(?:const|let|var)\s+)?(\w+)\s*=\s*(.+)", line)
    if not assign_match:
        return

    var_name = assign_match.group(1)
    rhs = assign_match.group(2)

    for source in sources:
        if source in rhs:
            ctx.tainted_vars[var_name] = (source, line_num)
            return


def _check_taint_sink(
    line: str,
    line_num: int,
    sinks: set[str],
    ctx: TaintContext,
    flows: list[TaintFlow],
    file_path: str,
) -> None:
    """Check if a line passes tainted data to a dangerous sink."""
    # Sort sinks longest-first so "cursor.execute" matches before "exec"
    sorted_sinks = sorted(sinks, key=len, reverse=True)
    matched_sink: str | None = None

    for sink in sorted_sinks:
        if sink not in line:
            continue

        # Check for function-call pattern: sink(...)
        sink_pattern = re.escape(sink) + r"\s*\("
        if re.search(sink_pattern, line):
            matched_sink = sink
            break

        # Check property assignment like .innerHTML =
        if f".{sink}" in line:
            matched_sink = sink
            break

    if matched_sink is None:
        return

    for var_name, (source, source_line) in ctx.tainted_vars.items():
        # Use word boundary to avoid false matches
        if re.search(r'\b' + re.escape(var_name) + r'\b', line):
            flows.append(
                TaintFlow(
                    source=source,
                    source_line=source_line,
                    sink=matched_sink,
                    sink_line=line_num,
                    variable=var_name,
                    file=file_path,
                )
            )


def _check_taint_propagation(
    line: str, line_num: int, ctx: TaintContext
) -> None:
    """Check if taint propagates from one variable to another."""
    assign_match = re.match(r"(?:(?:const|let|var)\s+)?(\w+)\s*=\s*(.+)", line)
    if not assign_match:
        return

    var_name = assign_match.group(1)
    rhs = assign_match.group(2)

    # If already tainted from source detection, skip
    if var_name in ctx.tainted_vars:
        return

    # Check if any tainted variable flows into this assignment
    for tainted_var, (source, _) in list(ctx.tainted_vars.items()):
        if tainted_var in rhs:
            ctx.tainted_vars[var_name] = (source, line_num)
            return


def _flow_to_finding(flow: TaintFlow) -> Finding:
    """Convert a TaintFlow to a Finding."""
    return Finding(
        type="security",
        file=flow.file,
        line_start=flow.source_line,
        line_end=flow.sink_line,
        severity=Severity.HIGH,
        confidence=Confidence.MEDIUM,
        title=f"Taint flow: {flow.source} → {flow.sink}",
        description=(
            f"Unsanitized data from '{flow.source}' (line {flow.source_line}) "
            f"flows through variable '{flow.variable}' to dangerous sink "
            f"'{flow.sink}' (line {flow.sink_line})."
        ),
        remediation=(
            f"Sanitize or validate '{flow.variable}' before passing to '{flow.sink}'. "
            f"Use parameterized queries for SQL, or escape input for shell commands."
        ),
        category="taint-flow",
        scanner="taint-analysis",
        cwe_id="CWE-20",
    )
