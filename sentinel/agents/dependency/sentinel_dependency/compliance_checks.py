"""NIST/HIPAA compliance detection checks for the Dependency Agent.

These functions analyze dependency scan results for healthcare and
AI-specific supply-chain risks.

Finding categories:
- dependency/hipaa-cve
- dependency/ai-supply-chain
- dependency/phi-license-risk
"""

from __future__ import annotations

import re
from typing import Any

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


# -------------------------------------------------------------------------
# 1. HIPAA-relevant CVE filtering
# -------------------------------------------------------------------------

# CWEs especially dangerous in healthcare / HIPAA contexts
HIPAA_CRITICAL_CWES: dict[str, str] = {
    "CWE-311": "Missing encryption of sensitive data",
    "CWE-319": "Cleartext transmission of sensitive information",
    "CWE-312": "Cleartext storage of sensitive information",
    "CWE-306": "Missing authentication for critical function",
    "CWE-287": "Improper authentication",
    "CWE-532": "Insertion of sensitive information into log file",
    "CWE-200": "Exposure of sensitive information",
    "CWE-522": "Insufficiently protected credentials",
    "CWE-256": "Unprotected storage of credentials",
    "CWE-523": "Unprotected transport of credentials",
    "CWE-359": "Exposure of private personal information",
    "CWE-668": "Exposure of resource to wrong sphere",
}


def check_hipaa_cves(findings: list[Finding]) -> list[Finding]:
    """Filter existing CVE findings for HIPAA-critical CWE categories.

    Takes findings from the OSV scanner (category="cve") and produces
    additional findings for those that match HIPAA-critical CWE patterns.

    HIPAA: 164.312(a)(2)(iv), 164.312(e)(1), 164.312(e)(2)(ii)
    """
    hipaa_findings: list[Finding] = []

    for f in findings:
        if f.category != "cve":
            continue

        cwe = f.cwe_id or ""
        # Normalize CWE format
        cwe_match = re.match(r"CWE-(\d+)", cwe)
        if not cwe_match:
            # Check extra dict for CWE info
            cwe_ids = f.extra.get("cwe_ids", [])
            if isinstance(cwe_ids, list):
                for cid in cwe_ids:
                    if cid in HIPAA_CRITICAL_CWES:
                        cwe = cid
                        break

        if cwe not in HIPAA_CRITICAL_CWES:
            # Also check description for HIPAA-relevant keywords
            desc_lower = (f.description or "").lower()
            hipaa_keywords = [
                "encryption", "cleartext", "plaintext", "authentication",
                "credential", "password", "log.*sensitive", "phi", "ephi",
                "personal.*information", "health.*record",
            ]
            if not any(re.search(kw, desc_lower) for kw in hipaa_keywords):
                continue

        cwe_desc = HIPAA_CRITICAL_CWES.get(cwe, "HIPAA-relevant vulnerability pattern")

        hipaa_findings.append(
            Finding(
                type="dependency",
                file=f.file,
                line_start=f.line_start,
                line_end=f.line_end,
                severity=Severity.CRITICAL if f.severity in (Severity.CRITICAL, Severity.HIGH) else Severity.HIGH,
                confidence=Confidence.HIGH,
                title=f"HIPAA-critical CVE: {f.title}",
                description=(
                    f"Vulnerability {f.title} has CWE pattern relevant to HIPAA compliance. "
                    f"{cwe_desc}. "
                    "This could impact ePHI confidentiality, integrity, or availability. "
                    f"Original: {f.description[:200]}"
                ),
                remediation=(
                    f"{f.remediation} "
                    "HIPAA 164.312 requires technical safeguards including encryption, "
                    "access controls, and audit logging for ePHI."
                ),
                category="hipaa-cve",
                scanner="dependency-agent",
                cwe_id=cwe or f.cwe_id,
                extra={
                    "original_finding": f.title,
                    "hipaa_controls": [
                        "164.312(a)(2)(iv)",
                        "164.312(e)(1)",
                        "164.312(e)(2)(ii)",
                    ],
                    "cwe_description": cwe_desc,
                    **{k: v for k, v in f.extra.items() if k != "findingType"},
                    "findingType": "hipaa-cve",
                },
            )
        )

    return hipaa_findings


# -------------------------------------------------------------------------
# 2. AI Supply Chain Risk Detection
# -------------------------------------------------------------------------

