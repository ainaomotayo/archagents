# NIST AI RMF + HIPAA Compliance Frameworks — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement the implementation plan that follows this design.

**Goal:** Add NIST AI RMF 1.0 and HIPAA Security Rule as full regulatory compliance frameworks to Sentinel, transforming it from a governance platform into a regulated-industry compliance platform targeting the $20T healthcare + US government economy.

**Architecture:** Attestation-gated scoring (hybrid A1+A2) on hierarchical control trees (hybrid D1+D2), delivered as domain services (W2) within the existing monolith with plugin-loadable framework definitions (hybrid S1+S2). Extends existing agents with targeted detection rules for deeper automated coverage.

**Tech Stack:** TypeScript (packages/compliance, packages/db, apps/api), Python (agent extensions), React-PDF (report templates), Semgrep YAML (security rules), Prisma (schema/migrations)

---

## 1. Problem Statement

Sentinel has 7 compliance frameworks (SOC2, ISO27001, EU AI Act, SLSA, OpenSSF, CIS-SSC, GDPR) but is missing the two frameworks that cover regulated industries:

- **NIST AI RMF 1.0** — Required for US government AI systems, increasingly adopted by private sector
- **HIPAA Security Rule** — Required for all healthcare organizations handling PHI (Protected Health Information)

These frameworks are fundamentally different from existing ones: ~45% of their controls are procedural/organizational and cannot be verified by automated scanning. Without an attestation mechanism, these controls silently pass (score 1.0), creating **dangerous false compliance**.

## 2. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scoring algorithm | Hybrid: attestation-gated on existing deterministic engine | Prevents false compliance on procedural controls; unattested controls score 0.0 |
| Data structure | Hybrid: hierarchical tree + flat array interface | Tree for navigation/reporting, flat for backward-compatible scoring engine |
| System design | Hybrid: plugin definitions within monolith | Hot-reload frameworks without microservice complexity |
| Software design | Strategy pattern with domain services | Clean boundaries per regulatory domain; extensible for FedRAMP, HITRUST later |
| Hybrid control scoring | `min(automated, attestation)` | Both must pass — strictest interpretation, safest for regulated industries |
| Gap analysis | Computed projection, not stored entity | Always reflects current state, avoids stale data |
| BAA tracking | Separate model, HIPAA-only | Other frameworks don't need vendor agreement tracking |
| Agent extensions | New rules in existing agents | No new agent infra — YAML rules + Python functions |

### Why Hybrid Scoring (not pure automated)

NIST AI RMF has 72 subcategories: ~20 automated, ~30 attestation-only, ~22 hybrid. HIPAA has ~75 specs: ~15 automated, ~35 attestation-only, ~25 hybrid. Pure automated scoring would silently report ~45% of controls as "compliant" because no agent findings exist. This is a regulatory liability. Attestation-gated scoring forces organizations to actively confirm compliance on procedural controls.

### Why Hierarchical + Flat (not pure graph)

NIST uses Function→Category→Subcategory (3 levels). HIPAA uses Safeguard→Standard→Specification (3 levels). A flat list is unnavigable at 72-75 controls. But the scoring engine expects flat `ControlDefinition[]` arrays. The hierarchy is expressed via `parentCode` field and `controlPath` for prefix queries, while scoring operates on the flattened array. No graph dependencies — regulators don't formally define control dependencies, and inventing them would be challenged by auditors.

### Why Not Microservice

Compliance scoring is CPU-light (sub-100ms for 200 controls × 5000 findings). Current scale doesn't justify separate service infrastructure. Extract when Sentinel hits 10K+ orgs with continuous monitoring.

### Why Not Bayesian Scoring

Regulators and auditors expect deterministic pass/fail. HIPAA auditors need "you meet §164.312(a)(1) or you don't." Confidence intervals are useful internally but cannot be the primary scoring mechanism for regulated industries.

## 3. Framework Definitions

### 3.1 Extended ControlDefinition

```typescript
interface ControlDefinition {
  code: string;                    // "GV-1.1", "AS-7.1"
  name: string;
  weight: number;                  // 1.0-3.0
  matchRules: MatchRule[];
  // NEW FIELDS
  parentCode?: string;             // "GV-1" for "GV-1.1" — enables tree
  requirementType: "automated" | "attestation" | "hybrid";
  attestationCadence?: number;     // Days until attestation expires (default 90)
  regulatoryStatus?: "required" | "addressable";  // HIPAA-specific
  description?: string;            // Regulatory text reference
}
```

