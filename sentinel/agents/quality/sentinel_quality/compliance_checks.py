"""NIST AI RMF / HIPAA compliance detection checks for the Quality Agent.

These functions scan diff content for documentation and governance gaps
relevant to NIST AI RMF (MAP, MEASURE, MANAGE) and HIPAA compliance.

Finding categories:
- quality/ai-documentation-gap
- quality/data-governance-gap
- quality/ai-test-coverage-gap
- quality/access-documentation-gap
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from sentinel_agents.types import Confidence, DiffFile, Finding, Severity


# -------------------------------------------------------------------------
# Shared helpers
# -------------------------------------------------------------------------

def _extract_added_code(diff_file: DiffFile) -> str:
    """Reconstruct added code from diff hunks."""
    lines: list[str] = []
    for hunk in diff_file.hunks:
        for line in hunk.content.split("\n"):
            if line.startswith("+") and not line.startswith("+++"):
                lines.append(line[1:])
            elif not line.startswith("-") and not line.startswith("---"):
                if not line.startswith("@@"):
                    lines.append(line)
    return "\n".join(lines)


def _is_ai_ml_file(path: str) -> bool:
    """Heuristic: does the file path suggest AI/ML code?"""
    lower = path.lower()
    indicators = [
        "model", "ml", "ai", "train", "predict", "infer",
        "pipeline", "transformer", "neural", "classifier",
        "detector", "embedding", "tokenizer", "llm",
        "agent", "rag", "prompt", "fine_tune", "finetune",
    ]
    return any(ind in lower for ind in indicators)


def _is_ai_ml_content(code: str) -> bool:
    """Heuristic: does the code content suggest AI/ML usage?"""
    lower = code.lower()
    patterns = [
        r"\bimport\s+(?:torch|tensorflow|keras|sklearn|transformers|openai|langchain|anthropic)\b",
        r"\bfrom\s+(?:torch|tensorflow|keras|sklearn|transformers|openai|langchain|anthropic)\b",
        r"\bmodel\.(?:predict|fit|train|generate|forward)\b",
        r"\bpipeline\s*\(",
        r"\b(?:GPT|BERT|LLM|embedding|tokenizer)\b",
    ]
    return any(re.search(p, lower) for p in patterns)


# -------------------------------------------------------------------------
# 1. AI Documentation Completeness
# -------------------------------------------------------------------------

# Markers that indicate proper AI documentation exists
_AI_DOC_MARKERS = [
    r"(?i)model\s*card",
    r"(?i)model\s*documentation",
    r"(?i)##\s*(?:AI|ML|Model)\s",
    r"(?i)intended\s*use",
    r"(?i)limitations?\s*(?:and|&)\s*(?:risks?|biases?)",
    r"(?i)training\s*data(?:set)?",
    r"(?i)performance\s*(?:metrics?|evaluation)",
    r"(?i)ethical\s*considerations?",
    r"(?i)model\s*version",
    r"(?i)model\s*(?:source|provenance|origin)",
]


def check_ai_documentation(files: list[DiffFile]) -> list[Finding]:
    """Check whether AI/ML files in the diff have adequate documentation.

    Looks for model cards, README AI sections, and inline doc markers.
    Flags AI/ML code that lacks documentation artifacts.

    NIST AI RMF: MAP 1.1, MAP 1.5, GOVERN 1.1
    """
    findings: list[Finding] = []

    ai_files: list[DiffFile] = []
    has_doc_file = False

    for f in files:
        code = _extract_added_code(f)
        lower_path = f.path.lower()

        # Check if this is a documentation file with AI content
        if any(ext in lower_path for ext in (".md", ".rst", ".txt")):
            if any(re.search(m, code) for m in _AI_DOC_MARKERS):
                has_doc_file = True
            continue

        # Check if this is an AI/ML code file
        if _is_ai_ml_file(f.path) or _is_ai_ml_content(code):
            ai_files.append(f)

    if not ai_files:
        return findings

    if not has_doc_file:
        # No documentation found — flag each AI file
        for f in ai_files:
            findings.append(
                Finding(
                    type="quality",
                    file=f.path,
                    line_start=1,
                    line_end=1,
                    severity=Severity.MEDIUM,
                    confidence=Confidence.MEDIUM,
                    title="AI/ML code lacks documentation (model card / README)",
                    description=(
                        f"File `{f.path}` contains AI/ML code but no model card "
                        "or AI documentation section was found in this diff. "
                        "NIST AI RMF MAP 1.1 requires documentation of AI system "
                        "purpose, intended use, and known limitations."
                    ),
                    remediation=(
                        "Add a MODEL_CARD.md or document AI usage in the project README "
                        "including: intended use, limitations, training data provenance, "
                        "performance metrics, and ethical considerations."
                    ),
                    category="ai-documentation-gap",
                    scanner="quality-agent",
                    extra={"nist_controls": ["MAP-1.1", "MAP-1.5", "GOVERN-1.1"]},
                )
            )

    return findings


# -------------------------------------------------------------------------
# 2. Data Governance Markers
# -------------------------------------------------------------------------

_DATA_GOVERNANCE_MARKERS = [
    r"(?i)data\s*classification",
    r"(?i)(?:public|internal|confidential|restricted|sensitive)\s*(?:data|information)",
    r"(?i)retention\s*polic(?:y|ies)",
    r"(?i)data\s*lineage",
    r"(?i)data\s*(?:owner|steward)",
    r"(?i)PII|PHI|ePHI|personally\s*identifiable",
    r"(?i)HIPAA|GDPR|CCPA",
    r"(?i)data\s*processing\s*agreement",
    r"(?i)data\s*inventory",
    r"(?i)data\s*flow",
]

_DATA_HANDLING_PATTERNS = [
    r"(?i)\b(?:read|load|fetch|query|ingest).*(?:patient|medical|health|clinical|record)\b",
    r"(?i)\b(?:database|db|store|persist|save).*(?:user|patient|personal)\b",
    r"(?i)\bopen\s*\([^)]*(?:\.csv|\.json|\.parquet|\.xlsx)\b",
    r"(?i)\bpd\.read_",
    r"(?i)\b(?:SELECT|INSERT|UPDATE)\b.*(?:FROM|INTO)\b",
]


def check_data_governance(files: list[DiffFile]) -> list[Finding]:
    """Check for data governance markers in code that handles sensitive data.

    Flags code that reads/processes data without classification labels or
    retention policies.

    HIPAA: 164.312(c)(1), 164.530(j)
    NIST AI RMF: MAP 2.1, MAP 2.3
    """
    findings: list[Finding] = []

    for f in files:
        code = _extract_added_code(f)
        if not code.strip():
            continue

        # Check if the file handles data
        handles_data = any(re.search(p, code) for p in _DATA_HANDLING_PATTERNS)
        if not handles_data:
            continue

        # Check if governance markers exist
        has_governance = any(re.search(m, code) for m in _DATA_GOVERNANCE_MARKERS)
        if has_governance:
            continue

        findings.append(
            Finding(
                type="quality",
                file=f.path,
                line_start=1,
                line_end=1,
                severity=Severity.MEDIUM,
                confidence=Confidence.MEDIUM,
                title="Data handling code lacks governance markers",
                description=(
                    f"File `{f.path}` contains data handling operations but no "
                    "data classification, retention policy, or data lineage markers. "
                    "HIPAA 164.312(c)(1) requires integrity controls for ePHI. "
                    "NIST AI RMF MAP 2.1 requires data provenance documentation."
                ),
                remediation=(
                    "Add data classification comments (e.g., '# Data Classification: PHI'), "
                    "document retention policies, and include data lineage references. "
                    "For HIPAA, ensure ePHI access is logged and data flows are documented."
                ),
                category="data-governance-gap",
                scanner="quality-agent",
                extra={
                    "hipaa_controls": ["164.312(c)(1)", "164.530(j)"],
                    "nist_controls": ["MAP-2.1", "MAP-2.3"],
                },
            )
        )

    return findings


# -------------------------------------------------------------------------
# 3. AI Test Coverage
# -------------------------------------------------------------------------

_ML_TEST_PATTERNS = [
    r"(?i)test_model",
    r"(?i)test_predict",
    r"(?i)test_train",
    r"(?i)test_inference",
    r"(?i)test_fairness",
    r"(?i)test_bias",
    r"(?i)test_accuracy",
    r"(?i)test_performance",
    r"(?i)evaluation_report",
    r"(?i)model_eval",
    r"(?i)benchmark",
    r"(?i)confusion_matrix",
    r"(?i)classification_report",
    r"(?i)assert.*accuracy",
    r"(?i)assert.*f1_score",
    r"(?i)assert.*precision",
    r"(?i)assert.*recall",
]


def check_ai_test_coverage(files: list[DiffFile]) -> list[Finding]:
    """Check whether AI/ML code has adequate test coverage.

    Looks for ML test files, model evaluation scripts, and fairness tests.

    NIST AI RMF: MEASURE 1.1, MEASURE 2.6, MEASURE 2.11
    """
    findings: list[Finding] = []

    ai_source_files: list[DiffFile] = []
    has_ml_tests = False

    for f in files:
        code = _extract_added_code(f)
        lower_path = f.path.lower()

        # Check if this is a test file with ML test patterns
        if "test" in lower_path:
            if any(re.search(p, code) for p in _ML_TEST_PATTERNS):
                has_ml_tests = True
            continue

        # Check if this is an AI/ML source file
        if _is_ai_ml_file(f.path) or _is_ai_ml_content(code):
            ai_source_files.append(f)

    if not ai_source_files:
        return findings

    if not has_ml_tests:
        for f in ai_source_files:
            findings.append(
                Finding(
                    type="quality",
                    file=f.path,
                    line_start=1,
                    line_end=1,
                    severity=Severity.HIGH,
                    confidence=Confidence.MEDIUM,
                    title="AI/ML code lacks model evaluation tests",
                    description=(
                        f"File `{f.path}` contains AI/ML code but no model "
                        "evaluation or fairness tests were found in this diff. "
                        "NIST AI RMF MEASURE 1.1 requires AI systems to be tested "
                        "for accuracy, fairness, and robustness."
                    ),
                    remediation=(
                        "Add test files that validate model accuracy, fairness metrics "
                        "(e.g., demographic parity, equalized odds), robustness to "
                        "adversarial inputs, and performance benchmarks."
                    ),
                    category="ai-test-coverage-gap",
                    scanner="quality-agent",
                    extra={
                        "nist_controls": ["MEASURE-1.1", "MEASURE-2.6", "MEASURE-2.11"],
                    },
                )
            )

    return findings


# -------------------------------------------------------------------------
# 4. Access Control Documentation
# -------------------------------------------------------------------------

_ACCESS_CONTROL_CODE_PATTERNS = [
    r"(?i)\b(?:role|permission|rbac|acl|authorize|auth_check)\b",
    r"(?i)\b(?:is_admin|is_authorized|has_permission|check_role|require_role)\b",
    r"(?i)\b(?:@login_required|@require_auth|@permission_required|@roles_allowed)\b",
    r"(?i)\b(?:access_control|policy_engine|permission_check)\b",
]

_ACCESS_DOC_MARKERS = [
    r"(?i)access\s*control\s*(?:policy|matrix|list)",
    r"(?i)RBAC\s*(?:policy|config|definition)",
    r"(?i)permission\s*(?:model|matrix|scheme|documentation)",
    r"(?i)role\s*(?:definition|hierarchy|mapping)",
    r"(?i)##\s*(?:Access|Authorization|Permissions?|Roles?)\b",
    r"(?i)least\s*privilege",
    r"(?i)segregation\s*of\s*duties",
]


def check_access_documentation(files: list[DiffFile]) -> list[Finding]:
    """Check for access control documentation alongside RBAC/auth code.

    Flags access control implementations that lack documentation.

    HIPAA: 164.312(a)(1), 164.312(d)
    NIST AI RMF: GOVERN 1.4, MANAGE 2.2
    """
    findings: list[Finding] = []

    access_code_files: list[DiffFile] = []
    has_access_docs = False

    for f in files:
        code = _extract_added_code(f)
        lower_path = f.path.lower()

        # Check doc files for access control documentation
        if any(ext in lower_path for ext in (".md", ".rst", ".txt", ".yaml", ".yml")):
            if any(re.search(m, code) for m in _ACCESS_DOC_MARKERS):
                has_access_docs = True
            continue

        # Check for access control code
        if any(re.search(p, code) for p in _ACCESS_CONTROL_CODE_PATTERNS):
            access_code_files.append(f)

    if not access_code_files:
        return findings

    if not has_access_docs:
        for f in access_code_files:
            findings.append(
                Finding(
                    type="quality",
                    file=f.path,
                    line_start=1,
                    line_end=1,
                    severity=Severity.MEDIUM,
                    confidence=Confidence.MEDIUM,
                    title="Access control code lacks documentation",
                    description=(
                        f"File `{f.path}` implements access control logic but no "
                        "RBAC/permission documentation was found in this diff. "
                        "HIPAA 164.312(a)(1) requires access control documentation. "
                        "NIST AI RMF GOVERN 1.4 requires defined roles and responsibilities."
                    ),
                    remediation=(
                        "Document the access control model in an ACCESS_CONTROL.md or "
                        "equivalent, covering: role definitions, permission matrix, "
                        "least-privilege enforcement, and segregation of duties."
                    ),
                    category="access-documentation-gap",
                    scanner="quality-agent",
                    extra={
                        "hipaa_controls": ["164.312(a)(1)", "164.312(d)"],
                        "nist_controls": ["GOVERN-1.4", "MANAGE-2.2"],
                    },
                )
            )

    return findings
