"""NIST AI RMF / HIPAA compliance detection checks for the AI-Detector Agent.

These functions analyze code for AI governance gaps including model provenance,
bias indicators, and human oversight requirements.

Finding categories (namespaced to match framework matchRules):
- ai-detection/provenance-gap
- ai-detection/bias-indicator
- ai-detection/oversight-gap
"""

from __future__ import annotations

import re

from sentinel_agents.types import Confidence, DiffFile, Finding, Severity, extract_added_code as _extract_added_code


def _uses_ai_models(code: str) -> bool:
    """Check if the code references AI/ML model loading or inference."""
    patterns = [
        r"\bfrom_pretrained\s*\(",
        r"\bload_model\s*\(",
        r"\bmodel\s*=\s*",
        r"\bAutoModel\b",
        r"\bAutoTokenizer\b",
        r"\bpipeline\s*\(\s*['\"]",
        r"\bopenai\.\w+\.create\b",
        r"\banthropic\.\w+\.create\b",
        r"\bcompletion\s*=",
        r"\bchat\.completions\b",
        r"\bmodel_path\b",
        r"\bckpt\b|\.pt\b|\.pth\b|\.onnx\b|\.safetensors\b",
        r"\bhuggingface\.co/",
        r"\bmodel_name\s*=",
    ]
    return any(re.search(p, code) for p in patterns)


# -------------------------------------------------------------------------
# 1. Model Provenance Check
# -------------------------------------------------------------------------

_PROVENANCE_MARKERS = [
    r"(?i)model_version\s*=",
    r"(?i)model_source\s*=",
    r"(?i)model_hash\s*=",
    r"(?i)model_sha\s*=",
    r"(?i)model_checksum\s*=",
    r"(?i)model_card",
    r"(?i)model_id\s*=\s*['\"]",
    r"(?i)revision\s*=\s*['\"]",
    r"(?i)commit_hash\s*=",
    r"(?i)model_registry",
    r"(?i)mlflow\.(?:log_model|register_model|load_model)",
    r"(?i)wandb\.(?:log_artifact|use_artifact)",
    r"(?i)dvc\.(?:pull|push|checkout)",
    r"(?i)# Model provenance:",
    r"(?i)# Model source:",
    r"(?i)# Model version:",
    r"(?i)\"model_metadata\"",
]


def check_model_provenance(files: list[DiffFile]) -> list[Finding]:
    """Check for model source/version documentation in AI code.

    Flags code that loads or uses AI models without provenance tracking
    (version, source, hash, registry reference).

    NIST AI RMF: GOVERN 1.5, MAP 2.3, MANAGE 1.3
    """
    findings: list[Finding] = []

    for f in files:
        code = _extract_added_code(f)
        if not code.strip():
            continue

        if not _uses_ai_models(code):
            continue

        has_provenance = any(re.search(m, code) for m in _PROVENANCE_MARKERS)
        if has_provenance:
            continue

        findings.append(
            Finding(
                type="ai-detection",
                file=f.path,
                line_start=1,
                line_end=1,
                severity=Severity.HIGH,
                confidence=Confidence.MEDIUM,
                title="AI model loaded without provenance documentation",
                description=(
                    f"File `{f.path}` loads or references AI models but lacks "
                    "provenance information (model version, source, hash, or "
                    "registry reference). NIST AI RMF GOVERN 1.5 requires "
                    "tracking of AI component supply chain. MAP 2.3 requires "
                    "documentation of data and model origins."
                ),
                remediation=(
                    "Add model provenance metadata: specify model_version, "
                    "model_source (URL or registry), and model_hash (SHA-256). "
                    "Consider using a model registry (MLflow, W&B) or pinning "
                    "the revision parameter in from_pretrained() calls."
                ),
                category="ai-detection/provenance-gap",
                scanner="ai-detector",
                extra={
                    "nist_controls": ["GOVERN-1.5", "MAP-2.3", "MANAGE-1.3"],
                },
            )
        )

    return findings


