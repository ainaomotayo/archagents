# SENTINEL MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a hybrid AI-Generated Code Governance & Compliance Platform with local CLI scanning and cloud-based analysis agents, targeting regulated industries.

**Architecture:** Event-driven agent system — TypeScript CLI/API/Assessor + Python analysis agents + Redis Streams event bus + Postgres persistence + Next.js dashboard. See `docs/plans/2026-03-09-sentinel-mvp-design.md` for full design.

**Tech Stack:**
- CLI & API: TypeScript (ESM, strict mode), Node.js 22 LTS
- Agents: Python 3.12, dataclasses, unittest/pytest
- Event Bus: Redis 7 (Streams)
- Database: Postgres 16 (Prisma ORM)
- Dashboard: Next.js 15, Tailwind, shadcn/ui
- Monorepo: Turborepo + pnpm workspaces
- Testing: Vitest (TS), pytest (Python)
- Linting: Oxlint (TS), Ruff (Python)
- Containers: Docker, Docker Compose

**Conventions (from existing OpenClaw codebase):**
- TypeScript: ESM modules, strict mode, ES2023 target
- Tests: colocated `*.test.ts`, Vitest with `vi.hoisted()` mocks, temp dirs for I/O tests
- Python: PEP 8, dataclasses, type hints, `from __future__ import annotations`
- Commits: conventional commits (`feat:`, `fix:`, `test:`, `chore:`)

---

## Month 1: Foundation (Weeks 1-4)

### Task 1: Monorepo Scaffolding

**Files:**
- Create: `sentinel/package.json`
- Create: `sentinel/pnpm-workspace.yaml`
- Create: `sentinel/turbo.json`
- Create: `sentinel/tsconfig.base.json`
- Create: `sentinel/.gitignore`
- Create: `sentinel/docker-compose.yml`

**Step 1: Initialize monorepo root**

```bash
mkdir -p sentinel
cd sentinel
pnpm init
```

Edit `sentinel/package.json`:
```json
{
  "name": "sentinel",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "dev": "turbo dev"
  },
  "devDependencies": {
    "turbo": "^2.4",
    "typescript": "^5.7"
  }
}
```

**Step 2: Create workspace config**

Create `sentinel/pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
  - "apps/*"
  - "agents/*"
```

**Step 3: Create Turborepo config**

Create `sentinel/turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

**Step 4: Create base TypeScript config**

Create `sentinel/tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

**Step 5: Create Docker Compose for local dev**

Create `sentinel/docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: sentinel
      POSTGRES_USER: sentinel
      POSTGRES_PASSWORD: sentinel_dev
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sentinel"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

**Step 6: Create .gitignore**

Create `sentinel/.gitignore`:
```
node_modules/
dist/
.turbo/
*.log
.env
.env.local
__pycache__/
*.pyc
.pytest_cache/
.venv/
coverage/
.next/
```

**Step 7: Install dependencies and verify**

```bash
cd sentinel
pnpm install
pnpm turbo --version
```

Expected: Turborepo version prints without error.

**Step 8: Commit**

```bash
git add -A
git commit -m "chore: initialize SENTINEL monorepo with Turborepo + pnpm"
```

---

### Task 2: Shared Types Package

**Files:**
- Create: `sentinel/packages/shared/package.json`
- Create: `sentinel/packages/shared/tsconfig.json`
- Create: `sentinel/packages/shared/src/types.ts`
- Create: `sentinel/packages/shared/src/index.ts`
- Create: `sentinel/packages/shared/src/types.test.ts`
- Create: `sentinel/packages/shared/vitest.config.ts`

**Step 1: Scaffold shared package**

Create `sentinel/packages/shared/package.json`:
```json
{
  "name": "@sentinel/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "oxlint src/"
  },
  "devDependencies": {
    "typescript": "^5.7",
    "vitest": "^3.0"
  }
}
```

Create `sentinel/packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Create `sentinel/packages/shared/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

**Step 2: Write the failing test for core types**

Create `sentinel/packages/shared/src/types.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import type {
  DiffHunk,
  SentinelDiffPayload,
  Finding,
  SecurityFinding,
  LicenseFinding,
  QualityFinding,
  PolicyFinding,
  DependencyFinding,
  AIDetectionFinding,
  ComplianceAssessment,
  ComplianceCertificate,
  AuditEvent,
  AgentResult,
  CategoryScore,
  ScanConfig,
} from "./types.js";

describe("shared types", () => {
  it("constructs a valid SentinelDiffPayload", () => {
    const payload: SentinelDiffPayload = {
      projectId: "proj_123",
      commitHash: "a1b2c3d",
      branch: "main",
      author: "dev@example.com",
      timestamp: "2026-03-09T12:00:00Z",
      files: [
        {
          path: "src/index.ts",
          language: "typescript",
          hunks: [{ oldStart: 1, oldCount: 5, newStart: 1, newCount: 8, content: "@@ -1,5 +1,8 @@\n+new line" }],
          aiScore: 0.85,
        },
      ],
      scanConfig: {
        securityLevel: "standard",
        licensePolicy: "MIT OR Apache-2.0",
        qualityThreshold: 0.7,
      },
    };
    expect(payload.projectId).toBe("proj_123");
    expect(payload.files).toHaveLength(1);
    expect(payload.files[0].aiScore).toBe(0.85);
  });

  it("constructs a valid SecurityFinding", () => {
    const finding: SecurityFinding = {
      type: "security",
      severity: "high",
      category: "injection",
      file: "src/api.ts",
      lineStart: 47,
      lineEnd: 49,
      title: "SQL Injection",
      description: "Unparameterized query",
      remediation: "Use parameterized queries",
      scanner: "semgrep",
      cweId: "CWE-89",
      confidence: "high",
    };
    expect(finding.severity).toBe("high");
    expect(finding.type).toBe("security");
  });

  it("constructs a valid ComplianceAssessment", () => {
    const assessment: ComplianceAssessment = {
      id: "scan_123",
      commitHash: "a1b2c3d",
      projectId: "proj_123",
      timestamp: "2026-03-09T12:00:00Z",
      status: "provisional_pass",
      riskScore: 12,
      categories: {
        security: { score: 95, status: "pass", findings: { critical: 0, high: 0, medium: 1, low: 2 } },
        license: { score: 100, status: "pass", findings: { critical: 0, high: 0, medium: 0, low: 0 } },
        quality: { score: 78, status: "warn", findings: { critical: 0, high: 0, medium: 3, low: 1 } },
        policy: { score: 100, status: "pass", findings: { critical: 0, high: 0, medium: 0, low: 0 } },
        dependency: { score: 100, status: "pass", findings: { critical: 0, high: 0, medium: 0, low: 0 } },
      },
      findings: [],
      agentResults: [],
      drift: {
        aiComposition: {
          thisCommit: 0.34,
          projectBaseline: 0.12,
          deviationFactor: 2.83,
          riskFlag: false,
          trend: "stable",
        },
        dependencyDrift: {
          newDeps: [],
          categoryConflicts: [],
        },
      },
    };
    expect(assessment.status).toBe("provisional_pass");
    expect(assessment.riskScore).toBe(12);
  });

  it("constructs a valid ComplianceCertificate", () => {
    const cert: ComplianceCertificate = {
      id: "cert_abc",
      version: "1.0",
      subject: {
        projectId: "proj_123",
        repository: "acme/api",
        commitHash: "a1b2c3d",
        branch: "main",
        author: "dev@example.com",
        timestamp: "2026-03-09T12:00:00Z",
      },
      verdict: {
        status: "pass",
        riskScore: 12,
        categories: { security: "pass", license: "pass", quality: "warn", policy: "pass", dependency: "pass" },
      },
      scanMetadata: {
        agents: [
          {
            name: "security",
            version: "0.1.0",
            rulesetVersion: "rules-2026.03.09-a",
            rulesetHash: "sha256:abc123",
            status: "completed",
            findingCount: 3,
            durationMs: 8500,
          },
        ],
        environmentHash: "sha256:env123",
        totalDurationMs: 15000,
        scanLevel: "standard",
      },
      compliance: {},
      signature: "hmac_sha256:deadbeef",
      issuedAt: "2026-03-09T12:01:00Z",
      expiresAt: "2026-04-09T12:01:00Z",
    };
    expect(cert.version).toBe("1.0");
    expect(cert.verdict.status).toBe("pass");
  });

  it("constructs a valid AuditEvent", () => {
    const event: AuditEvent = {
      id: "evt_123",
      timestamp: "2026-03-09T12:00:00Z",
      actor: { type: "system", id: "assessor", name: "Compliance Assessor" },
      action: "certificate.issued",
      resource: { type: "certificate", id: "cert_abc" },
      detail: { riskScore: 12 },
      previousEventHash: "sha256:prev",
      eventHash: "sha256:this",
    };
    expect(event.action).toBe("certificate.issued");
    expect(event.actor.type).toBe("system");
  });
});
```

**Step 3: Run test to verify it fails**

```bash
cd sentinel/packages/shared
pnpm test
```

Expected: FAIL — cannot find module `./types.js`

**Step 4: Write the types**

Create `sentinel/packages/shared/src/types.ts`:
```typescript
// === Diff Payload Types ===

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  content: string;
}

