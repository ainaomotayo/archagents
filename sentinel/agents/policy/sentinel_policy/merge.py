"""Policy inheritance and merge logic for org-level and repo-level policies."""

from __future__ import annotations

from sentinel_policy.parser import PolicyConfig, PolicyRule, parse_policy_yaml


def merge_policies(org_config: PolicyConfig, repo_config: PolicyConfig) -> PolicyConfig:
    """Merge org-level defaults with repo-level overrides.

    Merge strategy:
    - Repo rules override org rules with the same name.
    - Org rules not overridden by the repo are kept.
    - Repo rules with new names are added.
    - The version is taken from the repo config if present, else org config.
    - Errors from both configs are combined.

    Args:
        org_config: Organization-level policy configuration.
        repo_config: Repository-level policy configuration (overrides).

    Returns:
        Merged PolicyConfig.
    """
    # Index org rules by name
    org_rules_by_name: dict[str, PolicyRule] = {r.name: r for r in org_config.rules}

    # Index repo rules by name
    repo_rules_by_name: dict[str, PolicyRule] = {r.name: r for r in repo_config.rules}

    # Build merged rules: start with org rules, override with repo rules
    merged: dict[str, PolicyRule] = {}
    for name, rule in org_rules_by_name.items():
        merged[name] = rule
    for name, rule in repo_rules_by_name.items():
        merged[name] = rule  # Override or add

    # Preserve order: org rules first (possibly overridden), then new repo rules
    ordered_rules: list[PolicyRule] = []
    seen: set[str] = set()
    for rule in org_config.rules:
        ordered_rules.append(merged[rule.name])
        seen.add(rule.name)
    for rule in repo_config.rules:
        if rule.name not in seen:
            ordered_rules.append(merged[rule.name])
            seen.add(rule.name)

    version = repo_config.version or org_config.version
    errors = org_config.errors + repo_config.errors

    return PolicyConfig(version=version, rules=ordered_rules, errors=errors)


def merge_policies_from_yaml(
    org_yaml: str, repo_yaml: str | None = None
) -> PolicyConfig:
    """Parse and merge org + repo policy YAML strings.

    Args:
        org_yaml: Organization-level policy YAML.
        repo_yaml: Optional repository-level policy YAML.

    Returns:
        Merged PolicyConfig.
    """
    org_config = parse_policy_yaml(org_yaml)
    if repo_yaml is None:
        return org_config
    repo_config = parse_policy_yaml(repo_yaml)
    return merge_policies(org_config, repo_config)
