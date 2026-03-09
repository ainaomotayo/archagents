"""Tests for the YAML policy parser."""

from sentinel_policy.parser import parse_policy_yaml


class TestParseValidPolicy:
    def test_parse_basic_policy(self):
        yaml_str = """\
version: "1"
rules:
  - name: no-eval
    type: deny-import
    description: "eval() is prohibited"
    severity: critical
    targets: ["eval", "exec"]
    files: "**/*.py"
"""
        config = parse_policy_yaml(yaml_str)
        assert config.version == "1"
        assert len(config.rules) == 1
        assert config.errors == []
        rule = config.rules[0]
        assert rule.name == "no-eval"
        assert rule.type == "deny-import"
        assert rule.targets == ["eval", "exec"]
        assert rule.severity == "critical"

    def test_parse_deny_pattern_rule(self):
        yaml_str = """\
version: "1"
rules:
  - name: no-console-log
    type: deny-pattern
    description: "No console.log in production"
    severity: medium
    pattern: "console\\\\.log\\\\("
    files: "src/**/*.ts"
"""
        config = parse_policy_yaml(yaml_str)
        assert len(config.rules) == 1
        assert config.rules[0].type == "deny-pattern"
        assert config.rules[0].pattern != ""

    def test_parse_require_pattern_rule(self):
        yaml_str = """\
version: "1"
rules:
  - name: require-copyright
    type: require-pattern
    description: "All files must have copyright header"
    severity: low
    pattern: "Copyright \\\\d{4}"
    files: "**/*.py"
"""
        config = parse_policy_yaml(yaml_str)
        assert len(config.rules) == 1
        assert config.rules[0].type == "require-pattern"

    def test_parse_multiple_rules(self):
        yaml_str = """\
version: "1"
rules:
  - name: rule-a
    type: deny-import
    description: "A"
    severity: high
    targets: ["os"]
    files: "**/*.py"
  - name: rule-b
    type: deny-pattern
    description: "B"
    severity: low
    pattern: "TODO"
    files: "**/*"
"""
        config = parse_policy_yaml(yaml_str)
        assert len(config.rules) == 2
        assert config.errors == []


class TestParseInvalidPolicy:
    def test_invalid_yaml(self):
        config = parse_policy_yaml("{{not valid yaml")
        assert len(config.errors) > 0
        assert "YAML parse error" in config.errors[0]

    def test_missing_version(self):
        config = parse_policy_yaml("rules: []")
        assert len(config.errors) > 0
        assert "version" in config.errors[0]

    def test_non_mapping_root(self):
        config = parse_policy_yaml("- just a list")
        assert len(config.errors) > 0

    def test_invalid_rule_type(self):
        yaml_str = """\
version: "1"
rules:
  - name: bad-rule
    type: unknown-type
    description: "Invalid"
    severity: medium
    files: "**/*"
"""
        config = parse_policy_yaml(yaml_str)
        assert len(config.errors) > 0
        assert "invalid type" in config.errors[0]
        assert len(config.rules) == 0

    def test_deny_import_missing_targets(self):
        yaml_str = """\
version: "1"
rules:
  - name: bad-import
    type: deny-import
    description: "Missing targets"
    severity: high
    files: "**/*.py"
"""
        config = parse_policy_yaml(yaml_str)
        assert len(config.errors) > 0
        assert "targets" in config.errors[0]

    def test_deny_pattern_missing_pattern(self):
        yaml_str = """\
version: "1"
rules:
  - name: bad-pattern
    type: deny-pattern
    description: "Missing pattern"
    severity: high
    files: "**/*.py"
"""
        config = parse_policy_yaml(yaml_str)
        assert len(config.errors) > 0
        assert "pattern" in config.errors[0]
