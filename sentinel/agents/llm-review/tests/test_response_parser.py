"""Tests for response_parser module."""

from __future__ import annotations

import json

from sentinel_agents.types import Confidence, Severity

from sentinel_llm.response_parser import extract_parse_errors, parse_llm_findings


# ---------------------------------------------------------------------------
# Valid JSON responses
# ---------------------------------------------------------------------------

def test_parse_valid_single_finding():
    response = json.dumps([{
        "title": "SQL Injection",
        "description": "User input not sanitised",
        "severity": "high",
        "confidence": "high",
        "line_start": 10,
        "line_end": 12,
        "category": "CWE-89",
        "cwe_id": "CWE-89",
        "remediation": "Use parameterised queries",
    }])
    findings = parse_llm_findings(response, "app.py", "security")
    assert len(findings) == 1
    f = findings[0]
    assert f.type == "security"
    assert f.file == "app.py"
    assert f.severity == Severity.HIGH
    assert f.confidence == Confidence.HIGH
    assert f.line_start == 10
    assert f.line_end == 12
    assert f.title == "SQL Injection"
    assert f.cwe_id == "CWE-89"
    assert f.scanner == "llm-review"


def test_parse_multiple_findings():
    response = json.dumps([
        {"title": "XSS", "severity": "medium", "confidence": "low",
         "line_start": 5, "line_end": 5, "description": "", "category": "",
         "remediation": ""},
        {"title": "CSRF", "severity": "high", "confidence": "medium",
         "line_start": 20, "line_end": 25, "description": "", "category": "",
         "remediation": ""},
    ])
    findings = parse_llm_findings(response, "view.py", "security")
    assert len(findings) == 2
    assert findings[0].title == "XSS"
    assert findings[1].title == "CSRF"


def test_parse_license_review_type():
    response = json.dumps([{
        "title": "GPL code detected",
        "severity": "critical",
        "confidence": "high",
        "line_start": 1,
        "line_end": 50,
        "description": "Copy of GPL library",
        "category": "GPL-3.0",
        "remediation": "Remove or replace",
    }])
    findings = parse_llm_findings(response, "vendor.c", "license")
    assert len(findings) == 1
    assert findings[0].type == "license"


def test_parse_architecture_review_type():
    response = json.dumps([{
        "title": "God class",
        "severity": "medium",
        "confidence": "medium",
        "line_start": 1,
        "line_end": 200,
        "description": "Class does too much",
        "category": "solid-violation",
        "remediation": "Split into smaller classes",
    }])
    findings = parse_llm_findings(response, "service.py", "architecture")
    assert len(findings) == 1
    assert findings[0].type == "architecture"


def test_parse_performance_review_type():
    response = json.dumps([{
        "title": "N+1 query",
        "severity": "high",
        "confidence": "high",
        "line_start": 10,
        "line_end": 15,
        "description": "Query in loop",
        "category": "n-plus-1",
        "remediation": "Batch the query",
    }])
    findings = parse_llm_findings(response, "dao.py", "performance")
    assert len(findings) == 1
    assert findings[0].type == "performance"


# ---------------------------------------------------------------------------
# Severity / confidence mapping
# ---------------------------------------------------------------------------

def test_severity_mapping():
    for sev in ["critical", "high", "medium", "low", "info"]:
        response = json.dumps([{
            "title": "t", "severity": sev, "confidence": "medium",
            "line_start": 1, "line_end": 1, "description": "", "category": "",
            "remediation": "",
        }])
        findings = parse_llm_findings(response, "f.py", "security")
        assert findings[0].severity.value == sev


def test_unknown_severity_defaults_to_medium():
    response = json.dumps([{
        "title": "t", "severity": "unknown_level", "confidence": "medium",
        "line_start": 1, "line_end": 1, "description": "", "category": "",
        "remediation": "",
    }])
    findings = parse_llm_findings(response, "f.py", "security")
    assert findings[0].severity == Severity.MEDIUM


def test_unknown_confidence_defaults_to_medium():
    response = json.dumps([{
        "title": "t", "severity": "high", "confidence": "very_high",
        "line_start": 1, "line_end": 1, "description": "", "category": "",
        "remediation": "",
    }])
    findings = parse_llm_findings(response, "f.py", "security")
    assert findings[0].confidence == Confidence.MEDIUM


# ---------------------------------------------------------------------------
# Malformed / edge-case responses
# ---------------------------------------------------------------------------

def test_parse_empty_array():
    findings = parse_llm_findings("[]", "f.py", "security")
    assert findings == []


def test_parse_empty_string():
    findings = parse_llm_findings("", "f.py", "security")
    assert findings == []


def test_parse_garbage_text():
    findings = parse_llm_findings("Sorry, I can't help with that.", "f.py", "security")
    assert findings == []


def test_parse_json_with_markdown_fences():
    inner = json.dumps([{
        "title": "Issue", "severity": "low", "confidence": "high",
        "line_start": 1, "line_end": 1, "description": "desc", "category": "cat",
        "remediation": "fix",
    }])
    response = f"```json\n{inner}\n```"
    findings = parse_llm_findings(response, "f.py", "security")
    assert len(findings) == 1
    assert findings[0].title == "Issue"


def test_parse_non_dict_items_skipped():
    response = json.dumps(["not a dict", 42, None])
    findings = parse_llm_findings(response, "f.py", "security")
    assert findings == []


def test_missing_line_start_defaults_to_1():
    response = json.dumps([{
        "title": "t", "severity": "low", "confidence": "low",
        "description": "", "category": "", "remediation": "",
    }])
    findings = parse_llm_findings(response, "f.py", "security")
    assert len(findings) == 1
    assert findings[0].line_start == 1
    assert findings[0].line_end == 1


# ---------------------------------------------------------------------------
# Structured error extraction for reflection
# ---------------------------------------------------------------------------

def test_extract_parse_errors_empty():
    errors = extract_parse_errors("")
    assert "empty" in errors.lower()


def test_extract_parse_errors_not_json():
    errors = extract_parse_errors("Sorry, I can't do that")
    assert "not valid JSON" in errors


def test_extract_parse_errors_json_object_not_array():
    errors = extract_parse_errors('{"key": "value"}')
    assert "not a list" in errors


def test_extract_parse_errors_invalid_json_syntax():
    errors = extract_parse_errors('[{"title": "test"')
    assert "syntax error" in errors.lower() or "not valid JSON" in errors
