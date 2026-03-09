# SENTINEL MVP Design Document

**Date:** 2026-03-09
**Status:** Approved
**Scope:** Full MVP (Month 1-6) — AI-Generated Code Governance & Compliance Platform
**Architecture:** Event-Driven Agent Architecture (Approach B)

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [SENTINEL CLI](#2-sentinel-cli)
3. [Analysis Agents](#3-analysis-agents)
4. [Compliance Assessor & Certificate Generation](#4-compliance-assessor--certificate-generation)
5. [Dashboard & Audit Log](#5-dashboard--audit-log)
6. [Data Architecture & Infrastructure](#6-data-architecture--infrastructure)
7. [Integrations & API Design](#7-integrations--api-design)
8. [Security & Compliance Architecture](#8-security--compliance-architecture)
9. [6-Month Implementation Timeline](#9-6-month-implementation-timeline)

---

## Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Deployment model | Hybrid (local CLI + cloud dashboard) | Addresses enterprise data sensitivity while providing compliance value |
| AI tool support | Tool-agnostic via git diffs | Maximizes reach, avoids coupling to any single tool |
| Tech stack | TypeScript CLI/API + Python agents | TS consistent with OpenClaw; Python for security tooling ecosystem |
| Scanning approach | Layered (OSS → custom rules → LLM) | Fast deterministic first pass, expensive LLM only for escalation |
| Target market | Regulated industries first | EU AI Act urgency, higher ACV, clear buyers (CISO, Compliance) |
| Event bus | Redis Streams | Lightweight, ordered, consumer groups. Not Kafka (overkill for MVP) |

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DEVELOPER ENVIRONMENT                         │
│                                                                      │
│  ┌──────────┐    ┌───────────────────────────────────────────────┐  │
│  │ AI Tool  │───▶│  SENTINEL CLI (TypeScript)                    │  │
│  │ (any)    │    │                                                │  │
│  └──────────┘    │  ┌─────────┐  ┌──────────┐  ┌─────────────┐ │  │
│                  │  │Git Hook │  │Diff      │  │Local Agent  │ │  │
│  ┌──────────┐    │  │Capture  │─▶│Extractor │─▶│Runner       │ │  │
│  │ Git Repo │───▶│  └─────────┘  └──────────┘  └──────┬──────┘ │  │
│  └──────────┘    │                                      │        │  │
│                  └──────────────────────────────────────┼────────┘  │
│                                                         │           │
└─────────────────────────────────────────────────────────┼───────────┘
                                                          │ HTTPS/gRPC
┌─────────────────────────────────────────────────────────┼───────────┐
│                     SENTINEL CLOUD                       │           │
│                                                          ▼           │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                      Event Bus (Redis Streams)               │   │
│  └───┬──────────┬──────────┬──────────┬──────────┬─────────────┘   │
│      │          │          │          │          │                   │
│      ▼          ▼          ▼          ▼          ▼                   │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐     │
│  │Security│ │IP/     │ │Quality │ │LLM     │ │AI-Generation │     │
│  │Agent   │ │License │ │Agent   │ │Review  │ │Detector      │     │
│  │(Python)│ │Agent   │ │(Python)│ │Agent   │ │Agent         │     │
│  └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └──────┬───────┘     │
│      │          │          │          │              │               │
│      ▼          ▼          ▼          ▼              ▼               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Compliance Assessor (TypeScript)                 │   │
│  │         Merges findings → Risk Score → Certificate           │   │
│  └──────────────────────────────────┬───────────────────────────┘   │
│                                     │                                │
│      ┌──────────────────────────────┼──────────────────────┐        │
│      ▼                              ▼                      ▼        │
│  ┌────────────┐  ┌──────────────────────┐  ┌──────────────────┐    │
│  │Audit Log   │  │Compliance Dashboard  │  │Certificate       │    │
│  │(Postgres)  │  │(Next.js)             │  │Generator (PDF)   │    │
│  └────────────┘  └──────────────────────┘  └──────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**

- **CLI runs locally** — git hooks and diff extraction never leave the developer's machine unless they opt in
- **Agents run in cloud by default** — configurable to run locally (on-prem) for air-gapped environments
- **Redis Streams as event bus** — lightweight, ordered, supports consumer groups for parallel agents
- **Each agent is a standalone Python process** — communicates only via events, independently deployable
- **Compliance Assessor is TypeScript** — same stack as CLI and dashboard, merges all agent findings

---

## 2. SENTINEL CLI

### Commands

```
sentinel init              # Install git hooks + configure project
sentinel scan [--local]    # Manually trigger scan on staged/committed changes
sentinel status            # Show latest scan results for current branch
sentinel report <commit>   # Generate compliance report for a specific commit
sentinel config            # Manage settings (API key, scan modes, thresholds)
sentinel login             # Authenticate with SENTINEL Cloud
sentinel ci                # CI/CD mode — exit code reflects compliance pass/fail
```

### Git Hook Integration

The CLI installs a `post-commit` hook (not pre-commit — never blocks developer flow):

1. Extracts diff from latest commit
2. Runs AI-Generation Detector locally (fast, <2s)
3. If AI-generated code detected above threshold (default 30%), packages diff metadata and pushes to SENTINEL Cloud
4. Returns immediately — results arrive async via dashboard/notification

### Diff Metadata Payload

```typescript
interface SentinelDiffPayload {
  projectId: string;
  commitHash: string;
  branch: string;
  author: string;
  timestamp: string;
  files: Array<{
    path: string;
    language: string;
    hunks: DiffHunk[];
    aiScore: number;              // 0-1, likelihood this file contains AI code
  }>;
  toolHints?: {
    tool?: string;                // "copilot" | "cursor" | "claude-code" | etc.
    markers?: string[];
  };
  scanConfig: {
    securityLevel: "standard" | "strict" | "audit";
    licensePolicy: string;        // SPDX expression of allowed licenses
    qualityThreshold: number;
  };
}
```

### CI/CD Mode

- Exit 0: all checks pass
- Exit 1: security or license findings above threshold
- Exit 2: scan error / cloud unreachable
- Exit 3: configuration error (bad API key, invalid policy)

### Local-only Mode (`sentinel scan --local`)

For air-gapped environments. Runs Security Agent and IP/License Agent locally via bundled Docker containers. No data leaves the machine. LLM Review Agent skipped.

---

## 3. Analysis Agents

### Agent 1: AI-Generation Detector

**Purpose:** Determine which parts of a diff are AI-generated vs human-written.
**Runs:** Locally in CLI (fast pass) + cloud (deep analysis)

**Techniques:**
- Stylometric analysis (uniform naming, consistent comment style, verbose error handling)
- Entropy analysis (different token entropy distributions)
- Tool marker detection (Copilot ghost text, Cursor patterns, Claude attribution)
- Git timing heuristics (large perfect blocks committed rapidly)

```python
@dataclass
class AIDetectionFinding:
    file: str
    line_range: tuple[int, int]
    ai_probability: float
    detection_method: str
    tool_attribution: str | None
    confidence: str               # "high" | "medium" | "low"
```

### Agent 2: Security Agent

**Purpose:** Three-tier security scanning.

**Tier 1 — OSS Tools:** Semgrep, Bandit, ESLint security plugins, OSV-Scanner
**Tier 2 — Custom AI Rules:** Hallucinated imports, insecure defaults, deprecated APIs, missing validation
**Tier 3 — LLM Escalation:** Only for medium+ severity or audit mode

```python
@dataclass
class SecurityFinding:
    severity: str               # "critical" | "high" | "medium" | "low" | "info"
    category: str               # "injection" | "auth" | "crypto" | "hallucinated-dep"
    file: str
    line_range: tuple[int, int]
    title: str
    description: str
    remediation: str
    scanner: str                # "semgrep" | "custom-rules" | "llm-review"
    cwe_id: str | None
    confidence: str
```

### Agent 3: IP/License Agent

**Purpose:** Track IP attribution and license compliance.

**Techniques:**
- SPDX license detection
- Code fingerprinting against known OSS corpora
- Dependency license audit
- Attribution tracking (which AI tool generated which code)

```python
@dataclass
class LicenseFinding:
    file: str
    line_range: tuple[int, int]
    finding_type: str           # "copyleft-risk" | "unknown-license" | "policy-violation"
    license_detected: str | None
    similarity_score: float
    source_match: str | None
    policy_action: str          # "block" | "review" | "allow"
```

### Agent 4: Quality Agent

**Purpose:** Assess maintainability and technical debt risk.

**Metrics:** Cyclomatic complexity, duplication detection, test coverage gaps, naming consistency, dead code detection.

```python
@dataclass
class QualityFinding:
    file: str
    line_range: tuple[int, int]
    metric: str
    score: float                # 0.0 - 1.0
    detail: str
    suggestion: str | None
```

### Agent 5: LLM Review Agent

**Purpose:** Deep contextual analysis (escalation tier only).

**Triggered when:**
- Always for `securityLevel: "audit"`
- When Security Agent finds medium+ severity
- When IP Agent finds high similarity matches
- On-demand via dashboard

**Cost control:** Only escalated findings, token budget per scan (50K default), 30-day result caching.

### Agent 6: Policy & Standards Agent

**Purpose:** Enforce organization-specific rules.

Reads `.sentinel/policies.yaml` from repo or org-level config:

```yaml
policies:
  - name: "Use internal auth library"
    rule: "deny-import"
    pattern: "passport|express-jwt|jsonwebtoken"
    require: "@company/auth-header-lib"
    severity: "high"
    message: "All APIs must use @company/auth-header-lib"

  - name: "No direct DB access from controllers"
    rule: "deny-pattern"
    glob: "src/controllers/**"
    pattern: "prisma\\.|knex\\.|sequelize\\."
    severity: "medium"
```

Also ingests `CONTRIBUTING.md`, `ARCHITECTURE.md` — uses LLM to extract implicit rules on first setup, presents for human approval, then enforces deterministically.

```python
@dataclass
class PolicyFinding:
    file: str
    line_range: tuple[int, int]
    policy_name: str
    policy_source: str          # "repo" | "org" | "inferred"
    violation: str
    required_alternative: str | None
    severity: str
```

### Agent 7: Dependency Agent

**Purpose:** First-class dependency analysis — security, architectural drift, and supply chain risk.

**Three concerns:**
1. **Security** — known CVEs via OSV-Scanner/Trivy
2. **Architectural drift** — AI suggests lodash when project uses ramda
3. **Supply chain** — typosquatting, freshness, maintainer reputation

```python
@dataclass
class DependencyFinding:
    package: str
    finding_type: str           # "cve" | "architectural-drift" | "typosquat" | "unmaintained"
    severity: str
    detail: str
    existing_alternative: str | None
    cve_id: str | None
```

### Agent Communication

All agents follow the same contract:

```python
class BaseAgent:
    def process(self, event: DiffEvent) -> list[Finding]: ...
    def health(self) -> AgentHealth: ...
```

Redis Streams:
- `sentinel.diffs` — all agents consume
- `sentinel.findings` — all agents produce
- `sentinel.escalations` — LLM Review Agent consumes

### Agent Summary

| # | Agent | Language | Runs | Speed |
|---|-------|----------|------|-------|
| 1 | AI-Generation Detector | Python | Local + Cloud | <2s |
| 2 | Security Agent | Python | Cloud (local optional) | 5-15s |
| 3 | IP/License Agent | Python | Cloud (local optional) | 5-10s |
| 4 | Quality Agent | Python | Cloud | 3-8s |
| 5 | LLM Review Agent | Python | Cloud only | 30-120s |
| 6 | Policy & Standards Agent | Python | Cloud (local optional) | 2-5s |
| 7 | Dependency Agent | Python | Cloud (local optional) | 3-8s |

Deterministic agents (1-4, 6-7) complete in ~15s parallel. LLM agent runs async. CI/CD never waits more than 30s.

---

## 4. Compliance Assessor & Certificate Generation

### Tiered Certification (Solves the "Wait" Problem)

```
Agents 1-4, 6-7 complete (deterministic, fast)
       │
       ▼
  All pass? (no critical/high) ──yes──▶ PROVISIONAL PASS (CI exits 0)
       │ no
       ▼
  FAIL (CI exits 1)

  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
  Agent 5 (LLM Review) completes async
       │
       ▼
  LLM finds critical? ──yes──▶ REVOKE certificate
       │ no                    → Alert via webhook
       ▼                       → Block merge (GitHub API)
  FULL PASS (Certificate upgraded)
```

**Certificate states:**
- `provisional_pass` — deterministic agents passed, LLM review pending
- `full_pass` — all agents including LLM confirm clean
- `revoked` — LLM review found critical issue after provisional pass
- `fail` — deterministic agents found critical/high issues
- `partial` — some agents errored/timed out

### Risk Scoring

```typescript
interface ComplianceAssessment {
  commitHash: string;
  projectId: string;
  timestamp: string;
  status: "full_pass" | "provisional_pass" | "fail" | "revoked" | "partial";
  riskScore: number;           // 0-100
  categories: {
    security: CategoryScore;
    license: CategoryScore;
    quality: CategoryScore;
    policy: CategoryScore;
    dependency: CategoryScore;
  };
  findings: Finding[];
  agentResults: AgentResult[];
  certificate?: ComplianceCertificate;
  drift: {
    aiComposition: {
      thisCommit: number;
      projectBaseline: number;
      deviationFactor: number;
      riskFlag: boolean;          // true if >3x baseline
      trend: "increasing" | "stable" | "decreasing";
    };
    dependencyDrift: {
      newDeps: string[];
      categoryConflicts: Array<{
        category: string;
        existing: string;
        introduced: string;
      }>;
    };
  };
}
```

| Finding Severity | Default Points | Auto-fail? |
|-----------------|---------------|------------|
| Critical | 40 | Yes — any critical = fail |
| High | 15 | Fail if ≥3 high findings |
| Medium | 5 | Warn only |
| Low | 1 | Info only |

Default pass threshold: risk score <25.

### Compliance Certificate

```typescript
interface ComplianceCertificate {
  id: string;
  version: "1.0";
  subject: {
    projectId: string;
    repository: string;
    commitHash: string;
    branch: string;
    author: string;
    timestamp: string;
  };
  verdict: {
    status: "pass" | "provisional" | "fail";
    riskScore: number;
    categories: Record<string, "pass" | "warn" | "fail">;
  };
  scanMetadata: {
    agents: Array<{
      name: string;
      version: string;
      rulesetVersion: string;
      rulesetHash: string;
      status: "completed" | "error" | "timeout";
      findingCount: number;
      durationMs: number;
    }>;
    environmentHash: string;
    totalDurationMs: number;
    scanLevel: "standard" | "strict" | "audit";
  };
  compliance: {
    euAiAct?: {
      riskCategory: string;
      documentationComplete: boolean;
      humanOversightVerified: boolean;
    };
    soc2?: { controlsMapped: string[]; };
    iso27001?: { controlsMapped: string[]; };
  };
  signature: string;            // HMAC-SHA256
  issuedAt: string;
  expiresAt: string;
}
```

### Agent Timeout & Resilience

```typescript
const AGENT_TIMEOUT_MS = 30_000;        // Deterministic agents
const LLM_TIMEOUT_MS = 300_000;         // LLM review agent

interface AssessorConfig {
  onAgentTimeout: "partial" | "fail";   // Default: "partial"
  requiredAgents: string[];             // Default: ["security", "ip-license"]
  optionalAgents: string[];             // Default: ["quality", "llm-review"]
}
```

### LLM Re-evaluation (Idempotent Merge)

When the LLM Agent completes, it publishes a `RE_EVALUATE` event. The Assessor:
1. Loads existing assessment from Postgres
2. Merges new findings (deduplicates by fingerprint)
3. Recalculates risk score
4. If status changes: updates Postgres in a transaction, THEN updates GitHub Check Run, THEN fires webhooks

### GitHub Check Suite Integration for Revocation

When `provisional_pass → revoked`: SENTINEL (as GitHub App) updates the Check Run from `conclusion: "success"` to `conclusion: "failure"` with inline annotations. Branch protection rules block the merge automatically.

---

## 5. Dashboard & Audit Log

### Information Architecture

```
Dashboard
├── Overview (org-wide health at a glance)
├── Projects
│   ├── Project Detail (scan history, findings, certificates, drift)
│   └── Compare (side-by-side project compliance)
├── Certificates (active, revoked, expired, public verification)
├── Policies (org policies, repo overrides, YAML editor)
├── Audit Log (immutable event stream)
├── Reports (compliance report generator, EU AI Act package, export)
└── Settings (integrations, team & roles, scan config, API keys)
```

### Audit Log

Append-only, hash-chained for tamper evidence:

```typescript
interface AuditEvent {
  id: string;                   // UUID v7 (time-sortable)
  timestamp: string;
  actor: {
    type: "system" | "user" | "agent" | "api";
    id: string;
    name: string;
    ip?: string;
  };
  action: string;               // "scan.started" | "certificate.revoked" | etc.
  resource: {
    type: "scan" | "certificate" | "finding" | "policy" | "project";
    id: string;
  };
  detail: Record<string, unknown>;
  previousEventHash: string;    // SHA256 of previous event — hash chain
  eventHash: string;
}
```

Retention: 7 years (configurable). Archived to S3 after 1 year.

### Role-Based Access Control

| Permission | Dev | Lead | Compliance | CISO | Admin |
|------------|-----|------|-----------|------|-------|
| View findings | ✓ | ✓ | ✓ | ✓ | ✓ |
| Suppress findings | ✗ | ✓ | ✓ | ✓ | ✓ |
| View certificates | ✓ | ✓ | ✓ | ✓ | ✓ |
| Export reports | ✗ | ✓ | ✓ | ✓ | ✓ |
| Edit policies | ✗ | ✗ | ✓ | ✓ | ✓ |
| View audit log | ✗ | ✗ | ✓ | ✓ | ✓ |
| Manage integrations | ✗ | ✗ | ✗ | ✓ | ✓ |
| Manage team | ✗ | ✗ | ✗ | ✗ | ✓ |
| Verify chain | ✗ | ✗ | ✓ | ✓ | ✓ |

### Tech Stack

- Next.js 15 (App Router, server components)
- Postgres (primary store)
- Redis (caching, real-time via pub/sub)
- Tailwind + shadcn/ui
- NextAuth.js (SAML/OIDC for enterprise, GitHub OAuth for self-serve)
- Puppeteer (HTML→PDF reports)
- WebSockets (real-time scan progress)

---

## 6. Data Architecture & Infrastructure

### Database Schema (Postgres)

Core tables: `organizations`, `projects`, `scans`, `findings`, `certificates`, `policies`, `audit_events`, `agent_results`, `users`

### Indexing Strategy

```sql
CREATE INDEX idx_scans_project_time ON scans (project_id, started_at DESC);
CREATE INDEX idx_findings_severity ON findings (scan_id, severity) WHERE suppressed = false;
CREATE INDEX idx_audit_chain ON audit_events (timestamp, event_hash);
CREATE INDEX idx_certs_project ON certificates (scan_id);
CREATE INDEX idx_scans_commit ON scans (commit_hash);
CREATE INDEX idx_audit_time ON audit_events USING BRIN (timestamp);
```

### Partitioning

`findings` and `audit_events` partitioned by month via pg_partman. Partitions >12 months → cold tablespace. >7 years → archive to S3, drop.

### Infrastructure (Cloud)

- API Gateway / ALB
- Dashboard: Vercel / Cloud Run
- API Service: ECS / Cloud Run (TypeScript)
- Agent Worker Pool: ECS / Cloud Run (Python containers)
- Redis: Elasticache / Memorystore (Streams + Cache)
- Postgres: RDS / Cloud SQL
- S3 / GCS: audit archive, PDF reports

### On-Prem Mode

Full stack as Docker Compose — single command: `docker compose -f docker-compose.sentinel.yml up -d`

### Data Flow (Corrected for Race Conditions)

```
 1. Developer commits code
 2. Git hook → CLI extracts diff, runs local AI detection
 3. CLI → HMAC-signed HTTPS POST → API Service (raw diff only)
 4. API Service → verifies signature, writes scan record to Postgres
 5. API Service → publishes DiffEvent to Redis Stream
 6. All agents consume in parallel
 7. Deterministic agents → publish findings to Redis
 8. Compliance Assessor → merges findings, writes to Postgres
 9. API Service → updates GitHub Check Run
10. API Service → returns result to CLI (reads from Postgres)
    ← CLI and GitHub are now guaranteed consistent
11. LLM Agent completes → publishes RE_EVALUATE event
12. Assessor → idempotent merge, recalculates in Postgres transaction
13. If status changed → updates GitHub, fires webhooks
    ← All in order: DB first, then external systems
```

---

## 7. Integrations & API Design

### REST API

**Base URL:** `https://api.sentinel.dev/v1`
**Auth:** Bearer token (API key / OAuth2)

Key endpoints:
- `POST /scans` — submit diff for scanning
- `GET /scans/:id/poll` — long-poll for completion
- `GET /certificates/:id/verify` — public verification (no auth)
- `POST /reports/generate` — generate compliance report
- `GET /audit/verify` — verify hash chain integrity

### GitHub App Integration

Permissions: `checks: write`, `pull_requests: read`, `contents: read`, `statuses: write`
Events: `push`, `pull_request`, `check_suite`

Zero-friction path: install GitHub App → scans start on PRs automatically, no CLI required.

### GitLab CI Integration

SENTINEL outputs findings in GitLab Code Quality format for inline MR annotations.

### Slack Integration

Rich Block Kit messages for scan results, certificate revocations, and finding alerts. Thread support for follow-ups.

### Webhook Delivery

HMAC-signed payloads. Retry with exponential backoff: 1s, 5s, 30s, 5m, 30m.

### CI/CD Exit Codes

| Exit | Meaning | CI Behavior |
|------|---------|-------------|
| 0 | Pass (full or provisional) | Pipeline continues |
| 1 | Fail (critical/high findings) | Pipeline blocked |
| 2 | Scan error | Configurable: block or warn |
| 3 | Configuration error | Pipeline blocked |

---

## 8. Security & Compliance Architecture

### Threat Model

4 attack surfaces: CLI→API channel, code in transit/rest, dashboard/API, supply chain (SENTINEL itself).

### Authentication

- **CLI:** Short-lived session tokens (1-hour JWTs) via OIDC login. Static API keys as fallback for CI.
- **Request signing:** `HMAC-SHA256(session_jwt + sha256(diff_content) + timestamp)` — any byte change in diff invalidates signature.
- **Dashboard:** SSO (SAML/OIDC), MFA enforced for Compliance/CISO/Admin roles.

### Data Encryption

- **In transit:** TLS 1.3 everywhere. CLI pins SENTINEL API certificate.
- **At rest:** AES-256-GCM, per-organization KMS keys, 90-day rotation.
- **Diff retention:** Purged after configurable period (default 30 days). Findings retain 5-10 line snippets only.

### Multi-Tenancy Isolation

- Row-level security (RLS) in Postgres
- `SET LOCAL` within transactions (safe with PgBouncer)
- Per-org encryption keys
- Physical isolation available for enterprise tier

### Pre-LLM PII/Secret Scrubber

Mandatory gateway before any code reaches the LLM API. Regex-based detection of:
- API keys, secrets, passwords, tokens
- AWS keys, private keys, JWTs
- Emails, IPs, phone numbers, SSNs
- Connection strings
- Org-configurable custom patterns

Redactions logged in audit trail (count + hash, never values).

### LLM Data Policy

- Only flagged code snippets sent (never full files, max 2000 lines)
- PII/secrets scrubbed before transmission
- Anthropic API with zero-retention configuration
- Customer can disable LLM agent entirely, restrict to specific repos, or self-host
- Every LLM call audit-logged

### Data Purge (GDPR "Right to be Forgotten")

Crypto-shredding: destroy KMS encryption key → ciphertext becomes permanently unreadable. Faster and more reliable than byte-level overwriting. Purge itself is audit-logged.

### Audit Log Immutability

S3 Object Lock in **Compliance Mode** (not Governance) — even root admin cannot delete logs until retention expires (7 years). Legal defense for government contractors.

### EU AI Act Compliance Mapping

| Article | SENTINEL Coverage |
|---------|-------------------|
| Art. 9 (Risk Management) | Risk scoring model per scan |
| Art. 10 (Data Governance) | Ruleset versioning + hash chain |
| Art. 11 (Technical Documentation) | Auto-generated certificates + PDF reports |
| Art. 12 (Record-Keeping) | Append-only audit log, 7-year retention |
| Art. 13 (Transparency) | Every finding traceable to agent + ruleset version |
| Art. 14 (Human Oversight) | AI composition drift alerts, suppression requires human action |
| Art. 17 (Quality Management) | Self-scanning (dogfooding), agent health monitoring |

### SOC 2 Control Mapping

| Control | Coverage |
|---------|----------|
| CC6.1 (Logical Access) | RBAC, SSO, MFA |
| CC6.6 (System Boundaries) | Security Agent findings |
| CC7.1 (Monitoring) | Continuous scanning on every commit |
| CC7.2 (Incident Detection) | Certificate revocation + alerting |
| CC8.1 (Change Management) | Full audit trail + AI attribution |
| PI1.1 (Processing Integrity) | Hash chain, signed certificates |

### SENTINEL SBOM

Auto-generated on every release (Syft + Trivy), GPG-signed, published publicly. Nightly CVE re-scan with 24-hour customer notification.

---

## 9. 6-Month Implementation Timeline

### Month 1: Foundation

**Week 1-2:** Monorepo scaffolding (Turborepo), Postgres schema + migrations, Redis Streams event bus, CI/CD pipeline, Docker Compose for local dev, shared types.

**Week 3-4:** CLI v0.1 (init, login, git hook, diff extraction, HMAC signing), API v0.1 (POST /scans, long-poll, tenant middleware, audit log middleware).

**Milestone:** Developer can install CLI, authenticate, commit code, see scan record in Postgres.

### Month 2: Deterministic Agents

**Week 5-6:** Python agent framework (BaseAgent, events, health), Security Agent (Semgrep + custom AI rules), CWE mapping.

**Week 7-8:** IP/License Agent (SPDX, fingerprinting, dep license audit), Dependency Agent (OSV-Scanner, drift detection, typosquat detection).

**Milestone:** CLI → 3 agents in parallel → findings in Postgres → CLI receives results. First real scans.

### Month 3: Intelligence Agents & Assessor

**Week 9-10:** AI-Generation Detector (stylometric, markers, timing), Quality Agent (complexity, duplication, coverage), Policy Agent (YAML parser, rules, org inheritance).

**Week 11-12:** Compliance Assessor (finding merger, risk scoring, tiered certification, timeouts), certificate generation, drift calculation, `sentinel ci` command, GitHub Actions template.

**Milestone:** All 6 deterministic agents. Certificates issued. CI/CD working. **Internal alpha** — dogfooding on SENTINEL's own repo.

### Month 4: LLM Review & Dashboard

**Week 13-14:** PII/Secret Scrubber, LLM Review Agent (structured prompts, escalation, caching), RE_EVALUATE flow, certificate revocation, Anthropic API integration.

**Week 15-16:** Dashboard v0.1 (Next.js 15, auth, overview, project detail, findings, certificates, WebSocket real-time).

**Milestone:** Full pipeline with LLM review. Dashboard showing results. **Private beta** — 5-10 design partners from regulated industries.

### Month 5: Enterprise Features

**Week 17-18:** GitHub App integration, short-lived session tokens, per-org KMS keys, RLS hardening, crypto-shred purge, S3 Object Lock, RBAC, SBOM generation.

**Week 19-20:** Dashboard v1.0 (policy editor, drift analytics, PDF reports, EU AI Act docs, SOC 2 mapping, audit log viewer, webhooks, Slack integration).

**Milestone:** Enterprise-grade. Full dashboard. PDF reports. **Public beta** — waitlist of regulated industry teams.

### Month 6: Scale & Launch

**Week 21-22:** Docker Compose on-prem, local-only mode, load testing, auto-scaling, partition management, GitLab CI integration.

**Week 23-24:** Landing page, API docs, onboarding flow, pricing, security whitepaper, SOC 2 Type I initiation, public launch.

**Milestone:** Production launch. On-prem available. First paying customers.

### Team Composition

- **Month 1-3:** 1 full-stack TS engineer, 1 Python/security engineer, 1 founder/architect (3 people)
- **Month 4-6:** Add 1 frontend engineer, 1 DevOps/SRE (5 people)

### Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AI detection accuracy too low | Medium | High | Start conservative, improve with design partner data |
| Code fingerprinting legal concerns | Medium | Medium | Hash-only fingerprints, legal review before launch |
| LLM costs exceed budget | Medium | Medium | Token caps, escalation-only, aggressive caching |
| Enterprise sales cycle too slow | High | High | Target EU AI Act pain, 90-day free pilot |
| OSS tool licensing changes | Low | Medium | Abstract behind agent interface, any tool replaceable |
| On-prem deployment complexity | Medium | Medium | Docker Compose simplicity, single-command deploy |
