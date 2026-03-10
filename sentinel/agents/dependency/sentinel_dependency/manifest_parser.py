"""Parse dependency declarations from diff content (added lines only)."""
from __future__ import annotations

import json
import re
from typing import NamedTuple


class DependencyDeclaration(NamedTuple):
    package_name: str
    version: str  # version or range; may be empty
    ecosystem: str  # "PyPI", "npm", "Go", "crates.io", "Maven", "RubyGems"
    file_path: str
    line_number: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_MANIFEST_PARSERS: dict[str, type["_ManifestParser"]] = {}


def _added_lines(hunk_content: str, new_start: int) -> list[tuple[int, str]]:
    """Return (line_number, text) for every added line in a unified-diff hunk."""
    results: list[tuple[int, str]] = []
    current_line = new_start
    for raw in hunk_content.splitlines():
        if raw.startswith("+++"):
            continue
        if raw.startswith("+"):
            results.append((current_line, raw[1:]))
            current_line += 1
        elif raw.startswith("-"):
            pass  # removed line, don't advance new-file counter
        else:
            current_line += 1  # context line
    return results


def _clean_version(v: str) -> str:
    """Strip common range prefixes to get a plausible concrete version, or return empty."""
    v = v.strip().strip('"').strip("'").strip()
    # Strip operators like ^, ~, >=, <=, ==, !=, ~=
    v = re.sub(r"^[~^>=<!]+", "", v).strip()
    # If it looks like a semver-ish string, keep it
    if re.match(r"\d+(\.\d+)*", v):
        return v
    return ""


# ---------------------------------------------------------------------------
# Parser base
# ---------------------------------------------------------------------------

class _ManifestParser:
    """Base class for manifest parsers."""

    @staticmethod
    def matches(file_path: str) -> bool:
        raise NotImplementedError

    @staticmethod
    def parse(added_lines: list[tuple[int, str]], file_path: str) -> list[DependencyDeclaration]:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# requirements.txt
# ---------------------------------------------------------------------------

class _RequirementsTxtParser(_ManifestParser):
    _RE = re.compile(
        r"^\s*([\w][\w.\-]*[\w])\s*(?:([>=<!~]+)\s*(\S+))?"
    )

    @staticmethod
    def matches(file_path: str) -> bool:
        name = file_path.rsplit("/", 1)[-1]
        return name in ("requirements.txt", "requirements-dev.txt") or name.startswith(
            "requirements"
        ) and name.endswith(".txt")

    @staticmethod
    def parse(added_lines: list[tuple[int, str]], file_path: str) -> list[DependencyDeclaration]:
        results: list[DependencyDeclaration] = []
        for line_num, text in added_lines:
            text = text.strip()
            if not text or text.startswith("#") or text.startswith("-"):
                continue
            m = _RequirementsTxtParser._RE.match(text)
            if m:
                pkg = m.group(1)
                version = _clean_version(m.group(3) or "")
                results.append(DependencyDeclaration(pkg, version, "PyPI", file_path, line_num))
        return results


# ---------------------------------------------------------------------------
# package.json
# ---------------------------------------------------------------------------

class _PackageJsonParser(_ManifestParser):
    @staticmethod
    def matches(file_path: str) -> bool:
        return file_path.rsplit("/", 1)[-1] == "package.json"

    @staticmethod
    def parse(added_lines: list[tuple[int, str]], file_path: str) -> list[DependencyDeclaration]:
        results: list[DependencyDeclaration] = []
        # In diff context we see individual added JSON lines like:
        #   "express": "^4.18.0",
        dep_re = re.compile(r'^\s*"([@\w][\w./-]*)"\s*:\s*"([^"]*)"')
        for line_num, text in added_lines:
            m = dep_re.match(text.rstrip(","))
            if m:
                pkg = m.group(1)
                version = _clean_version(m.group(2))
                results.append(DependencyDeclaration(pkg, version, "npm", file_path, line_num))
        return results


# ---------------------------------------------------------------------------
# pyproject.toml
# ---------------------------------------------------------------------------

class _PyprojectTomlParser(_ManifestParser):
    # Matches lines like:   "requests>=2.28",   or  requests = "^1.0"
    _INLINE_RE = re.compile(
        r"""^\s*['"]?([\w][\w.\-]*[\w])(?:\[[\w,]+\])?([>=<!~]+[\d][\d.a-zA-Z]*)?\s*['"]?,?\s*$"""
    )
    _TABLE_RE = re.compile(
        r"""^\s*([\w][\w.\-]*[\w])\s*=\s*['"]([^'"]+)['"]"""
    )

    @staticmethod
    def matches(file_path: str) -> bool:
        return file_path.rsplit("/", 1)[-1] == "pyproject.toml"

    @staticmethod
    def parse(added_lines: list[tuple[int, str]], file_path: str) -> list[DependencyDeclaration]:
        results: list[DependencyDeclaration] = []
        for line_num, text in added_lines:
            text_s = text.strip()
            if not text_s or text_s.startswith("#") or text_s.startswith("["):
                continue

            # poetry style: requests = "^2.28"
            m = _PyprojectTomlParser._TABLE_RE.match(text_s)
            if m:
                pkg = m.group(1)
                if pkg.lower() in ("python", "name", "version", "description"):
                    continue
                version = _clean_version(m.group(2))
                results.append(DependencyDeclaration(pkg, version, "PyPI", file_path, line_num))
                continue

            # PEP 621 inline: "requests>=2.28",
            m = _PyprojectTomlParser._INLINE_RE.match(text_s)
            if m:
                pkg = m.group(1)
                if pkg.lower() in ("python", "name", "version", "description"):
                    continue
                version = _clean_version(m.group(2) or "")
                results.append(DependencyDeclaration(pkg, version, "PyPI", file_path, line_num))
        return results