### 3.2 NIST AI RMF 1.0 (72 subcategories)

4 Functions → 19 Categories → 72 Subcategories

| Function | Code | Categories | Subcategories | Automated | Attestation | Hybrid |
|----------|------|-----------|---------------|-----------|-------------|--------|
| GOVERN | GV | 6 | ~24 | 2 | 16 | 6 |
| MAP | MP | 5 | ~16 | 3 | 8 | 5 |
| MEASURE | MS | 4 | ~19 | 10 | 4 | 5 |
| MANAGE | MG | 4 | ~13 | 5 | 2 | 6 |
| **Total** | | **19** | **~72** | **~20** | **~30** | **~22** |

Representative control mappings:

- `GV-1.1` Legal/regulatory requirements — attestation, weight 2.0
- `GV-1.2` Trustworthy AI characteristics — hybrid (quality/documentation + attestation), weight 2.5
- `MP-2.1` AI system categorized by risk — automated (risk scorer), weight 2.0
- `MS-2.5` AI security evaluated — automated (security agent), weight 3.0
- `MS-2.3` AI fairness/bias evaluated — hybrid (ai-detector + attestation), weight 3.0
- `MG-2.2` Incidents documented — automated (evidence chain + audit trail), weight 2.5
- `MG-3.1` Pre-deployment risk evaluation — automated (scan results + approval gates), weight 3.0

### 3.3 HIPAA Security Rule (~75 implementation specifications)

3 Safeguards → 22 Standards → ~75 Specifications

| Safeguard | Code Prefix | Standards | Specs | Automated | Attestation | Hybrid |
|-----------|-------------|-----------|-------|-----------|-------------|--------|
| Administrative | AS | 9 | ~30 | 3 | 18 | 9 |
| Physical | PS | 4 | ~10 | 0 | 10 | 0 |
| Technical | TS | 5 | ~15 | 12 | 0 | 3 |
| **Total** | | **22** | **~75** | **~15** | **~35** | **~25** |

Weight rules:
- Required (R) specs: base weight × 1.5 multiplier
- Addressable (A) specs: base weight as-is

Representative control mappings:

- `AS-1.1` Risk Analysis (R) — hybrid (risk scorer + attestation), weight 3.0
- `AS-1.4` Info System Activity Review (R) — automated (audit trail), weight 3.0
- `AS-7.1` BAA Contracts (R) — attestation (BAA registry), weight 3.0
- `PS-1.1` Facility Access Controls (A) — attestation, weight 1.5
- `TS-1.1` Unique User Identification (R) — automated (security agent), weight 3.0
- `TS-1.4` Encryption and Decryption (A) — automated (security agent), weight 3.0
- `TS-2.1` Audit Controls (R) — automated (audit trail + evidence chain), weight 3.0
- `TS-4.1` Transmission Security (R) — automated (security agent TLS checks), weight 3.0

## 4. Attestation Engine

### 4.1 Data Model

```
ControlAttestation
├── id, orgId, frameworkSlug, controlCode
├── attestedBy: string (user ID)
├── attestationType: "compliant" | "not_applicable" | "compensating_control" | "planned_remediation"
├── justification: string (min 20 chars)
├── evidenceUrls: string[] (external evidence links)
├── validFrom, expiresAt (validFrom + control.attestationCadence)
├── revokedAt, revokedBy, revokedReason
├── createdAt, updatedAt
    @@unique([orgId, frameworkSlug, controlCode])
    @@index([orgId, expiresAt])

AttestationHistory
├── id, attestationId, action, actorId, previousState, createdAt
    @@index([attestationId])
```

### 4.2 Attestation Types and Score Impact

| Type | Score | Cadence | Use Case |
|------|-------|---------|----------|
| compliant | 1.0 | Per control (default 90 days) | Organization meets this control |
| not_applicable | Excluded from denominator | 365 days | Control doesn't apply |
| compensating_control | 0.8 | 90 days | Alternative control in place |
| planned_remediation | 0.3 | 30 days (forces re-review) | Gap acknowledged, plan exists |

### 4.3 Scoring Integration

