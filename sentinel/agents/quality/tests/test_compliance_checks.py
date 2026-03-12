"""Tests for quality agent NIST/HIPAA compliance checks."""

from sentinel_agents.types import (
    Confidence,
    DiffEvent,
    DiffFile,
    DiffHunk,
    ScanConfig,
    Severity,
)

from sentinel_quality.compliance_checks import (
    check_access_documentation,
    check_ai_documentation,
    check_ai_test_coverage,
    check_data_governance,
)


def _make_files(*file_specs: tuple[str, str, str]) -> list[DiffFile]:
    """Create DiffFile list from (path, language, added_code) tuples."""
    files = []
    for path, lang, code in file_specs:
        hunk_content = "\n".join(f"+{line}" for line in code.split("\n"))
        files.append(
            DiffFile(
                path=path,
                language=lang,
                hunks=[
                    DiffHunk(
                        old_start=0,
                        old_count=0,
                        new_start=1,
                        new_count=len(code.split("\n")),
                        content=f"@@ -0,0 +1,{len(code.split(chr(10)))} @@\n{hunk_content}",
                    )
                ],
                ai_score=0.0,
            )
        )
    return files


# =====================================================================
# 1. AI Documentation Completeness
# =====================================================================

class TestAIDocumentation:
    def test_flags_ai_code_without_docs(self):
        files = _make_files(
            ("src/model_trainer.py", "python", "import torch\nmodel = torch.nn.Linear(10, 1)"),
        )
        findings = check_ai_documentation(files)
        assert len(findings) == 1
        assert findings[0].category == "ai-documentation-gap"
        assert findings[0].type == "quality"
        assert findings[0].severity == Severity.MEDIUM

    def test_no_flag_when_model_card_present(self):
        files = _make_files(
            ("src/model_trainer.py", "python", "import torch\nmodel = torch.nn.Linear(10, 1)"),
            ("docs/MODEL_CARD.md", "markdown", "# Model Card\n## Intended Use\nClassification model"),
        )
        findings = check_ai_documentation(files)
        assert len(findings) == 0

    def test_no_flag_for_non_ai_code(self):
        files = _make_files(
            ("src/utils.py", "python", "def add(a, b):\n    return a + b"),
        )
        findings = check_ai_documentation(files)
        assert len(findings) == 0

    def test_detects_transformers_import(self):
        files = _make_files(
            ("src/nlp.py", "python", "from transformers import AutoModel\nmodel = AutoModel.from_pretrained('bert-base')"),
        )
        findings = check_ai_documentation(files)
        assert len(findings) == 1
        assert "MAP-1.1" in findings[0].extra["nist_controls"]

    def test_doc_with_limitations_section(self):
        files = _make_files(
            ("src/classifier.py", "python", "import sklearn\nclf = sklearn.tree.DecisionTreeClassifier()"),
            ("README.md", "markdown", "## Limitations and Risks\nModel may not generalize"),
        )
        findings = check_ai_documentation(files)
        assert len(findings) == 0


# =====================================================================
# 2. Data Governance Markers
# =====================================================================

class TestDataGovernance:
    def test_flags_data_handling_without_governance(self):
        files = _make_files(
            ("src/etl.py", "python", "import pandas as pd\ndf = pd.read_csv('patients.csv')"),
        )
        findings = check_data_governance(files)
        assert len(findings) == 1
        assert findings[0].category == "data-governance-gap"
        assert "164.312(c)(1)" in findings[0].extra["hipaa_controls"]

    def test_no_flag_when_classification_present(self):
        files = _make_files(
            ("src/etl.py", "python", "# Data Classification: PHI\nimport pandas as pd\ndf = pd.read_csv('patients.csv')"),
        )
        findings = check_data_governance(files)
        assert len(findings) == 0

    def test_no_flag_for_non_data_code(self):
        files = _make_files(
            ("src/math.py", "python", "def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)"),
        )
        findings = check_data_governance(files)
        assert len(findings) == 0

    def test_flags_sql_without_governance(self):
        files = _make_files(
            ("src/db.py", "python", "cursor.execute('SELECT * FROM patient_records')"),
        )
        findings = check_data_governance(files)
        assert len(findings) == 1

    def test_retention_policy_marker_satisfies(self):
        files = _make_files(
            ("src/db.py", "python", "# Retention Policy: 7 years per HIPAA\ncursor.execute('SELECT * FROM patient_records')"),
        )
        findings = check_data_governance(files)
        assert len(findings) == 0