# ---------------------------------------------------------------------------
# go.mod
# ---------------------------------------------------------------------------

class _GoModParser(_ManifestParser):
    _RE = re.compile(r"^\s*([\w./\-]+)\s+(v[\d.]+\S*)")

    @staticmethod
    def matches(file_path: str) -> bool:
        return file_path.rsplit("/", 1)[-1] == "go.mod"

    @staticmethod
    def parse(added_lines: list[tuple[int, str]], file_path: str) -> list[DependencyDeclaration]:
        results: list[DependencyDeclaration] = []
        for line_num, text in added_lines:
            text_s = text.strip()
            if not text_s or text_s.startswith("//") or text_s in ("require (", ")"):
                continue
            m = _GoModParser._RE.match(text_s)
            if m:
                pkg = m.group(1)
                version = m.group(2).lstrip("v")
                results.append(DependencyDeclaration(pkg, version, "Go", file_path, line_num))
        return results


# ---------------------------------------------------------------------------
# Cargo.toml
# ---------------------------------------------------------------------------

class _CargoTomlParser(_ManifestParser):
    _RE = re.compile(r"""^\s*([\w][\w-]*)\s*=\s*['"]([^'"]+)['"]""")
    _TABLE_RE = re.compile(r"""^\s*([\w][\w-]*)\s*=\s*\{.*version\s*=\s*['"]([^'"]+)['"]""")

    @staticmethod
    def matches(file_path: str) -> bool:
        return file_path.rsplit("/", 1)[-1] == "Cargo.toml"

    @staticmethod
    def parse(added_lines: list[tuple[int, str]], file_path: str) -> list[DependencyDeclaration]:
        results: list[DependencyDeclaration] = []
        for line_num, text in added_lines:
            text_s = text.strip()
            if not text_s or text_s.startswith("#") or text_s.startswith("["):
                continue
            # Table style: serde = { version = "1.0", features = [...] }
            m = _CargoTomlParser._TABLE_RE.match(text_s)
            if m:
                pkg = m.group(1)
                version = _clean_version(m.group(2))
                results.append(
                    DependencyDeclaration(pkg, version, "crates.io", file_path, line_num)
                )
                continue
            # Simple: serde = "1.0"
            m = _CargoTomlParser._RE.match(text_s)
            if m:
                pkg = m.group(1)
                if pkg.lower() in ("name", "version", "edition", "description"):
                    continue
                version = _clean_version(m.group(2))
                results.append(
                    DependencyDeclaration(pkg, version, "crates.io", file_path, line_num)
                )
        return results


# ---------------------------------------------------------------------------
# Gemfile
# ---------------------------------------------------------------------------

class _GemfileParser(_ManifestParser):
    _RE = re.compile(r"""^\s*gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?""")

    @staticmethod
    def matches(file_path: str) -> bool:
        return file_path.rsplit("/", 1)[-1] == "Gemfile"

    @staticmethod
    def parse(added_lines: list[tuple[int, str]], file_path: str) -> list[DependencyDeclaration]:
        results: list[DependencyDeclaration] = []
        for line_num, text in added_lines:
            m = _GemfileParser._RE.match(text.strip())
            if m:
                pkg = m.group(1)
                version = _clean_version(m.group(2) or "")
                results.append(
                    DependencyDeclaration(pkg, version, "RubyGems", file_path, line_num)
                )
        return results


# ---------------------------------------------------------------------------
# Registry of all parsers
# ---------------------------------------------------------------------------

_ALL_PARSERS: list[type[_ManifestParser]] = [
    _RequirementsTxtParser,
    _PackageJsonParser,
    _PyprojectTomlParser,
    _GoModParser,
    _CargoTomlParser,
    _GemfileParser,
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_manifests_from_diff(files: list) -> list[DependencyDeclaration]:
    """Parse dependency declarations from DiffFile objects.

    Only considers added lines (lines starting with '+' in hunk content).

    Parameters
    ----------
    files : list[DiffFile]
        The diff files from a DiffEvent.

    Returns
    -------
    list[DependencyDeclaration]
    """
    results: list[DependencyDeclaration] = []

    for diff_file in files:
        path = diff_file.path
        # Find a matching parser
        parser = None
        for p in _ALL_PARSERS:
            if p.matches(path):
                parser = p
                break
        if parser is None:
            continue

        # Collect all added lines across all hunks
        all_added: list[tuple[int, str]] = []
        for hunk in diff_file.hunks:
            all_added.extend(_added_lines(hunk.content, hunk.new_start))

        if all_added:
            results.extend(parser.parse(all_added, path))

    return results
