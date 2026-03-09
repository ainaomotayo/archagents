"""Tests for test coverage gap detection."""

from sentinel_agents.types import DiffFile, DiffHunk

from sentinel_quality.test_coverage import CoverageGap, find_coverage_gaps


def _make_file(path: str, language: str = "python") -> DiffFile:
    return DiffFile(
        path=path,
        language=language,
        hunks=[DiffHunk(old_start=0, old_count=0, new_start=1, new_count=1, content="+# new")],
        ai_score=0.0,
    )


class TestCoverageGaps:
    def test_python_file_without_test(self):
        files = [_make_file("src/parser.py")]
        gaps = find_coverage_gaps(files)
        assert len(gaps) == 1
        assert gaps[0].source_file == "src/parser.py"

    def test_python_file_with_test(self):
        files = [
            _make_file("src/parser.py"),
            _make_file("tests/test_parser.py"),
        ]
        gaps = find_coverage_gaps(files)
        assert len(gaps) == 0

    def test_js_file_without_test(self):
        files = [_make_file("src/utils.ts", "typescript")]
        gaps = find_coverage_gaps(files)
        assert len(gaps) == 1
        assert gaps[0].source_file == "src/utils.ts"

    def test_js_file_with_spec_test(self):
        files = [
            _make_file("src/utils.ts", "typescript"),
            _make_file("src/utils.spec.ts", "typescript"),
        ]
        gaps = find_coverage_gaps(files)
        assert len(gaps) == 0

    def test_js_file_with_test_file(self):
        files = [
            _make_file("src/utils.js", "javascript"),
            _make_file("src/utils.test.js", "javascript"),
        ]
        gaps = find_coverage_gaps(files)
        assert len(gaps) == 0

    def test_test_file_not_flagged(self):
        """A test file itself should never be flagged as missing tests."""
        files = [_make_file("tests/test_parser.py")]
        gaps = find_coverage_gaps(files)
        assert len(gaps) == 0

    def test_non_source_file_ignored(self):
        """Non-source files (e.g., .md, .json) should be ignored."""
        files = [_make_file("README.md", "markdown")]
        gaps = find_coverage_gaps(files)
        assert len(gaps) == 0

    def test_multiple_files_mixed(self):
        files = [
            _make_file("src/a.py"),
            _make_file("tests/test_a.py"),
            _make_file("src/b.py"),
            _make_file("src/c.ts", "typescript"),
            _make_file("src/c.test.ts", "typescript"),
        ]
        gaps = find_coverage_gaps(files)
        # Only b.py should be flagged
        assert len(gaps) == 1
        assert gaps[0].source_file == "src/b.py"