# =====================================================================
# 3. AI Test Coverage
# =====================================================================

class TestAITestCoverage:
    def test_flags_ai_code_without_ml_tests(self):
        files = _make_files(
            ("src/model.py", "python", "import torch\nmodel.predict(X)"),
        )
        findings = check_ai_test_coverage(files)
        assert len(findings) == 1
        assert findings[0].category == "ai-test-coverage-gap"
        assert findings[0].severity == Severity.HIGH

    def test_no_flag_when_ml_tests_present(self):
        files = _make_files(
            ("src/model.py", "python", "import torch\nmodel.predict(X)"),
            ("tests/test_model.py", "python", "def test_model_accuracy():\n    assert accuracy > 0.9"),
        )
        findings = check_ai_test_coverage(files)
        assert len(findings) == 0

    def test_no_flag_for_non_ai_code(self):
        files = _make_files(
            ("src/api.py", "python", "from flask import Flask\napp = Flask(__name__)"),
        )
        findings = check_ai_test_coverage(files)
        assert len(findings) == 0

    def test_fairness_test_satisfies(self):
        files = _make_files(
            ("src/classifier.py", "python", "from sklearn import tree\nclf = tree.DecisionTreeClassifier()"),
            ("tests/test_fairness.py", "python", "def test_bias():\n    assert demographic_parity > 0.8"),
        )
        findings = check_ai_test_coverage(files)
        assert len(findings) == 0

    def test_nist_controls_in_extra(self):
        files = _make_files(
            ("src/ml_pipeline.py", "python", "from transformers import pipeline\np = pipeline('text-classification')"),
        )
        findings = check_ai_test_coverage(files)
        assert len(findings) == 1
        assert "MEASURE-1.1" in findings[0].extra["nist_controls"]


# =====================================================================
# 4. Access Control Documentation
# =====================================================================

class TestAccessDocumentation:
    def test_flags_rbac_code_without_docs(self):
        files = _make_files(
            ("src/auth.py", "python", "def check_role(user, role):\n    return role in user.roles"),
        )
        findings = check_access_documentation(files)
        assert len(findings) == 1
        assert findings[0].category == "access-documentation-gap"

    def test_no_flag_when_access_docs_present(self):
        files = _make_files(
            ("src/auth.py", "python", "@require_auth\ndef admin_only(): pass"),
            ("docs/access.md", "markdown", "## Access Control Policy\nRBAC policy definitions"),
        )
        findings = check_access_documentation(files)
        assert len(findings) == 0

    def test_no_flag_for_non_auth_code(self):
        files = _make_files(
            ("src/utils.py", "python", "def format_date(d):\n    return d.isoformat()"),
        )
        findings = check_access_documentation(files)
        assert len(findings) == 0

    def test_hipaa_controls_in_extra(self):
        files = _make_files(
            ("src/permissions.py", "python", "def has_permission(user, perm):\n    return perm in user.permissions"),
        )
        findings = check_access_documentation(files)
        assert len(findings) == 1
        assert "164.312(a)(1)" in findings[0].extra["hipaa_controls"]

    def test_yaml_permission_docs_satisfy(self):
        files = _make_files(
            ("src/auth.py", "python", "def is_admin(user):\n    return user.role == 'admin'"),
            ("config/roles.yaml", "yaml", "# Role Definitions\nadmin:\n  permissions: ['*']"),
        )
        findings = check_access_documentation(files)
        assert len(findings) == 0
