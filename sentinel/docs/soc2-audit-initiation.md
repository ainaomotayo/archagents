# SENTINEL — Compliance Audit Readiness Guide

**Version:** 2.0
**Date:** 2026-03-18
**Audience:** Security leads, compliance officers, external auditors

This document provides the framework for achieving and maintaining compliance certifications for SENTINEL. It covers SOC 2 Type I/II, ISO/IEC 27001:2022, EU AI Act readiness, and GDPR operational requirements.

---

## Part 1: SOC 2 Type I/II

### Overview

SOC 2 is a framework established by the American Institute of Certified Public Accountants (AICPA) based on the Trust Services Criteria (TSC). The current applicable standard is the **2017 TSC with Revised Points of Focus (2022)**, updated by the AICPA in Fall 2022 to address evolving technologies and threats — while keeping the core criteria unchanged.

| Aspect | Type I | Type II |
|--------|--------|---------|
| Scope | **Design** of controls at a point in time | **Design + operating effectiveness** over a period |
| Duration | Point-in-time | 6–12 month review period |
| Audit timeline | 2–4 months | 6–12 months |
| Typical prerequisite | None | Type I (recommended) |

SENTINEL targets Type I first as a foundation, then progresses to Type II.

### 1.1 Trust Service Criteria — Security (Common Criteria)

Security is the **only mandatory** TSC category for all SOC 2 audits. It encompasses nine criteria groups (CC1–CC9).

#### CC1 — Control Environment

| Criterion | SENTINEL Control | Evidence Location |
|-----------|-----------------|-------------------|
| CC1.1 — Integrity and ethics | Security policy, responsible disclosure policy | `docs/security-whitepaper.md` |
| CC1.2 — Board oversight | Executive security review; security steering committee | Meeting minutes; approval records |
| CC1.3 — Authority and responsibility | RBAC with 5 defined roles; SCIM 2.0 provisioning | `packages/auth/`; SCIM API docs |
| CC1.4 — Competence commitment | Security training; annual agent ruleset review | Training records; ruleset changelogs |
| CC1.5 — Accountability | Hash-chained audit log captures all actor-action pairs | Audit log entries in `audit_events` table |

#### CC2 — Communication and Information

| Criterion | SENTINEL Control | Evidence Location |
|-----------|-----------------|-------------------|
| CC2.1 — Internal information quality | Structured scan results with CVSS scores, CWE tags, agent version | Database schema; scan result samples |
| CC2.2 — Internal communication | Slack/Teams/PagerDuty notification integration | Notification config; alert history |
| CC2.3 — External communication | HMAC-signed compliance certificates; OpenAPI 3.1 documentation | `docs/api/openapi.yaml`; sample certificates |

#### CC3 — Risk Assessment

| Criterion | SENTINEL Control | Evidence Location |
|-----------|-----------------|-------------------|
| CC3.1 — Risk objectives | Weighted 0–100 risk scoring model; certificate status levels | `packages/assessor/`; risk scoring docs |
| CC3.2 — Risk identification | 7-agent automated scanning pipeline (Security, License, Quality, Policy, Dependency, AI, LLM) | Agent configurations |
| CC3.3 — Fraud risk | AI detection agent; PII scrubbing before LLM processing | `agents/ai-detector/`; PII scrubber |
| CC3.4 — Change impact | Drift detection; policy change audit trail; dry-run estimates | Drift dashboard; retention policy change log |

#### CC4 — Monitoring Activities

| Criterion | SENTINEL Control | Evidence Location |
|-----------|-----------------|-------------------|
| CC4.1 — Ongoing monitoring | Continuous scan pipeline; Prometheus metrics; Grafana dashboards | `deploy/monitoring/`; health endpoints |
| CC4.2 — Deficiency remediation | Finding status workflow (open → acknowledged → resolved); SLA tracking | Finding records; resolution timestamps |

#### CC5 — Control Activities