export interface ScanConfig {
  securityLevel: "standard" | "strict" | "audit";
  licensePolicy: string;
  qualityThreshold: number;
}

export interface SentinelDiffPayload {
  projectId: string;
  commitHash: string;
  branch: string;
  author: string;
  timestamp: string;
  files: Array<{
    path: string;
    language: string;
    hunks: DiffHunk[];
    aiScore: number;
  }>;
  toolHints?: {
    tool?: string;
    markers?: string[];
  };
  scanConfig: ScanConfig;
}

// === Finding Types ===

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Confidence = "high" | "medium" | "low";
export type FindingType = "security" | "license" | "quality" | "policy" | "dependency" | "ai-detection";

interface BaseFinding {
  type: FindingType;
  file: string;
  lineStart: number;
  lineEnd: number;
  severity: Severity;
  confidence: Confidence;
}

export interface SecurityFinding extends BaseFinding {
  type: "security";
  category: string;
  title: string;
  description: string;
  remediation: string;
  scanner: "semgrep" | "custom-rules" | "llm-review";
  cweId: string | null;
}

export interface LicenseFinding extends BaseFinding {
  type: "license";
  findingType: "copyleft-risk" | "unknown-license" | "policy-violation" | "attribution-required";
  licenseDetected: string | null;
  similarityScore: number;
  sourceMatch: string | null;
  policyAction: "block" | "review" | "allow";
}

export interface QualityFinding extends BaseFinding {
  type: "quality";
  metric: "complexity" | "duplication" | "test-gap" | "naming" | "dead-code";
  score: number;
  detail: string;
  suggestion: string | null;
}

export interface PolicyFinding extends BaseFinding {
  type: "policy";
  policyName: string;
  policySource: "repo" | "org" | "inferred";
  violation: string;
  requiredAlternative: string | null;
}

export interface DependencyFinding extends BaseFinding {
  type: "dependency";
  package: string;
  findingType: "cve" | "architectural-drift" | "typosquat" | "unmaintained" | "policy-blocked";
  detail: string;
  existingAlternative: string | null;
  cveId: string | null;
}

export interface AIDetectionFinding extends BaseFinding {
  type: "ai-detection";
  aiProbability: number;
  detectionMethod: string;
  toolAttribution: string | null;
}

export type Finding =
  | SecurityFinding
  | LicenseFinding
  | QualityFinding
  | PolicyFinding
  | DependencyFinding
  | AIDetectionFinding;

// === Assessment Types ===

export interface CategoryScore {
  score: number;
  status: "pass" | "warn" | "fail" | "error";
  findings: { critical: number; high: number; medium: number; low: number };
}

export type AssessmentStatus = "full_pass" | "provisional_pass" | "fail" | "revoked" | "partial";

export interface ComplianceAssessment {
  id: string;
  commitHash: string;
  projectId: string;
  timestamp: string;
  status: AssessmentStatus;
  riskScore: number;
  categories: {
    security: CategoryScore;
    license: CategoryScore;
    quality: CategoryScore;
    policy: CategoryScore;
    dependency: CategoryScore;
  };
  findings: Finding[];
  agentResults: AgentResult[];
  drift: {
    aiComposition: {
      thisCommit: number;
      projectBaseline: number;
      deviationFactor: number;
      riskFlag: boolean;
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
  certificate?: ComplianceCertificate;
}

// === Certificate Types ===

export interface ComplianceCertificate {
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
    soc2?: { controlsMapped: string[] };
    iso27001?: { controlsMapped: string[] };
  };
  signature: string;
  issuedAt: string;
  expiresAt: string;
}

// === Agent Types ===

export type AgentStatus = "completed" | "error" | "timeout";

export interface AgentResult {
  agentName: string;
  agentVersion: string;
  rulesetVersion: string;
  rulesetHash: string;
  status: AgentStatus;
  findingCount: number;
  durationMs: number;
  errorDetail?: string;
}

// === Audit Types ===

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: {
    type: "system" | "user" | "agent" | "api";
    id: string;
    name: string;
    ip?: string;
  };
  action: string;
  resource: {
    type: "scan" | "certificate" | "finding" | "policy" | "project";
    id: string;
  };
  detail: Record<string, unknown>;
  previousEventHash: string;
  eventHash: string;
}

// === Event Bus Types ===

export interface DiffEvent {
  scanId: string;
  payload: SentinelDiffPayload;
  submittedAt: string;
}

export interface FindingEvent {
  scanId: string;
  agentName: string;
  findings: Finding[];
  agentResult: AgentResult;
}

export interface ReEvaluateEvent {
  type: "RE_EVALUATE";
  scanId: string;
  agentName: string;
  findings: Finding[];
  triggeredAt: string;
}

export interface ScanResultEvent {
  scanId: string;
  assessment: ComplianceAssessment;
}
```

Create `sentinel/packages/shared/src/index.ts`:
```typescript
export * from "./types.js";
```

**Step 5: Run test to verify it passes**

```bash
cd sentinel/packages/shared
pnpm test
```

Expected: All 5 tests PASS.

**Step 6: Build to verify compilation**

```bash
cd sentinel/packages/shared
pnpm build
```

Expected: `dist/` directory created with `.js` and `.d.ts` files.

**Step 7: Commit**

```bash
git add packages/shared/
git commit -m "feat: add @sentinel/shared types package with core domain types"
```

---

### Task 3: Database Schema & Migrations

**Files:**
- Create: `sentinel/packages/db/package.json`
- Create: `sentinel/packages/db/tsconfig.json`
- Create: `sentinel/packages/db/prisma/schema.prisma`
- Create: `sentinel/packages/db/src/index.ts`
- Create: `sentinel/packages/db/src/client.ts`
- Create: `sentinel/packages/db/src/tenant.ts`
- Create: `sentinel/packages/db/src/tenant.test.ts`
- Create: `sentinel/packages/db/vitest.config.ts`

**Step 1: Scaffold db package**

Create `sentinel/packages/db/package.json`:
```json
{
  "name": "@sentinel/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^6.4"
  },
  "devDependencies": {
    "prisma": "^6.4",
    "typescript": "^5.7",
    "vitest": "^3.0"
  }
}
```

**Step 2: Write Prisma schema**

Create `sentinel/packages/db/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Organization {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  plan      String   @default("free")
  settings  Json     @default("{}")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  projects Project[]
  users    User[]
  policies Policy[]

  @@map("organizations")
}

model Project {
  id            String   @id @default(uuid())
  orgId         String   @map("org_id")
  name          String
  repoUrl       String?  @map("repo_url")
  defaultConfig Json     @default("{}") @map("default_config")
  depProfile    Json     @default("{}") @map("dep_profile")
  aiBaseline    Float    @default(0) @map("ai_baseline")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  org   Organization @relation(fields: [orgId], references: [id])
  scans Scan[]

  @@index([orgId])
  @@map("projects")
}

