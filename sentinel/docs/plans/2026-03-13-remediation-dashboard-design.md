# Remediation Tracking Dashboard — Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Unified remediation tracking dashboard that serves compliance managers (strategic, framework-level) and security engineers (tactical, finding-level), with parent-child task hierarchy, priority scoring with SLA decay, hybrid table/kanban views, real-time toast notifications, outbound Jira/GitHub Issues integration, custom workflow stages, evidence file uploads, auto-remediation PRs, burndown/velocity charts, and two-way Jira/GitHub sync.

**Architecture:** Modular monolith — core CRUD in existing Fastify API, integration worker subscribes to Redis Stream events for async Jira/GitHub outbound calls, inbound webhook routes for two-way sync. Dashboard uses hybrid table (default) + kanban toggle with SSE toast notifications triggering targeted refetches.

**Tech Stack:** Prisma 6, PostgreSQL, Fastify 5, Redis Streams, Next.js 15, SSE, Jira REST API v3, GitHub REST API, @aws-sdk/s3-request-presigner, @octokit/rest, Recharts

---

## Approach Analysis

### Algorithms (Prioritization & Scoring)

| # | Approach | Verdict | Rationale |
|---|----------|---------|-----------|
| 1 | Static weighted sum | Base | Auditable for compliance, O(n log n) |
| 2 | Exponential SLA decay | Layered on top | Captures urgency dynamics static misses |
| 3 | MCDA/TOPSIS | Rejected | Poor explainability — auditors can't interpret "closeness coefficient" |

**Decision: Hybrid 1+2.** Weighted scoring (priority=0-40, SLA=0-40, blast_radius=0-20, max=100) with exponential decay as deadline approaches. Score materialized on write + 15-min cron refresh.

### Data Structures (Storage & Query)

| # | Approach | Verdict | Rationale |
|---|----------|---------|-----------|
| 1 | Flat table + self-ref FK | Selected | Max depth 2, Prisma-native, simple queries |
| 2 | Materialized path | Rejected | Write amplification on reparent, overkill for depth 2 |
| 3 | Closure table | Rejected | Extra table + joins, designed for arbitrary depth |

**Decision: Approach 1.** `parent_id` self-referential FK. `WHERE parent_id IS NULL` for top-level, single join for children. Recursive CTEs unnecessary at depth 2.

### System Design (Architecture)

| # | Approach | Verdict | Rationale |
|---|----------|---------|-----------|
| 1 | Monolithic extension | Base | Fast, simple, uses existing infra |
| 2 | Microservice extraction | Rejected | Premature — adds distributed system complexity for O(10)/day changes |
| 3 | Modular monolith + integration worker | Selected | Core stays fast, external API calls isolated |

**Decision: Hybrid 1+3.** Core CRUD in monolith. Integration worker subscribes to `remediation.*` events, handles Jira/GitHub outbound async. Failures don't block core workflow.

### Software Design (Patterns)

| # | Approach | Verdict | Rationale |
|---|----------|---------|-----------|
| 1 | Feature-sliced architecture | Directory structure | Matches existing codebase (approvals, compliance) |
| 2 | Clean Architecture | Rejected | Repository interfaces wrapping Prisma adds ~20 files of indirection for zero gain |
| 3 | DDD Lite (tactical patterns) | Domain logic | Value objects for status/priority, domain methods for scoring/transitions |

**Decision: Hybrid 1+3.** Feature-sliced directories + DDD Lite for domain logic. No ceremony — Prisma IS the repository, service IS the use case.

---

## Data Model

### Extended RemediationItem