| Criterion | SENTINEL Control | Evidence Location |
|-----------|-----------------|-------------------|
| CC5.1 — Risk mitigation controls | Policy enforcement gates; dual-admin approval for retention changes | `packages/security/`; retention API |
| CC5.2 — Technology general controls | Helm charts; Docker Compose; GitHub Actions CI/CD | `deploy/helm/`; `.github/workflows/` |
| CC5.3 — Policy deployment | YAML policy engine with org/repo inheritance; versioned policy records | `agents/policy/`; policy database table |

#### CC6 — Logical and Physical Access

| Criterion | SENTINEL Control | Evidence Location |
|-----------|-----------------|-------------------|
| CC6.1 — Access control | RBAC; HMAC-signed API keys; OIDC/SAML SSO | `packages/auth/`; API auth middleware |
| CC6.2 — Access provisioning | SCIM 2.0; invitation-based onboarding; role assignment | SCIM endpoint; user management API |
| CC6.3 — Access removal | SCIM de-provisioning; session invalidation on role change | Auth session management |
| CC6.4 — Physical access | Delegated to AWS/GCP/Azure data centres (SOC 2 certified) | Cloud provider SOC 2 reports |
| CC6.5 — Logical access to assets | Org-scoped PostgreSQL queries; multi-tenant isolation | RLS policies; org filter middleware |
| CC6.6 — Logical access threats | TLS 1.3; AES-256-GCM at rest; HMAC signing | `docs/security-whitepaper.md` §5 |
| CC6.7 — Restriction of data access | PostgreSQL row-level security; org-scoped API responses | Database schema; RLS policies |
| CC6.8 — Unauthorised access prevention | Auth middleware on all routes; rate limiting (100 req/min) | API middleware; Nginx config |

#### CC7 — System Operations

| Criterion | SENTINEL Control | Evidence Location |
|-----------|-----------------|-------------------|
| CC7.1 — Infrastructure monitoring | Prometheus + Grafana; `/health` endpoints; structured logs | `deploy/monitoring/`; service health checks |
| CC7.2 — Incident detection | Alertmanager rules; anomaly detection; audit log alerts | `deploy/monitoring/rules/`; alert config |
| CC7.3 — Incident response | Documented P0–P3 incident response (see whitepaper §13) | `docs/security-whitepaper.md` §13 |
| CC7.4 — Incident recovery | Multi-AZ deployment; PodDisruptionBudgets; backup/restore | `deploy/helm/values.yaml`; backup procedures |
| CC7.5 — Incident disclosure | 24-hour customer notification SLA; 72-hour GDPR regulatory SLA | Incident response runbook |

#### CC8 — Change Management

| Criterion | SENTINEL Control | Evidence Location |
|-----------|-----------------|-------------------|
| CC8.1 — Change authorisation | PR-based workflow; required code reviews; CI gates block failing scans | `.github/` branch protection; CI config |

#### CC9 — Risk Mitigation

| Criterion | SENTINEL Control | Evidence Location |
|-----------|-----------------|-------------------|
| CC9.1 — Risk mitigation activities | Certificate revocation; policy versioning; crypto-shredding | Revocation API; `packages/security/` |
| CC9.2 — Vendor risk management | Dependency license scanning; SBOM; OSV CVE scanning | `agents/dependency/`; SBOM artifacts |

### 1.2 Optional TSC: Availability

| Criterion | SENTINEL Control |
|-----------|-----------------|
| A1.1 — SLO commitments | Kubernetes HPA; KEDA Redis-based autoscaling for agents |
| A1.2 — Environmental threats | Multi-AZ (AWS/GCP/Azure); topology spread constraints; PDBs |
| A1.3 — Recovery | Documented backup/restore; database point-in-time recovery; RTO < 4h, RPO < 1h |

### 1.3 Optional TSC: Confidentiality

| Criterion | SENTINEL Control |
|-----------|-----------------|
| C1.1 — Confidential information identification | Data classification: code diffs (not persisted), findings (encrypted), certs (WORM) |
| C1.2 — Disposal | Automated retention cleanup; crypto-shredding for tenant offboarding |

---

