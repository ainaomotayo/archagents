"""Tests for dependency agent NIST/HIPAA compliance checks."""

from sentinel_agents.types import (
    Confidence,
    DiffFile,
    DiffHunk,
    Finding,
    Severity,
)

from sentinel_dependency.compliance_checks import (
    check_ai_supply_chain,
    check_hipaa_cves,
    check_phi_license_risk,
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


def _make_finding(
    cwe_id: str | None = None,
    description: str = "",
    severity: Severity = Severity.HIGH,
    title: str = "CVE-2024-1234: some-package@1.0.0",
    category: str = "cve",
    extra: dict | None = None,
) -> Finding:
    return Finding(
        type="dependency",
        file="requirements.txt",
        line_start=1,
        line_end=1,
        severity=severity,
        confidence=Confidence.HIGH,
        title=title,
        description=description,
        remediation="Upgrade to latest version",
        category=category,
        scanner="osv-scanner",
        cwe_id=cwe_id,
        extra=extra or {},
    )


# =====================================================================
# 1. HIPAA-relevant CVE Filtering
# =====================================================================

class TestHipaaCves:
    def test_flags_cwe_311_missing_encryption(self):
        findings = [_make_finding(cwe_id="CWE-311")]
        result = check_hipaa_cves(findings)
        assert len(result) == 1
        assert result[0].category == "dependency/hipaa-cve"
        assert result[0].severity in (Severity.CRITICAL, Severity.HIGH)

    def test_flags_cwe_306_missing_auth(self):
        findings = [_make_finding(cwe_id="CWE-306")]
        result = check_hipaa_cves(findings)
        assert len(result) == 1
        assert "HIPAA-critical" in result[0].title

    def test_flags_cwe_532_info_in_logs(self):
        findings = [_make_finding(cwe_id="CWE-532")]
        result = check_hipaa_cves(findings)
        assert len(result) == 1

    def test_no_flag_for_non_hipaa_cwe(self):
        findings = [_make_finding(cwe_id="CWE-79", description="XSS vulnerability")]
        result = check_hipaa_cves(findings)
        assert len(result) == 0

    def test_flags_encryption_keyword_in_description(self):
        findings = [_make_finding(
            cwe_id=None,
            description="Cleartext password stored without encryption",
        )]
        result = check_hipaa_cves(findings)
        assert len(result) == 1

    def test_skips_non_cve_findings(self):
        findings = [_make_finding(cwe_id="CWE-311", category="typosquat")]
        result = check_hipaa_cves(findings)
        assert len(result) == 0

    def test_hipaa_controls_in_extra(self):
        findings = [_make_finding(cwe_id="CWE-287")]
        result = check_hipaa_cves(findings)
        assert len(result) == 1
        assert "164.312(a)(2)(iv)" in result[0].extra["hipaa_controls"]

    def test_critical_severity_escalation(self):
        findings = [_make_finding(cwe_id="CWE-311", severity=Severity.CRITICAL)]
        result = check_hipaa_cves(findings)
        assert result[0].severity == Severity.CRITICAL


# =====================================================================
# 2. AI Supply Chain Risk
# =====================================================================

class TestAISupplyChain:
    def test_flags_unpinned_torch(self):
        files = _make_files(
            ("requirements.txt", "text", "torch>=2.0\nflask==2.3.0"),
        )
        findings = check_ai_supply_chain(files)
        assert len(findings) == 1
        assert findings[0].category == "dependency/ai-supply-chain"
        assert "torch" in findings[0].title

    def test_no_flag_for_pinned_version(self):
        files = _make_files(
            ("requirements.txt", "text", "torch==2.1.0\ntransformers==4.35.0"),
        )
        findings = check_ai_supply_chain(files)
        assert len(findings) == 0

    def test_flags_unpinned_npm_ai_package(self):
        files = _make_files(
            ("package.json", "json", '"openai": "^4.0.0"'),
        )
        findings = check_ai_supply_chain(files)
        assert len(findings) == 1

    def test_no_flag_for_non_manifest(self):
        files = _make_files(
            ("src/app.py", "python", "import torch"),
        )
        findings = check_ai_supply_chain(files)
        assert len(findings) == 0

    def test_flags_no_version_at_all(self):
        files = _make_files(
            ("requirements.txt", "text", "transformers"),
        )
        findings = check_ai_supply_chain(files)
        assert len(findings) == 1
        assert findings[0].severity == Severity.HIGH

    def test_nist_controls_in_extra(self):
        files = _make_files(
            ("requirements.txt", "text", "openai>=1.0"),
        )
        findings = check_ai_supply_chain(files)
        assert len(findings) == 1
        assert "GOVERN-1.5" in findings[0].extra["nist_controls"]

    def test_no_flag_for_non_ai_package(self):
        files = _make_files(
            ("requirements.txt", "text", "flask>=2.0\nrequests"),
        )
        findings = check_ai_supply_chain(files)
        assert len(findings) == 0


# =====================================================================
# 3. PHI License Risk
# =====================================================================

class TestPHILicenseRisk:
    def test_flags_gpl_in_manifest(self):
        files = _make_files(
            ("package.json", "json", '"license": "GPL-3.0"'),
        )
        findings = check_phi_license_risk(files)
        assert len(findings) == 1
        assert findings[0].category == "dependency/phi-license-risk"
        assert findings[0].severity == Severity.HIGH

    def test_flags_agpl_as_critical(self):
        files = _make_files(
            ("package.json", "json", '"license": "AGPL-3.0"'),
        )
        findings = check_phi_license_risk(files)
        # AGPL-3.0 contains "GPL-3.0" substring, so may match both
        assert len(findings) >= 1
        agpl_findings = [f for f in findings if f.extra.get("license_id") == "AGPL-3.0"]
        assert len(agpl_findings) == 1
        assert agpl_findings[0].severity == Severity.CRITICAL

    def test_no_flag_for_mit(self):
        files = _make_files(
            ("package.json", "json", '"license": "MIT"'),
        )
        findings = check_phi_license_risk(files)
        assert len(findings) == 0

    def test_no_flag_for_non_manifest(self):
        files = _make_files(
            ("src/app.py", "python", "# GPL-3.0 license code"),
        )
        findings = check_phi_license_risk(files)
        assert len(findings) == 0

    def test_detects_in_pyproject_toml(self):
        files = _make_files(
            ("pyproject.toml", "toml", 'license = "GPL-2.0"'),
        )
        findings = check_phi_license_risk(files)
        assert len(findings) == 1

    def test_mpl_is_medium_severity(self):
        files = _make_files(
            ("package.json", "json", '"license": "MPL-2.0"'),
        )
        findings = check_phi_license_risk(files)
        assert len(findings) == 1
        assert findings[0].severity == Severity.MEDIUM

    def test_hipaa_controls_in_extra(self):
        files = _make_files(
            ("package.json", "json", '"license": "GPL-3.0"'),
        )
        findings = check_phi_license_risk(files)
        assert "164.312(a)(1)" in findings[0].extra["hipaa_controls"]
