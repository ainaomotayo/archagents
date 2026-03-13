# Remediation Tracking Dashboard — Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Unified remediation tracking dashboard that serves compliance managers (strategic, framework-level) and security engineers (tactical, finding-level), with parent-child task hierarchy, priority scoring with SLA decay, hybrid table/kanban views, real-time toast notifications, and outbound Jira/GitHub Issues integration.

**Architecture:** Modular monolith — core CRUD in existing Fastify API, integration worker subscribes to Redis Stream events for async Jira/GitHub outbound calls. Dashboard uses hybrid table (default) + kanban toggle with SSE toast notifications triggering targeted refetches.

**Tech Stack:** Prisma 6, PostgreSQL, Fastify 5, Redis Streams, Next.js 15, SSE, Jira REST API v3, GitHub REST API

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
  frameworkSlug    String?   @map("framework_slug")        // nullable (finding-level has none)
  controlCode      String?   @map("control_code")          // nullable
  title            String
  description      String
  status           String    @default("open")
  priority         String    @default("medium")
  assignedTo       String?   @map("assigned_to")
  dueDate          DateTime? @map("due_date")
  completedAt      DateTime? @map("completed_at")
  completedBy      String?   @map("completed_by")
  evidenceNotes    String?   @map("evidence_notes")
  linkedFindingIds String[]  @map("linked_finding_ids")
  createdBy        String    @map("created_by")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  // New fields
  parentId         String?   @map("parent_id") @db.Uuid
  findingId        String?   @map("finding_id") @db.Uuid
  itemType         String    @default("compliance") @map("item_type")  // "compliance" | "finding"
  priorityScore    Int       @default(0) @map("priority_score")
  externalRef      String?   @map("external_ref")                      // "jira:PROJ-123" | "github:owner/repo#45"

  // Relations
  parent           RemediationItem?  @relation("RemediationTree", fields: [parentId], references: [id])
  children         RemediationItem[] @relation("RemediationTree")
  finding          Finding?          @relation(fields: [findingId], references: [id])
  organization     Organization      @relation(fields: [orgId], references: [id])

  // Indexes
  @@index([orgId, status, priorityScore], map: "idx_remediation_queue")
  @@index([orgId, dueDate], map: "idx_remediation_due")
  @@index([orgId, itemType, status], map: "idx_remediation_type_status")
  @@index([parentId], map: "idx_remediation_parent")
  @@index([findingId], map: "idx_remediation_finding")
  @@map("remediation_items")
}
```

### New IntegrationConfig Model

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

### State Machine

```
open → in_progress → completed (terminal)
open → accepted_risk (terminal)
in_progress → open (reopen)
in_progress → accepted_risk (terminal)
```

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

### Event Topics

```
remediation.created    → new item created
remediation.updated    → status/priority/assignment changed
remediation.completed  → item reached terminal state
remediation.overdue    → SLA breach detected by cron
remediation.linked     → external issue created
```

---

## Dashboard Components

### Pages

```
/remediations          → Main queue (stats + filters + hybrid table/kanban)
/remediations/[id]     → Detail (item + children + actions + evidence + activity)
```

### Component Tree

```
components/remediations/
├── remediation-stats-bar.tsx       # open, inProgress, overdue, completed, avgResolution, slaCompliance
├── remediation-table.tsx           # expandable parent rows, sorted by priorityScore
├── remediation-kanban.tsx          # 4 columns, drag-and-drop, child progress badges
├── remediation-card.tsx            # shared between table row and kanban card
├── remediation-detail-panel.tsx    # full detail with children, actions, evidence, activity log
├── remediation-create-modal.tsx    # type selector, parent picker, finding linker
├── remediation-filters.tsx         # type, status, priority, assignee, framework
├── view-toggle.tsx                 # table ↔ kanban, persisted in localStorage
└── external-link-modal.tsx         # Jira/GitHub provider selector, project/repo picker
```

### Key Behaviors

- **Table (default):** Parents expandable with ▶ chevron, children indented. Sorted by priorityScore desc.
- **Kanban (toggle):** Top-level items only. Cards show "2/3 ✓" child progress. Drag = status change.
- **SSE:** Lightweight `{ type, itemId }` → toast → click navigates → targeted refetch.
- **Create:** From `/remediations` (modal) or from `/findings/[id]` (pre-filled button).

---

## Integration Worker

**File:** `apps/api/src/workers/remediation-integration.ts`

Subscribes to `remediation.*` events on existing EventBus. Handles outbound Jira/GitHub calls async with 3x retry + exponential backoff. Failures logged to DLQ, never block core workflow.

**Jira outbound:** createIssue, transitionIssue, addComment (SLA breach)
**GitHub outbound:** createIssue, closeIssue, addComment, addLabels

**Credentials:** Stored encrypted in `integration_configs.config` using existing DEK encryption. Never returned to dashboard.

---

## Cron Jobs

1. **Score refresh (every 15 min):** Batch UPDATE recalculating SLA decay for all active items.
2. **Overdue detection (every hour):** SELECT overdue items, publish `remediation.overdue` events.

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

---

## Security

- Input validation: title (max 500), description (max 5000), evidenceNotes (max 10000), enums for status/priority/itemType
- Multi-tenancy: `withTenant()` + RLS, defense in depth
- Credentials: encrypted at rest, never returned to client
- XSS: React auto-escaping, no dangerouslySetInnerHTML
- Audit: every mutation logged via `auditLog.append()`
- External ref: server-generated only, never from client

---

## Testing

| Layer | New Tests |
|-------|-----------|
| Service unit (parent-child, scoring, roll-up, external) | ~18 |
| Scoring pure function | ~8 |
| API routes (stats, get-by-id, link-external, filters) | ~12 |
| Dashboard (table logic, card, stats, mock data) | ~27 |
| RBAC enforcement | ~6 |
| **Total** | **~71** |

---

## Not in Scope (v2)

- Two-way Jira/GitHub sync (inbound webhooks)
- Custom workflow stages beyond 4-status FSM
- Evidence file upload (v1 is text notes only)
- Auto-remediation (agent-generated fix PRs)
- Burndown/velocity charts