### 1.4 SOC 2 Evidence Collection Checklist

#### Governance and Policies
- [ ] Information security policy document (reference: `docs/security-whitepaper.md`)
- [ ] Acceptable use policy
- [ ] Data classification policy
- [ ] Incident response plan and runbook
- [ ] Business continuity / disaster recovery plan
- [ ] Change management policy (PR review requirements, CI gates)
- [ ] Vendor management policy (sub-processor list)
- [ ] Data Processing Agreement (DPA) template

#### Access Control
- [ ] User access inventory (all SENTINEL users, roles, last-login dates)
- [ ] RBAC role definitions and permission matrix
- [ ] Authentication mechanism documentation (NextAuth config, OIDC/SAML setup)
- [ ] Session management configuration (TTL, refresh rotation)
- [ ] Evidence of quarterly access reviews
- [ ] SCIM provisioning configuration and de-provisioning test evidence

#### Infrastructure and Operations
- [ ] Architecture diagram with security boundaries (see `docs/security-whitepaper.md` §2)
- [ ] Network topology diagram (Docker/K8s network policies)
- [ ] Helm chart and Docker Compose configuration
- [ ] CI/CD pipeline configuration (`/.github/workflows/`)
- [ ] Prometheus alerting rules and Grafana dashboard screenshots
- [ ] Backup configuration and restore test evidence
- [ ] TLS certificate inventory and expiry monitoring

#### Application Security
- [ ] Secure development lifecycle documentation
- [ ] Code review process (branch protection rules, required reviewers)
- [ ] Dependency vulnerability scan results (OSV Scanner output)
- [ ] SBOM for current production release
- [ ] SLSA provenance attestation for container images
- [ ] Penetration test results (most recent)
- [ ] Security scan configuration (Semgrep rulesets, agent configs)

#### Logging and Monitoring
- [ ] Audit log configuration, schema, and sample entries
- [ ] Audit log retention policy (7 years default)
- [ ] Alertmanager rules and notification evidence
- [ ] Prometheus scrape configuration and metrics sample
- [ ] Log shipping configuration (CloudWatch / Cloud Logging / Azure Monitor)

#### Compliance Artifacts
- [ ] Sample compliance certificate (anonymised)
- [ ] Certificate verification test (valid and tampered scenarios)
- [ ] Policy enforcement configuration and sample policy YAML
- [ ] Retention policy with dual-admin approval evidence
- [ ] Crypto-shred test execution (with before/after evidence)
- [ ] Finding remediation tracking records (open → resolved workflow)

---

### 1.5 SOC 2 Audit Timeline

#### Phase 1: Readiness Assessment (Weeks 1–2)
1. Gap analysis against Trust Service Criteria using checklist above
2. Identify missing controls, documentation, and evidence
3. Prioritise remediation items by risk and audit materiality
4. Assign ownership for each control area

#### Phase 2: Control Implementation (Weeks 3–6)
1. Draft and approve missing policy documents
2. Implement any missing technical controls (monitoring, alerting, access reviews)
3. Configure log shipping and retention
4. Complete quarterly access reviews
5. Document all procedures and runbooks

#### Phase 3: Evidence Collection (Weeks 7–8)
1. Gather evidence per checklist above
2. Organise in auditor-accessible shared repository (e.g., Vanta, Drata, Secureframe)
3. Create control-to-evidence mapping document
4. Internal review of evidence completeness and quality

#### Phase 4: Pre-Audit Review (Week 9)
1. Internal mock audit walkthrough by a non-control-owner
2. Address gaps discovered during mock audit
3. Prepare management assertion letter
4. Finalise evidence package

#### Phase 5: External Audit (Weeks 10–12)
1. Auditor onboarding and scope confirmation
2. Control walkthroughs (architecture, auth, logging, change management)
3. Evidence review and testing by auditor
4. Draft SOC 2 report review
5. Final SOC 2 Type I report issuance

---

## Part 2: ISO/IEC 27001:2022

### Overview