```
scoreControlWithAttestation(control, findings, attestation):
  if "automated":     return scoreControl(control, findings)
  if "attestation":   return attestation valid ? typeScore : 0.0
  if "hybrid":        return min(scoreControl(control, findings), attestation valid ? typeScore : 0.0)
```

### 4.4 Lifecycle

```
unattested (score=0) → active (score=type-based) → expired (score=0)
                        ↑                            │
                        └────── renew ───────────────┘
                        active → revoked (score=0)
```

## 5. Gap Analysis

Computed projection (not stored):

```typescript
interface GapAnalysis {
  frameworkSlug: string;
  overallScore: number;
  summary: { compliant, partiallyCompliant, nonCompliant, notApplicable, unattested };
  gaps: GapItem[];  // Sorted by weight × severity
  remediationPlan: { totalItems, overdue, inProgress, completed, estimatedCompletionDate };
}

interface GapItem {
  controlCode, controlName, parentCode, requirementType, regulatoryStatus;
  currentScore: number;
  gapType: "automated_failure" | "missing_attestation" | "expired_attestation" | "hybrid_partial";
  severity: "critical" | "high" | "medium" | "low";
  findings: string[];
  remediation: RemediationItem | null;
  suggestedActions: string[];
}
```

Gap severity derivation:
- critical: Required (R) + weight >= 2.5 + score = 0
- high: Required or weight >= 2.0 + score < 0.5
- medium: Addressable + weight >= 1.5 + score < 0.8
- low: Everything else below compliant threshold

## 6. Remediation Tracking

```
RemediationItem
├── id, orgId, frameworkSlug, controlCode
├── title, description
├── status: "open" | "in_progress" | "completed" | "accepted_risk"
├── priority: "critical" | "high" | "medium" | "low"
├── assignedTo, dueDate, completedAt, completedBy
├── evidenceNotes, linkedFindingIds
├── createdBy, createdAt, updatedAt
    @@index([orgId, frameworkSlug, status])
    @@index([orgId, dueDate])
```

Status effects:
- open/in_progress → no score credit
- completed → triggers control re-assessment
- accepted_risk → 0.3 score, requires admin approval

## 7. BAA Registry (HIPAA-specific)

```
BusinessAssociateAgreement
├── id, orgId
├── vendorName, vendorContact
├── agreementDate, expiresAt, documentUrl
├── status: "active" | "expired" | "terminated"
├── coveredServices: string[]
├── reviewedBy, reviewedAt
├── createdAt, updatedAt
    @@index([orgId, status])
```

## 8. Agent Extensions

### Security Agent (+6 Semgrep rules)

| Rule | Finding Category | Controls |
|------|-----------------|----------|
| hipaa-phi-exposure.yaml | vulnerability/phi-exposure | HIPAA TS-3.1 |
| hipaa-encryption.yaml | vulnerability/encryption-missing | HIPAA TS-1.4, TS-4.2 |
| hipaa-auth-controls.yaml | vulnerability/auth-weakness | HIPAA TS-1.1, TS-1.3 |
| hipaa-audit-logging.yaml | vulnerability/audit-gap | HIPAA TS-2.1, AS-1.4 |
| nist-transparency.yaml | vulnerability/ai-transparency | NIST MS-2.8 |
| nist-input-validation.yaml | vulnerability/ai-input-validation | NIST MS-2.5 |

### Quality Agent (+4 checks)

| Check | Finding Category | Controls |
|-------|-----------------|----------|
| AI documentation completeness | quality/ai-documentation* | NIST GV-1.2, MP-4.1, MS-2.8 |
| Data governance markers | quality/data-governance* | NIST GV-5.1, MP-2.1 |
| AI test coverage | quality/ai-test-coverage* | NIST MS-1.1, MS-2.1 |
| Access control documentation | quality/access-documentation* | HIPAA AS-3.4 |

### Dependency Agent (+3 checks)

| Check | Finding Category | Controls |
|-------|-----------------|----------|
| HIPAA-relevant CVEs | dependency/hipaa-cve* | HIPAA TS-3.1 |
| AI supply chain risk | dependency/ai-supply-chain* | NIST GV-6.1 |
| PHI license risk | dependency/phi-license-risk* | HIPAA AS-7.1 |

### AI-Detector Agent (+3 checks)

