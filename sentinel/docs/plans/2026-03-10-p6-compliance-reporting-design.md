# P6: Compliance Reporting & Audit Evidence Engine — Design Document

**Goal:** Transform SENTINEL from a scanning platform into a compliance evidence engine — enabling enterprises to demonstrate compliance to auditors, regulators, and internal stakeholders across all major frameworks.

**Architecture:** Hybrid Compliance Engine (Approach C). In-process scoring and control mapping in the existing API server for low-latency dashboard queries. Single new `report-worker` async service for PDF generation and evidence snapshotting. Compliance data in existing PostgreSQL with new tables. Trend data via materialized view refreshed by the existing scheduler.

**Tech Stack:** `@sentinel/compliance` package, `@react-pdf/renderer` for reports, micromatch for rule matching, SHA-256 hash chains for evidence integrity, PostgreSQL materialized views for trend aggregation, Redis Streams for async report queue.

---

## Why Hybrid (Not Monolithic or Microservice)

### 3 Enterprise Approaches Evaluated

**A. Monolithic Compliance Service** — All logic in the API process. Simple but PDF generation blocks the API thread, cannot scale report generation independently, and large compliance queries compete with scan traffic.

**B. Microservice Compliance Engine** — Three new services (compliance-scorer, report-generator, evidence-collector) + TimescaleDB. Maximum scalability but 3 new services + new DB infrastructure = excessive operational overhead for the value delivered.

**C. Hybrid Compliance Engine (Chosen)** — Two layers: in-process scoring (fast, <100ms) + single async report-worker (non-blocking PDFs). One new service, no new infrastructure, follows existing SENTINEL patterns.

| Decision | Hybrid Choice | Why Not Pure A | Why Not Pure B |
|----------|--------------|----------------|----------------|
| Scoring | In-process (API) | — | Separate service is overkill for O(c*f) computation |
| Report Generation | Separate worker | PDF takes 2-30s, blocks API | Agreed, but one worker not three |
| Evidence Collection | Event-driven in worker | Synchronous capture slows scans | Dedicated service overengineered for append-only writes |
| Trend Data | Materialized views | — | TimescaleDB unnecessary for daily granularity |
| Framework Registry | In-memory + DB | — | Pure DB has cold-start latency |
| Control Mapping | HashMap + SQL merge | — | Pure SQL unnecessary for immutable built-in frameworks |

---

## Algorithms & Data Structures

### Control Mapping: Hybrid HashMap + SQL

Built-in frameworks loaded as `Map<frameworkId, Map<controlId, FindingMatcher>>` at startup. Custom overrides fetched from DB and merged at runtime.

- **Hot path (built-in):** O(1) lookup
- **Cold path (custom):** O(log n) SQL query, cached after first load
- **Pattern source:** Same as RBAC `PERMISSION_MAP` (P2) and OpenCode's ruleset merging (default + user + session)

### Finding-to-Control Matching: Rule-Based Glob Matcher

Each control defines match rules: `{ category: "vulnerability/*", severity: ["critical", "high"], agent: "security" }`. Matcher evaluates rules against findings using micromatch glob patterns.

- **Complexity:** O(f * r) where f=findings, r=rules per control
- **Justification:** Deterministic, debuggable, no ML. Glob patterns are familiar to engineers. Same pattern as Gemini CLI's policy engine.

### Compliance Scoring: Weighted Pass-Rate with Severity Multipliers

**Control Score:**
```
control_score = 1.0 - (matching_findings / total_relevant_findings)
```

**Framework Score:**
```
severity_multiplier = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }

framework_score = SUM(control.weight * max_severity_multiplier * control_score)
                / SUM(control.weight * max_severity_multiplier)
```

**Verdict Thresholds:**
```
>= 0.95  →  "compliant"
>= 0.80  →  "partially_compliant"
>= 0.60  →  "needs_remediation"
<  0.60  →  "non_compliant"
```

- **Complexity:** O(c * f) where c=controls, f=avg findings per control
- **Why not EMA:** Auditors need point-in-time truth, not smoothed trends
- **Why not ML:** Black box — regulators reject unexplainable scores
- **Why not binary pass/fail:** Too coarse — 1/100 failing != 100/100 failing

### Trend Storage: Daily Snapshots + Materialized View

`ComplianceSnapshot` table — one row per org/framework/day. PostgreSQL materialized view pre-aggregates 30/60/90-day averages, min, max.

- **Insert:** O(1)
- **Dashboard read:** O(1) via materialized view
- **Refresh:** Scheduler daily at 05:00 UTC
- **Why not TimescaleDB:** Daily granularity doesn't warrant a time-series extension

### Evidence Chain: SHA-256 Hash Chain

```
hash_0 = SHA-256(JSON.stringify(data_0) + "GENESIS")
hash_n = SHA-256(JSON.stringify(data_n) + hash_{n-1})
```

