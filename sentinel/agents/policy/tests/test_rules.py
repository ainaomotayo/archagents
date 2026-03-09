"""Tests for the rule evaluation engine."""

from sentinel_policy.parser import PolicyRule
from sentinel_policy.rules import evaluate_rule, file_matches_glob, _expand_braces


class TestFileMatchesGlob:
    def test_star_star_py(self):
        assert file_matches_glob("src/utils/helper.py", "**/*.py")

    def test_star_star_no_match(self):
        assert not file_matches_glob("src/utils/helper.ts", "**/*.py")

    def test_nested_glob(self):
        assert file_matches_glob("src/components/Button.tsx", "src/**/*.tsx")

    def test_root_only(self):
        assert file_matches_glob("setup.py", "*.py")

    def test_brace_expansion(self):
        assert file_matches_glob("main.py", "**/*.{py,ts,js}")
        assert file_matches_glob("main.ts", "**/*.{py,ts,js}")
        assert not file_matches_glob("main.go", "**/*.{py,ts,js}")


class TestExpandBraces:
    def test_simple_expansion(self):
        result = _expand_braces("**/*.{py,ts}")
        assert "**/*.py" in result
        assert "**/*.ts" in result

    def test_no_braces(self):
        result = _expand_braces("**/*.py")
        assert result == ["**/*.py"]


class TestDenyImportRule:
    def _make_rule(self, targets: list[str]) -> PolicyRule:
        return PolicyRule(
            name="no-eval",
            type="deny-import",
            description="eval() is prohibited",
            severity="critical",
            files="**/*.py",
            targets=targets,
        )

    def test_detect_eval_call(self):
        rule = self._make_rule(["eval"])
        violations = evaluate_rule(rule, "src/handler.py", "result = eval(expr)")
        assert len(violations) == 1
        assert violations[0].line_start == 1
        assert "eval" in violations[0].message

    def test_detect_import(self):
        rule = self._make_rule(["os"])
        violations = evaluate_rule(rule, "app.py", "import os\nprint('hi')")
        assert len(violations) == 1

    def test_detect_from_import(self):
        rule = self._make_rule(["subprocess"])
        code = "from subprocess import run"
        violations = evaluate_rule(rule, "tool.py", code)
        assert len(violations) == 1

    def test_no_violation_clean_code(self):
        rule = self._make_rule(["eval", "exec"])
        violations = evaluate_rule(rule, "clean.py", "x = 1 + 2\nprint(x)")
        assert len(violations) == 0

    def test_file_glob_mismatch(self):
        rule = self._make_rule(["eval"])
        violations = evaluate_rule(rule, "script.js", "eval('code')")
        assert len(violations) == 0  # Rule only applies to **/*.py


class TestDenyPatternRule:
    def _make_rule(self, pattern: str, files: str = "**/*.ts") -> PolicyRule:
        return PolicyRule(
            name="no-console",
            type="deny-pattern",
            description="No console.log",
            severity="medium",
            files=files,
            pattern=pattern,
        )

    def test_detect_console_log(self):
        rule = self._make_rule(r"console\.log\(")
        violations = evaluate_rule(rule, "src/app.ts", 'console.log("debug")')
        assert len(violations) == 1

    def test_no_violation_clean(self):
        rule = self._make_rule(r"console\.log\(")
        violations = evaluate_rule(rule, "src/app.ts", "const x = 1;")
        assert len(violations) == 0

    def test_multiple_matches(self):
        rule = self._make_rule(r"console\.log\(")
        code = 'console.log("a")\nconst x = 1;\nconsole.log("b")'
        violations = evaluate_rule(rule, "src/app.ts", code)
        assert len(violations) == 2

    def test_hardcoded_ip_pattern(self):
        rule = self._make_rule(r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}", "**/*.py")
        violations = evaluate_rule(rule, "config.py", 'HOST = "192.168.1.1"')
        assert len(violations) == 1


class TestRequirePatternRule:
    def _make_rule(self, pattern: str) -> PolicyRule:
        return PolicyRule(
            name="require-copyright",
            type="require-pattern",
            description="Must have copyright",
            severity="low",
            files="**/*.py",
            pattern=pattern,
        )

    def test_missing_copyright(self):
        rule = self._make_rule(r"Copyright \d{4}")
        violations = evaluate_rule(rule, "module.py", "x = 1\ny = 2")
        assert len(violations) == 1
        assert "Required pattern missing" in violations[0].message

    def test_copyright_present(self):
        rule = self._make_rule(r"Copyright \d{4}")
        code = "# Copyright 2026 ACME Corp\nx = 1"
        violations = evaluate_rule(rule, "module.py", code)
        assert len(violations) == 0

    def test_file_glob_mismatch(self):
        rule = self._make_rule(r"Copyright \d{4}")
        violations = evaluate_rule(rule, "readme.md", "no copyright here")
        assert len(violations) == 0  # Rule only applies to **/*.py