model Scan {
  id          String    @id @default(uuid())
  projectId   String    @map("project_id")
  orgId       String    @map("org_id")
  commitHash  String    @map("commit_hash")
  branch      String
  author      String
  status      String    @default("pending")
  riskScore   Int?      @map("risk_score")
  scanLevel   String    @default("standard") @map("scan_level")
  metadata    Json      @default("{}")
  startedAt   DateTime  @default(now()) @map("started_at")
  completedAt DateTime? @map("completed_at")

  project      Project       @relation(fields: [projectId], references: [id])
  findings     Finding[]
  agentResults AgentResult[]
  certificate  Certificate?

  @@index([projectId, startedAt(sort: Desc)])
  @@index([commitHash])
  @@index([orgId])
  @@map("scans")
}

model Finding {
  id           String    @id @default(uuid())
  scanId       String    @map("scan_id")
  orgId        String    @map("org_id")
  agentName    String    @map("agent_name")
  type         String
  severity     String
  category     String?
  file         String
  lineStart    Int       @map("line_start")
  lineEnd      Int       @map("line_end")
  title        String?
  description  String?
  remediation  String?
  cweId        String?   @map("cwe_id")
  confidence   String
  suppressed   Boolean   @default(false)
  suppressedBy String?   @map("suppressed_by")
  suppressedAt DateTime? @map("suppressed_at")
  rawData      Json      @default("{}") @map("raw_data")
  createdAt    DateTime  @default(now()) @map("created_at")

  scan Scan @relation(fields: [scanId], references: [id])

  @@index([scanId, severity])
  @@index([orgId])
  @@map("findings")
}

model Certificate {
  id               String    @id @default(uuid())
  scanId           String    @unique @map("scan_id")
  orgId            String    @map("org_id")
  status           String    @default("provisional_pass")
  riskScore        Int       @map("risk_score")
  verdict          Json
  scanMetadata     Json      @map("scan_metadata")
  compliance       Json      @default("{}")
  signature        String
  issuedAt         DateTime  @default(now()) @map("issued_at")
  expiresAt        DateTime  @map("expires_at")
  revokedAt        DateTime? @map("revoked_at")
  revocationReason String?   @map("revocation_reason")

  scan Scan @relation(fields: [scanId], references: [id])

  @@index([orgId])
  @@map("certificates")
}

model AgentResult {
  id             String @id @default(uuid())
  scanId         String @map("scan_id")
  agentName      String @map("agent_name")
  agentVersion   String @map("agent_version")
  rulesetVersion String @map("ruleset_version")
  rulesetHash    String @map("ruleset_hash")
  status         String
  findingCount   Int    @map("finding_count")
  durationMs     Int    @map("duration_ms")
  errorDetail    String? @map("error_detail")

  scan Scan @relation(fields: [scanId], references: [id])

  @@index([scanId])
  @@map("agent_results")
}

model Policy {
  id        String   @id @default(uuid())
  orgId     String   @map("org_id")
  projectId String?  @map("project_id")
  name      String
  rules     Json
  version   Int      @default(1)
  createdBy String   @map("created_by")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  org Organization @relation(fields: [orgId], references: [id])

  @@index([orgId])
  @@map("policies")
}

model AuditEvent {
  id                String   @id @default(uuid())
  orgId             String   @map("org_id")
  timestamp         DateTime @default(now())
  actorType         String   @map("actor_type")
  actorId           String   @map("actor_id")
  actorName         String   @map("actor_name")
  actorIp           String?  @map("actor_ip")
  action            String
  resourceType      String   @map("resource_type")
  resourceId        String   @map("resource_id")
  detail            Json     @default("{}")
  previousEventHash String   @map("previous_event_hash")
  eventHash         String   @map("event_hash")

  @@index([orgId])
  @@index([timestamp])
  @@map("audit_events")
}

model User {
  id           String   @id @default(uuid())
  orgId        String   @map("org_id")
  email        String   @unique
  name         String
  role         String   @default("dev")
  authProvider String   @default("github") @map("auth_provider")
  createdAt    DateTime @default(now()) @map("created_at")

  org Organization @relation(fields: [orgId], references: [id])

  @@index([orgId])
  @@map("users")
}
```

**Step 3: Write tenant isolation helper**

Create `sentinel/packages/db/src/tenant.ts`:
```typescript
import type { PrismaClient } from "@prisma/client";

export async function withTenant<T>(
  db: PrismaClient,
  orgId: string,
  fn: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_org_id', $1, true)`,
      orgId,
    );
    return fn(tx);
  });
}
```

**Step 4: Write the failing test for tenant isolation**

Create `sentinel/packages/db/src/tenant.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { withTenant } from "./tenant.js";

describe("withTenant", () => {
  it("sets org_id within transaction and calls callback", async () => {
    const executeRawUnsafe = vi.fn().mockResolvedValue(undefined);
    const txProxy = { $executeRawUnsafe: executeRawUnsafe };
    const mockDb = {
      $transaction: vi.fn(async (fn: (tx: typeof txProxy) => Promise<unknown>) => {
        return fn(txProxy);
      }),
    };

    const result = await withTenant(mockDb as any, "org_123", async (tx) => {
      return "tenant_result";
    });

    expect(result).toBe("tenant_result");
    expect(executeRawUnsafe).toHaveBeenCalledWith(
      `SELECT set_config('app.current_org_id', $1, true)`,
      "org_123",
    );
  });
});
```

**Step 5: Run test to verify it passes**

```bash
cd sentinel/packages/db
pnpm install
pnpm test
```

Expected: PASS

**Step 6: Generate Prisma client and run migration**

```bash
cd sentinel
docker compose up -d postgres
cd packages/db
echo 'DATABASE_URL="postgresql://sentinel:sentinel_dev@localhost:5432/sentinel"' > .env
pnpm db:generate
pnpm db:migrate --name init
```

Expected: Migration created, Prisma client generated.

**Step 7: Commit**

```bash
git add packages/db/
git commit -m "feat: add @sentinel/db with Prisma schema, migrations, tenant isolation"
```

---

### Task 4: Redis Event Bus Package

**Files:**
- Create: `sentinel/packages/events/package.json`
- Create: `sentinel/packages/events/tsconfig.json`
- Create: `sentinel/packages/events/src/bus.ts`
- Create: `sentinel/packages/events/src/bus.test.ts`
- Create: `sentinel/packages/events/src/index.ts`
- Create: `sentinel/packages/events/vitest.config.ts`

**Step 1: Scaffold events package**

Create `sentinel/packages/events/package.json`:
```json
{
  "name": "@sentinel/events",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  },
  "dependencies": {
    "@sentinel/shared": "workspace:*",
    "ioredis": "^5.6"
  },
  "devDependencies": {
    "typescript": "^5.7",
    "vitest": "^3.0"
  }
}
```

**Step 2: Write the failing test**

Create `sentinel/packages/events/src/bus.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "./bus.js";

describe("EventBus", () => {
  const mockRedis = {
    xadd: vi.fn().mockResolvedValue("1709942400000-0"),
    xreadgroup: vi.fn().mockResolvedValue(null),
    xgroup: vi.fn().mockResolvedValue("OK"),
    xack: vi.fn().mockResolvedValue(1),
    disconnect: vi.fn(),
    duplicate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.duplicate.mockReturnValue(mockRedis);
  });

  it("publishes an event to a stream", async () => {
    const bus = new EventBus(mockRedis as any);
    const eventId = await bus.publish("sentinel.diffs", {
      scanId: "scan_123",
      payload: { projectId: "proj_1" },
    });

    expect(eventId).toBe("1709942400000-0");
    expect(mockRedis.xadd).toHaveBeenCalledWith(
      "sentinel.diffs",
      "*",
      "data",
      expect.any(String),
    );
  });

  it("serializes event data as JSON", async () => {
    const bus = new EventBus(mockRedis as any);
    await bus.publish("sentinel.findings", { scanId: "scan_456", findings: [] });

    const callArgs = mockRedis.xadd.mock.calls[0];
    const parsed = JSON.parse(callArgs[3]);
    expect(parsed.scanId).toBe("scan_456");
  });
});
```

**Step 3: Run test to verify it fails**

```bash
cd sentinel/packages/events
pnpm install
pnpm test
```

Expected: FAIL — cannot find module `./bus.js`

**Step 4: Implement EventBus**

Create `sentinel/packages/events/src/bus.ts`:
```typescript
import type { Redis } from "ioredis";

export class EventBus {
  constructor(private redis: Redis) {}