```prisma
model RemediationItem {
  id               String    @id @default(uuid()) @db.Uuid
  orgId            String    @map("org_id") @db.Uuid
  frameworkSlug    String?   @map("framework_slug")
  controlCode      String?   @map("control_code")
  title            String
  description      String
  status           String    @default("open")
  priority         String    @default("medium")
  assignedTo       String?   @map("assigned_to")
  dueDate          DateTime? @map("due_date") @db.Timestamptz
  completedAt      DateTime? @map("completed_at") @db.Timestamptz
  completedBy      String?   @map("completed_by")
  evidenceNotes    String?   @map("evidence_notes")
  linkedFindingIds String[]  @map("linked_finding_ids")
  createdBy        String    @map("created_by")
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt        DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  // Parent-child hierarchy
  parentId         String?   @map("parent_id") @db.Uuid
  findingId        String?   @map("finding_id") @db.Uuid
  itemType         String    @default("compliance") @map("item_type")  // "compliance" | "finding"
  priorityScore    Int       @default(0) @map("priority_score")
  externalRef      String?   @map("external_ref")                      // "jira:PROJ-123" | "github:owner/repo#45"

  // Relations
  parent           RemediationItem?    @relation("RemediationTree", fields: [parentId], references: [id])
  children         RemediationItem[]   @relation("RemediationTree")
  finding          Finding?            @relation(fields: [findingId], references: [id])
  organization     Organization        @relation(fields: [orgId], references: [id])
  evidenceAttachments EvidenceAttachment[]

  // Indexes
  @@index([orgId, status, priorityScore], map: "idx_remediation_queue")
  @@index([orgId, dueDate], map: "idx_remediation_due")
  @@index([orgId, itemType, status], map: "idx_remediation_type_status")
  @@index([parentId], map: "idx_remediation_parent")
  @@index([findingId], map: "idx_remediation_finding")
  @@map("remediation_items")
}
```

### IntegrationConfig Model

```prisma
model IntegrationConfig {
  id        String   @id @default(uuid()) @db.Uuid
  orgId     String   @map("org_id") @db.Uuid
  provider  String                                    // "jira" | "github"
  config    Json                                      // encrypted credentials
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  organization Organization @relation(fields: [orgId], references: [id])

  @@unique([orgId, provider])
  @@map("integration_configs")
}
```

### EvidenceAttachment Model

```prisma
model EvidenceAttachment {
  id               String   @id @default(uuid()) @db.Uuid
  orgId            String   @map("org_id") @db.Uuid
  remediationId    String   @map("remediation_id") @db.Uuid
  fileName         String   @map("file_name")
  fileSize         Int      @map("file_size")
  mimeType         String   @map("mime_type")
  s3Key            String   @map("s3_key")
  uploadedBy       String   @map("uploaded_by")
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz

  remediation RemediationItem @relation(fields: [remediationId], references: [id])
  organization Organization @relation(fields: [orgId], references: [id])

  @@index([remediationId])
  @@index([orgId])
  @@map("evidence_attachments")
}
```

### RemediationSnapshot Model (for burndown/velocity)

```prisma
model RemediationSnapshot {
  id            String   @id @default(uuid()) @db.Uuid
  orgId         String   @map("org_id") @db.Uuid
  snapshotDate  DateTime @map("snapshot_date") @db.Date
  scope         String   @default("org")                  // "org" | "framework" | "assignee" | "project"
  scopeValue    String?  @map("scope_value")              // framework slug, assignee id, etc.
  openCount     Int      @map("open_count")
  inProgressCount Int    @map("in_progress_count")
  completedCount  Int    @map("completed_count")
  acceptedRiskCount Int  @map("accepted_risk_count")
  avgResolutionHours Float? @map("avg_resolution_hours")
  createdAt     DateTime @default(now()) @map("created_at")

  organization Organization @relation(fields: [orgId], references: [id])

  @@unique([orgId, snapshotDate, scope, scopeValue])
  @@index([orgId, scope, snapshotDate])
  @@map("remediation_snapshots")
}
```

### WorkflowConfig Model (for custom workflow)

```prisma
model WorkflowConfig {
  id            String   @id @default(uuid()) @db.Uuid
  orgId         String   @map("org_id") @db.Uuid
  skipStages    String[] @map("skip_stages")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  organization Organization @relation(fields: [orgId], references: [id])

  @@unique([orgId])
  @@map("workflow_configs")
}
```

---

## Custom Workflow State Machine

### 8 Predefined Stages

```
open -> assigned -> in_progress -> in_review -> awaiting_deployment -> completed (terminal)
open -> accepted_risk (terminal, from any non-terminal)
* -> blocked (from any non-terminal, reversible to previous)
```

**Full stage set:** `open`, `assigned`, `in_progress`, `in_review`, `awaiting_deployment`, `completed`, `accepted_risk`, `blocked`

**Per-org configuration:** `WorkflowConfig.skipStages` allows orgs to skip stages (e.g., small teams skip `in_review` and `awaiting_deployment`). The FSM computes the next valid stage by skipping disabled ones.

### Transition Rules

