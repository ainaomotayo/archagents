"""Tests for AI-detector agent NIST/HIPAA compliance checks."""

from sentinel_agents.types import (
    Confidence,
    DiffFile,
    DiffHunk,
    Severity,
)

from sentinel_aidetector.compliance_checks import (
    check_bias_indicators,
    check_model_provenance,
    check_oversight_gaps,
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
# 1. Model Provenance
# =====================================================================

class TestModelProvenance:
    def test_flags_model_load_without_provenance(self):
        files = _make_files(
            ("src/model.py", "python",
             "from transformers import AutoModel\n"
             "model = AutoModel.from_pretrained('bert-base-uncased')"),
        )
        findings = check_model_provenance(files)
        assert len(findings) == 1
        assert findings[0].category == "provenance-gap"
        assert findings[0].type == "ai-detection"
        assert findings[0].severity == Severity.HIGH

    def test_no_flag_when_version_documented(self):
        files = _make_files(
            ("src/model.py", "python",
             "# Model version: 2.1.0\n"
             "# Model source: https://huggingface.co/bert-base\n"
             "model = AutoModel.from_pretrained('bert-base', revision='abc123')"),
        )
        findings = check_model_provenance(files)
        assert len(findings) == 0

    def test_no_flag_for_non_model_code(self):
        files = _make_files(
            ("src/utils.py", "python", "def add(a, b):\n    return a + b"),
        )
        findings = check_model_provenance(files)
        assert len(findings) == 0

    def test_flags_openai_without_provenance(self):
        files = _make_files(
            ("src/llm.py", "python",
             "import openai\n"
             "completion = openai.chat.completions.create(model='gpt-4')"),
        )
        findings = check_model_provenance(files)
        assert len(findings) == 1

    def test_mlflow_satisfies_provenance(self):
        files = _make_files(
            ("src/model.py", "python",
             "import mlflow\n"
             "model = mlflow.load_model('runs:/abc123/model')"),
        )
        findings = check_model_provenance(files)
        assert len(findings) == 0

    def test_nist_controls_in_extra(self):
        files = _make_files(
            ("src/ml.py", "python", "model = load_model('model.pt')"),
        )
        findings = check_model_provenance(files)
        assert len(findings) == 1
        assert "GOVERN-1.5" in findings[0].extra["nist_controls"]

    def test_revision_parameter_satisfies(self):
        files = _make_files(
            ("src/model.py", "python",
             "model = AutoModel.from_pretrained('bert', revision='v1.0.0')"),
        )
        findings = check_model_provenance(files)
        assert len(findings) == 0


# =====================================================================
# 2. Bias Indicators
# =====================================================================

class TestBiasIndicators:
    def test_flags_protected_attributes_without_fairness(self):
        files = _make_files(
            ("src/classifier.py", "python",
             "def predict_risk(patient_data):\n"
             "    features = [patient_data.age, patient_data.gender, patient_data.race]\n"
             "    return model.predict(features)"),
        )
        findings = check_bias_indicators(files)
        assert len(findings) == 1
        assert findings[0].category == "bias-indicator"
        assert findings[0].severity == Severity.HIGH

    def test_no_flag_when_fairness_present(self):
        files = _make_files(
            ("src/classifier.py", "python",
             "features = [data.age, data.gender]\n"
             "prediction = model.predict(features)"),
            ("tests/test_fairness.py", "python",
             "from fairlearn.metrics import demographic_parity_difference\n"
             "def test_fairness():\n"
             "    assert demographic_parity_difference(y_true, y_pred, sensitive) < 0.1"),
        )
        findings = check_bias_indicators(files)
        assert len(findings) == 0

    def test_no_flag_without_protected_attributes(self):
        files = _make_files(
            ("src/model.py", "python",
             "def predict(features):\n"
             "    return model.predict(features)"),
        )
        findings = check_bias_indicators(files)
        assert len(findings) == 0

    def test_flags_healthcare_decision_attributes(self):
        files = _make_files(
            ("src/triage.py", "python",
             "def score_patient(age, ethnicity, risk_score):\n"
             "    return classify(age, ethnicity)"),
        )
        findings = check_bias_indicators(files)
        assert len(findings) == 1

    def test_matched_attributes_in_extra(self):
        files = _make_files(
            ("src/hr.py", "python",
             "def screen(candidate):\n"
             "    return score(candidate.gender, candidate.age)"),
        )
        findings = check_bias_indicators(files)
        assert len(findings) == 1
        attrs = findings[0].extra["matched_attributes"]
        assert any("gender" in a.lower() for a in attrs) or any("age" in a.lower() for a in attrs)

    def test_nist_controls_in_extra(self):
        files = _make_files(
            ("src/model.py", "python", "features = [data.race, data.gender]"),
        )
        findings = check_bias_indicators(files)
        assert len(findings) == 1
        assert "MEASURE-2.6" in findings[0].extra["nist_controls"]


# =====================================================================
# 3. Human Oversight Gaps
# =====================================================================

class TestOversightGaps:
    def test_flags_auto_approve_without_review(self):
        files = _make_files(
            ("src/processor.py", "python",
             "def process_application(app):\n"
             "    if prediction > 0.9:\n"
             "        auto_approve(app)"),
        )
        findings = check_oversight_gaps(files)
        assert len(findings) == 1
        assert findings[0].category == "oversight-gap"
        assert findings[0].severity == Severity.CRITICAL

    def test_no_flag_when_human_review_present(self):
        files = _make_files(
            ("src/processor.py", "python",
             "def process_application(app):\n"
             "    auto_approve(app)\n"
             "    # Requires human_review for all auto-approved cases"),
        )
        findings = check_oversight_gaps(files)
        assert len(findings) == 0

    def test_no_flag_for_non_automated_code(self):
        files = _make_files(
            ("src/utils.py", "python",
             "def format_date(d):\n"
             "    return d.strftime('%Y-%m-%d')"),
        )
        findings = check_oversight_gaps(files)
        assert len(findings) == 0

    def test_flags_auto_triage(self):
        files = _make_files(
            ("src/clinical.py", "python",
             "def handle_patient(patient):\n"
             "    auto_triage(patient)"),
        )
        findings = check_oversight_gaps(files)
        assert len(findings) == 1

    def test_escalation_satisfies_oversight(self):
        files = _make_files(
            ("src/processor.py", "python",
             "def handle(app):\n"
             "    auto_approve(app)\n"
             "    escalate_to_manager(app)"),
        )
        findings = check_oversight_gaps(files)
        assert len(findings) == 0

    def test_nist_controls_in_extra(self):
        files = _make_files(
            ("src/bot.py", "python", "automated_clinical_decision(patient)"),
        )
        findings = check_oversight_gaps(files)
        assert len(findings) == 1
        assert "MANAGE-2.2" in findings[0].extra["nist_controls"]

    def test_approval_required_satisfies_oversight(self):
        files = _make_files(
            ("src/deploy.py", "python",
             "auto_deploy(model)\n"
             "# approval_required for production deployments"),
        )
        findings = check_oversight_gaps(files)
        assert len(findings) == 0