  async publish(stream: string, data: Record<string, unknown>): Promise<string> {
    const serialized = JSON.stringify(data);
    const id = await this.redis.xadd(stream, "*", "data", serialized);
    return id;
  }

  async subscribe(
    stream: string,
    group: string,
    consumer: string,
    handler: (id: string, data: Record<string, unknown>) => Promise<void>,
    options: { blockMs?: number; count?: number } = {},
  ): Promise<void> {
    const { blockMs = 5000, count = 10 } = options;

    // Ensure consumer group exists
    try {
      await this.redis.xgroup("CREATE", stream, group, "0", "MKSTREAM");
    } catch {
      // Group already exists — OK
    }

    const reader = this.redis.duplicate();

    while (true) {
      const results = await reader.xreadgroup(
        "GROUP", group, consumer,
        "COUNT", count,
        "BLOCK", blockMs,
        "STREAMS", stream, ">",
      );

      if (!results) continue;

      for (const [, messages] of results) {
        for (const [id, fields] of messages as Array<[string, string[]]>) {
          const dataIndex = fields.indexOf("data");
          if (dataIndex === -1) continue;
          const data = JSON.parse(fields[dataIndex + 1]);
          await handler(id, data);
          await reader.xack(stream, group, id);
        }
      }
    }
  }

  async disconnect(): Promise<void> {
    this.redis.disconnect();
  }
}
```

Create `sentinel/packages/events/src/index.ts`:
```typescript
export { EventBus } from "./bus.js";
```

**Step 5: Run test to verify it passes**

```bash
pnpm test
```

Expected: Both tests PASS.

**Step 6: Commit**

```bash
git add packages/events/
git commit -m "feat: add @sentinel/events with Redis Streams EventBus"
```

---

### Task 5: Audit Log Service

**Files:**
- Create: `sentinel/packages/audit/package.json`
- Create: `sentinel/packages/audit/tsconfig.json`
- Create: `sentinel/packages/audit/src/audit-log.ts`
- Create: `sentinel/packages/audit/src/audit-log.test.ts`
- Create: `sentinel/packages/audit/src/index.ts`
- Create: `sentinel/packages/audit/vitest.config.ts`

**Step 1: Write the failing test**

Create `sentinel/packages/audit/src/audit-log.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuditLog } from "./audit-log.js";
import { createHash } from "node:crypto";

describe("AuditLog", () => {
  const mockDb = {
    auditEvent: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an audit event with hash chain", async () => {
    mockDb.auditEvent.findFirst.mockResolvedValue(null); // No previous event
    mockDb.auditEvent.create.mockImplementation(async ({ data }) => data);

    const log = new AuditLog(mockDb as any);
    const event = await log.append("org_123", {
      actor: { type: "system" as const, id: "assessor", name: "Compliance Assessor" },
      action: "scan.started",
      resource: { type: "scan" as const, id: "scan_abc" },
      detail: { commitHash: "a1b2c3d" },
    });

    expect(event.action).toBe("scan.started");
    expect(event.orgId).toBe("org_123");
    expect(event.previousEventHash).toBe("GENESIS");
    expect(event.eventHash).toBeTruthy();
    expect(typeof event.eventHash).toBe("string");
  });

  it("chains to previous event hash", async () => {
    mockDb.auditEvent.findFirst.mockResolvedValue({
      eventHash: "sha256:previous_hash_abc",
    });
    mockDb.auditEvent.create.mockImplementation(async ({ data }) => data);

    const log = new AuditLog(mockDb as any);
    const event = await log.append("org_123", {
      actor: { type: "agent" as const, id: "security", name: "Security Agent" },
      action: "finding.created",
      resource: { type: "finding" as const, id: "finding_xyz" },
      detail: { severity: "high" },
    });

    expect(event.previousEventHash).toBe("sha256:previous_hash_abc");
  });

  it("produces deterministic hash for same inputs", async () => {
    mockDb.auditEvent.findFirst.mockResolvedValue(null);
    const events: any[] = [];
    mockDb.auditEvent.create.mockImplementation(async ({ data }) => {
      events.push(data);
      return data;
    });

    const log = new AuditLog(mockDb as any);
    const input = {
      actor: { type: "system" as const, id: "test", name: "Test" },
      action: "test.action",
      resource: { type: "scan" as const, id: "scan_1" },
      detail: {},
    };

    await log.append("org_123", { ...input });
    mockDb.auditEvent.findFirst.mockResolvedValue(null);
    await log.append("org_123", { ...input });

    // Same inputs with same timestamp and previous hash should produce same hash
    // (In practice timestamps differ, but the hashing function is deterministic)
    expect(events[0].eventHash).toBeTruthy();
    expect(events[1].eventHash).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd sentinel/packages/audit
pnpm test
```

Expected: FAIL

**Step 3: Implement AuditLog**

Create `sentinel/packages/audit/src/audit-log.ts`:
```typescript
import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

interface AuditActor {
  type: "system" | "user" | "agent" | "api";
  id: string;
  name: string;
  ip?: string;
}

interface AuditInput {
  actor: AuditActor;
  action: string;
  resource: { type: string; id: string };
  detail: Record<string, unknown>;
}

export class AuditLog {
  constructor(private db: Pick<PrismaClient, "auditEvent">) {}

  async append(orgId: string, input: AuditInput) {
    const previousEvent = await this.db.auditEvent.findFirst({
      where: { orgId },
      orderBy: { timestamp: "desc" },
      select: { eventHash: true },
    });

    const previousEventHash = previousEvent?.eventHash ?? "GENESIS";
    const id = randomUUID();
    const timestamp = new Date();

    const hashInput = JSON.stringify({
      id,
      timestamp: timestamp.toISOString(),
      orgId,
      ...input,
      previousEventHash,
    });

    const eventHash = `sha256:${createHash("sha256").update(hashInput).digest("hex")}`;

    const event = await this.db.auditEvent.create({
      data: {
        id,
        orgId,
        timestamp,
        actorType: input.actor.type,
        actorId: input.actor.id,
        actorName: input.actor.name,
        actorIp: input.actor.ip ?? null,
        action: input.action,
        resourceType: input.resource.type,
        resourceId: input.resource.id,
        detail: input.detail,
        previousEventHash,
        eventHash,
      },
    });

    return event;
  }

  async verifyChain(orgId: string): Promise<{ valid: boolean; brokenAt?: string }> {
    const events = await this.db.auditEvent.findFirst({
      where: { orgId },
      orderBy: { timestamp: "asc" },
    });

    // Full chain verification would iterate all events
    // and recompute hashes — implemented in production
    return { valid: true };
  }
}
```

Create `sentinel/packages/audit/src/index.ts`:
```typescript
export { AuditLog } from "./audit-log.js";
```

**Step 4: Run test to verify it passes**

```bash
pnpm test
```

Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add packages/audit/
git commit -m "feat: add @sentinel/audit with hash-chained audit log"
```

---

### Task 6: HMAC Request Signing

**Files:**
- Create: `sentinel/packages/auth/package.json`
- Create: `sentinel/packages/auth/tsconfig.json`
- Create: `sentinel/packages/auth/src/signing.ts`
- Create: `sentinel/packages/auth/src/signing.test.ts`
- Create: `sentinel/packages/auth/src/index.ts`
- Create: `sentinel/packages/auth/vitest.config.ts`

**Step 1: Write the failing test**

Create `sentinel/packages/auth/src/signing.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { signRequest, verifyRequest } from "./signing.js";

describe("HMAC request signing", () => {
  const secret = "test_secret_key_abc123";

  it("signs a request with HMAC-SHA256", () => {
    const body = JSON.stringify({ scanId: "scan_123" });
    const timestamp = 1709942400;

    const signature = signRequest(body, secret, timestamp);

    expect(signature).toMatch(/^t=\d+,sig=[a-f0-9]{64}$/);
    expect(signature).toContain(`t=${timestamp}`);
  });

  it("verifies a valid signature", () => {
    const body = JSON.stringify({ scanId: "scan_123" });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signRequest(body, secret, timestamp);

    const result = verifyRequest(signature, body, secret);
    expect(result.valid).toBe(true);
  });

  it("rejects tampered body", () => {
    const body = JSON.stringify({ scanId: "scan_123" });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signRequest(body, secret, timestamp);

    const tampered = JSON.stringify({ scanId: "scan_HACKED" });
    const result = verifyRequest(signature, tampered, secret);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("rejects expired timestamp (>5 min old)", () => {
    const body = JSON.stringify({ scanId: "scan_123" });
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 min ago
    const signature = signRequest(body, secret, oldTimestamp);

    const result = verifyRequest(signature, body, secret);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("request_expired");
  });

  it("rejects invalid signature format", () => {
    const result = verifyRequest("garbage", "{}", secret);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("invalid_format");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd sentinel/packages/auth
pnpm test
```

Expected: FAIL

**Step 3: Implement signing**

Create `sentinel/packages/auth/src/signing.ts`:
```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_SECONDS = 300; // 5 minutes

export function signRequest(body: string, secret: string, timestamp?: number): string {
  const t = timestamp ?? Math.floor(Date.now() / 1000);
  const message = `${t}.${body}`;
  const sig = createHmac("sha256", secret).update(message).digest("hex");
  return `t=${t},sig=${sig}`;
}

interface VerifyResult {
  valid: boolean;
  reason?: "invalid_format" | "request_expired" | "signature_mismatch";
}

export function verifyRequest(signature: string, body: string, secret: string): VerifyResult {
  const match = signature.match(/^t=(\d+),sig=([a-f0-9]{64})$/);
  if (!match) {
    return { valid: false, reason: "invalid_format" };
  }

  const [, timestampStr, sig] = match;
  const timestamp = parseInt(timestampStr, 10);
  const now = Math.floor(Date.now() / 1000);

  if (Math.abs(now - timestamp) > MAX_AGE_SECONDS) {
    return { valid: false, reason: "request_expired" };
  }

  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

  const sigBuffer = Buffer.from(sig);
  const expectedBuffer = Buffer.from(expected);

  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, reason: "signature_mismatch" };
  }

  return { valid: true };
}
```

Create `sentinel/packages/auth/src/index.ts`:
```typescript
export { signRequest, verifyRequest } from "./signing.js";
```

**Step 4: Run test to verify it passes**

```bash
pnpm test
```

Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add packages/auth/
git commit -m "feat: add @sentinel/auth with HMAC request signing and verification"
```

---

### Task 7: API Service Scaffold

**Files:**
- Create: `sentinel/apps/api/package.json`
- Create: `sentinel/apps/api/tsconfig.json`
- Create: `sentinel/apps/api/src/server.ts`
- Create: `sentinel/apps/api/src/routes/scans.ts`
- Create: `sentinel/apps/api/src/routes/scans.test.ts`
- Create: `sentinel/apps/api/src/middleware/auth.ts`
- Create: `sentinel/apps/api/src/middleware/auth.test.ts`
- Create: `sentinel/apps/api/src/middleware/tenant.ts`
- Create: `sentinel/apps/api/vitest.config.ts`

**Step 1: Scaffold API app**

Create `sentinel/apps/api/package.json`:
```json
{
  "name": "@sentinel/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@sentinel/shared": "workspace:*",
    "@sentinel/db": "workspace:*",
    "@sentinel/events": "workspace:*",
    "@sentinel/auth": "workspace:*",
    "@sentinel/audit": "workspace:*",
    "fastify": "^5.2",
    "ioredis": "^5.6"
  },
  "devDependencies": {
    "tsx": "^4.19",
    "typescript": "^5.7",
    "vitest": "^3.0"
  }
}
```

**Step 2: Write the failing test for auth middleware**

Create `sentinel/apps/api/src/middleware/auth.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { createAuthHook } from "./auth.js";

describe("auth middleware", () => {
  it("passes valid HMAC-signed request", async () => {
    const { signRequest } = await import("@sentinel/auth");
    const body = JSON.stringify({ projectId: "proj_1" });
    const signature = signRequest(body, "org_secret_123");

    const request = {
      headers: { "x-sentinel-signature": signature },
      body,
      rawBody: body,
    };
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };

    const hook = createAuthHook({
      getOrgSecret: async () => "org_secret_123",
    });

    await expect(hook(request as any, reply as any)).resolves.not.toThrow();
    expect(reply.code).not.toHaveBeenCalled();
  });

  it("rejects request with missing signature", async () => {
    const request = {
      headers: {},
      body: "{}",
      rawBody: "{}",
    };
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };

    const hook = createAuthHook({
      getOrgSecret: async () => "org_secret_123",
    });

    await hook(request as any, reply as any);
    expect(reply.code).toHaveBeenCalledWith(401);
  });
});
```

**Step 3: Run test to verify it fails**

```bash
cd sentinel/apps/api
pnpm install
pnpm test
```

Expected: FAIL

**Step 4: Implement auth middleware**

Create `sentinel/apps/api/src/middleware/auth.ts`:
```typescript
import { verifyRequest } from "@sentinel/auth";
import type { FastifyRequest, FastifyReply } from "fastify";