# Known AI/ML libraries that should be version-pinned
AI_ML_PACKAGES: dict[str, str] = {
    # Python
    "torch": "PyTorch",
    "tensorflow": "TensorFlow",
    "keras": "Keras",
    "transformers": "HuggingFace Transformers",
    "openai": "OpenAI SDK",
    "anthropic": "Anthropic SDK",
    "langchain": "LangChain",
    "langchain-core": "LangChain Core",
    "langchain-community": "LangChain Community",
    "llama-index": "LlamaIndex",
    "scikit-learn": "scikit-learn",
    "sklearn": "scikit-learn",
    "numpy": "NumPy",
    "pandas": "Pandas",
    "scipy": "SciPy",
    "xgboost": "XGBoost",
    "lightgbm": "LightGBM",
    "onnx": "ONNX",
    "onnxruntime": "ONNX Runtime",
    "huggingface-hub": "HuggingFace Hub",
    "tokenizers": "HuggingFace Tokenizers",
    "safetensors": "SafeTensors",
    "accelerate": "HuggingFace Accelerate",
    "peft": "PEFT",
    "trl": "TRL",
    "vllm": "vLLM",
    "mlflow": "MLflow",
    "wandb": "Weights & Biases",
    # npm
    "@tensorflow/tfjs": "TensorFlow.js",
    "openai": "OpenAI SDK",
    "@anthropic-ai/sdk": "Anthropic SDK",
    "langchain": "LangChain",
    "ml5": "ml5.js",
    "brain.js": "Brain.js",
    "onnxruntime-web": "ONNX Runtime Web",
    "onnxruntime-node": "ONNX Runtime Node",
}

# Version patterns indicating unpinned versions
_UNPINNED_PATTERNS = [
    r"^\*$",           # wildcard
    r"^latest$",       # latest tag
    r"^>=",            # minimum only
    r"^>",             # greater than
    r"^~",             # tilde range (allows patch)
    r"^\^",            # caret range (allows minor)
    r"^$",             # empty version
]


def _is_unpinned(version: str | None) -> bool:
    """Check if a version string indicates an unpinned dependency."""
    if not version:
        return True
    v = version.strip()
    return any(re.match(p, v) for p in _UNPINNED_PATTERNS)


def check_ai_supply_chain(files: list[DiffFile]) -> list[Finding]:
    """Check for AI/ML library dependencies without pinned versions.

    Scans diff content for manifest files and flags AI/ML packages
    that don't have exact version pins.

    NIST AI RMF: GOVERN 1.5, MAP 3.4
    """
    findings: list[Finding] = []

    for f in files:
        lower_path = f.path.lower()
        # Only check manifest files
        is_manifest = any(
            lower_path.endswith(m) for m in (
                "requirements.txt", "pyproject.toml", "setup.py", "setup.cfg",
                "package.json", "package-lock.json", "go.mod", "cargo.toml",
                "gemfile", "pom.xml",
            )
        )
        if not is_manifest:
            continue

        # Extract added lines
        for hunk in f.hunks:
            line_num = hunk.new_start
            for line in hunk.content.split("\n"):
                if not (line.startswith("+") and not line.startswith("+++")):
                    if not line.startswith("-") and not line.startswith("@@"):
                        line_num += 1
                    continue

                text = line[1:].strip()
                line_num += 1

                for pkg_name, pkg_label in AI_ML_PACKAGES.items():
                    # Check various manifest formats
                    if pkg_name.lower() in text.lower():
                        # Try to extract version
                        version = _extract_version_from_line(text, pkg_name)
                        if _is_unpinned(version):
                            findings.append(
                                Finding(
                                    type="dependency",
                                    file=f.path,
                                    line_start=max(1, line_num - 1),
                                    line_end=max(1, line_num - 1),
                                    severity=Severity.HIGH,
                                    confidence=Confidence.HIGH,
                                    title=f"AI/ML dependency `{pkg_name}` is not version-pinned",
                                    description=(
                                        f"{pkg_label} (`{pkg_name}`) is declared without an "
                                        f"exact version pin (found: '{version or 'none'}'). "
                                        "Unpinned AI/ML dependencies create supply chain risks "
                                        "and make builds non-reproducible. "
                                        "NIST AI RMF GOVERN 1.5 requires supply chain risk management."
                                    ),
                                    remediation=(
                                        f"Pin `{pkg_name}` to an exact version (e.g., "
                                        f"`{pkg_name}==x.y.z` or `\"{pkg_name}\": \"x.y.z\"`). "
                                        "Use a lockfile and verify package integrity with hashes."
                                    ),
                                    category="ai-supply-chain",
                                    scanner="dependency-agent",
                                    extra={
                                        "package": pkg_name,
                                        "current_version": version or "",
                                        "nist_controls": ["GOVERN-1.5", "MAP-3.4"],
                                        "findingType": "ai-supply-chain",
                                    },
                                )
                            )
                            break  # one finding per line

    return findings


