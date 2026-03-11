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


class TestBurstDetection:
    def test_burst_with_many_files(self):
        """10+ files should trigger burst detection."""
        files = []
        for i in range(12):
            files.append(
                DiffFile(
                    path=f"file_{i}.py",
                    language="python",
                    hunks=[
                        DiffHunk(
                            old_start=1,
                            old_count=0,
                            new_start=1,
                            new_count=50,
                            content="\n".join(f"+line {j}" for j in range(50)),
                        )
                    ],
                    ai_score=0.0,
                )
            )
        signal = analyze_timing(files, "2026-03-09T12:00:00Z")
        assert signal.is_burst is True
        assert signal.file_count == 12

    def test_no_burst_with_few_files(self):
        signal = analyze_timing(_make_files(100), "2026-03-09T12:00:00Z")
        assert signal.is_burst is False

    def test_size_uniformity_similar_files(self):
        """Files with identical line counts should show high uniformity."""
        files = []
        for i in range(5):
            files.append(
                DiffFile(
                    path=f"file_{i}.py",
                    language="python",
                    hunks=[
                        DiffHunk(
                            old_start=1,
                            old_count=0,
                            new_start=1,
                            new_count=50,
                            content="\n".join(f"+line {j}" for j in range(50)),
                        )
                    ],
                    ai_score=0.0,
                )
            )
        signal = analyze_timing(files, "2026-03-09T12:00:00Z")
        assert signal.size_uniformity > 0.5

    def test_size_uniformity_varied_files(self):
        """Files with very different line counts should show low uniformity."""
        files = []
        for i, count in enumerate([10, 200, 5, 500, 2]):
            content = "\n".join(f"+line {j}" for j in range(count))
            files.append(
                DiffFile(
                    path=f"file_{i}.py",
                    language="python",
                    hunks=[DiffHunk(1, 0, 1, count, content)],
                    ai_score=0.0,
                )
            )
        signal = analyze_timing(files, "2026-03-09T12:00:00Z")
        assert signal.size_uniformity == 0.0
