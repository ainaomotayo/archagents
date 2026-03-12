"""OSS corpus builder - generates real AST fingerprints from source code.

Builds fingerprint corpora from actual OSS package source files for use
in code provenance detection.
"""

from __future__ import annotations

from dataclasses import dataclass

from sentinel_license.fingerprint import (
    _AST_LANGUAGES,
    _ast_fingerprint,
    hash_fragment,
    normalize_code,
)
from sentinel_license.fingerprint_db import FingerprintDB, FingerprintRecord

# Extension to language mapping
_EXT_TO_LANG: dict[str, str] = {
    ".py": "python",
    ".js": "javascript",
    ".ts": "typescript",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".rb": "ruby",
    ".c": "c",
    ".cpp": "cpp",
    ".cc": "cc",
    ".jsx": "jsx",
    ".tsx": "tsx",
}

# Registry base URLs for major ecosystems
REGISTRY_URLS: dict[str, str] = {
    "npm": "https://registry.npmjs.org",
    "PyPI": "https://pypi.org/pypi",
    "crates.io": "https://crates.io/api/v1/crates",
    "Maven": "https://search.maven.org/solrsearch/select",
    "RubyGems": "https://rubygems.org/api/v1/gems",
    "Go": "https://proxy.golang.org",
}


@dataclass
class RegistryPackage:
    """Metadata for a package from a registry."""

    name: str
    version: str
    ecosystem: str
    spdx_license: str
    source_url: str


def fingerprint_source_file(code: str, language: str) -> list[str]:
    """Generate fingerprints from a source file using sliding windows.

    Takes source code string and language name. Splits into lines and
    generates sliding windows (10 lines, stride 5). For AST-supported
    languages, tries AST fingerprinting first, falls back to text
    normalization.

    Returns list of 16-char hex hash strings. Skips files shorter than
    10 lines.
    """
    lines = code.splitlines()
    window_size = 10
    stride = 5

    if len(lines) < window_size:
        return []

    use_ast = language.lower() in _AST_LANGUAGES
    fingerprints: list[str] = []

    for i in range(0, len(lines) - window_size + 1, stride):
        window = "\n".join(lines[i : i + window_size])

        if use_ast:
            try:
                fp = _ast_fingerprint(window, language.lower())
                fingerprints.append(fp)
                continue
            except Exception:
                pass

        normalized = normalize_code(window)
        if not normalized:
            continue
        fingerprints.append(hash_fragment(normalized))

    return fingerprints


def build_corpus_for_package(
    db: FingerprintDB,
    pkg: RegistryPackage,
    source_files: dict[str, str] | None = None,
) -> int:
    """Build fingerprint corpus for a package and store in the database.

    Args:
        db: FingerprintDB instance to store fingerprints in.
        pkg: Package metadata.
        source_files: Optional dict of {filename: code}. If provided,
            fingerprints each file and bulk_inserts records.

    Returns:
        Count of fingerprints added.
    """
    if not source_files:
        return 0

    records: list[FingerprintRecord] = []

    for filepath, code in source_files.items():
        # Detect language from extension
        ext = ""
        dot_idx = filepath.rfind(".")
        if dot_idx >= 0:
            ext = filepath[dot_idx:]
        language = _EXT_TO_LANG.get(ext, "")

        if not language:
            continue

        fps = fingerprint_source_file(code, language)
        lines = code.splitlines()

        for idx, fp in enumerate(fps):
            line_start = idx * 5
            line_end = min(line_start + 10, len(lines))
            records.append(
                FingerprintRecord(
                    hash=fp,
                    source_url=pkg.source_url,
                    package_name=pkg.name,
                    package_version=pkg.version,
                    ecosystem=pkg.ecosystem,
                    spdx_license=pkg.spdx_license,
                    file_path=filepath,
                    line_start=line_start,
                    line_end=line_end,
                )
            )

    if records:
        db.bulk_insert(records)

    return len(records)