Per-org chains. Events: scan_completed, certificate_issued, certificate_revoked, policy_changed, compliance_assessed, report_generated, finding_suppressed.

- **Append:** O(1)
- **Latest verification:** O(1)
- **Full chain verification:** O(n) — only during audits
- **Why not Merkle tree:** Chain verification is rare; O(n) acceptable for <100K records/org/year
- **Why not blockchain:** No multi-party trust requirement
- **Pattern source:** EdgeClaw's dual-track integrity model

### Report Generation: React-PDF (Pure Node.js)

`@react-pdf/renderer` — React components define report layout. Charts as SVG data URIs.

- **Why not Puppeteer:** 300MB Docker image, Chrome security surface
- **Why not pdfkit:** No component model, manual layout
- **Image size:** ~5MB vs ~300MB for Puppeteer

---

## Built-in Compliance Frameworks

7 frameworks ship as TypeScript modules with code-defined controls:

| Framework | Controls | Category | Relevance |
|-----------|----------|----------|-----------|
| SOC 2 Type II | ~18 (CC series) | governance | Most requested by enterprise |
| ISO 27001:2022 | ~20 (Annex A subset) | governance | International standard |
| EU AI Act | ~12 | regulatory | AI-generated code governance |
| SLSA v1.0 | ~8 (4 levels) | supply-chain | Build provenance |
| OpenSSF Scorecard | ~10 | supply-chain | Open-source security |
| CIS Software Supply Chain | ~15 | supply-chain | CI/CD benchmarks |
| GDPR Article 25/32 | ~8 | regulatory | Data protection by design |

### Data Structure

```typescript
interface FrameworkDefinition {
  slug: string;
  name: string;
  version: string;
  category: "supply-chain" | "governance" | "regulatory";
  controls: ControlDefinition[];
}

interface ControlDefinition {
  code: string;
  name: string;
  weight: number;        // 1.0-5.0
  matchRules: MatchRule[];
}

interface MatchRule {
  agent?: string;
  category?: string;     // micromatch glob
  severity?: string[];
  negate?: boolean;       // true = passing means NO findings match
}
```

Hybrid management: built-in frameworks are read-only code. Customers create custom frameworks via API/dashboard. `ComplianceControlOverride` table allows per-org weight/matchRule overrides on any control (built-in or custom).

---

## Database Schema

```prisma
model ComplianceFramework {
  id          String   @id @default(cuid())
  orgId       String?  // null = built-in (read-only)
  slug        String
  name        String
  version     String
  controls    ComplianceControl[]
  assessments ComplianceAssessment[]
  snapshots   ComplianceSnapshot[]
  @@unique([orgId, slug])
}

model ComplianceControl {
  id          String   @id @default(cuid())
  frameworkId String
  framework   ComplianceFramework @relation(fields: [frameworkId], references: [id])
  code        String
  name        String
  description String?
  weight      Float    @default(1.0)
  matchRules  Json
  overrides   ComplianceControlOverride[]
}

model ComplianceControlOverride {
  id         String   @id @default(cuid())
  orgId      String
  controlId  String
  control    ComplianceControl @relation(fields: [controlId], references: [id])
  matchRules Json?
  weight     Float?
  enabled    Boolean  @default(true)
  @@unique([orgId, controlId])
}

model ComplianceAssessment {
  id            String   @id @default(cuid())
  orgId         String
  frameworkId   String
  framework     ComplianceFramework @relation(fields: [frameworkId], references: [id])
  scanId        String?
  score         Float
  verdict       String
  controlScores Json
  assessedAt    DateTime @default(now())
}

model ComplianceSnapshot {
  id               String   @id @default(cuid())
  orgId            String
  frameworkId      String
  framework        ComplianceFramework @relation(fields: [frameworkId], references: [id])
  date             DateTime @db.Date
  score            Float
  controlBreakdown Json
  @@unique([orgId, frameworkId, date])
}

model EvidenceRecord {
  id        String   @id @default(cuid())
  orgId     String
  scanId    String?
  type      String
  data      Json
  hash      String
  prevHash  String?
  createdAt DateTime @default(now())
  @@index([orgId, createdAt])
}

model Report {
  id          String    @id @default(cuid())
  orgId       String
  type        String
  frameworkId String?
  status      String    @default("pending")
  parameters  Json
  fileUrl     String?
  fileHash    String?
  requestedBy String?
  createdAt   DateTime  @default(now())
  completedAt DateTime?
}
```

Materialized view `compliance_trends` created via raw SQL in migration for 30/60/90-day aggregates.

---