ISO/IEC 27001:2022 is the current version of the international standard for Information Security Management Systems (ISMS). It replaced ISO/IEC 27001:2013 and reduced the number of Annex A controls from **114 (across 14 domains)** to **93 (across 4 themes)**, adding 11 new controls for modern risks including cloud security, threat intelligence, and secure coding. The transition deadline of **31 October 2025** has passed; all certifications and new audits are conducted against the 2022 version.

### 2.1 Certification Phases

| Phase | Activity | Duration |
|-------|----------|----------|
| **Gap Analysis** | Assess ISMS against ISO 27001:2022 requirements | 2–4 weeks |
| **ISMS Design** | Scope statement, risk assessment, risk treatment plan, Statement of Applicability | 4–8 weeks |
| **Implementation** | Controls implemented, documented, tested | 8–16 weeks |
| **Stage 1 Audit** | Document review by certification body | 1–2 days |
| **Stage 2 Audit** | Implementation verification and control testing | 2–5 days |
| **Surveillance Audits** | Annual audits to maintain certification | 1–2 days/year |
| **Recertification** | Full audit every 3 years | 2–5 days |

### 2.2 Statement of Applicability (SoA)

The SoA must address all 93 controls from ISO 27001:2022 Annex A, justifying inclusion, exclusion, or partial implementation. Key exclusions for SENTINEL (with justification):

| Control | Status | Justification |
|---------|--------|---------------|
| A.7.1–A.7.14 (Physical controls) | **Excluded for cloud** | Physical security delegated to AWS/GCP/Azure (each ISO 27001 certified) |
| A.7.1–A.7.14 (Physical controls) | **Included for on-prem** | Customer responsibility for on-premises deployments |
| A.5.21 (Managing ICT supply chain) | **Partially included** | SBOM and OSV scanning implemented; formal supplier agreements TBD |

### 2.3 Risk Assessment and Treatment

SENTINEL's risk register covers the asset classes identified in the threat model (`docs/security-whitepaper.md` §3). Risk assessment follows ISO 31000:

```
Risk = Likelihood × Impact
Risk score → Accept / Treat / Transfer / Avoid
```

For each identified risk, the risk treatment plan references the specific Annex A control(s) applied.

### 2.4 Key Differences from ISO 27001:2013

Teams transitioning from a 2013-based ISMS should note:

| New in 2022 | SENTINEL Implementation |
|-------------|------------------------|
| A.5.7 Threat intelligence | OSV CVE feed; MITRE CWE Top 25 |
| A.5.23 Cloud services security | Cloud-specific deployment guides; VPC isolation |
| A.8.9 Configuration management | Helm charts; IaC; immutable containers |
| A.8.11 Data masking | PII scrubbing before LLM processing |
| A.8.12 Data leakage prevention | Org isolation; no code persistence |
| A.8.16 Monitoring activities | Prometheus; Grafana; Falco |
| A.8.28 Secure coding | Self-scanning; Semgrep in CI |

---

## Part 3: EU AI Act Readiness

### Overview

The EU AI Act (Regulation (EU) 2024/1689) entered into force on **1 August 2024**. It applies to AI systems developed, deployed, or used in the EU, or affecting EU persons.

### 3.1 SENTINEL's Role

SENTINEL operates as a **governance tool** that helps customers demonstrate compliance with the EU AI Act's documentation, transparency, and human oversight requirements for AI-generated code. SENTINEL itself is not classified as a "high-risk AI system" under Annex III of the Act.

### 3.2 Customer Compliance Evidence Matrix

| EU AI Act Article | Requirement | SENTINEL Output |
|-------------------|-------------|----------------|
| Art. 9 — Risk management | Ongoing risk assessment for AI systems | Risk score (0–100) per scan; historical trend |
| Art. 10 — Data governance | Training data documentation | AI detection attribution records |
| Art. 11 — Technical documentation | Evidence of system testing and oversight | Compliance certificates with agent versions |
| Art. 12 — Record-keeping | Automatic logging of AI system operations | Hash-chained audit log |
| Art. 13 — Transparency | AI generation probability disclosure | AI detection findings per file |
| Art. 14 — Human oversight | Human review of high-risk outputs | Certificate requires human acknowledgement fields |
| Art. 15 — Accuracy and robustness | Evidence of code quality and security testing | All 7 agent findings per scan |
| Art. 53 — GPAI transparency | Training data documentation | Dependency + AI detection agent records |

