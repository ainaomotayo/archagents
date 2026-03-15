"""AST-normalized code fingerprinting for OSS detection."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from .treesitter import parse_code


@dataclass
class OSSMatch:
    library: str
    version: str
    similarity: float  # 0.0 to 1.0
    fingerprint: str


class FingerprintDB:
    """Database of known OSS code fingerprints."""

    def __init__(self) -> None:
        self._db: dict[str, dict[str, str]] = {}  # fingerprint -> {library, version}

    def add(self, fingerprint: str, library: str, version: str = "") -> None:
        self._db[fingerprint] = {"library": library, "version": version}

    def lookup(self, fingerprint: str) -> OSSMatch | None:
        entry = self._db.get(fingerprint)
        if entry:
            return OSSMatch(
                library=entry["library"],
                version=entry["version"],
                similarity=1.0,
                fingerprint=fingerprint,
            )
        return None

    def load(self, path: str | Path) -> None:
        data = json.loads(Path(path).read_text())
        for entry in data:
            self.add(entry["fingerprint"], entry["library"], entry.get("version", ""))

    def save(self, path: str | Path) -> None:
        data = [
            {"fingerprint": fp, "library": info["library"], "version": info["version"]}
            for fp, info in self._db.items()
        ]
        Path(path).write_text(json.dumps(data, indent=2))

    def __len__(self) -> int:
        return len(self._db)


def fingerprint_code(code: str, language: str) -> str:
    """Generate AST-normalized fingerprint that ignores variable names."""
    root = parse_code(code, language)
    normalized = _normalize_ast(root)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _normalize_ast(node: object) -> str:
    """Recursively normalize AST to a canonical string form.

    Replaces all identifiers with a positional placeholder so that
    two pieces of code with the same structure but different variable
    names produce the same fingerprint.
    """
    node_type = node.type  # type: ignore[union-attr]

    # Replace identifiers with generic placeholder
    if node_type == "identifier":
        return "ID"

    children = node.children  # type: ignore[union-attr]
    if not children:
        text = node.text.decode("utf-8")  # type: ignore[union-attr]
        # Normalize string literals and their content
        if node_type in (
            "string", "string_literal", "template_string",
            "string_content", "string_fragment",
        ):
            return "STR"
        # Normalize number literals
        if node_type in (
            "integer", "float", "number", "integer_literal", "float_literal",
        ):
            return "NUM"
        return text

    child_strs = [_normalize_ast(c) for c in children]
    return f"({node_type} {' '.join(child_strs)})"
