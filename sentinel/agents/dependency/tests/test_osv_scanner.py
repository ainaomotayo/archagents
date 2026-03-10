"""Tests for osv_scanner module."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from sentinel_agents.types import Confidence, Severity
from sentinel_dependency.manifest_parser import DependencyDeclaration
from sentinel_dependency.osv_scanner import (
    OSV_BATCH_URL,
    OSV_QUERY_URL,
    _cvss_to_severity,
    _extract_cve_ids,
    _extract_fixed_versions,
    _map_ecosystem,
    _parse_vulns,
    build_batch_queries,
    build_query,
    query_osv_batch,
    query_osv_single,
    scan_dependencies,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _dep(name: str = "requests", version: str = "2.28.0", ecosystem: str = "PyPI") -> DependencyDeclaration:
    return DependencyDeclaration(name, version, ecosystem, "requirements.txt", 5)


_SAMPLE_VULN = {
    "id": "GHSA-xxxx-yyyy-zzzz",
    "summary": "Remote code execution in requests",
    "aliases": ["CVE-2023-12345"],
    "severity": [{"type": "CVSS_V3", "score": "9.8"}],
    "affected": [
        {
            "ranges": [
                {
                    "type": "ECOSYSTEM",
                    "events": [
                        {"introduced": "0"},
                        {"fixed": "2.29.0"},
                    ],
                }
            ]
        }
    ],
}

_SAMPLE_VULN_NO_CVE = {
    "id": "GHSA-aaaa-bbbb-cccc",
    "summary": "Moderate issue",
    "aliases": [],
    "severity": [],
    "affected": [],
}


# ---------------------------------------------------------------------------
# Ecosystem mapping
# ---------------------------------------------------------------------------

def test_map_ecosystem_known():
    assert _map_ecosystem("PyPI") == "PyPI"
    assert _map_ecosystem("npm") == "npm"
    assert _map_ecosystem("python") == "PyPI"
    assert _map_ecosystem("javascript") == "npm"
    assert _map_ecosystem("ts") == "npm"
    assert _map_ecosystem("rust") == "crates.io"
    assert _map_ecosystem("go") == "Go"
    assert _map_ecosystem("java") == "Maven"
    assert _map_ecosystem("ruby") == "RubyGems"


def test_map_ecosystem_passthrough():
    assert _map_ecosystem("UnknownEco") == "UnknownEco"


# ---------------------------------------------------------------------------
# Severity mapping
# ---------------------------------------------------------------------------

def test_cvss_to_severity():
    assert _cvss_to_severity(9.8) == Severity.CRITICAL
    assert _cvss_to_severity(9.0) == Severity.CRITICAL
    assert _cvss_to_severity(7.5) == Severity.HIGH
    assert _cvss_to_severity(7.0) == Severity.HIGH
    assert _cvss_to_severity(5.0) == Severity.MEDIUM
    assert _cvss_to_severity(4.0) == Severity.MEDIUM
    assert _cvss_to_severity(2.0) == Severity.LOW
    assert _cvss_to_severity(0.0) == Severity.INFO
    assert _cvss_to_severity(None) == Severity.MEDIUM


# ---------------------------------------------------------------------------
# CVE ID extraction
# ---------------------------------------------------------------------------

def test_extract_cve_ids():
    assert _extract_cve_ids(["CVE-2023-12345", "GHSA-xxxx"]) == ["CVE-2023-12345"]
    assert _extract_cve_ids([]) == []
    assert _extract_cve_ids(None) == []


# ---------------------------------------------------------------------------
# Fixed version extraction
# ---------------------------------------------------------------------------

def test_extract_fixed_versions():
    affected = [
        {
            "ranges": [
                {
                    "events": [{"introduced": "0"}, {"fixed": "2.29.0"}]
                }
            ]
        }
    ]
    assert _extract_fixed_versions(affected) == ["2.29.0"]


def test_extract_fixed_versions_none():
    assert _extract_fixed_versions(None) == []
    assert _extract_fixed_versions([]) == []


# ---------------------------------------------------------------------------
# Query construction
# ---------------------------------------------------------------------------

def test_build_query():
    dep = _dep("flask", "2.0.0", "PyPI")
    q = build_query(dep)
    assert q == {
        "package": {"name": "flask", "ecosystem": "PyPI"},
        "version": "2.0.0",
    }


def test_build_query_no_version():
    dep = DependencyDeclaration("flask", "", "PyPI", "req.txt", 1)
    q = build_query(dep)
    assert "version" not in q
    assert q["package"]["name"] == "flask"


def test_build_query_maps_ecosystem():
    dep = _dep("express", "4.18.0", "javascript")
    q = build_query(dep)
    assert q["package"]["ecosystem"] == "npm"


def test_build_batch_queries():
    deps = [_dep("flask", "2.0.0"), _dep("django", "4.0")]
    batch = build_batch_queries(deps)
    assert "queries" in batch
    assert len(batch["queries"]) == 2
    assert batch["queries"][0]["package"]["name"] == "flask"
    assert batch["queries"][1]["package"]["name"] == "django"


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------

def test_parse_vulns_basic():
    dep = _dep()
    findings = _parse_vulns([_SAMPLE_VULN], dep)
    assert len(findings) == 1
    f = findings[0]
    assert f.type == "dependency"
    assert f.category == "cve"
    assert f.scanner == "osv-scanner"
    assert f.severity == Severity.CRITICAL  # 9.8
    assert f.confidence == Confidence.HIGH
    assert "CVE-2023-12345" in f.title
    assert f.extra["cveId"] == "CVE-2023-12345"
    assert f.extra["cvssScore"] == 9.8
    assert f.extra["fixedVersion"] == "2.29.0"
    assert f.extra["package"] == "requests"
    assert f.file == "requirements.txt"
    assert f.line_start == 5


def test_parse_vulns_no_cve():
    dep = _dep()
    findings = _parse_vulns([_SAMPLE_VULN_NO_CVE], dep)
    assert len(findings) == 1
    f = findings[0]
    # Falls back to OSV ID
    assert f.extra["cveId"] == "GHSA-aaaa-bbbb-cccc"
    assert f.severity == Severity.MEDIUM  # no score


def test_parse_vulns_empty():
    dep = _dep()
    findings = _parse_vulns([], dep)
    assert findings == []


# ---------------------------------------------------------------------------
# API integration (mocked)
# ---------------------------------------------------------------------------

@patch("sentinel_dependency.osv_scanner._post_with_retry")
def test_query_osv_batch_success(mock_post):
    mock_post.return_value = {
        "results": [
            {"vulns": [_SAMPLE_VULN]},
            {"vulns": []},
        ]
    }
    deps = [_dep("requests", "2.28.0"), _dep("flask", "2.0.0")]
    findings = query_osv_batch(deps)

    mock_post.assert_called_once()
    assert len(findings) == 1
    assert findings[0].extra["package"] == "requests"


@patch("sentinel_dependency.osv_scanner._post_with_retry")
def test_query_osv_batch_empty_deps(mock_post):
    findings = query_osv_batch([])
    mock_post.assert_not_called()
    assert findings == []


@patch("sentinel_dependency.osv_scanner._post_with_retry")
def test_query_osv_batch_api_failure(mock_post):
    mock_post.return_value = None
    deps = [_dep()]
    findings = query_osv_batch(deps)
    assert findings == []


@patch("sentinel_dependency.osv_scanner._post_with_retry")
def test_query_osv_single_success(mock_post):
    mock_post.return_value = {"vulns": [_SAMPLE_VULN]}
    findings = query_osv_single(_dep())
    assert len(findings) == 1
    mock_post.assert_called_once()


@patch("sentinel_dependency.osv_scanner._post_with_retry")
def test_query_osv_single_no_vulns(mock_post):
    mock_post.return_value = {"vulns": []}
    findings = query_osv_single(_dep())
    assert findings == []


@patch("sentinel_dependency.osv_scanner._post_with_retry")
def test_query_osv_single_api_failure(mock_post):
    mock_post.return_value = None
    findings = query_osv_single(_dep())
    assert findings == []


# ---------------------------------------------------------------------------
# scan_dependencies (end-to-end with mock)
# ---------------------------------------------------------------------------

@patch("sentinel_dependency.osv_scanner.query_osv_batch")
def test_scan_dependencies_filters_no_version(mock_batch):
    mock_batch.return_value = []
    deps = [
        DependencyDeclaration("flask", "2.0.0", "PyPI", "req.txt", 1),
        DependencyDeclaration("numpy", "", "PyPI", "req.txt", 2),  # no version
    ]
    scan_dependencies(deps)
    # Only the dep with a version should be passed
    called_deps = mock_batch.call_args[0][0]
    assert len(called_deps) == 1
    assert called_deps[0].package_name == "flask"


@patch("sentinel_dependency.osv_scanner.query_osv_batch")
def test_scan_dependencies_empty(mock_batch):
    findings = scan_dependencies([])
    mock_batch.assert_not_called()
    assert findings == []


# ---------------------------------------------------------------------------
# Rate limiting / retry (mocked requests)
# ---------------------------------------------------------------------------

@patch("sentinel_dependency.osv_scanner.http_requests.post")
@patch("sentinel_dependency.osv_scanner.time.sleep")
def test_post_with_retry_rate_limit(mock_sleep, mock_post):
    from sentinel_dependency.osv_scanner import _post_with_retry

    # First call returns 429, second succeeds
    resp_429 = MagicMock()
    resp_429.status_code = 429

    resp_200 = MagicMock()
    resp_200.status_code = 200
    resp_200.raise_for_status = MagicMock()
    resp_200.json.return_value = {"vulns": []}

    mock_post.side_effect = [resp_429, resp_200]
    result = _post_with_retry("https://api.osv.dev/v1/query", {})
    assert result == {"vulns": []}
    assert mock_sleep.called


@patch("sentinel_dependency.osv_scanner.http_requests.post")
def test_post_with_retry_timeout(mock_post):
    import requests as real_requests
    from sentinel_dependency.osv_scanner import _post_with_retry

    mock_post.side_effect = real_requests.exceptions.Timeout("timed out")
    result = _post_with_retry("https://api.osv.dev/v1/query", {}, retries=0)
    assert result is None


@patch("sentinel_dependency.osv_scanner.http_requests.post")
def test_post_with_retry_connection_error(mock_post):
    import requests as real_requests
    from sentinel_dependency.osv_scanner import _post_with_retry

    mock_post.side_effect = real_requests.exceptions.ConnectionError("refused")
    result = _post_with_retry("https://api.osv.dev/v1/query", {}, retries=0)
    assert result is None


@patch("sentinel_dependency.osv_scanner.http_requests.post")
def test_post_with_retry_malformed_json(mock_post):
    from sentinel_dependency.osv_scanner import _post_with_retry

    resp = MagicMock()
    resp.status_code = 200
    resp.raise_for_status = MagicMock()
    resp.json.side_effect = ValueError("bad json")
    mock_post.return_value = resp

    result = _post_with_retry("https://api.osv.dev/v1/query", {}, retries=0)
    assert result is None