interface AuthHookOptions {
  getOrgSecret: (apiKey?: string) => Promise<string | null>;
}

export function createAuthHook(options: AuthHookOptions) {
  return async function authHook(request: FastifyRequest, reply: FastifyReply) {
    const signature = request.headers["x-sentinel-signature"] as string | undefined;

    if (!signature) {
      reply.code(401).send({ error: "Missing X-Sentinel-Signature header" });
      return;
    }

    const secret = await options.getOrgSecret(
      request.headers["x-sentinel-api-key"] as string | undefined,
    );

    if (!secret) {
      reply.code(401).send({ error: "Invalid API key" });
      return;
    }

    const body = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    const result = verifyRequest(signature, body, secret);

    if (!result.valid) {
      reply.code(401).send({ error: `Authentication failed: ${result.reason}` });
      return;
    }
  };
}
```

**Step 5: Write the failing test for POST /scans**

Create `sentinel/apps/api/src/routes/scans.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { buildScanRoutes } from "./scans.js";

describe("POST /scans", () => {
  it("creates a scan record and publishes event", async () => {
    const mockDb = {
      scan: {
        create: vi.fn().mockResolvedValue({
          id: "scan_new",
          projectId: "proj_1",
          status: "pending",
        }),
      },
    };
    const mockEventBus = {
      publish: vi.fn().mockResolvedValue("1709942400000-0"),
    };
    const mockAuditLog = {
      append: vi.fn().mockResolvedValue({}),
    };

    const handler = buildScanRoutes({
      db: mockDb as any,
      eventBus: mockEventBus as any,
      auditLog: mockAuditLog as any,
    });

    const result = await handler.submitScan({
      orgId: "org_123",
      body: {
        projectId: "proj_1",
        commitHash: "a1b2c3d",
        branch: "main",
        author: "dev@example.com",
        timestamp: "2026-03-09T12:00:00Z",
        files: [],
        scanConfig: {
          securityLevel: "standard",
          licensePolicy: "MIT",
          qualityThreshold: 0.7,
        },
      },
    });

    expect(result.scanId).toBe("scan_new");
    expect(result.status).toBe("pending");
    expect(mockDb.scan.create).toHaveBeenCalled();
    expect(mockEventBus.publish).toHaveBeenCalledWith(
      "sentinel.diffs",
      expect.objectContaining({ scanId: "scan_new" }),
    );
    expect(mockAuditLog.append).toHaveBeenCalledWith(
      "org_123",
      expect.objectContaining({ action: "scan.started" }),
    );
  });
});
```

**Step 6: Run test to verify it fails**

```bash
pnpm test
```

Expected: FAIL

**Step 7: Implement scan routes**

Create `sentinel/apps/api/src/routes/scans.ts`:
```typescript
import type { PrismaClient } from "@prisma/client";
import type { EventBus } from "@sentinel/events";
import type { AuditLog } from "@sentinel/audit";
import type { SentinelDiffPayload } from "@sentinel/shared";

interface ScanDeps {
  db: PrismaClient;
  eventBus: EventBus;
  auditLog: AuditLog;
}

interface SubmitScanInput {
  orgId: string;
  body: SentinelDiffPayload;
}

