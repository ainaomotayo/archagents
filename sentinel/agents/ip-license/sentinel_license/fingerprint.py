"""Code fingerprinting for OSS detection.

Uses AST-normalized fingerprinting (via agent_core) for supported languages,
with text-based normalization fallback. Includes binary format detection.
"""

from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass

from sentinel_agents.types import Confidence, DiffEvent, Finding, Severity
from sentinel_license.fingerprint_db import FingerprintDB
from sentinel_license.minhash import LSHIndex, MinHashSignature, compute_minhash

# Languages supported by agent_core tree-sitter fingerprinting
_AST_LANGUAGES = {
    "python", "javascript", "typescript", "js", "ts", "jsx", "tsx",
    "go", "rust", "java", "ruby", "c", "cpp", "cc",
}


# Legacy dict kept for backward compatibility with tests that inject hashes.
# Primary lookup is via _fingerprint_db (SQLite).
KNOWN_OSS_HASHES: dict[str, tuple[str, str]] = {}


def _resolve_data_path(filename: str) -> str:
    """Resolve path to a data file, supporting both dev and Docker layouts.

    Checks (in order):
    1. SENTINEL_DATA_DIR env var (explicit override for Docker/k8s)
    2. Relative to source: ``sentinel_license/../data/``  (dev / editable install)
    3. ``/app/data/`` (Docker fallback via shared agent.Dockerfile)
    """
    env_dir = os.environ.get("SENTINEL_DATA_DIR")
    if env_dir:
        return os.path.join(env_dir, filename)

    dev_path = os.path.join(os.path.dirname(__file__), "..", "data", filename)
    if os.path.exists(dev_path):
        return dev_path

    # Docker: shared agent.Dockerfile puts agent at /app/agent/
    docker_path = os.path.join("/app", "agent", "data", filename)
    if os.path.exists(docker_path):
        return docker_path

    # Default to dev path (will create new DB if needed)
    return dev_path


def _init_fingerprint_db() -> FingerprintDB:
    """Load the SQLite fingerprint DB, falling back to JSON import."""
    db_path = _resolve_data_path("oss_fingerprints.db")
    json_path = _resolve_data_path("oss_fingerprints.json")
    if os.path.exists(db_path):
        return FingerprintDB(db_path)
    # Create DB and import from legacy JSON if available
    db = FingerprintDB(db_path)
    if os.path.exists(json_path):
        try:
            db.import_legacy_json(json_path)
        except Exception:
            pass
    return db


_fingerprint_db: FingerprintDB = _init_fingerprint_db()


def _tokenize_window(code: str, language: str) -> set[str]:
    """Split code into tokens, return set of 3-grams."""
    # Split on whitespace and punctuation boundaries
    tokens = re.findall(r"[A-Za-z_]\w*|[^\s]", code)
    if len(tokens) < 3:
        return set()
    ngrams: set[str] = set()
    for i in range(len(tokens) - 2):
        ngrams.add(f"{tokens[i]} {tokens[i+1]} {tokens[i+2]}")
    return ngrams


def _init_lsh_index() -> tuple[LSHIndex, dict, dict]:
    """Lazily load the LSH index from the fingerprint DB."""
    try:
        return _fingerprint_db.load_lsh_index()
    except Exception:
        from sentinel_license.fingerprint_db import FingerprintRecord
        return LSHIndex(), {}, {}


_lsh_index, _lsh_records, _lsh_sigs = _init_lsh_index()


# --- Binary Format Detection ---

@dataclass
class BinaryInfo:
    """Detected binary format."""

    format: str  # "ELF", "MachO", "PE", "JAR", "WASM"
    detail: str


# Magic bytes for common binary formats
_MAGIC_BYTES: list[tuple[bytes, str, str]] = [
    (b"\x7fELF", "ELF", "Linux/Unix executable"),
    (b"\xfe\xed\xfa\xce", "MachO", "macOS executable (32-bit)"),
    (b"\xfe\xed\xfa\xcf", "MachO", "macOS executable (64-bit)"),
    (b"\xcf\xfa\xed\xfe", "MachO", "macOS executable (64-bit, reversed)"),
    (b"MZ", "PE", "Windows executable"),
    (b"PK\x03\x04", "JAR", "Java archive / ZIP"),
    (b"\x00asm", "WASM", "WebAssembly binary"),
]


def detect_binary(content: bytes) -> BinaryInfo | None:
    """Detect binary format from magic bytes."""
    for magic, fmt, detail in _MAGIC_BYTES:
        if content[:len(magic)] == magic:
            return BinaryInfo(format=fmt, detail=detail)
    return None


# --- Code Normalization ---

