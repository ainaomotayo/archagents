"""Git timing heuristics for AI-generation detection.

Analyzes commit size (lines changed) vs time since last commit. Large commits
produced in short timeframes suggest AI generation.
"""

from __future__ import annotations

from dataclasses import dataclass

from sentinel_agents.types import DiffFile


@dataclass
class TimingSignal:
    """Result of git timing analysis."""

    lines_changed: int
    probability: float  # 0.0 to 1.0


# Thresholds for lines-changed heuristic.
# These assume a single commit's diff; the timestamp gap is not available from
# DiffEvent alone, so we use lines-changed as a proxy signal.
_LOW_THRESHOLD = 50  # Below this, unlikely to be bulk AI generation
_HIGH_THRESHOLD = 500  # Above this, very likely bulk generation


def _count_added_lines(files: list[DiffFile]) -> int:
    """Count total added lines across all files in the diff."""
    total = 0
    for f in files:
        for hunk in f.hunks:
            for line in hunk.content.split("\n"):
                if line.startswith("+") and not line.startswith("+++"):
                    total += 1
    return total


def analyze_timing(files: list[DiffFile], timestamp: str) -> TimingSignal:
    """Analyze commit size as a heuristic for AI generation.

    Large diffs (many added lines) in a single commit suggest bulk AI-generated code.
    The timestamp is accepted for future use (e.g., comparing against previous commit
    timestamps) but currently the heuristic focuses on lines changed.

    Returns a TimingSignal with a probability from 0.0 to 1.0.
    """
    lines_changed = _count_added_lines(files)

    if lines_changed <= _LOW_THRESHOLD:
        probability = 0.0
    elif lines_changed >= _HIGH_THRESHOLD:
        probability = 1.0
    else:
        # Linear interpolation between thresholds
        probability = (lines_changed - _LOW_THRESHOLD) / (_HIGH_THRESHOLD - _LOW_THRESHOLD)

    return TimingSignal(lines_changed=lines_changed, probability=probability)
