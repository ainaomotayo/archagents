"""Tests for cross-file manifest analysis."""

from __future__ import annotations

from sentinel_dependency.cross_manifest import detect_cross_manifest_issues
from sentinel_dependency.manifest_parser import DependencyDeclaration


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _dep(pkg: str, version: str, ecosystem: str, file_path: str, line: int = 1) -> DependencyDeclaration:
    return DependencyDeclaration(pkg, version, ecosystem, file_path, line)


# ---------------------------------------------------------------------------
# 1. Version conflict detection
# ---------------------------------------------------------------------------

class TestVersionConflict:
    def test_same_package_different_versions(self):
        deps = [
            _dep("requests", "2.28.0", "PyPI", "requirements.txt", 1),
            _dep("requests", "2.31.0", "PyPI", "pyproject.toml", 5),
        ]
        findings = detect_cross_manifest_issues(deps)
        conflict = [f for f in findings if f.category == "version-conflict"]
        assert len(conflict) == 1
        assert "2.28.0" in conflict[0].description
        assert "2.31.0" in conflict[0].description

    def test_same_version_no_conflict(self):
        deps = [
            _dep("requests", "2.28.0", "PyPI", "requirements.txt", 1),
            _dep("requests", "2.28.0", "PyPI", "pyproject.toml", 5),
        ]
        findings = detect_cross_manifest_issues(deps)
        conflicts = [f for f in findings if f.category == "version-conflict"]
        assert len(conflicts) == 0


# ---------------------------------------------------------------------------
# 2. Duplicate declaration detection
# ---------------------------------------------------------------------------

class TestDuplicateDeclaration:
    def test_same_package_in_two_manifests(self):
        deps = [
            _dep("flask", "3.0.0", "PyPI", "requirements.txt", 1),
            _dep("flask", "3.0.0", "PyPI", "pyproject.toml", 2),
        ]
        findings = detect_cross_manifest_issues(deps)
        dupes = [f for f in findings if f.category == "duplicate-dependency"]
        assert len(dupes) == 1
        assert "flask" in dupes[0].title

    def test_same_file_not_flagged(self):
        deps = [
            _dep("flask", "3.0.0", "PyPI", "requirements.txt", 1),
            _dep("flask", "3.0.0", "PyPI", "requirements.txt", 5),
        ]
        findings = detect_cross_manifest_issues(deps)
        assert len(findings) == 0

    def test_single_declaration_not_flagged(self):
        deps = [
            _dep("flask", "3.0.0", "PyPI", "requirements.txt", 1),
        ]
        findings = detect_cross_manifest_issues(deps)
        assert len(findings) == 0


# ---------------------------------------------------------------------------
# 3. Cross-ecosystem overlap
# ---------------------------------------------------------------------------

class TestCrossEcosystemOverlap:
    def test_http_clients_across_ecosystems(self):
        deps = [
            _dep("requests", "2.28.0", "PyPI", "requirements.txt", 1),
            _dep("axios", "1.6.0", "npm", "package.json", 3),
        ]
        findings = detect_cross_manifest_issues(deps)
        overlap = [f for f in findings if f.category == "cross-ecosystem-overlap"]
        assert len(overlap) == 1
        assert "requests" in overlap[0].title
        assert "axios" in overlap[0].title

    def test_same_ecosystem_no_cross_overlap(self):
        deps = [
            _dep("requests", "2.28.0", "PyPI", "requirements.txt", 1),
            _dep("httpx", "0.25.0", "PyPI", "pyproject.toml", 2),
        ]
        findings = detect_cross_manifest_issues(deps)
        overlap = [f for f in findings if f.category == "cross-ecosystem-overlap"]
        assert len(overlap) == 0

    def test_unrelated_packages_no_overlap(self):
        deps = [
            _dep("requests", "2.28.0", "PyPI", "requirements.txt", 1),
            _dep("react", "19.0.0", "npm", "package.json", 1),
        ]
        findings = detect_cross_manifest_issues(deps)
        overlap = [f for f in findings if f.category == "cross-ecosystem-overlap"]
        assert len(overlap) == 0


# ---------------------------------------------------------------------------
# 4. Empty / edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_empty_deps(self):
        assert detect_cross_manifest_issues([]) == []

    def test_single_dep(self):
        deps = [_dep("flask", "3.0.0", "PyPI", "requirements.txt")]
        assert detect_cross_manifest_issues(deps) == []

    def test_multiple_issues_combined(self):
        deps = [
            _dep("requests", "2.28.0", "PyPI", "requirements.txt", 1),
            _dep("requests", "2.31.0", "PyPI", "pyproject.toml", 2),
            _dep("axios", "1.6.0", "npm", "package.json", 3),
        ]
        findings = detect_cross_manifest_issues(deps)
        categories = {f.category for f in findings}
        assert "version-conflict" in categories
        assert "cross-ecosystem-overlap" in categories


# ---------------------------------------------------------------------------
# 5. Finding structure
# ---------------------------------------------------------------------------

class TestFindingStructure:
    def test_version_conflict_severity(self):
        deps = [
            _dep("express", "4.18.0", "npm", "package.json", 1),
            _dep("express", "5.0.0", "npm", "apps/api/package.json", 1),
        ]
        findings = detect_cross_manifest_issues(deps)
        conflict = [f for f in findings if f.category == "version-conflict"]
        assert len(conflict) == 1
        assert conflict[0].severity.value == "high"
        assert conflict[0].scanner == "cross-manifest"

    def test_overlap_severity_is_info(self):
        deps = [
            _dep("flask", "3.0.0", "PyPI", "requirements.txt", 1),
            _dep("express", "4.18.0", "npm", "package.json", 1),
        ]
        findings = detect_cross_manifest_issues(deps)
        overlap = [f for f in findings if f.category == "cross-ecosystem-overlap"]
        assert len(overlap) == 1
        assert overlap[0].severity.value == "info"
