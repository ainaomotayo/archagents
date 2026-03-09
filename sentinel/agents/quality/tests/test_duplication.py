"""Tests for duplicate code block detection."""

from sentinel_agents.types import DiffFile, DiffHunk

from sentinel_quality.duplication import detect_duplicates


def _make_hunk(content: str) -> DiffHunk:
    return DiffHunk(old_start=1, old_count=0, new_start=1, new_count=10, content=content)


def _make_file(path: str, hunk_content: str, language: str = "python") -> DiffFile:
    return DiffFile(
        path=path,
        language=language,
        hunks=[_make_hunk(hunk_content)],
        ai_score=0.0,
    )


class TestDuplication:
    def test_no_duplicates_in_unique_code(self):
        f1 = _make_file(
            "a.py",
            "@@ -0,0 +1,3 @@\n+def foo():\n+    return 1\n+    pass\n",
        )
        f2 = _make_file(
            "b.py",
            "@@ -0,0 +1,3 @@\n+def bar():\n+    return 2\n+    done\n",
        )
        result = detect_duplicates([f1, f2])
        assert len(result) == 0

    def test_detects_duplicate_blocks_across_files(self):
        shared_code = (
            "@@ -0,0 +1,4 @@\n"
            "+x = 1\n"
            "+y = 2\n"
            "+z = x + y\n"
            "+print(z)\n"
        )
        f1 = _make_file("a.py", shared_code)
        f2 = _make_file("b.py", shared_code)
        result = detect_duplicates([f1, f2], min_block_lines=3)
        assert len(result) >= 1
        # Should have at least 2 locations
        assert any(len(d.locations) >= 2 for d in result)

    def test_detects_duplicate_within_same_file(self):
        content = (
            "@@ -0,0 +1,8 @@\n"
            "+x = 1\n"
            "+y = 2\n"
            "+z = x + y\n"
            "+# separator\n"
            "+x = 1\n"
            "+y = 2\n"
            "+z = x + y\n"
            "+print('done')\n"
        )
        f = _make_file("a.py", content)
        result = detect_duplicates([f], min_block_lines=3)
        assert len(result) >= 1

    def test_ignores_blank_lines(self):
        content = (
            "@@ -0,0 +1,4 @@\n"
            "+\n"
            "+\n"
            "+\n"
            "+x = 1\n"
        )
        f = _make_file("a.py", content)
        result = detect_duplicates([f], min_block_lines=3)
        assert len(result) == 0

    def test_empty_files(self):
        result = detect_duplicates([])
        assert result == []