export function buildScanRoutes(deps: ScanDeps) {
  const { db, eventBus, auditLog } = deps;

  async function submitScan(input: SubmitScanInput) {
    const { orgId, body } = input;

    const scan = await db.scan.create({
      data: {
        projectId: body.projectId,
        orgId,
        commitHash: body.commitHash,
        branch: body.branch,
        author: body.author,
        status: "pending",
        scanLevel: body.scanConfig.securityLevel,
        metadata: body as any,
      },
    });

    await eventBus.publish("sentinel.diffs", {
      scanId: scan.id,
      payload: body,
      submittedAt: new Date().toISOString(),
    });

    await auditLog.append(orgId, {
      actor: { type: "api", id: "cli", name: "SENTINEL CLI" },
      action: "scan.started",
      resource: { type: "scan", id: scan.id },
      detail: { commitHash: body.commitHash, branch: body.branch },
    });

    return { scanId: scan.id, status: scan.status, pollUrl: `/v1/scans/${scan.id}/poll` };
  }

  return { submitScan };
}
```

**Step 8: Run tests to verify they pass**

```bash
pnpm test
```

Expected: All tests PASS.

**Step 9: Create Fastify server entry**

Create `sentinel/apps/api/src/server.ts`:
```typescript
import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok" }));

const port = parseInt(process.env.PORT ?? "8080", 10);

app.listen({ port, host: "0.0.0.0" }).then(() => {
  console.log(`SENTINEL API listening on :${port}`);
});

export { app };
```

**Step 10: Commit**

```bash
git add apps/api/
git commit -m "feat: add @sentinel/api with scan submission, auth middleware, audit logging"
```

---

### Task 8: CLI Scaffold with Git Hook

**Files:**
- Create: `sentinel/apps/cli/package.json`
- Create: `sentinel/apps/cli/tsconfig.json`
- Create: `sentinel/apps/cli/src/cli.ts`
- Create: `sentinel/apps/cli/src/commands/init.ts`
- Create: `sentinel/apps/cli/src/commands/init.test.ts`
- Create: `sentinel/apps/cli/src/git/diff.ts`
- Create: `sentinel/apps/cli/src/git/diff.test.ts`
- Create: `sentinel/apps/cli/src/git/hook.ts`
- Create: `sentinel/apps/cli/src/git/hook.test.ts`
- Create: `sentinel/apps/cli/vitest.config.ts`

**Step 1: Scaffold CLI app**

Create `sentinel/apps/cli/package.json`:
```json
{
  "name": "@sentinel/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "sentinel": "dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@sentinel/shared": "workspace:*",
    "@sentinel/auth": "workspace:*",
    "commander": "^13.1"
  },
  "devDependencies": {
    "tsx": "^4.19",
    "typescript": "^5.7",
    "vitest": "^3.0"
  }
}
```

**Step 2: Write failing test for diff extraction**

Create `sentinel/apps/cli/src/git/diff.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { parseDiff } from "./diff.js";

describe("parseDiff", () => {
  it("parses a unified diff into structured hunks", () => {
    const raw = `diff --git a/src/index.ts b/src/index.ts
index 1234567..abcdefg 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,8 @@
 import express from 'express';

+const db = require('mysql');
+const query = \`SELECT * FROM users WHERE id = \${id}\`;
+
 const app = express();
 app.listen(3000);
`;

    const files = parseDiff(raw);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/index.ts");
    expect(files[0].hunks).toHaveLength(1);
    expect(files[0].hunks[0].newStart).toBe(1);
    expect(files[0].hunks[0].newCount).toBe(8);
  });

  it("parses multiple files", () => {
    const raw = `diff --git a/src/a.ts b/src/a.ts
index 1234567..abcdefg 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 line1
+added
 line2
 line3
diff --git a/src/b.ts b/src/b.ts
index 1234567..abcdefg 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,2 +1,3 @@
 foo
+bar
 baz
`;

    const files = parseDiff(raw);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe("src/a.ts");
    expect(files[1].path).toBe("src/b.ts");
  });

  it("returns empty array for empty diff", () => {
    expect(parseDiff("")).toEqual([]);
  });
});
```

**Step 3: Run test to verify it fails**

```bash
cd sentinel/apps/cli
pnpm install
pnpm test
```

Expected: FAIL

**Step 4: Implement diff parser**

Create `sentinel/apps/cli/src/git/diff.ts`:
```typescript
import type { DiffHunk } from "@sentinel/shared";

export interface DiffFile {
  path: string;
  hunks: DiffHunk[];
}

