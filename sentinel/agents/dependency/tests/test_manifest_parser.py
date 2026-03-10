"""Tests for manifest_parser module."""
from sentinel_agents.types import DiffEvent, DiffFile, DiffHunk, ScanConfig
from sentinel_dependency.manifest_parser import (
    DependencyDeclaration,
    parse_manifests_from_diff,
    _added_lines,
    _clean_version,
)


def _make_diff_file(path: str, content: str, lang: str = "unknown") -> DiffFile:
    return DiffFile(
        path=path,
        language=lang,
        hunks=[DiffHunk(old_start=1, old_count=0, new_start=1, new_count=10, content=content)],
        ai_score=0.0,
    )


# ---------------------------------------------------------------------------
# _added_lines helper
# ---------------------------------------------------------------------------

def test_added_lines_only_includes_plus_lines():
    content = "+added\n context\n-removed\n+also added\n"
    result = _added_lines(content, 1)
    assert len(result) == 2
    assert result[0] == (1, "added")
    assert result[1] == (3, "also added")


def test_added_lines_skips_triple_plus():
    content = "+++ b/file.txt\n+real line\n"
    result = _added_lines(content, 1)
    assert len(result) == 1
    assert result[0][1] == "real line"


# ---------------------------------------------------------------------------
# _clean_version
# ---------------------------------------------------------------------------

def test_clean_version_strips_operators():
    assert _clean_version("^1.2.3") == "1.2.3"
    assert _clean_version("~1.0") == "1.0"
    assert _clean_version(">=2.28.0") == "2.28.0"
    assert _clean_version("==3.0.1") == "3.0.1"


def test_clean_version_returns_empty_for_star():
    assert _clean_version("*") == ""
    assert _clean_version("latest") == ""


# ---------------------------------------------------------------------------
# requirements.txt
# ---------------------------------------------------------------------------

def test_requirements_txt_parsing():
    content = "+requests==2.28.0\n+flask>=2.0\n+# comment\n+numpy\n"
    files = [_make_diff_file("requirements.txt", content)]
    deps = parse_manifests_from_diff(files)

    names = {d.package_name for d in deps}
    assert "requests" in names
    assert "flask" in names
    assert "numpy" in names

    # Check version extraction
    reqs = {d.package_name: d for d in deps}
    assert reqs["requests"].version == "2.28.0"
    assert reqs["flask"].version == "2.0"
    assert reqs["requests"].ecosystem == "PyPI"


def test_requirements_txt_only_added_lines():
    content = "-old_package==1.0\n+new_package==2.0\n context_line\n"
    files = [_make_diff_file("requirements.txt", content)]
    deps = parse_manifests_from_diff(files)
    names = [d.package_name for d in deps]
    assert "new_package" in names
    assert "old_package" not in names


# ---------------------------------------------------------------------------
# package.json
# ---------------------------------------------------------------------------

def test_package_json_parsing():
    content = (
        '+    "express": "^4.18.0",\n'
        '+    "lodash": "~4.17.21",\n'
        '+    "@scope/pkg": "1.0.0",\n'
    )
    files = [_make_diff_file("package.json", content)]
    deps = parse_manifests_from_diff(files)

    names = {d.package_name for d in deps}
    assert "express" in names
    assert "lodash" in names
    assert "@scope/pkg" in names

    by_name = {d.package_name: d for d in deps}
    assert by_name["express"].version == "4.18.0"
    assert by_name["express"].ecosystem == "npm"


def test_package_json_only_added_lines():
    content = '-    "removed": "1.0.0",\n+    "added": "2.0.0",\n'
    files = [_make_diff_file("package.json", content)]
    deps = parse_manifests_from_diff(files)
    names = [d.package_name for d in deps]
    assert "added" in names
    assert "removed" not in names


# ---------------------------------------------------------------------------
# pyproject.toml
# ---------------------------------------------------------------------------

def test_pyproject_toml_pep621():
    content = '+    "requests>=2.28",\n+    "flask>=2.0.0",\n'
    files = [_make_diff_file("pyproject.toml", content)]
    deps = parse_manifests_from_diff(files)

    names = {d.package_name for d in deps}
    assert "requests" in names
    assert "flask" in names

    by_name = {d.package_name: d for d in deps}
    assert by_name["requests"].version == "2.28"
    assert by_name["requests"].ecosystem == "PyPI"


def test_pyproject_toml_poetry_style():
    content = '+requests = "^2.28.0"\n+flask = "^2.0"\n'
    files = [_make_diff_file("pyproject.toml", content)]
    deps = parse_manifests_from_diff(files)

    names = {d.package_name for d in deps}
    assert "requests" in names
    assert "flask" in names


def test_pyproject_toml_skips_metadata():
    content = '+name = "my-project"\n+version = "1.0.0"\n+python = "^3.12"\n'
    files = [_make_diff_file("pyproject.toml", content)]
    deps = parse_manifests_from_diff(files)
    names = [d.package_name for d in deps]
    assert "name" not in names
    assert "version" not in names
    assert "python" not in names


# ---------------------------------------------------------------------------
# go.mod
# ---------------------------------------------------------------------------

def test_go_mod_parsing():
    content = "+\tgithub.com/gin-gonic/gin v1.9.1\n+\tgolang.org/x/net v0.10.0\n"
    files = [_make_diff_file("go.mod", content)]
    deps = parse_manifests_from_diff(files)

    assert len(deps) == 2
    assert deps[0].package_name == "github.com/gin-gonic/gin"
    assert deps[0].version == "1.9.1"
    assert deps[0].ecosystem == "Go"


# ---------------------------------------------------------------------------
# Cargo.toml
# ---------------------------------------------------------------------------

def test_cargo_toml_parsing():
    content = '+serde = "1.0"\n+tokio = { version = "1.28", features = ["full"] }\n'
    files = [_make_diff_file("Cargo.toml", content)]
    deps = parse_manifests_from_diff(files)

    names = {d.package_name for d in deps}
    assert "serde" in names
    assert "tokio" in names

    by_name = {d.package_name: d for d in deps}
    assert by_name["serde"].ecosystem == "crates.io"
    assert by_name["tokio"].version == "1.28"


# ---------------------------------------------------------------------------
# Gemfile
# ---------------------------------------------------------------------------

def test_gemfile_parsing():
    content = "+gem 'rails', '~> 7.0'\n+gem 'pg'\n"
    files = [_make_diff_file("Gemfile", content)]
    deps = parse_manifests_from_diff(files)

    names = {d.package_name for d in deps}
    assert "rails" in names
    assert "pg" in names

    by_name = {d.package_name: d for d in deps}
    assert by_name["rails"].ecosystem == "RubyGems"
    assert by_name["rails"].version == "7.0"


# ---------------------------------------------------------------------------
# Unrecognised files are ignored
# ---------------------------------------------------------------------------

def test_unknown_file_ignored():
    content = "+some content\n"
    files = [_make_diff_file("README.md", content)]
    deps = parse_manifests_from_diff(files)
    assert deps == []


# ---------------------------------------------------------------------------
# Multiple files in one event
# ---------------------------------------------------------------------------

def test_multiple_manifest_files():
    files = [
        _make_diff_file("requirements.txt", "+requests==2.28.0\n"),
        _make_diff_file("package.json", '+    "express": "^4.18.0"\n'),
    ]
    deps = parse_manifests_from_diff(files)
    names = {d.package_name for d in deps}
    assert "requests" in names
    assert "express" in names