def _extract_version_from_line(line: str, package: str) -> str | None:
    """Best-effort version extraction from a manifest line."""
    # requirements.txt style: package==1.0.0 or package>=1.0.0
    m = re.search(rf"{re.escape(package)}\s*([=<>!~]+\s*[\d][^\s,;]*)", line, re.IGNORECASE)
    if m:
        return m.group(1).strip()

    # package.json style: "package": "^1.0.0"
    m = re.search(rf'"{re.escape(package)}"\s*:\s*"([^"]*)"', line, re.IGNORECASE)
    if m:
        return m.group(1).strip()

    # pyproject.toml style: package = ">=1.0"
    m = re.search(rf'{re.escape(package)}\s*=\s*"([^"]*)"', line, re.IGNORECASE)
    if m:
        return m.group(1).strip()

    return None


# -------------------------------------------------------------------------
# 3. PHI License Risk Detection
# -------------------------------------------------------------------------

# Copyleft licenses that create compliance risks for healthcare software
COPYLEFT_LICENSES: dict[str, str] = {
    "GPL-2.0": "GNU General Public License v2.0 (strong copyleft)",
    "GPL-3.0": "GNU General Public License v3.0 (strong copyleft)",
    "AGPL-3.0": "GNU Affero General Public License v3.0 (network copyleft)",
    "LGPL-2.1": "GNU Lesser General Public License v2.1 (weak copyleft)",
    "LGPL-3.0": "GNU Lesser General Public License v3.0 (weak copyleft)",
    "MPL-2.0": "Mozilla Public License 2.0 (file-level copyleft)",
    "EUPL-1.2": "European Union Public License 1.2 (copyleft)",
    "SSPL-1.0": "Server Side Public License v1 (strong copyleft)",
    "CC-BY-SA": "Creative Commons Attribution-ShareAlike (copyleft)",
}

# License patterns to detect in manifest/lockfiles
_LICENSE_PATTERNS = [
    r'"license"\s*:\s*"([^"]+)"',
    r"license\s*=\s*['\"]([^'\"]+)['\"]",
    r"License\s*::\s*.*?::\s*(.+?)(?:\s*$|\s*::)",
]


def check_phi_license_risk(files: list[DiffFile]) -> list[Finding]:
    """Flag dependencies with copyleft licenses in healthcare context.

    Copyleft licenses in PHI-handling software may require source code
    disclosure, which conflicts with healthcare security requirements.

    HIPAA: 164.312(a)(1) — access control implications
    """
    findings: list[Finding] = []

    for f in files:
        lower_path = f.path.lower()
        # Only check manifest and license-related files
        is_relevant = any(
            lower_path.endswith(m) or m in lower_path for m in (
                "package.json", "package-lock.json", "pyproject.toml",
                "cargo.toml", "gemfile.lock", "go.sum", "license",
                "setup.cfg", "setup.py", "pom.xml",
            )
        )
        if not is_relevant:
            continue

        code = _extract_added_code(f)
        if not code.strip():
            continue

        for license_id, license_desc in COPYLEFT_LICENSES.items():
            # Case-insensitive search for the license identifier
            pattern = re.escape(license_id).replace(r"\-", r"[-]?")
            matches = list(re.finditer(pattern, code, re.IGNORECASE))
            if not matches:
                # Also check for common full names
                name_variants = [
                    license_id.replace("-", " "),
                    license_id.replace("-", ""),
                ]
                for variant in name_variants:
                    matches = list(re.finditer(re.escape(variant), code, re.IGNORECASE))
                    if matches:
                        break

            if matches:
                # Determine severity based on copyleft strength
                if license_id in ("AGPL-3.0", "SSPL-1.0"):
                    severity = Severity.CRITICAL
                elif license_id.startswith("GPL"):
                    severity = Severity.HIGH
                else:
                    severity = Severity.MEDIUM

                findings.append(
                    Finding(
                        type="dependency",
                        file=f.path,
                        line_start=1,
                        line_end=1,
                        severity=severity,
                        confidence=Confidence.MEDIUM,
                        title=f"Copyleft license ({license_id}) detected in PHI context",
                        description=(
                            f"Dependency in `{f.path}` uses {license_desc}. "
                            "Copyleft licenses may require source code disclosure, which "
                            "could conflict with healthcare software security requirements. "
                            "AGPL/GPL dependencies in ePHI-handling systems need legal review."
                        ),
                        remediation=(
                            f"Review the {license_id} dependency for legal compatibility. "
                            "Consider alternatives with permissive licenses (MIT, Apache-2.0, BSD). "
                            "Consult legal counsel for copyleft obligations in PHI-handling software."
                        ),
                        category="phi-license-risk",
                        scanner="dependency-agent",
                        extra={
                            "license_id": license_id,
                            "license_description": license_desc,
                            "hipaa_controls": ["164.312(a)(1)"],
                            "findingType": "phi-license-risk",
                        },
                    )
                )

    return findings
