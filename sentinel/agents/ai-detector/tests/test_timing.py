from sentinel_agents.types import DiffFile, DiffHunk

from sentinel_aidetector.timing import analyze_timing


def _make_files(added_lines: int) -> list[DiffFile]:
    content = "\n".join(f"+line {i}" for i in range(added_lines))
    return [
        DiffFile(
            path="bulk.py",
            language="python",
            hunks=[
                DiffHunk(
                    old_start=1,
                    old_count=0,
                    new_start=1,
                    new_count=added_lines,
                    content=content,
                )
            ],
            ai_score=0.0,
        )
    ]


def test_small_commit_zero_probability():
    signal = analyze_timing(_make_files(10), "2026-03-09T12:00:00Z")
    assert signal.probability == 0.0
    assert signal.lines_changed == 10


def test_large_commit_high_probability():
    signal = analyze_timing(_make_files(600), "2026-03-09T12:00:00Z")
    assert signal.probability == 1.0
    assert signal.lines_changed == 600


def test_medium_commit_partial_probability():
    signal = analyze_timing(_make_files(275), "2026-03-09T12:00:00Z")
    assert 0.3 < signal.probability < 0.7


def test_empty_files_zero():
    signal = analyze_timing([], "2026-03-09T12:00:00Z")
    assert signal.probability == 0.0
    assert signal.lines_changed == 0
