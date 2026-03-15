"""Tests for policy inheritance and merge logic."""

from sentinel_policy.merge import merge_hierarchy, merge_policies, merge_policies_from_yaml
from sentinel_policy.parser import PolicyConfig, PolicyRule


def _make_rule(name: str, rule_type: str = "deny-pattern", severity: str = "medium") -> PolicyRule:
    return PolicyRule(
        name=name,
        type=rule_type,
        description=f"Rule {name}",
        severity=severity,
        files="**/*",
        pattern="TODO" if rule_type != "deny-import" else "",
        targets=["eval"] if rule_type == "deny-import" else [],
    )


class TestMergePolicies:
    def test_repo_overrides_org_rule(self):
        org = PolicyConfig(version="1", rules=[_make_rule("no-todo", severity="low")])
        repo = PolicyConfig(version="1", rules=[_make_rule("no-todo", severity="high")])
        merged = merge_policies(org, repo)
        assert len(merged.rules) == 1
        assert merged.rules[0].severity == "high"

    def test_org_rules_preserved_when_no_override(self):
        org = PolicyConfig(version="1", rules=[_make_rule("org-rule")])
        repo = PolicyConfig(version="1", rules=[_make_rule("repo-rule")])
        merged = merge_policies(org, repo)
        assert len(merged.rules) == 2
        names = [r.name for r in merged.rules]
        assert "org-rule" in names
        assert "repo-rule" in names

    def test_order_preserved(self):
        org = PolicyConfig(
            version="1",
            rules=[_make_rule("a"), _make_rule("b")],
        )
        repo = PolicyConfig(
            version="1",
            rules=[_make_rule("c"), _make_rule("b", severity="critical")],
        )
        merged = merge_policies(org, repo)
        names = [r.name for r in merged.rules]
        # Org rules first (a, b-overridden), then new repo rules (c)
        assert names == ["a", "b", "c"]
        # b should be overridden
        b_rule = merged.rules[1]
        assert b_rule.severity == "critical"

    def test_version_from_repo(self):
        org = PolicyConfig(version="1", rules=[])
        repo = PolicyConfig(version="2", rules=[])
        merged = merge_policies(org, repo)
        assert merged.version == "2"

    def test_errors_combined(self):
        org = PolicyConfig(version="1", rules=[], errors=["org error"])
        repo = PolicyConfig(version="1", rules=[], errors=["repo error"])
        merged = merge_policies(org, repo)
        assert "org error" in merged.errors
        assert "repo error" in merged.errors


class TestMergeFromYaml:
    def test_org_only(self):
        org_yaml = """\
version: "1"
rules:
  - name: no-eval
    type: deny-import
    description: "No eval"
    severity: critical
    targets: ["eval"]
    files: "**/*.py"
"""
        config = merge_policies_from_yaml(org_yaml)
        assert len(config.rules) == 1
        assert config.rules[0].name == "no-eval"

    def test_org_plus_repo(self):
        org_yaml = """\
version: "1"
rules:
  - name: no-eval
    type: deny-import
    description: "No eval"
    severity: critical
    targets: ["eval"]
    files: "**/*.py"
"""
        repo_yaml = """\
version: "1"
rules:
  - name: no-eval
    type: deny-import
    description: "No eval - repo override"
    severity: high
    targets: ["eval", "exec"]
    files: "**/*.py"
"""
        config = merge_policies_from_yaml(org_yaml, repo_yaml)
        assert len(config.rules) == 1
        assert config.rules[0].severity == "high"
        assert "exec" in config.rules[0].targets


class TestMergeHierarchy:
    def test_5_level_override(self):
        """Most specific level wins."""
        org = PolicyConfig(version="1", rules=[_make_rule("r1", severity="low")])
        team = PolicyConfig(version="1", rules=[_make_rule("r1", severity="medium")])
        repo = PolicyConfig(version="1", rules=[_make_rule("r1", severity="high")])
        dirp = PolicyConfig(version="1", rules=[])
        filep = PolicyConfig(version="1", rules=[_make_rule("r1", severity="critical")])

        merged = merge_hierarchy(org, team, repo, dirp, filep)
        assert len(merged.rules) == 1
        assert merged.rules[0].severity == "critical"

    def test_3_level_hierarchy(self):
        """Intermediate levels can add rules."""
        org = PolicyConfig(version="1", rules=[_make_rule("org-rule")])
        team = PolicyConfig(version="1", rules=[_make_rule("team-rule")])
        repo = PolicyConfig(version="1", rules=[_make_rule("repo-rule")])

        merged = merge_hierarchy(org, team, repo)
        names = [r.name for r in merged.rules]
        assert "org-rule" in names
        assert "team-rule" in names
        assert "repo-rule" in names

    def test_single_level(self):
        org = PolicyConfig(version="1", rules=[_make_rule("r1")])
        merged = merge_hierarchy(org)
        assert len(merged.rules) == 1
        assert merged.rules[0].name == "r1"

    def test_empty_hierarchy(self):
        merged = merge_hierarchy()
        assert len(merged.errors) > 0
