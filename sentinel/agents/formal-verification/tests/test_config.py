"""Tests for configuration parser."""
from sentinel_fv.config import FVConfig, parse_config


def test_default_config():
    cfg = FVConfig()
    assert cfg.enabled is True
    assert cfg.engine.loop_bound == 8
    assert cfg.engine.smt_timeout_ms == 5000
    assert cfg.engine.pool_size >= 1
    assert cfg.scope.call_graph_depth == 1
    assert cfg.scope.skip_test_files is True


def test_parse_empty():
    cfg = parse_config("")
    assert cfg.enabled is True
    assert cfg.engine.loop_bound == 8


def test_parse_overrides():
    yaml_str = """
enabled: true
engine:
  loop_bound: 16
  smt_timeout_ms: 10000
  pool_size: 4
scope:
  call_graph_depth: 2
  skip_test_files: false
"""
    cfg = parse_config(yaml_str)
    assert cfg.engine.loop_bound == 16
    assert cfg.engine.smt_timeout_ms == 10000
    assert cfg.engine.pool_size == 4
    assert cfg.scope.call_graph_depth == 2
    assert cfg.scope.skip_test_files is False


def test_parse_invariants():
    yaml_str = """
invariant_rules:
  - pattern: "len(.*) >= 0"
    kind: postcondition
  - pattern: "x != None"
    kind: precondition
"""
    cfg = parse_config(yaml_str)
    assert len(cfg.invariant_rules) == 2
    assert cfg.invariant_rules[0].pattern == "len(.*) >= 0"
    assert cfg.invariant_rules[0].kind == "postcondition"


def test_parse_skip_patterns():
    yaml_str = """
scope:
  skip_patterns:
    - "test_*"
    - "conftest.py"
"""
    cfg = parse_config(yaml_str)
    assert "test_*" in cfg.scope.skip_patterns
    assert "conftest.py" in cfg.scope.skip_patterns


def test_invalid_yaml():
    cfg = parse_config(":::: invalid {{{{ yaml")
    # Should return defaults on invalid input
    assert cfg.enabled is True
    assert cfg.engine.loop_bound == 8


def test_disabled_config():
    yaml_str = """
enabled: false
"""
    cfg = parse_config(yaml_str)
    assert cfg.enabled is False
