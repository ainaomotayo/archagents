"""Configuration parser for .sentinel-verify.yml."""
from __future__ import annotations

import os
from dataclasses import dataclass, field

import yaml


@dataclass
class EngineConfig:
    loop_bound: int = 8
    smt_timeout_ms: int = 5000
    pool_size: int = field(default_factory=lambda: os.cpu_count() or 1)


@dataclass
class ScopeConfig:
    call_graph_depth: int = 1
    skip_test_files: bool = True
    skip_patterns: list[str] = field(default_factory=list)


@dataclass
class InvariantRule:
    pattern: str = ""
    kind: str = "invariant"


@dataclass
class FVConfig:
    enabled: bool = True
    engine: EngineConfig = field(default_factory=EngineConfig)
    scope: ScopeConfig = field(default_factory=ScopeConfig)
    invariant_rules: list[InvariantRule] = field(default_factory=list)


def parse_config(raw_yaml: str) -> FVConfig:
    """Parse a YAML string into an FVConfig. Returns defaults on empty/invalid input."""
    if not raw_yaml or not raw_yaml.strip():
        return FVConfig()

    try:
        data = yaml.safe_load(raw_yaml)
    except yaml.YAMLError:
        return FVConfig()

    if not isinstance(data, dict):
        return FVConfig()

    cfg = FVConfig()
    cfg.enabled = data.get("enabled", cfg.enabled)

    engine_data = data.get("engine", {})
    if isinstance(engine_data, dict):
        if "loop_bound" in engine_data:
            cfg.engine.loop_bound = engine_data["loop_bound"]
        if "smt_timeout_ms" in engine_data:
            cfg.engine.smt_timeout_ms = engine_data["smt_timeout_ms"]
        if "pool_size" in engine_data:
            cfg.engine.pool_size = engine_data["pool_size"]

    scope_data = data.get("scope", {})
    if isinstance(scope_data, dict):
        if "call_graph_depth" in scope_data:
            cfg.scope.call_graph_depth = scope_data["call_graph_depth"]
        if "skip_test_files" in scope_data:
            cfg.scope.skip_test_files = scope_data["skip_test_files"]
        if "skip_patterns" in scope_data:
            cfg.scope.skip_patterns = scope_data["skip_patterns"]

    rules_data = data.get("invariant_rules", [])
    if isinstance(rules_data, list):
        for rule in rules_data:
            if isinstance(rule, dict):
                cfg.invariant_rules.append(
                    InvariantRule(
                        pattern=rule.get("pattern", ""),
                        kind=rule.get("kind", "invariant"),
                    )
                )

    return cfg
