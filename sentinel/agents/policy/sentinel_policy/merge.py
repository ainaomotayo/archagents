"""Policy inheritance and merge logic for 5-level hierarchy.

Levels (most general to most specific):
  org -> team -> repo -> directory -> file

More specific level overrides less specific. Same rule name at lower level replaces higher.
"""

from __future__ import annotations

from sentinel_policy.parser import PolicyConfig, PolicyRule, parse_policy_yaml


def merge_policies(base: PolicyConfig, override: PolicyConfig) -> PolicyConfig:
    """Merge base-level with override-level policy.

    Override rules replace base rules with the same name.
    Base rules not overridden are kept. New override rules are added.
    """
    base_by_name: dict[str, PolicyRule] = {r.name: r for r in base.rules}
    override_by_name: dict[str, PolicyRule] = {r.name: r for r in override.rules}

    merged: dict[str, PolicyRule] = {}
    for name, rule in base_by_name.items():
        merged[name] = rule
    for name, rule in override_by_name.items():
        merged[name] = rule  # Override or add

    # Preserve order: base rules first (possibly overridden), then new override rules
    ordered_rules: list[PolicyRule] = []
    seen: set[str] = set()
    for rule in base.rules:
        ordered_rules.append(merged[rule.name])
        seen.add(rule.name)
    for rule in override.rules:
        if rule.name not in seen:
            ordered_rules.append(merged[rule.name])
            seen.add(rule.name)

    version = override.version or base.version
    errors = base.errors + override.errors

    return PolicyConfig(version=version, rules=ordered_rules, errors=errors)


def merge_hierarchy(*configs: PolicyConfig) -> PolicyConfig:
    """Merge N-level policy hierarchy (org -> team -> repo -> dir -> file).

    Each successive config overrides the previous. Accepts 1-5 configs.
    """
    if not configs:
        return PolicyConfig(version="", rules=[], errors=["No policy configs provided"])

    result = configs[0]
    for config in configs[1:]:
        result = merge_policies(result, config)
    return result


def merge_policies_from_yaml(
    org_yaml: str, repo_yaml: str | None = None
) -> PolicyConfig:
    """Parse and merge org + repo policy YAML strings (2-level convenience)."""
    org_config = parse_policy_yaml(org_yaml)
    if repo_yaml is None:
        return org_config
    repo_config = parse_policy_yaml(repo_yaml)
    return merge_policies(org_config, repo_config)


def merge_hierarchy_from_yaml(*yamls: str) -> PolicyConfig:
    """Parse and merge N-level YAML strings."""
    configs = [parse_policy_yaml(y) for y in yamls if y]
    if not configs:
        return PolicyConfig(version="", rules=[], errors=["No policy YAML provided"])
    return merge_hierarchy(*configs)