# -------------------------------------------------------------------------
# 2. Bias Indicator Detection
# -------------------------------------------------------------------------

_BIAS_RISK_PATTERNS = [
    # Demographic/protected attribute usage
    r"\b(?:gender|sex|race|ethnicity|age|religion|disability)\b",
    r"\b(?:male|female|caucasian|african|hispanic|asian)\b",
    r"\b(?:protected_attribute|sensitive_attribute|demographic)\b",
    # Decision-making on people
    r"\b(?:hire|reject|approve|deny|score|rank|classify)\s*\(",
    r"\b(?:risk_score|credit_score|eligibility|diagnosis)\b",
    # Healthcare-specific
    r"\b(?:patient_risk|clinical_decision|triage|treatment_recommendation)\b",
]

_FAIRNESS_MARKERS = [
    r"(?i)fairness",
    r"(?i)bias\s*(?:test|check|audit|metric|evaluation|mitigation)",
    r"(?i)demographic\s*parity",
    r"(?i)equalized\s*odds",
    r"(?i)disparate\s*impact",
    r"(?i)calibration\s*(?:by|across)\s*group",
    r"(?i)aif360|fairlearn|aequitas",
    r"(?i)protected\s*group\s*(?:analysis|evaluation)",
    r"(?i)# Fairness:",
    r"(?i)def\s+(?:test_fairness|check_bias|evaluate_fairness)",
]


def check_bias_indicators(files: list[DiffFile]) -> list[Finding]:
    """Check for fairness evaluation when code uses protected attributes.

    Flags code that processes demographic or protected attributes without
    corresponding bias/fairness evaluation artifacts.

    NIST AI RMF: MEASURE 2.6, MEASURE 2.11, MAP 2.3
    HIPAA: 164.530(i) — non-discrimination in AI healthcare decisions
    """
    findings: list[Finding] = []

    bias_risk_files: list[DiffFile] = []
    has_fairness = False

    for f in files:
        code = _extract_added_code(f)
        if not code.strip():
            continue

        # Check for fairness markers across all files
        if any(re.search(m, code) for m in _FAIRNESS_MARKERS):
            has_fairness = True

        # Check for bias risk patterns
        if any(re.search(p, code) for p in _BIAS_RISK_PATTERNS):
            bias_risk_files.append(f)

    if not bias_risk_files or has_fairness:
        return findings

    for f in bias_risk_files:
        code = _extract_added_code(f)
        # Find which specific patterns matched
        matched_attributes = []
        for p in _BIAS_RISK_PATTERNS:
            matches = re.findall(p, code, re.IGNORECASE)
            matched_attributes.extend(matches)
        matched_attributes = list(set(matched_attributes))[:5]

        findings.append(
            Finding(
                type="ai-detection",
                file=f.path,
                line_start=1,
                line_end=1,
                severity=Severity.HIGH,
                confidence=Confidence.MEDIUM,
                title="Protected attributes used without fairness evaluation",
                description=(
                    f"File `{f.path}` references protected or demographic "
                    f"attributes ({', '.join(matched_attributes)}) but no fairness "
                    "evaluation was found in this diff. "
                    "NIST AI RMF MEASURE 2.6 requires bias testing across "
                    "demographic groups. MEASURE 2.11 requires fairness assessment."
                ),
                remediation=(
                    "Add fairness evaluation: use libraries like fairlearn or AIF360 "
                    "to assess demographic parity, equalized odds, and disparate impact. "
                    "Document bias testing results and mitigation strategies."
                ),
                category="ai-detection/bias-indicator",
                scanner="ai-detector",
                extra={
                    "matched_attributes": matched_attributes,
                    "nist_controls": ["MEASURE-2.6", "MEASURE-2.11", "MAP-2.3"],
                    "hipaa_controls": ["164.530(i)"],
                },
            )
        )

    return findings