```typescript
WORKFLOW_STAGES = ["open", "assigned", "in_progress", "in_review", "awaiting_deployment", "completed"];
TERMINAL = new Set(["completed", "accepted_risk"]);

// Forward: next stage in sequence (skipping disabled)
// Backward: previous stage (reopen)
// Special: any non-terminal -> accepted_risk | blocked
// Blocked -> previous non-blocked state
```

**Backward compatibility:** Existing 4-status data maps directly — `open`/`in_progress`/`completed`/`accepted_risk` are preserved. New stages interleave naturally.

---

## Priority Scoring Algorithm

```
score = base_priority + sla_urgency + blast_radius  (max 100)

base_priority (0-40):  critical=40, high=30, medium=15, low=5
sla_urgency   (0-40):  overdue=40, else 40 * e^(-hours_left / 24)
blast_radius  (0-20):  4 * linked_finding_count, capped at 20

Parent roll-up: parent_score = max(own_score, max(children_scores))
```

**When computed:**
- On every create/update (immediate)
- Cron every 15 min (SLA decay refresh for all active items)

---

## API Endpoints

### Core Remediation

| Method | Path | Purpose | RBAC |
|--------|------|---------|------|
| POST | `/v1/compliance/remediations` | Create (compliance or finding) | admin, manager |
| GET | `/v1/compliance/remediations` | List with filters + pagination | all |
| GET | `/v1/compliance/remediations/stats` | Aggregate stats | all |
| GET | `/v1/compliance/remediations/overdue` | Overdue items | all |
| GET | `/v1/compliance/remediations/:id` | Single item + children | all |
| PATCH | `/v1/compliance/remediations/:id` | Update status/priority/assignment | admin, manager |
| POST | `/v1/compliance/remediations/:id/link-external` | Create Jira/GitHub issue | admin, manager |
| GET | `/v1/compliance/remediations/stream` | SSE toast notifications | all |

### Evidence Upload

| Method | Path | Purpose | RBAC |
|--------|------|---------|------|
| POST | `/v1/compliance/remediations/:id/evidence/presign` | Get S3 presigned upload URL | admin, manager |
| POST | `/v1/compliance/remediations/:id/evidence/confirm` | Confirm upload, create DB record | admin, manager |
| GET | `/v1/compliance/remediations/:id/evidence` | List evidence attachments | all |
| GET | `/v1/compliance/remediations/:id/evidence/:eid/url` | Get presigned download URL | all |
| DELETE | `/v1/compliance/remediations/:id/evidence/:eid` | Delete attachment | admin, manager |

### Charts/Analytics

| Method | Path | Purpose | RBAC |
|--------|------|---------|------|
| GET | `/v1/compliance/remediations/charts/burndown` | Burndown chart data | all |
| GET | `/v1/compliance/remediations/charts/velocity` | Velocity chart data | all |
| GET | `/v1/compliance/remediations/charts/aging` | Aging distribution | all |
| GET | `/v1/compliance/remediations/charts/sla` | SLA compliance rate | all |

### Auto-Remediation

| Method | Path | Purpose | RBAC |
|--------|------|---------|------|
| POST | `/v1/compliance/remediations/:id/auto-fix` | Trigger auto-remediation | admin, manager |
| GET | `/v1/compliance/remediations/:id/auto-fix/status` | Check fix PR status | all |

### Workflow Config

| Method | Path | Purpose | RBAC |
|--------|------|---------|------|
| GET | `/v1/compliance/workflow-config` | Get org workflow config | admin, manager |
| PUT | `/v1/compliance/workflow-config` | Update org workflow config | admin |

### Inbound Webhooks (Two-Way Sync)

| Method | Path | Purpose | RBAC |
|--------|------|---------|------|
| POST | `/webhooks/jira` | Jira webhook receiver | none (HMAC) |
| POST | `/webhooks/integration/github` | GitHub integration webhook | none (HMAC) |

### Event Topics

```
remediation.created      -> new item created
remediation.updated      -> status/priority/assignment changed
remediation.completed    -> item reached terminal state
remediation.overdue      -> SLA breach detected by cron
remediation.linked       -> external issue created
remediation.evidence     -> evidence uploaded/deleted
remediation.auto_fix     -> auto-remediation PR created
remediation.synced       -> inbound sync from external system
```

---

## Dashboard Components

### Pages

```
/remediations             -> Main queue (stats + filters + hybrid table/kanban)
/remediations/[id]        -> Detail (item + children + actions + evidence + activity)
/remediations/charts      -> Burndown/velocity/aging/SLA charts
/settings/workflow        -> Workflow stage configuration
```