### 3.3 Enforcement Timeline Reference

| Date | Obligation |
|------|-----------|
| **2 Feb 2025** | ✅ Prohibited AI practices banned; AI literacy obligations |
| **2 Aug 2025** | ✅ GPAI model obligations; EU AI Office operational |
| **2 Aug 2026** | ⚠️ Full enforcement begins; most high-risk AI obligations |
| **2 Aug 2027** | Extended transition for embedded high-risk AI |

For penalties reference, see `docs/security-whitepaper.md` §14.3.

---

## Part 4: GDPR Operational Requirements

### 4.1 Data Subject Rights Operational Checklist

| Right | Trigger | SENTINEL Response | SLA |
|-------|---------|-------------------|-----|
| Art. 15 — Access | Subject requests their data | Export org data via API | 30 days |
| Art. 16 — Rectification | Subject requests correction | Update via API | 30 days |
| Art. 17 — Erasure | Subject requests deletion | Crypto-shred via `POST /v1/admin/crypto-shred` | 30 days |
| Art. 20 — Portability | Subject requests data export | JSON export via audit and findings API | 30 days |
| Art. 21 — Objection | Subject objects to processing | Cease processing; crypto-shred | Without undue delay |

### 4.2 Data Breach Response Checklist

When a data breach is suspected:

- [ ] **T+0**: Incident detection and initial triage
- [ ] **T+1h**: P0 escalation if confirmed breach; containment initiated
- [ ] **T+24h**: Preliminary breach assessment; customer notification if their data affected
- [ ] **T+72h**: Supervisory authority notification (GDPR Art. 33) if breach involves personal data
- [ ] **T+72h+**: Data subject notification (GDPR Art. 34) if high risk to individuals
- [ ] **T+30d**: Full incident report; remediation evidence; post-mortem

### 4.3 Sub-Processor Registry

Customers acting as data controllers should maintain a record of SENTINEL as a processor and SENTINEL's sub-processors:

| Sub-Processor | Service | Location |
|--------------|---------|----------|
| Amazon Web Services | Cloud infrastructure, S3, KMS (AWS deployments) | Region-specific (configurable) |
| Google Cloud Platform | Cloud infrastructure, GCS, Cloud KMS (GCP deployments) | Region-specific (configurable) |
| Microsoft Azure | Cloud infrastructure, Blob Storage, Key Vault (Azure deployments) | Region-specific (configurable) |

For on-premises deployments, no third-party sub-processors are used.

---

## Key Contacts

| Role | Responsibility |
|------|---------------|
| Security Lead | Control owner; whitepaper maintenance; security incident commander |
| Engineering Lead | Technical control implementation; audit evidence preparation |
| Compliance Officer | Policy documentation; external auditor liaison; regulatory notifications |
| Data Protection Officer | GDPR Art. 37 obligations; data subject rights; breach notifications |
| External Auditor | Independent assessment (CPA firm with SOC 2 / ISO 27001 experience) |

---

## Next Steps for New Deployments

1. **Review** the Evidence Collection Checklist (§1.4) and identify gaps
2. **Select** an external auditor (CPA firm for SOC 2; accredited certification body for ISO 27001)
3. **Begin** policy documentation in `/docs/policies/` directory
4. **Configure** log shipping to your SIEM (Splunk, Elastic, Microsoft Sentinel)
5. **Enable** monitoring using `deploy/monitoring/` Prometheus and Grafana configuration
6. **Complete** quarterly access reviews and document them
7. **Schedule** initial penetration test
8. **Set** a target date for Type I / Stage 1 audit and work backwards from it

---

*This document should be reviewed annually or whenever significant architectural changes are made to SENTINEL.*
