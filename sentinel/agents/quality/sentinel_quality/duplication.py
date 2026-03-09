"""Duplicate code block detection within diffs."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

from sentinel_agents.types import DiffFile


@dataclass
class DuplicateBlock:
    """A group of identical code blocks found across files."""

    block_hash: str
    locations: list[DuplicateLocation]
    line_count: int
    content_preview: str


@dataclass
class DuplicateLocation:
    """Location of one instance of a duplicated block."""

    file: str
    line_start: int
    line_end: int


# Minimum number of non-blank lines for a block to be considered for duplication.
MIN_BLOCK_LINES = 3


def _normalize_line(line: str) -> str:
    """Normalize a line for comparison: strip whitespace and collapse spacing."""
    return re.sub(r"\s+", " ", line.strip())


def _extract_added_lines(hunk_content: str) -> list[tuple[int, str]]:
    """Extract added lines from a unified-diff hunk, returning (line_number, text) pairs."""
    lines: list[tuple[int, str]] = []
    current_line = 0
    for raw_line in hunk_content.split("\n"):
        if raw_line.startswith("@@"):
            # Parse the new-file line number from the hunk header
            m = re.search(r"\+(\d+)", raw_line)
            if m:
                current_line = int(m.group(1))
            continue
        if raw_line.startswith("+"):
            text = raw_line[1:]
            lines.append((current_line, text))
            current_line += 1
        elif raw_line.startswith("-"):
            # Deleted line — skip, don't increment new-file counter
            continue
        else:
            # Context line
            current_line += 1
    return lines


def _hash_block(normalized_lines: list[str]) -> str:
    """Create a stable hash from a sequence of normalized lines."""
    combined = "\n".join(normalized_lines)
    return hashlib.sha256(combined.encode()).hexdigest()[:16]


def detect_duplicates(
    files: list[DiffFile],
    min_block_lines: int = MIN_BLOCK_LINES,
) -> list[DuplicateBlock]:
    """Find duplicate code blocks across the added lines of the given diff files.

    Uses a sliding-window approach: for each file, extract added lines, normalize them,
    compute hashes for every window of `min_block_lines` consecutive non-blank lines,
    and collect identical hashes.

    Args:
        files: List of DiffFile objects from a DiffEvent.
        min_block_lines: Minimum number of non-blank lines for a block.

    Returns:
        List of DuplicateBlock instances where 2+ identical blocks were found.
    """
    # Map hash -> list of locations
    hash_map: dict[str, list[tuple[DuplicateLocation, list[str]]]] = {}

    for diff_file in files:
        for hunk in diff_file.hunks:
            added = _extract_added_lines(hunk.content)
            # Filter blank lines but keep track of original line numbers
            non_blank = [
                (line_no, _normalize_line(text))
                for line_no, text in added
                if text.strip()
            ]

            # Sliding window
            for i in range(len(non_blank) - min_block_lines + 1):
                window = non_blank[i : i + min_block_lines]
                normalized = [text for _, text in window]
                block_hash = _hash_block(normalized)
                loc = DuplicateLocation(
                    file=diff_file.path,
                    line_start=window[0][0],
                    line_end=window[-1][0],
                )
                hash_map.setdefault(block_hash, []).append((loc, normalized))

    # Collect duplicates (hash appears 2+ times)
    duplicates: list[DuplicateBlock] = []
    seen_hashes: set[str] = set()
    for block_hash, entries in hash_map.items():
        if len(entries) < 2:
            continue
        if block_hash in seen_hashes:
            continue
        seen_hashes.add(block_hash)
        locations = [loc for loc, _ in entries]
        sample_lines = entries[0][1]
        duplicates.append(
            DuplicateBlock(
                block_hash=block_hash,
                locations=locations,
                line_count=min_block_lines,
                content_preview="\n".join(sample_lines[:3]),
            )
        )

    return duplicates