### Component Tree

```
components/remediations/
├── remediation-stats-bar.tsx       # open, inProgress, overdue, completed, avgResolution, slaCompliance
├── remediation-table.tsx           # expandable parent rows, sorted by priorityScore
├── remediation-kanban.tsx          # columns per active workflow stage, drag-and-drop
├── remediation-card.tsx            # shared between table row and kanban card
├── remediation-detail-panel.tsx    # full detail with children, actions, evidence, activity log
├── remediation-create-modal.tsx    # type selector, parent picker, finding linker
├── remediation-filters.tsx         # type, status, priority, assignee, framework
├── view-toggle.tsx                 # table <-> kanban, persisted in localStorage
├── external-link-modal.tsx         # Jira/GitHub provider selector, project/repo picker
├── evidence-upload.tsx             # drag-drop file upload, progress bar, file list
├── burndown-chart.tsx              # Recharts area chart with scope selector
├── velocity-chart.tsx              # Recharts bar chart (completed per period)
├── aging-chart.tsx                 # Recharts stacked bar (age buckets)
├── sla-chart.tsx                   # Recharts line chart (SLA compliance over time)
├── auto-fix-button.tsx             # trigger auto-remediation, show PR link
└── workflow-config-editor.tsx      # toggle stages on/off per org
```

### Key Behaviors

- **Table (default):** Parents expandable with chevron, children indented. Sorted by priorityScore desc.
- **Kanban (toggle):** Columns match active workflow stages. Cards show child progress. Drag = status change.
- **SSE:** Lightweight `{ type, itemId }` -> toast -> click navigates -> targeted refetch.
- **Create:** From `/remediations` (modal) or from `/findings/[id]` (pre-filled button).
- **Charts:** Scope selector (org/framework/assignee/project), date range picker, 30/60/90 day presets.

---

## Evidence File Upload

**Flow:** Client requests presigned URL -> uploads directly to S3 -> confirms with API -> API creates DB metadata record.

- **Max file size:** 25MB
- **Allowed types:** PDF, PNG, JPG, CSV, JSON, TXT, MD, XLSX
- **S3 key:** `evidence/{orgId}/{remediationId}/{uuid}/{fileName}`
- **Presigned URL TTL:** 15 minutes (upload), 1 hour (download)
- **Uses existing `@aws-sdk/client-s3`** from `packages/security` + adds `@aws-sdk/s3-request-presigner`

---

## Auto-Remediation

### Fix Strategies

1. **Dependency upgrade** — Parse manifest, bump vulnerable package to fixed version, create PR
2. **Semgrep autofix** — Apply Semgrep rule `fix:` patterns to generate code patches
3. **Config patch** — Template-based fixes for common misconfigurations (e.g., enable HTTPS, set secure headers)

### Modes (per-org configurable)

- **Draft PR (default):** Creates a draft PR for human review. Links PR URL back to remediation item.
- **Autonomous:** Creates a regular PR, auto-merges if CI passes. High-severity items still require ApprovalGate.

### Flow

1. User clicks "Auto-Fix" on a remediation item with a linked finding
2. API validates finding has a known fix strategy
3. Worker clones repo, applies fix, creates branch, pushes, creates PR via Octokit
4. PR URL stored as `externalRef`, remediation status updated
5. In Autonomous mode: high-severity -> creates ApprovalGate for human sign-off

---

## Burndown/Velocity Charts

### Data Collection

**`RemediationSnapshotJob`** — New scheduler job, runs daily at 2am UTC. For each org, captures counts by status at 4 scopes: org, framework, assignee, project.

### Chart Types

1. **Burndown** — Area chart: open + in_progress items over time. Shows trend toward zero.
2. **Velocity** — Bar chart: items completed per week/sprint. Shows throughput.
3. **Aging** — Stacked bar: open items by age bucket (0-7d, 7-14d, 14-30d, 30d+).
4. **SLA Compliance** — Line chart: % of items resolved before due date, over time.

### Scope Drill-Down

Charts accept `scope` (org|framework|assignee|project) and `scopeValue` query params. Default is org-level. Multi-series overlay for team comparison.

---

## Two-Way Jira/GitHub Sync

### Inbound Webhook Processing

Dedicated routes receive webhooks from Jira and GitHub. HMAC verification using secrets stored in `IntegrationConfig`.

