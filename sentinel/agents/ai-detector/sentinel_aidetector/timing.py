"""Git timing heuristics for AI-generation detection.

Analyzes commit size (lines changed), file count burst patterns, and commit size
uniformity as indicators of AI generation.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass

from sentinel_agents.types import DiffFile


@dataclass
class TimingSignal:
    """Result of git timing analysis."""

    lines_changed: int
    probability: float  # 0.0 to 1.0
    file_count: int = 0
    is_burst: bool = False
    size_uniformity: float = 0.0  # 0.0 = varied, 1.0 = very uniform


# Thresholds for lines-changed heuristic.
_LOW_THRESHOLD = 50  # Below this, unlikely to be bulk AI generation
_HIGH_THRESHOLD = 500  # Above this, very likely bulk generation

# Burst detection: many files touched in a single commit
_BURST_FILE_THRESHOLD = 10  # 10+ files in one commit

# Size uniformity: if per-file line counts have low coefficient of variation
_UNIFORMITY_CV_THRESHOLD = 0.3  # CV < 0.3 = suspiciously uniform


def _count_added_lines(files: list[DiffFile]) -> int:
    """Count total added lines across all files in the diff."""
    total = 0
    for f in files:
        for hunk in f.hunks:
            for line in hunk.content.split("\n"):
                if line.startswith("+") and not line.startswith("+++"):
                    total += 1
    return total


def _per_file_line_counts(files: list[DiffFile]) -> list[int]:
    """Count added lines per file."""
    counts: list[int] = []
    for f in files:
        count = 0
        for hunk in f.hunks:
            for line in hunk.content.split("\n"):
                if line.startswith("+") and not line.startswith("+++"):
                    count += 1
        if count > 0:
            counts.append(count)
    return counts


def _compute_size_uniformity(per_file: list[int]) -> float:
    """Compute size uniformity (1.0 = very uniform, 0.0 = highly varied).

    Uses inverse coefficient of variation. AI-generated bulk commits often
    produce files of similar size.
    """
    if len(per_file) < 3:
        return 0.0
    mean = statistics.mean(per_file)
    if mean == 0:
        return 0.0
    stdev = statistics.stdev(per_file)
    cv = stdev / mean
    if cv <= _UNIFORMITY_CV_THRESHOLD:
        return 1.0 - (cv / _UNIFORMITY_CV_THRESHOLD)
    return 0.0


def analyze_timing(files: list[DiffFile], timestamp: str) -> TimingSignal:
    """Analyze commit size and patterns as heuristics for AI generation.

    Combines three signals:
    - Lines changed: large diffs suggest bulk generation
    - File burst: many files in one commit
    - Size uniformity: similar-sized files suggest templated generation
    """
    lines_changed = _count_added_lines(files)
    file_count = len(files)
    per_file = _per_file_line_counts(files)
    is_burst = file_count >= _BURST_FILE_THRESHOLD
    size_uniformity = _compute_size_uniformity(per_file)

    # Base probability from lines changed
    if lines_changed <= _LOW_THRESHOLD:
        base_prob = 0.0
    elif lines_changed >= _HIGH_THRESHOLD:
        base_prob = 1.0
    else:
        base_prob = (lines_changed - _LOW_THRESHOLD) / (_HIGH_THRESHOLD - _LOW_THRESHOLD)

    # Boost for burst pattern
    burst_boost = 0.15 if is_burst else 0.0

    # Boost for uniform file sizes
    uniformity_boost = 0.10 * size_uniformity

    probability = max(0.0, min(1.0, base_prob + burst_boost + uniformity_boost))

    return TimingSignal(
        lines_changed=lines_changed,
        probability=probability,
        file_count=file_count,
        is_burst=is_burst,
        size_uniformity=round(size_uniformity, 3),
    )