def normalize_code(code: str) -> str:
    """Normalize code for fingerprinting: strip whitespace, comments, blank lines."""
    lines = []
    for line in code.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith(("#", "//", "/*", "*", "*/", "'''", '"""')):
            continue
        normalized = re.sub(r"\s+", " ", stripped)
        lines.append(normalized)
    return "\n".join(lines)


def hash_fragment(code: str) -> str:
    """Hash a normalized code fragment."""
    return hashlib.sha256(code.encode()).hexdigest()[:16]


def _ast_fingerprint(code: str, language: str) -> str:
    """AST-normalized fingerprint via agent_core."""
    from agent_core.analysis.fingerprint import fingerprint_code as ast_fp
    return ast_fp(code, language)[:16]


# --- Fingerprinting Pipeline ---

def fingerprint_code(event: DiffEvent) -> list[Finding]:
    """Fingerprint added code fragments against known OSS corpus."""
    findings: list[Finding] = []

    for diff_file in event.files:
        added_lines: list[str] = []
        start_line = 0

        for hunk in diff_file.hunks:
            current_line = hunk.new_start
            for raw_line in hunk.content.splitlines():
                if raw_line.startswith("+") and not raw_line.startswith("+++"):
                    if not added_lines:
                        start_line = current_line
                    added_lines.append(raw_line[1:])
                    current_line += 1
                elif raw_line.startswith("-"):
                    continue
                else:
                    current_line += 1

        if len(added_lines) < 5:
            continue

        lang = diff_file.language.lower()
        use_ast = lang in _AST_LANGUAGES

        # Fingerprint sliding windows of 10 lines
        window_size = 10
        for i in range(0, len(added_lines) - window_size + 1, 5):
            window = "\n".join(added_lines[i : i + window_size])

            # Try AST fingerprint first, fall back to text normalization
            if use_ast:
                try:
                    fprint = _ast_fingerprint(window, lang)
                except Exception:
                    normalized = normalize_code(window)
                    if not normalized:
                        continue
                    fprint = hash_fragment(normalized)
            else:
                normalized = normalize_code(window)
                if not normalized:
                    continue
                fprint = hash_fragment(normalized)

            # Try SQLite DB first, then fall back to legacy dict
            rec = _fingerprint_db.lookup(fprint)
            if rec is not None:
                source = rec.source_url
                license_name = rec.spdx_license or "unknown"
                extra = {
                    "similarityScore": 1.0,
                    "sourceMatch": source,
                    "licenseDetected": license_name,
                    "findingType": "copyleft-risk",
                    "policyAction": "review",
                    "packageVersion": rec.package_version,
                    "ecosystem": rec.ecosystem,
                    "matchType": "exact",
                }
            elif fprint in KNOWN_OSS_HASHES:
                source, license_name = KNOWN_OSS_HASHES[fprint]
                extra = {
                    "similarityScore": 1.0,
                    "sourceMatch": source,
                    "licenseDetected": license_name,
                    "findingType": "copyleft-risk",
                    "policyAction": "review",
                }
            else:
                # Fuzzy matching fallback via MinHash/LSH
                tokens = _tokenize_window(window, lang)
                if not tokens:
                    continue
                sig = compute_minhash(tokens)
                candidates = _lsh_index.query(sig)
                best_sim = 0.0
                best_id = None
                for cand_id in candidates:
                    cand_sig = _lsh_sigs.get(cand_id)
                    if cand_sig is None:
                        continue
                    sim = sig.similarity(cand_sig)
                    if sim > best_sim:
                        best_sim = sim
                        best_id = cand_id
                if best_id is None or best_sim < 0.7:
                    continue
                rec = _lsh_records[best_id]
                source = rec.source_url
                license_name = rec.spdx_license or "unknown"
                extra = {
                    "similarityScore": best_sim,
                    "sourceMatch": source,
                    "licenseDetected": license_name,
                    "findingType": "copyleft-risk",
                    "policyAction": "review",
                    "packageVersion": rec.package_version,
                    "ecosystem": rec.ecosystem,
                    "matchType": "fuzzy",
                }

            findings.append(
                Finding(
                    type="license",
                    file=diff_file.path,
                    line_start=start_line + i,
                    line_end=start_line + i + window_size,
                    severity=(
                        Severity.HIGH
                        if license_name in ("GPL", "AGPL")
                        else Severity.MEDIUM
                    ),
                    confidence=Confidence.MEDIUM,
                    title=f"Code matches known OSS: {source}",
                    description=(
                        f"Code fragment matches {source} (license: {license_name})"
                    ),
                    category="copyleft-risk",
                    scanner="fingerprint",
                    extra=extra,
                )
            )

    return findings