### Sync Scope

Status changes, assignment changes, and comments sync bidirectionally. Field mapping is configurable per integration.

### Status Mapping (configurable defaults)

| Jira Status | Sentinel Status |
|-------------|-----------------|
| To Do | open |
| In Progress | in_progress |
| In Review | in_review |
| Done | completed |

| GitHub State | Sentinel Status |
|--------------|-----------------|
| open | open |
| closed | completed |

### Conflict Resolution

- **Last-write-wins** with timestamp comparison
- **Echo prevention:** Comments/updates originating from Sentinel are tagged with `[Sentinel]` prefix. Inbound webhook handler ignores updates with this prefix.
- **Sync log:** Every inbound sync is logged as `remediation.synced` event for audit trail

### Security

- HMAC verification on every inbound webhook (Jira: shared secret header, GitHub: `X-Hub-Signature-256`)
- Rate limiting disabled on webhook routes (matching existing pattern)
- Raw body parsing preserved for signature verification

---

## Integration Worker

**File:** `apps/api/src/workers/remediation-integration.ts`

Subscribes to `remediation.*` events on existing EventBus. Handles outbound Jira/GitHub calls async with 3x retry + exponential backoff. Failures logged to DLQ, never block core workflow.

**Outbound operations:**
- Jira: createIssue, transitionIssue, addComment (SLA breach), updateAssignee
- GitHub: createIssue, closeIssue, addComment, addLabels, updateAssignees

**Inbound processing:**
- Parse webhook payload, match to `externalRef`, apply status/assignment/comment changes

**Credentials:** Stored encrypted in `integration_configs.config` using existing DEK encryption. Never returned to dashboard.

---

## Cron Jobs

1. **Score refresh (every 15 min):** Batch UPDATE recalculating SLA decay for all active items.
2. **Overdue detection (every hour):** SELECT overdue items, publish `remediation.overdue` events.
3. **Snapshot collection (daily 2am):** Capture burndown/velocity snapshot per org/scope.

All jobs follow existing `SchedulerJob` interface pattern with `name`, `schedule`, `tier`, `dependencies`, `execute(ctx)`.

---

## Error Handling

| Condition | HTTP | Pattern |
|-----------|------|---------|
| Not found / wrong org | 404 | "Remediation item not found" |
| Invalid state transition | 409 | "Cannot transition from X to Y" |
| Invalid parent | 400 | "Parent must be compliance-type in same org" |
| Depth > 2 | 400 | "Maximum nesting depth is 2" |
| Duplicate external link | 409 | "Item already linked to jira:PROJ-123" |
| External API failure | 502 | "Failed to create external issue — will retry" |
| Delete with children | 409 | "Cannot delete item with active children" |
| File too large | 413 | "File exceeds 25MB limit" |
| Invalid file type | 415 | "File type not allowed" |
| No fix strategy | 422 | "No auto-fix strategy available for this finding type" |
| Webhook signature invalid | 401 | "Invalid webhook signature" |
| Skipped stage in workflow | 400 | "Stage X is disabled for this organization" |

---

## Security

- Input validation: title (max 500), description (max 5000), evidenceNotes (max 10000), enums for status/priority/itemType
- Multi-tenancy: `withTenant()` + RLS, defense in depth
- Credentials: encrypted at rest, never returned to client
- XSS: React auto-escaping, no dangerouslySetInnerHTML
- Audit: every mutation logged via `auditLog.append()`
- External ref: server-generated only, never from client
- Evidence: presigned URLs with TTL, S3 key includes orgId for isolation
- Webhooks: HMAC verification with timing-safe comparison
- Auto-fix: ApprovalGate required for high-severity autonomous fixes

---

## Testing

| Layer | New Tests |
|-------|-----------|
| Service unit (parent-child, scoring, roll-up, external) | ~18 |
| Scoring pure function | ~8 |
| Custom workflow FSM | ~10 |
| Evidence upload service | ~6 |
| Auto-remediation service | ~8 |
| Snapshot/chart service | ~6 |
| Two-way sync handler | ~8 |
| API routes (stats, get-by-id, link-external, filters, evidence, charts) | ~18 |
| Dashboard (table, card, stats, kanban, charts, evidence, mock data) | ~35 |
| RBAC enforcement | ~8 |
| Webhook signature verification | ~4 |
| **Total** | **~129** |