## API Endpoints

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | /v1/compliance/frameworks | all | List frameworks |
| GET | /v1/compliance/frameworks/:id | all | Get framework + controls |
| POST | /v1/compliance/frameworks | admin | Create custom framework |
| PUT | /v1/compliance/frameworks/:id | admin | Update custom framework |
| DELETE | /v1/compliance/frameworks/:id | admin | Delete custom framework |
| POST | /v1/compliance/controls/:id/override | admin, manager | Override control for org |
| DELETE | /v1/compliance/controls/:id/override | admin, manager | Remove override |
| GET | /v1/compliance/assess/:frameworkId | admin, manager, developer | Live assessment |
| GET | /v1/compliance/scores | all | Latest scores |
| GET | /v1/compliance/trends/:frameworkId | all | 30/60/90-day trends |
| GET | /v1/evidence | admin, manager | List evidence (paginated) |
| GET | /v1/evidence/:id | admin, manager | Get evidence record |
| GET | /v1/evidence/verify | admin | Verify chain integrity |
| POST | /v1/reports | admin, manager | Request report (async) |
| GET | /v1/reports | admin, manager | List reports |
| GET | /v1/reports/:id | admin, manager | Report status / download |

18 new entries in RBAC `PERMISSION_MAP`.

---

## Report Types

| Type | Audience | Pages | Content |
|------|----------|-------|---------|
| compliance_summary | CISO, VP Eng | 3-8 | Scores, control breakdown, trends, top failures |
| audit_evidence | External auditors | 20-100+ | Full evidence chain, finding details, policy snapshots |
| executive | Board, C-suite | 2-4 | Risk posture, all frameworks, remediation priorities |

Generated via `@react-pdf/renderer` (pure Node.js, ~5MB, no headless browser). Async via Redis Stream `sentinel.reports` → report-worker consumer. Stored in S3 with SHA-256 file hash.

---

## System Architecture

```
                    +---------------------------+
                    |   Existing API Server     |
                    |                           |
                    |  GET /v1/compliance/*      |
                    |  POST /v1/reports          |
                    |  GET /v1/evidence/*        |
                    |                           |
                    |  In-process:              |
                    |  - Framework registry     |
                    |  - Control mapping        |
                    |  - Compliance scoring     |
                    |  - Evidence querying      |
                    +-----------+---------------+
                                | publishes
                                v
                    +---------------------------+
                    |   sentinel.reports        |
                    |   sentinel.evidence       |
                    |   (Redis Streams)         |
                    +-----------+---------------+
                                | consumes
                                v
                    +---------------------------+
                    |   report-worker           |
                    |                           |
                    |  - PDF generation         |
                    |  - Evidence snapshots     |
                    |  - S3 upload              |
                    |  - Hash chain append      |
                    |                           |
                    |  Health: port 9094        |
                    +---------------------------+

    Scheduler (existing)
      |
      +-- 05:00 daily: generateComplianceSnapshots()
      +-- 05:00 daily: refreshComplianceTrends()
      +-- 05:00 daily: evidence chain integrity check (async)
```

---

## Software Structure

```
packages/compliance/
  src/
    frameworks/
      soc2.ts, iso27001.ts, eu-ai-act.ts, slsa.ts,
      openssf.ts, cis.ts, gdpr.ts, custom.ts, index.ts
    scoring/
      engine.ts, snapshot.ts
    evidence/
      chain.ts, collector.ts
    reports/
      templates/
        components/ (ScoreDonut, TrendChart, ControlTable, etc.)
      ComplianceSummaryReport.tsx
      AuditEvidenceReport.tsx
      ExecutiveReport.tsx
      generator.ts
    matchers/
      rule-matcher.ts
    index.ts
  __tests__/
    scoring.test.ts, rule-matcher.test.ts, registry.test.ts,
    evidence.test.ts, snapshot.test.ts, report.test.ts,
    frameworks.test.ts
```

---

## Testing Strategy

~73 new tests across 9 test files:

- Scoring engine (12): weighted scoring, severity multipliers, edge cases, verdicts
- Rule matcher (8): globs, severity filters, negation, multi-rule
- Framework registry (6): load built-in, merge custom, override, reject built-in mutation
- Evidence chain (8): hash computation, append, verify, tamper detection, genesis, per-org
- Snapshot generation (5): create, upsert, materialized view refresh
- Report generation (6): template render, PDF buffer, file hash, S3 upload mock
- API integration (15): all 16 endpoints, RBAC, pagination, report lifecycle
- RBAC permissions (+6): compliance-specific role checks
- Framework validation (7): structural validity of all 7 built-in frameworks

---

## Docker & Infrastructure

- **1 new service:** report-worker (same Dockerfile as assessor-worker, different CMD)
- **0 new infrastructure:** Reuses PostgreSQL, Redis, S3
- **1 new Prisma migration:** 7 tables + 1 materialized view
- **Scheduler additions:** 2 new daily jobs (snapshot generation, view refresh)
