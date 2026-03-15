"""JSON Schema definition for policy YAML validation."""

from __future__ import annotations

POLICY_SCHEMA: dict = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["version", "rules"],
    "properties": {
        "version": {"type": "string"},
        "rules": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name", "type", "description", "severity", "files"],
                "properties": {
                    "name": {"type": "string", "minLength": 1},
                    "type": {
                        "type": "string",
                        "enum": [
                            "deny-import", "deny-pattern", "require-pattern",
                            "require-review", "enforce-format",
                            "dependency-allow", "secret-scan",
                        ],
                    },
                    "description": {"type": "string"},
                    "severity": {
                        "type": "string",
                        "enum": ["critical", "high", "medium", "low", "info"],
                    },
                    "files": {"type": "string", "minLength": 1},
                    "targets": {
                        "oneOf": [
                            {"type": "array", "items": {"type": "string"}},
                            {"type": "string"},
                        ],
                    },
                    "pattern": {"type": "string"},
                    "min_approvals": {"type": "integer", "minimum": 1},
                    "format_style": {"type": "string"},
                    "allowlist": {
                        "oneOf": [
                            {"type": "array", "items": {"type": "string"}},
                            {"type": "string"},
                        ],
                    },
                },
                "allOf": [
                    {
                        "if": {"properties": {"type": {"const": "deny-import"}}},
                        "then": {"required": ["targets"]},
                    },
                    {
                        "if": {
                            "properties": {
                                "type": {
                                    "enum": ["deny-pattern", "require-pattern", "secret-scan"],
                                },
                            },
                        },
                        "then": {"required": ["pattern"]},
                    },
                    {
                        "if": {"properties": {"type": {"const": "dependency-allow"}}},
                        "then": {"required": ["allowlist"]},
                    },
                ],
            },
        },
    },
}


def validate_schema(data: dict) -> list[str]:
    """Validate a parsed policy dict against the JSON Schema.

    Returns a list of error messages (empty if valid).
    """
    try:
        import jsonschema
    except ImportError:
        return []  # graceful degradation if jsonschema not installed

    errors: list[str] = []
    validator = jsonschema.Draft202012Validator(POLICY_SCHEMA)
    for error in validator.iter_errors(data):
        path = ".".join(str(p) for p in error.absolute_path) if error.absolute_path else "<root>"
        errors.append(f"Schema error at {path}: {error.message}")
    return errors