# -------------------------------------------------------------------------
# 3. Human Oversight Gap Detection
# -------------------------------------------------------------------------

_AUTOMATED_DECISION_PATTERNS = [
    # Direct automated actions
    r"\b(?:auto_approve|auto_reject|auto_deny|auto_accept)\b",
    r"\bautomate.*(?:decision|approval|rejection)\b",
    # Model output -> action without human check
    r"\bif\s+(?:prediction|score|result|output)\s*[><=!]+.*:\s*\n\s*(?:approve|reject|deny|execute|send|deploy)",
    r"\b(?:prediction|score|result)\s*>\s*[\d.]+.*(?:approve|execute|send|deploy)\b",
    # Healthcare automated decisions
    r"\b(?:auto_triage|auto_diagnose|auto_prescribe|auto_discharge)\b",
    r"\b(?:automated_clinical|automated_treatment|automated_screening)\b",
    # Deployment without review
    r"\b(?:auto_deploy|auto_release|continuous_deploy)\b.*model",
]

_OVERSIGHT_MARKERS = [
    r"(?i)human_review",
    r"(?i)human_in_the_loop",
    r"(?i)manual_review",
    r"(?i)approval_required",
    r"(?i)review_gate",
    r"(?i)escalat(?:e|ion)",
    r"(?i)human_override",
    r"(?i)manual_override",
    r"(?i)confidence_threshold.*(?:human|manual|review)",
    r"(?i)requires_approval",
    r"(?i)pending_review",
    r"(?i)audit_trail",
    r"(?i)# Human oversight:",
    r"(?i)def\s+(?:request_review|escalate|require_approval)",
]


def check_oversight_gaps(files: list[DiffFile]) -> list[Finding]:
    """Check for automated AI decision-making without human review gates.

    Flags code that takes automated actions based on AI/ML model outputs
    without any human-in-the-loop review mechanism.

    NIST AI RMF: MANAGE 2.2, MANAGE 2.4, GOVERN 1.4
    HIPAA: 164.312(a)(1) — access control for clinical decisions
    """
    findings: list[Finding] = []

    auto_decision_files: list[DiffFile] = []
    has_oversight = False

    for f in files:
        code = _extract_added_code(f)
        if not code.strip():
            continue

        # Check for oversight markers across all files
        if any(re.search(m, code) for m in _OVERSIGHT_MARKERS):
            has_oversight = True

        # Check for automated decision patterns
        if any(re.search(p, code, re.IGNORECASE) for p in _AUTOMATED_DECISION_PATTERNS):
            auto_decision_files.append(f)

    if not auto_decision_files or has_oversight:
        return findings

    for f in auto_decision_files:
        findings.append(
            Finding(
                type="ai-detection",
                file=f.path,
                line_start=1,
                line_end=1,
                severity=Severity.CRITICAL,
                confidence=Confidence.MEDIUM,
                title="Automated AI decision-making without human oversight",
                description=(
                    f"File `{f.path}` contains automated decision logic driven by "
                    "AI/ML outputs without visible human-in-the-loop review gates. "
                    "NIST AI RMF MANAGE 2.2 requires human oversight for AI decisions. "
                    "MANAGE 2.4 requires mechanisms for human intervention. "
                    "In healthcare contexts, automated clinical decisions without "
                    "physician review may violate standard of care requirements."
                ),
                remediation=(
                    "Add human oversight mechanisms: implement review gates for "
                    "critical decisions, add confidence thresholds that trigger "
                    "manual review, create escalation paths, and maintain audit "
                    "trails for all AI-assisted decisions."
                ),
                category="ai-detection/oversight-gap",
                scanner="ai-detector",
                extra={
                    "nist_controls": ["MANAGE-2.2", "MANAGE-2.4", "GOVERN-1.4"],
                    "hipaa_controls": ["164.312(a)(1)"],
                },
            )
        )

    return findings
