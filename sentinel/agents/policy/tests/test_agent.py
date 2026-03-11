"""Tests for the main PolicyAgent."""

from sentinel_agents.types import (
    Confidence,
    DiffEvent,
    DiffFile,
    DiffHunk,
    ScanConfig,
    Severity,
)

from sentinel_policy.agent import PolicyAgent


def _make_event(files: list[DiffFile]) -> DiffEvent:
    return DiffEvent(
        scan_id="test-scan-1",
        project_id="proj-1",
        commit_hash="abc123",
        branch="main",
        author="dev@test.com",
        timestamp="2026-03-09T00:00:00Z",
        files=files,
        scan_config=ScanConfig(
            security_level="standard",
            license_policy="",
            quality_threshold=0.7,
        ),
    )


_EVAL_POLICY = """\
version: "1"
rules:
  - name: no-eval
    type: deny-import
    description: "eval() is prohibited"
    severity: critical
    targets: ["eval", "exec"]
    files: "**/*.py"
"""

_CONSOLE_LOG_POLICY = """\
version: "1"
rules:
  - name: no-console-log
    type: deny-pattern
    description: "No console.log in production"
    severity: medium
    pattern: "console\\\\.log\\\\("
    files: "**/*.ts"
"""

_COPYRIGHT_POLICY = """\
version: "1"
rules:
  - name: require-copyright
    type: require-pattern
    description: "All files must have copyright header"
    severity: low
    pattern: "Copyright \\\\d{4}"
    files: "**/*.py"
"""


class TestPolicyAgent:
    def test_agent_metadata(self):
        agent = PolicyAgent()
        assert agent.name == "policy"
        assert agent.version == "0.2.0"

    def test_process_empty_event(self):
        agent = PolicyAgent()
        event = _make_event([])
        findings = agent.process(event)
        assert findings == []

    def test_deny_import_violation(self):
        agent = PolicyAgent(org_policy_yaml=_EVAL_POLICY)
        event = _make_event([
            DiffFile(
                path="src/handler.py",
                language="python",
                hunks=[
                    DiffHunk(
                        old_start=0,
                        old_count=0,
                        new_start=1,
                        new_count=2,
                        content="@@ -0,0 +1,2 @@\n+result = eval(expr)\n+print(result)",
                    )
                ],
                ai_score=0.5,
            )
        ])
        findings = agent.process(event)
        assert len(findings) >= 1
        assert findings[0].type == "policy"
        assert findings[0].scanner == "policy-agent"
        assert findings[0].severity == Severity.CRITICAL

    def test_deny_import_no_violation(self):
        agent = PolicyAgent(org_policy_yaml=_EVAL_POLICY)
        event = _make_event([
            DiffFile(
                path="src/clean.py",
                language="python",
                hunks=[
                    DiffHunk(0, 0, 1, 1, "@@ -0,0 +1,1 @@\n+x = 1 + 2")
                ],
                ai_score=0.5,
            )
        ])
        findings = agent.process(event)
        assert len(findings) == 0

    def test_deny_pattern_violation(self):
        agent = PolicyAgent(org_policy_yaml=_CONSOLE_LOG_POLICY)
        event = _make_event([
            DiffFile(
                path="src/app.ts",
                language="typescript",
                hunks=[
                    DiffHunk(
                        0, 0, 1, 1,
                        '@@ -0,0 +1,1 @@\n+console.log("debug info")',
                    )
                ],
                ai_score=0.3,
            )
        ])
        findings = agent.process(event)
        assert len(findings) >= 1
        assert findings[0].type == "policy"

    def test_require_pattern_violation(self):
        agent = PolicyAgent(org_policy_yaml=_COPYRIGHT_POLICY)
        event = _make_event([
            DiffFile(
                path="src/module.py",
                language="python",
                hunks=[
                    DiffHunk(0, 0, 1, 1, "@@ -0,0 +1,1 @@\n+x = 1")
                ],
                ai_score=0.5,
            )
        ])
        findings = agent.process(event)
        assert len(findings) >= 1
        assert "Required pattern missing" in findings[0].description

    def test_require_pattern_satisfied(self):
        agent = PolicyAgent(org_policy_yaml=_COPYRIGHT_POLICY)
        event = _make_event([
            DiffFile(
                path="src/module.py",
                language="python",
                hunks=[
                    DiffHunk(
                        0, 0, 1, 2,
                        "@@ -0,0 +1,2 @@\n+# Copyright 2026 ACME\n+x = 1",
                    )
                ],
                ai_score=0.5,
            )
        ])
        findings = agent.process(event)
        assert len(findings) == 0

    def test_file_glob_filtering(self):
        """Ensure rules only apply to matching file patterns."""
        agent = PolicyAgent(org_policy_yaml=_EVAL_POLICY)
        event = _make_event([
            DiffFile(
                path="src/script.js",
                language="javascript",
                hunks=[
                    DiffHunk(0, 0, 1, 1, "@@ -0,0 +1,1 @@\n+eval('code')")
                ],
                ai_score=0.5,
            )
        ])
        findings = agent.process(event)
        # eval policy only applies to **/*.py, not .js
        assert len(findings) == 0

    def test_all_findings_have_policy_type(self):
        agent = PolicyAgent(org_policy_yaml=_EVAL_POLICY)
        event = _make_event([
            DiffFile(
                path="src/bad.py",
                language="python",
                hunks=[
                    DiffHunk(0, 0, 1, 2, "@@ -0,0 +1,2 @@\n+eval('x')\n+exec('y')")
                ],
                ai_score=0.5,
            )
        ])
        findings = agent.process(event)
        for f in findings:
            assert f.type == "policy"
            assert f.scanner == "policy-agent"

    def test_repo_override_changes_severity(self):
        org_yaml = """\
version: "1"
rules:
  - name: no-eval
    type: deny-import
    description: "eval() is prohibited"
    severity: critical
    targets: ["eval"]
    files: "**/*.py"
"""
        repo_yaml = """\
version: "1"
rules:
  - name: no-eval
    type: deny-import
    description: "eval() - repo relaxed"
    severity: low
    targets: ["eval"]
    files: "**/*.py"
"""
        agent = PolicyAgent(org_policy_yaml=org_yaml, repo_policy_yaml=repo_yaml)
        event = _make_event([
            DiffFile(
                path="src/handler.py",
                language="python",
                hunks=[
                    DiffHunk(0, 0, 1, 1, "@@ -0,0 +1,1 @@\n+eval('expr')")
                ],
                ai_score=0.5,
            )
        ])
        findings = agent.process(event)
        assert len(findings) >= 1
        # Repo override changed severity to low
        assert findings[0].severity == Severity.LOW