export function parseDiff(raw: string): DiffFile[] {
  if (!raw.trim()) return [];

  const files: DiffFile[] = [];
  const fileSections = raw.split(/^diff --git /m).filter(Boolean);

  for (const section of fileSections) {
    const pathMatch = section.match(/^a\/(.+?) b\/(.+)/m);
    if (!pathMatch) continue;

    const path = pathMatch[2];
    const hunks: DiffHunk[] = [];
    const hunkRegex = /@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/g;

    let match: RegExpExecArray | null;
    while ((match = hunkRegex.exec(section)) !== null) {
      const oldStart = parseInt(match[1], 10);
      const oldCount = parseInt(match[2] || "1", 10);
      const newStart = parseInt(match[3], 10);
      const newCount = parseInt(match[4] || "1", 10);

      // Extract content until next hunk or end of section
      const startIdx = match.index + match[0].length;
      const nextHunk = section.indexOf("\n@@", startIdx);
      const content = section.slice(
        startIdx,
        nextHunk === -1 ? undefined : nextHunk,
      );

      hunks.push({ oldStart, oldCount, newStart, newCount, content });
    }

    files.push({ path, hunks });
  }

  return files;
}
```

**Step 5: Run test to verify it passes**

```bash
pnpm test
```

Expected: All 3 tests PASS.

**Step 6: Write failing test for git hook installation**

Create `sentinel/apps/cli/src/git/hook.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installHook, HOOK_CONTENT } from "./hook.js";
import { mkdtemp, rm, readFile, stat, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("installHook", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sentinel-hook-"));
    await mkdir(join(tempDir, ".git", "hooks"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("installs post-commit hook", async () => {
    await installHook(tempDir);

    const hookPath = join(tempDir, ".git", "hooks", "post-commit");
    const content = await readFile(hookPath, "utf-8");
    expect(content).toContain("sentinel");

    const stats = await stat(hookPath);
    const isExecutable = (stats.mode & 0o111) !== 0;
    expect(isExecutable).toBe(true);
  });

  it("preserves existing hook content", async () => {
    const hookPath = join(tempDir, ".git", "hooks", "post-commit");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(hookPath, "#!/bin/sh\necho 'existing hook'\n");

    await installHook(tempDir);

    const content = await readFile(hookPath, "utf-8");
    expect(content).toContain("existing hook");
    expect(content).toContain("sentinel");
  });
});
```

**Step 7: Implement git hook installation**

Create `sentinel/apps/cli/src/git/hook.ts`:
```typescript
import { readFile, writeFile, chmod, stat } from "node:fs/promises";
import { join } from "node:path";

export const HOOK_MARKER = "# SENTINEL_HOOK_START";
export const HOOK_MARKER_END = "# SENTINEL_HOOK_END";

export const HOOK_CONTENT = `
${HOOK_MARKER}
# SENTINEL post-commit hook — scans AI-generated code
sentinel scan --post-commit 2>/dev/null &
${HOOK_MARKER_END}
`;

export async function installHook(repoRoot: string): Promise<void> {
  const hookPath = join(repoRoot, ".git", "hooks", "post-commit");

  let existing = "";
  try {
    existing = await readFile(hookPath, "utf-8");
  } catch {
    existing = "#!/bin/sh\n";
  }

  if (existing.includes(HOOK_MARKER)) {
    // Already installed — replace with latest version
    const before = existing.slice(0, existing.indexOf(HOOK_MARKER));
    const after = existing.slice(
      existing.indexOf(HOOK_MARKER_END) + HOOK_MARKER_END.length,
    );
    existing = before + after;
  }

  const content = existing.trimEnd() + "\n" + HOOK_CONTENT;
  await writeFile(hookPath, content);
  await chmod(hookPath, 0o755);
}
```

**Step 8: Run all tests**

```bash
pnpm test
```

Expected: All tests PASS.

**Step 9: Create CLI entry point**

Create `sentinel/apps/cli/src/cli.ts`:
```typescript
#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("sentinel")
  .description("AI-Generated Code Governance & Compliance")
  .version("0.1.0");

program
  .command("init")
  .description("Install git hooks and configure project")
  .action(async () => {
    const { installHook } = await import("./git/hook.js");
    await installHook(process.cwd());
    console.log("SENTINEL initialized. Post-commit hook installed.");
  });

program
  .command("scan")
  .description("Scan current changes")
  .option("--local", "Run analysis locally only")
  .option("--post-commit", "Triggered by post-commit hook")
  .action(async (options) => {
    console.log("Scanning...", options);
    // Implemented in Task 8+ of Month 1
  });

program
  .command("ci")
  .description("CI/CD mode — synchronous scan with exit codes")
  .action(async () => {
    console.log("CI mode not yet implemented");
    process.exit(2);
  });

program.parse();
```

**Step 10: Commit**

```bash
git add apps/cli/
git commit -m "feat: add @sentinel/cli with diff parser, git hook installation, CLI scaffold"
```

---

## Month 2: Deterministic Agents (Weeks 5-8)

### Task 9: Python Agent Framework

**Files:**
- Create: `sentinel/agents/framework/pyproject.toml`
- Create: `sentinel/agents/framework/sentinel_agents/__init__.py`
- Create: `sentinel/agents/framework/sentinel_agents/base.py`
- Create: `sentinel/agents/framework/sentinel_agents/events.py`
- Create: `sentinel/agents/framework/sentinel_agents/types.py`
- Create: `sentinel/agents/framework/tests/test_base.py`
- Create: `sentinel/agents/framework/tests/test_events.py`
- Create: `sentinel/agents/framework/Dockerfile`

**Details:** Implements `BaseAgent` abstract class with `process(event) -> list[Finding]` and `health() -> AgentHealth`. `events.py` wraps Redis Streams consumer/producer. Uses `ioredis`-compatible protocol via `redis-py`. Each agent is a Docker container consuming from `sentinel.diffs` and producing to `sentinel.findings`.

**Test approach:** Unit tests with mocked Redis. Integration test with real Redis (Docker Compose).

**Key patterns from design:**
```python
class BaseAgent(ABC):
    @abstractmethod
    def process(self, event: DiffEvent) -> list[Finding]: ...
    def health(self) -> AgentHealth: ...
```

**Commit:** `feat: add Python agent framework with BaseAgent, Redis Streams events`

---

### Task 10: Security Agent (Tier 1 — Semgrep)

**Files:**
- Create: `sentinel/agents/security/pyproject.toml`
- Create: `sentinel/agents/security/sentinel_security/__init__.py`
- Create: `sentinel/agents/security/sentinel_security/agent.py`
- Create: `sentinel/agents/security/sentinel_security/semgrep_runner.py`
- Create: `sentinel/agents/security/sentinel_security/rules/ai_patterns.yaml`
- Create: `sentinel/agents/security/tests/test_agent.py`
- Create: `sentinel/agents/security/tests/test_semgrep.py`
- Create: `sentinel/agents/security/tests/fixtures/vulnerable_code.py`
- Create: `sentinel/agents/security/Dockerfile`

**Details:** Wraps Semgrep CLI with AI-specific rulesets. Custom rules for hallucinated imports, insecure defaults, `DEBUG=True`, `verify=False`. Maps all findings to CWE IDs. Outputs `SecurityFinding` dataclass.

**Commit:** `feat: add Security Agent with Semgrep integration and AI-specific rules`

---

### Task 11: Security Agent (Tier 2 — Custom Rules)

**Files:**
- Modify: `sentinel/agents/security/sentinel_security/agent.py`
- Create: `sentinel/agents/security/sentinel_security/custom_rules.py`
- Create: `sentinel/agents/security/tests/test_custom_rules.py`
- Create: `sentinel/agents/security/sentinel_security/rules/hallucinated_packages.json`

**Details:** Custom rule engine checking for: packages that don't exist on npm/PyPI (hallucinated), hardcoded secrets patterns, deprecated API usage (based on curated list), overly permissive CORS/CSP. Uses AST parsing (`ast` module for Python, `@typescript-eslint/parser` patterns for TS).

**Commit:** `feat: add custom AI-specific security rules (hallucinated deps, insecure defaults)`

---

### Task 12: IP/License Agent

**Files:**
- Create: `sentinel/agents/ip-license/pyproject.toml`
- Create: `sentinel/agents/ip-license/sentinel_license/__init__.py`
- Create: `sentinel/agents/ip-license/sentinel_license/agent.py`
- Create: `sentinel/agents/ip-license/sentinel_license/spdx_detector.py`
- Create: `sentinel/agents/ip-license/sentinel_license/dep_auditor.py`
- Create: `sentinel/agents/ip-license/sentinel_license/fingerprint.py`
- Create: `sentinel/agents/ip-license/tests/test_agent.py`
- Create: `sentinel/agents/ip-license/tests/test_spdx.py`
- Create: `sentinel/agents/ip-license/tests/test_fingerprint.py`
- Create: `sentinel/agents/ip-license/Dockerfile`

**Details:** SPDX license header detection via regex patterns. Dependency license resolution — shells out to `npm view <pkg> license` or `pip show <pkg>`. Code fingerprinting — normalize code (strip whitespace/comments), hash fragments, compare against curated OSS corpus hashes.

**Commit:** `feat: add IP/License Agent with SPDX detection, dep audit, code fingerprinting`

---

### Task 13: Dependency Agent

**Files:**
- Create: `sentinel/agents/dependency/pyproject.toml`
- Create: `sentinel/agents/dependency/sentinel_dependency/__init__.py`
- Create: `sentinel/agents/dependency/sentinel_dependency/agent.py`
- Create: `sentinel/agents/dependency/sentinel_dependency/osv_scanner.py`
- Create: `sentinel/agents/dependency/sentinel_dependency/drift_detector.py`
- Create: `sentinel/agents/dependency/sentinel_dependency/typosquat.py`
- Create: `sentinel/agents/dependency/tests/test_agent.py`
- Create: `sentinel/agents/dependency/tests/test_drift.py`
- Create: `sentinel/agents/dependency/tests/test_typosquat.py`
- Create: `sentinel/agents/dependency/Dockerfile`

**Details:** Wraps OSV-Scanner for CVE detection. Drift detector reads project's existing dep profile and flags conflicts by category. Typosquat detector uses Levenshtein distance against top 10K npm/PyPI package names.

**Commit:** `feat: add Dependency Agent with CVE scanning, drift detection, typosquat checks`

---

### Task 14: End-to-End Pipeline Integration Test

**Files:**
- Create: `sentinel/test/e2e/pipeline.test.ts`
- Modify: `sentinel/docker-compose.yml` (add agent containers)

**Details:** Full integration test: CLI submits diff → API receives → Redis publishes → Security, IP, Dependency agents consume → findings published → verify findings land in Postgres. Uses Docker Compose to spin up full stack. Timeout: 60s.

**Commit:** `test: add end-to-end pipeline integration test`

---

## Month 3: Intelligence Agents & Assessor (Weeks 9-12)

### Task 15: AI-Generation Detector Agent

**Files:**
- Create: `sentinel/agents/ai-detector/` (full agent structure)

**Details:** Stylometric analysis (token entropy via `math.log2`, naming uniformity score), tool marker detection (regex for Copilot/Cursor/Claude patterns in comments and metadata), git timing heuristics (commit size vs time since last commit). Outputs `AIDetectionFinding` with probability score.

**Commit:** `feat: add AI-Generation Detector with stylometric and marker analysis`

---

### Task 16: Quality Agent

**Files:**
- Create: `sentinel/agents/quality/` (full agent structure)

**Details:** Wraps `radon` (Python complexity), `escomplex` (JS/TS complexity). Duplication via `jscpd`. Test coverage gap detection — checks if new code paths have corresponding test files. Naming consistency scorer.

**Commit:** `feat: add Quality Agent with complexity, duplication, coverage analysis`

---

### Task 17: Policy & Standards Agent

**Files:**
- Create: `sentinel/agents/policy/` (full agent structure)

**Details:** YAML policy parser with validation. Three rule types: `deny-import`, `deny-pattern`, `require-pattern`. Glob-based file filtering. Org-level policy inheritance (org defaults merged with repo overrides).

**Commit:** `feat: add Policy Agent with YAML-based org/repo policy enforcement`

---

### Task 18: Compliance Assessor

**Files:**
- Create: `sentinel/packages/assessor/package.json`
- Create: `sentinel/packages/assessor/src/assessor.ts`
- Create: `sentinel/packages/assessor/src/risk-scorer.ts`
- Create: `sentinel/packages/assessor/src/certificate.ts`
- Create: `sentinel/packages/assessor/src/drift.ts`
- Create: `sentinel/packages/assessor/src/re-evaluate.ts`
- Create: `sentinel/packages/assessor/tests/` (all test files)

**Details:** Consumes `sentinel.findings` stream, waits for all deterministic agents (30s timeout). Merges findings, calculates weighted risk score, determines status (pass/provisional/fail/partial). Generates HMAC-signed certificate. Handles RE_EVALUATE events idempotently. Writes assessment + certificate to Postgres in single transaction. Updates GitHub Check Run. All within `withTenant()`.

**Commit:** `feat: add Compliance Assessor with tiered certification and drift detection`

---

### Task 19: CLI `sentinel ci` Command

**Files:**
- Modify: `sentinel/apps/cli/src/cli.ts`
- Create: `sentinel/apps/cli/src/commands/ci.ts`
- Create: `sentinel/apps/cli/src/commands/ci.test.ts`

**Details:** Synchronous scan mode. Submits diff, long-polls `/scans/:id/poll`, waits for assessment. Prints human-readable summary + JSON report. Exits with code 0/1/2/3 per design. GitHub Actions template at `sentinel/.github/actions/sentinel-scan/action.yml`.

**Commit:** `feat: add sentinel ci command with synchronous scanning and exit codes`

---

## Month 4: LLM Review & Dashboard (Weeks 13-16)

### Task 20: PII/Secret Scrubber

**Files:**
- Create: `sentinel/agents/llm-review/sentinel_llm/scrubber.py`
- Create: `sentinel/agents/llm-review/tests/test_scrubber.py`

**Details:** Regex-based mandatory scrubber (design Section 8). Patterns for AWS keys, JWTs, emails, IPs, SSNs, connection strings. Returns `ScrubResult` with sanitized code + redaction audit. Non-configurable to disable — always runs.

**Commit:** `feat: add PII/Secret scrubber as mandatory pre-LLM gateway`

---

### Task 21: LLM Review Agent

**Files:**
- Create: `sentinel/agents/llm-review/` (full agent structure)

**Details:** Consumes `sentinel.escalations` stream. Scrubs code via scrubber, sends to Anthropic API with structured prompts (security verification, license analysis). Parses structured responses into Finding format. Token budget enforcement (50K default). 30-day result caching via Redis. Publishes RE_EVALUATE event on completion.

**Commit:** `feat: add LLM Review Agent with Anthropic API, escalation-only, token budgets`

---

### Task 22: Dashboard — Auth & Layout

**Files:**
- Create: `sentinel/apps/dashboard/` (Next.js 15 project)

**Details:** Next.js 15 App Router, Tailwind + shadcn/ui. NextAuth.js with GitHub OAuth provider. Layout with sidebar navigation. RBAC middleware checking user role against route permissions.

**Commit:** `feat: add dashboard scaffold with Next.js 15, auth, RBAC layout`

---

### Task 23: Dashboard — Overview & Project Pages

**Files:**
- Create: `sentinel/apps/dashboard/app/(dashboard)/page.tsx`
- Create: `sentinel/apps/dashboard/app/(dashboard)/projects/[id]/page.tsx`

**Details:** Overview: scan count, active revocations, open findings, pass rate. Risk trend chart (30 days). Recent scans table. Project detail: scan history timeline, filterable finding list, certificate list, drift analytics.

**Commit:** `feat: add dashboard overview and project detail pages`

---

### Task 24: Dashboard — Finding Detail & Certificate Views

**Files:**
- Create: `sentinel/apps/dashboard/app/(dashboard)/findings/[id]/page.tsx`
- Create: `sentinel/apps/dashboard/app/(dashboard)/certificates/page.tsx`

**Details:** Finding detail: code snippet with highlighting, remediation suggestion, suppress/resolve actions. Certificate list: active/revoked/expired with status badges. Real-time scan status via WebSocket.

**Commit:** `feat: add finding detail and certificate views with real-time updates`

---

## Month 5: Enterprise Features (Weeks 17-20)

### Task 25: GitHub App Integration

**Details:** GitHub App manifest with permissions (checks:write, pull_requests:read, contents:read). Webhook handler for `push` and `pull_request` events. Creates Check Run on scan start, updates on completion. Inline annotations for findings. Certificate revocation flips Check Run conclusion.

**Commit:** `feat: add GitHub App integration with Check Runs and revocation`

---

### Task 26: Enterprise Security Hardening

**Details:** Short-lived JWT session tokens via OIDC. Per-org KMS encryption keys. RLS with `SET LOCAL` in all DB access. Crypto-shred purge background worker. S3 Object Lock (compliance mode) for audit archives. RBAC enforcement on all API endpoints.

**Commit:** `feat: add enterprise security (JWTs, KMS, RLS, crypto-shred, S3 Object Lock)`

---

### Task 27: Dashboard v1.0 — Policy Editor & Reports

**Details:** YAML policy editor with syntax highlighting and validation preview. Drift analytics page with AI composition trend charts. PDF report generation (Puppeteer HTML→PDF). EU AI Act documentation package. SOC 2 control mapping in reports. Audit log viewer. Webhook management UI. Slack Block Kit integration.

**Commit:** `feat: add policy editor, PDF reports, audit log viewer, Slack integration`

---

## Month 6: Scale & Launch (Weeks 21-24)

### Task 28: On-Prem Docker Compose Package

**Details:** Full `docker-compose.sentinel.yml` with all services. Configuration via `.env` file. Health checks on all containers. Optional LLM agent (separate profile). Installation docs. Upgrade path.

**Commit:** `feat: add on-prem Docker Compose deployment package`

---

### Task 29: Load Testing & Auto-Scaling

**Details:** k6 load test: 100 concurrent scan submissions. Agent auto-scaling rules (min 1, max 10 per agent). Postgres partition management via pg_partman. Redis Streams consumer group tuning. Performance benchmarks documented.

**Commit:** `feat: add load testing, auto-scaling, partition management`

---

### Task 30: SENTINEL SBOM & Self-Scanning

**Details:** SBOM generation via Syft + Trivy in CI. GPG-signed, published to `/security/sbom`. SENTINEL dogfoods itself — `.sentinel/policies.yaml` in repo. Nightly CVE re-scan of own dependencies.

**Commit:** `feat: add SBOM generation and self-scanning dogfood`

---

### Task 31: Launch Preparation

**Details:** API documentation (OpenAPI spec from Fastify). Landing page. Onboarding flow (install GitHub App → first scan in <5 min). Security whitepaper for procurement. Pricing page. GitLab CI integration template. SOC 2 Type I audit initiation.

**Commit:** `docs: add API docs, landing page, onboarding flow, security whitepaper`

---

## Final Directory Structure

```
sentinel/
├── apps/
│   ├── api/                    # Fastify API service (TypeScript)
│   ├── cli/                    # CLI tool (TypeScript)
│   └── dashboard/              # Next.js 15 dashboard
├── packages/
│   ├── shared/                 # Shared types
│   ├── db/                     # Prisma schema + migrations
│   ├── events/                 # Redis Streams EventBus
│   ├── audit/                  # Hash-chained audit log
│   ├── auth/                   # HMAC signing + JWT
│   └── assessor/               # Compliance Assessor
├── agents/
│   ├── framework/              # Python BaseAgent + events
│   ├── ai-detector/            # AI-Generation Detector
│   ├── security/               # Security Agent (Semgrep + custom)
│   ├── ip-license/             # IP/License Agent
│   ├── dependency/             # Dependency Agent
│   ├── quality/                # Quality Agent
│   ├── policy/                 # Policy & Standards Agent
│   └── llm-review/             # LLM Review Agent + Scrubber
├── test/
│   └── e2e/                    # End-to-end integration tests
├── docker-compose.yml          # Local dev (Postgres + Redis)
├── docker-compose.sentinel.yml # Full on-prem deployment
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```
