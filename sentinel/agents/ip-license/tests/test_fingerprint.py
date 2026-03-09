from sentinel_agents.types import DiffEvent, DiffFile, DiffHunk, ScanConfig
from sentinel_license.fingerprint import (
    normalize_code,
    hash_fragment,
    fingerprint_code,
    KNOWN_OSS_HASHES,
)


def test_normalize_strips_comments_and_whitespace():
    code = """
    # This is a comment
    def hello():
        x = 1    +    2
        return x
    """
    normalized = normalize_code(code)
    assert "# This is a comment" not in normalized
    assert "def hello():" in normalized
    assert "x = 1 + 2" in normalized  # whitespace normalized


def test_normalize_strips_blank_lines():
    code = "line1\n\n\nline2"
    normalized = normalize_code(code)
    assert normalized == "line1\nline2"


def test_normalize_strips_multiline_comment_markers():
    code = '"""\nThis is a docstring\n"""\ndef foo(): pass'
    normalized = normalize_code(code)
    assert '"""' not in normalized
    assert "def foo(): pass" in normalized


def test_hash_fragment_deterministic():
    code = "def hello():\n    return 42"
    h1 = hash_fragment(code)
    h2 = hash_fragment(code)
    assert h1 == h2
    assert len(h1) == 16  # 16 hex chars


def test_hash_fragment_different_for_different_code():
    h1 = hash_fragment("def hello(): return 1")
    h2 = hash_fragment("def hello(): return 2")
    assert h1 != h2


def _make_event(code: str, path: str = "file.py") -> DiffEvent:
    return DiffEvent(
        scan_id="scan_test",
        project_id="proj_1",
        commit_hash="abc",
        branch="main",
        author="dev@test.com",
        timestamp="2026-03-09T12:00:00Z",
        files=[
            DiffFile(
                path=path,
                language="python",
                hunks=[
                    DiffHunk(
                        old_start=1, old_count=0, new_start=1, new_count=1, content=code
                    )
                ],
                ai_score=0.9,
            )
        ],
        scan_config=ScanConfig(
            security_level="standard",
            license_policy="MIT",
            quality_threshold=0.7,
        ),
    )


def test_fingerprint_skips_short_fragments():
    # Only 2 added lines — too short to fingerprint
    event = _make_event("+line1\n+line2\n")
    findings = fingerprint_code(event)
    assert len(findings) == 0


def test_fingerprint_matches_known_hash():
    # Build a code block of 10+ lines and register its hash
    lines = [f"+def func_{i}(): return {i}" for i in range(12)]
    code = "\n".join(lines) + "\n"

    # Pre-compute what the fingerprinter will see
    from sentinel_license.fingerprint import normalize_code, hash_fragment

    raw_lines = [line[1:] for line in lines]
    window = "\n".join(raw_lines[:10])
    normalized = normalize_code(window)
    fprint = hash_fragment(normalized)

    # Register in the known hashes
    KNOWN_OSS_HASHES[fprint] = ("https://github.com/example/repo", "GPL")
    try:
        findings = fingerprint_code(_make_event(code))
        assert len(findings) >= 1
        assert "example/repo" in findings[0].title
        assert findings[0].severity.value == "high"
    finally:
        del KNOWN_OSS_HASHES[fprint]


def test_fingerprint_no_match_for_unknown_code():
    lines = [f"+unique_line_{i}_xyz = {i * 42}" for i in range(12)]
    code = "\n".join(lines) + "\n"
    findings = fingerprint_code(_make_event(code))
    assert len(findings) == 0
