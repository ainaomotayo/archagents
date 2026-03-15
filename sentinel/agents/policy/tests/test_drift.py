"""Tests for policy drift detection."""

from sentinel_policy.drift import detect_drift, DriftViolation
from sentinel_policy.parser import PolicyConfig, PolicyRule


def _make_rule(name: str, rule_type: str = "deny-pattern", severity: str = "medium",
               pattern: str = "TODO", files: str = "**/*.py", targets: list[str] | None = None) -> PolicyRule:
    return PolicyRule(
        name=name,
        type=rule_type,
        description=f"Rule {name}",
        severity=severity,
        files=files,
        pattern=pattern if rule_type != "deny-import" else "",
        targets=targets or (["eval"] if rule_type == "deny-import" else []),
    )


class TestDriftDetection:
    def test_drift_found_for_matching_violation(self):
        policy = PolicyConfig(
            version="1",
            rules=[_make_rule("no-todo", pattern=r"TODO")],
        )
        files = {"src/app.py": "# TODO: fix this later\nx = 1"}
        violations = detect_drift(files, policy)

        assert len(violations) >= 1
        assert violations[0].rule_name == "no-todo"
        assert violations[0].file == "src/app.py"

    def test_no_drift_for_clean_files(self):
        policy = PolicyConfig(
            version="1",
            rules=[_make_rule("no-todo", pattern=r"TODO")],
        )
        files = {"src/app.py": "x = 1\ny = 2"}
        violations = detect_drift(files, policy)

        assert violations == []

    def test_drift_respects_file_glob(self):
        policy = PolicyConfig(
            version="1",
            rules=[_make_rule("no-todo", pattern=r"TODO", files="**/*.py")],
        )
        # JS file should not be checked against **/*.py rule
        files = {"src/app.js": "// TODO: fix this"}
        violations = detect_drift(files, policy)

        assert violations == []

    def test_drift_multiple_files(self):
        policy = PolicyConfig(
            version="1",
            rules=[_make_rule("no-todo", pattern=r"TODO")],
        )
        files = {
            "src/a.py": "# TODO: fix",
            "src/b.py": "clean code",
            "src/c.py": "# TODO: another",
        }
        violations = detect_drift(files, policy)

        assert len(violations) == 2
        violation_files = {v.file for v in violations}
        assert "src/a.py" in violation_files
        assert "src/c.py" in violation_files

    def test_drift_multiple_rules(self):
        policy = PolicyConfig(
            version="1",
            rules=[
                _make_rule("no-todo", pattern=r"TODO"),
                _make_rule("no-eval", rule_type="deny-import", targets=["eval"]),
            ],
        )
        files = {"src/app.py": "# TODO: fix\nresult = eval('expr')"}
        violations = detect_drift(files, policy)

        assert len(violations) >= 2
        rule_names = {v.rule_name for v in violations}
        assert "no-todo" in rule_names
        assert "no-eval" in rule_names

    def test_drift_empty_files(self):
        policy = PolicyConfig(version="1", rules=[_make_rule("no-todo")])
        violations = detect_drift({}, policy)
        assert violations == []

    def test_drift_empty_policy(self):
        policy = PolicyConfig(version="1", rules=[])
        files = {"src/app.py": "# TODO: fix"}
        violations = detect_drift(files, policy)
        assert violations == []

    def test_drift_violation_has_severity(self):
        policy = PolicyConfig(
            version="1",
            rules=[_make_rule("no-todo", pattern=r"TODO", severity="high")],
        )
        files = {"src/app.py": "# TODO: fix"}
        violations = detect_drift(files, policy)

        assert len(violations) >= 1
        assert violations[0].severity == "high"