| Check | Finding Category | Controls |
|-------|-----------------|----------|
| Model provenance | ai-detection/provenance* | NIST MP-2.3 |
| Bias indicators | ai-detection/bias-indicator* | NIST MS-2.3 |
| Human oversight gaps | ai-detection/oversight-gap* | NIST GV-3.1 |

Coverage impact: NIST automated 28% → 49%, HIPAA automated 20% → 37%.

## 9. Report Templates

### NIST AI RMF CSF Profile Report

Cover → Profile Overview (Current/Target/Gap) → Function-Level Detail (per function: score, categories, subcategories, attestations) → Gap Analysis (prioritized list, remediation plan) → Evidence Index

### HIPAA Security Rule Assessment Report

Cover → Executive Summary (safeguard-level scores, critical gaps) → Safeguard Detail (per standard: R/A status, automated + attestation + gap) → BAA Registry → Risk Analysis Summary (30/60/90 day trend) → Evidence Package

## 10. API Endpoints (15 new)

```
POST   /v1/compliance/attestations                    admin, manager
GET    /v1/compliance/attestations?framework=          admin, manager, developer
GET    /v1/compliance/attestations/:id                 admin, manager, developer
DELETE /v1/compliance/attestations/:id                 admin
GET    /v1/compliance/attestations/expiring            admin, manager

GET    /v1/compliance/gaps/:frameworkSlug              admin, manager
GET    /v1/compliance/gaps/:frameworkSlug/export        admin, manager

POST   /v1/compliance/remediations                     admin, manager
GET    /v1/compliance/remediations?framework=           admin, manager, developer
PATCH  /v1/compliance/remediations/:id                  admin, manager
GET    /v1/compliance/remediations/overdue              admin, manager

POST   /v1/compliance/baa                              admin
GET    /v1/compliance/baa                              admin, manager
PATCH  /v1/compliance/baa/:id                           admin
DELETE /v1/compliance/baa/:id                           admin
```

Existing extended:
```
POST   /v1/reports    type="nist_profile" | "hipaa_assessment"
GET    /v1/compliance/dashboard    (new unified endpoint)
```

## 11. Scheduler Extensions

```
05:00 UTC — ComplianceSnapshotJob (extended: 9 frameworks)
06:00 UTC — AttestationExpiryJob (new: 14-day warnings + mark expired)
06:30 UTC — RemediationOverdueJob (new: escalation notifications)
```

## 12. RBAC Permissions (new)

```
POST   /v1/compliance/attestations     → admin, manager
DELETE /v1/compliance/attestations/:id  → admin
POST   /v1/compliance/remediations     → admin, manager
PATCH  /v1/compliance/remediations/:id  → admin, manager
POST   /v1/compliance/baa              → admin
PATCH  /v1/compliance/baa/:id           → admin
DELETE /v1/compliance/baa/:id           → admin
GET    /v1/compliance/gaps/*            → admin, manager
GET    /v1/compliance/dashboard         → admin, manager, developer
```

## 13. Test Plan (~111 tests)

| Component | Count | Scope |
|-----------|-------|-------|
| NIST framework definition | ~15 | Controls valid, hierarchy, parentCode, weights |
| HIPAA framework definition | ~15 | Controls valid, R/A status, hierarchy |
| Attestation service | ~12 | CRUD, expiry, type scoring, cadence |
| Scoring with attestation | ~10 | Automated, attestation, hybrid, expired, N/A |
| Gap analysis | ~8 | Computation, priority, summary, remediation links |
| Remediation service | ~8 | CRUD, status transitions, overdue, finding links |
| BAA registry | ~6 | CRUD, expiry, status transitions |
| API endpoints | ~15 | All 15 endpoints, auth, RBAC, withTenant, errors |
| Scheduler jobs | ~6 | Attestation expiry, remediation overdue, snapshot |
| Security agent rules | ~12 | Positive + negative samples per Semgrep rule |
| Report templates | ~4 | NIST profile + HIPAA assessment PDF generation |

## 14. Out of Scope

- Dashboard pages (attestation UI, gap analysis UI, remediation UI, BAA UI) — separate PR
- PHI runtime detection (DLP) — static analysis only
- HITRUST CSF, FedRAMP — can be added later as framework definitions
- Automated remediation (auto-fix findings)
