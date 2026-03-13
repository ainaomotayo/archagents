# Remediation Tracking Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unified remediation tracking dashboard with parent-child hierarchy, priority scoring, hybrid table/kanban views, SSE toast notifications, Jira/GitHub outbound + inbound integration, custom workflow stages, evidence file uploads, auto-remediation PRs, and burndown/velocity charts.

**Architecture:** Modular monolith — extend existing Fastify API with new endpoints, add integration worker for async Jira/GitHub calls, inbound webhook routes for two-way sync. Dashboard uses hybrid table/kanban with SSE toast + targeted refetch.

**Tech Stack:** Prisma 6, PostgreSQL, Fastify 5, Redis Streams, Next.js 15, SSE, Vitest, @aws-sdk/s3-request-presigner, @octokit/rest, Recharts

---

## Task 1: Extend Prisma Schema — Add New Fields to RemediationItem

**Files:**
- Modify: `packages/db/prisma/schema.prisma:615-639`
- Create: `packages/db/prisma/migrations/20260313100000_extend_remediation_items/migration.sql`

**Step 1: Modify the RemediationItem model in schema.prisma**

Find the existing model (lines 615-639) and replace it with:

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

  parentId         String?   @map("parent_id") @db.Uuid
  findingId        String?   @map("finding_id") @db.Uuid
  itemType         String    @default("compliance") @map("item_type")
  priorityScore    Int       @default(0) @map("priority_score")
  externalRef      String?   @map("external_ref")

  parent           RemediationItem?  @relation("RemediationTree", fields: [parentId], references: [id])
  children         RemediationItem[] @relation("RemediationTree")
  finding          Finding?          @relation(fields: [findingId], references: [id])
  organization     Organization      @relation(fields: [orgId], references: [id])

  @@index([orgId, status, priorityScore], map: "idx_remediation_queue")
  @@index([orgId, dueDate], map: "idx_remediation_due")
  @@index([orgId, itemType, status], map: "idx_remediation_type_status")
  @@index([parentId], map: "idx_remediation_parent")
  @@index([findingId], map: "idx_remediation_finding")
  @@map("remediation_items")
}
```

Also add backrelation on the `Finding` model (around line 87-114): add `remediationItems RemediationItem[]` to the Finding model.

**Step 2: Write the migration SQL**

Create file `packages/db/prisma/migrations/20260313100000_extend_remediation_items/migration.sql`:

```sql
-- AlterTable: Make framework_slug and control_code nullable
ALTER TABLE "remediation_items" ALTER COLUMN "framework_slug" DROP NOT NULL;
ALTER TABLE "remediation_items" ALTER COLUMN "control_code" DROP NOT NULL;

-- AlterTable: Add new columns
ALTER TABLE "remediation_items" ADD COLUMN "parent_id" UUID;
ALTER TABLE "remediation_items" ADD COLUMN "finding_id" UUID;
ALTER TABLE "remediation_items" ADD COLUMN "item_type" TEXT NOT NULL DEFAULT 'compliance';
ALTER TABLE "remediation_items" ADD COLUMN "priority_score" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "remediation_items" ADD COLUMN "external_ref" TEXT;

-- CreateIndex
CREATE INDEX "idx_remediation_queue" ON "remediation_items"("org_id", "status", "priority_score");
CREATE INDEX "idx_remediation_type_status" ON "remediation_items"("org_id", "item_type", "status");
CREATE INDEX "idx_remediation_parent" ON "remediation_items"("parent_id");
CREATE INDEX "idx_remediation_finding" ON "remediation_items"("finding_id");

-- DropIndex: Replace old index with new composite
DROP INDEX IF EXISTS "remediation_items_org_id_framework_slug_status_idx";

-- AddForeignKey: Self-referential parent
ALTER TABLE "remediation_items" ADD CONSTRAINT "remediation_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "remediation_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Finding relation
ALTER TABLE "remediation_items" ADD CONSTRAINT "remediation_items_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

**Step 3: Generate Prisma client**

Run: `cd packages/db && npx prisma generate`
Expected: "Generated Prisma Client"

**Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260313100000_extend_remediation_items/
git commit -m "feat(db): extend remediation model with parent-child, scoring, external ref"
```

---

## Task 2: Add IntegrationConfig Model

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (add after RemediationItem model)
- Modify: `packages/db/prisma/migrations/20260313100000_extend_remediation_items/migration.sql` (append)

**Step 1: Add IntegrationConfig model to schema.prisma**

Add after the RemediationItem model:

```prisma
model IntegrationConfig {
  id        String   @id @default(uuid()) @db.Uuid
  orgId     String   @map("org_id") @db.Uuid
  provider  String
  config    Json
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz

  organization Organization @relation(fields: [orgId], references: [id])

  @@unique([orgId, provider])
  @@map("integration_configs")
}
```

Add `integrationConfigs IntegrationConfig[]` backrelation on the Organization model.

**Step 2: Append to migration SQL**

```sql
-- CreateTable
CREATE TABLE "integration_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "integration_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_configs_org_id_provider_key" ON "integration_configs"("org_id", "provider");

-- AddForeignKey
ALTER TABLE "integration_configs" ADD CONSTRAINT "integration_configs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

**Step 3: Regenerate Prisma client**

Run: `cd packages/db && npx prisma generate`

**Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260313100000_extend_remediation_items/
git commit -m "feat(db): add IntegrationConfig model for Jira/GitHub integration"
```

---

## Task 3: Priority Scoring Function

**Files:**
- Create: `packages/compliance/src/remediation/priority-score.ts`
- Create: `packages/compliance/src/__tests__/priority-score.test.ts`

**Step 1: Write the failing tests**

Create `packages/compliance/src/__tests__/priority-score.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computePriorityScore } from "../remediation/priority-score.js";

describe("computePriorityScore", () => {
  it("returns base score for critical priority with no due date", () => {
    expect(computePriorityScore({ priority: "critical", dueDate: null, linkedFindingIds: [], findingId: null })).toBe(40);
  });

  it("returns base score for low priority with no due date", () => {
    expect(computePriorityScore({ priority: "low", dueDate: null, linkedFindingIds: [], findingId: null })).toBe(5);
  });

  it("adds max SLA urgency (40) for overdue items", () => {
    const pastDate = new Date(Date.now() - 86400000);
    const score = computePriorityScore({ priority: "low", dueDate: pastDate, linkedFindingIds: [], findingId: null });
    expect(score).toBe(45); // 5 base + 40 overdue
  });

  it("adds blast radius for linked findings", () => {
    const score = computePriorityScore({ priority: "medium", dueDate: null, linkedFindingIds: ["f1", "f2", "f3"], findingId: null });
    expect(score).toBe(27); // 15 base + 0 sla + 12 blast (3*4)
  });

  it("counts findingId in blast radius", () => {
    const score = computePriorityScore({ priority: "medium", dueDate: null, linkedFindingIds: ["f1"], findingId: "f2" });
    expect(score).toBe(23); // 15 base + 0 sla + 8 blast (2*4)
  });

  it("caps blast radius at 20", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `f${i}`);
    const score = computePriorityScore({ priority: "low", dueDate: null, linkedFindingIds: ids, findingId: null });
    expect(score).toBe(25); // 5 base + 0 sla + 20 blast (capped)
  });

  it("caps total score at 100", () => {
    const pastDate = new Date(Date.now() - 86400000);
    const ids = Array.from({ length: 10 }, (_, i) => `f${i}`);
    const score = computePriorityScore({ priority: "critical", dueDate: pastDate, linkedFindingIds: ids, findingId: null });
    expect(score).toBe(100); // 40+40+20 = 100
  });

  it("returns 15 for unknown priority (defaults to medium)", () => {
    expect(computePriorityScore({ priority: "unknown", dueDate: null, linkedFindingIds: [], findingId: null })).toBe(15);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/compliance && npx vitest run src/__tests__/priority-score.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the scoring function**

Create `packages/compliance/src/remediation/priority-score.ts`:

```typescript
const BASE_SCORES: Record<string, number> = {
  critical: 40,
  high: 30,
  medium: 15,
  low: 5,
};

export interface PriorityScoreInput {
  priority: string;
  dueDate: Date | null;
  linkedFindingIds: string[];
  findingId: string | null;
}

export function computePriorityScore(input: PriorityScoreInput): number {
  let score = BASE_SCORES[input.priority] ?? 15;

  // SLA decay (0-40)
  if (input.dueDate) {
    const msLeft = input.dueDate.getTime() - Date.now();
    if (msLeft <= 0) {
      score += 40;
    } else {
      const hoursLeft = msLeft / 3_600_000;
      score += Math.min(40, Math.round(40 * Math.exp(-hoursLeft / 24)));
    }
  }

  // Blast radius (0-20)
  const findingCount = input.linkedFindingIds.length + (input.findingId ? 1 : 0);
  score += Math.min(20, findingCount * 4);

  return Math.min(100, score);
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/compliance && npx vitest run src/__tests__/priority-score.test.ts`
Expected: 8 tests PASS

**Step 5: Export from package index**

Modify `packages/compliance/src/index.ts` — add after the existing RemediationService export (line 37):

```typescript
export { computePriorityScore, type PriorityScoreInput } from "./remediation/priority-score.js";
```

**Step 6: Commit**

```bash
git add packages/compliance/src/remediation/priority-score.ts packages/compliance/src/__tests__/priority-score.test.ts packages/compliance/src/index.ts
git commit -m "feat(compliance): add priority scoring function with SLA decay"
```

---

## Task 4: Extend RemediationService — Parent-Child, Scoring, GetById, Stats

**Files:**
- Modify: `packages/compliance/src/remediation/service.ts:1-95`
- Modify: `packages/compliance/src/__tests__/remediation-service.test.ts:1-111`

**Step 1: Write failing tests for new functionality**

Add to the bottom of `packages/compliance/src/__tests__/remediation-service.test.ts` (before the closing `});`):

```typescript
  // --- Parent-child tests ---

  it("creates a finding-level item with parentId", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "parent-1", orgId: "org-1", itemType: "compliance" });
    mockDb.remediationItem.create.mockResolvedValue({ id: "child-1", parentId: "parent-1", itemType: "finding" });
    mockDb.remediationItem.findMany.mockResolvedValue([]);
    mockDb.remediationItem.update.mockResolvedValue({});

    const result = await service.create("org-1", {
      title: "Fix CVE-2024-1234",
      description: "Upgrade jsonwebtoken",
      itemType: "finding",
      findingId: "f-1",
      parentId: "parent-1",
      createdBy: "user-1",
    });
    expect(result).toHaveProperty("parentId", "parent-1");
  });

  it("rejects parent from different org", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "parent-1", orgId: "org-other", itemType: "compliance" });

    await expect(service.create("org-1", {
      title: "Test", description: "Test", itemType: "finding", parentId: "parent-1", createdBy: "user-1",
    })).rejects.toThrow("not found");
  });

  it("rejects finding-type item as parent", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "parent-1", orgId: "org-1", itemType: "finding" });

    await expect(service.create("org-1", {
      title: "Test", description: "Test", itemType: "finding", parentId: "parent-1", createdBy: "user-1",
    })).rejects.toThrow("compliance-type");
  });

  it("rejects depth > 2 (child of a child)", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "parent-1", orgId: "org-1", itemType: "compliance", parentId: "grandparent-1" });

    await expect(service.create("org-1", {
      title: "Test", description: "Test", itemType: "finding", parentId: "parent-1", createdBy: "user-1",
    })).rejects.toThrow("depth");
  });

  // --- getById ---

  it("returns item with children", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({
      id: "rem-1", orgId: "org-1", children: [{ id: "child-1" }],
    });

    const result = await service.getById("org-1", "rem-1");
    expect(result).toHaveProperty("children");
    expect(result!.children).toHaveLength(1);
  });

  it("returns null for wrong org on getById", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "rem-1", orgId: "org-other" });

    const result = await service.getById("org-1", "rem-1");
    expect(result).toBeNull();
  });

  // --- getStats ---

  it("returns stats with correct shape", async () => {
    mockDb.remediationItem.count
      .mockResolvedValueOnce(5)   // open
      .mockResolvedValueOnce(3)   // inProgress
      .mockResolvedValueOnce(2)   // overdue
      .mockResolvedValueOnce(10)  // completed
      .mockResolvedValueOnce(1);  // acceptedRisk
    mockDb.remediationItem.findMany.mockResolvedValue([]);

    const result = await service.getStats("org-1");
    expect(result).toEqual({
      open: 5,
      inProgress: 3,
      overdue: 2,
      completed: 10,
      acceptedRisk: 1,
      avgResolutionDays: 0,
      slaCompliance: 100,
    });
  });

  // --- Parent roll-up on child update ---

  it("recomputes parent score when child status changes", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({
      id: "child-1", orgId: "org-1", status: "open", parentId: "parent-1",
    });
    mockDb.remediationItem.update.mockResolvedValue({ id: "child-1", status: "in_progress" });
    mockDb.remediationItem.findMany.mockResolvedValue([
      { id: "child-1", status: "in_progress", priority: "high", dueDate: null, linkedFindingIds: [], findingId: null, priorityScore: 30 },
    ]);

    await service.update("org-1", "child-1", { status: "in_progress" });

    // Parent should be updated with max child score
    expect(mockDb.remediationItem.update).toHaveBeenCalledTimes(2); // child + parent
  });

  // --- linkExternal ---

  it("stores externalRef on link-external", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "rem-1", orgId: "org-1", externalRef: null });
    mockDb.remediationItem.update.mockResolvedValue({ id: "rem-1", externalRef: "jira:PROJ-123" });

    const result = await service.linkExternal("org-1", "rem-1", "jira:PROJ-123");
    expect(result.externalRef).toBe("jira:PROJ-123");
  });

  it("rejects linking already-linked item", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "rem-1", orgId: "org-1", externalRef: "jira:PROJ-100" });

    await expect(service.linkExternal("org-1", "rem-1", "jira:PROJ-123")).rejects.toThrow("already linked");
  });
```

Also add `count: vi.fn().mockResolvedValue(0)` to the mockDb.remediationItem object at the top of the test file.

**Step 2: Run tests to verify they fail**

Run: `cd packages/compliance && npx vitest run src/__tests__/remediation-service.test.ts`
Expected: FAIL — getById, getStats, linkExternal not defined; create doesn't accept itemType/parentId

**Step 3: Extend the service implementation**

Replace `packages/compliance/src/remediation/service.ts` with:

```typescript
import { computePriorityScore } from "./priority-score.js";

const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "accepted_risk"],
  in_progress: ["completed", "accepted_risk", "open"],
  completed: [],
  accepted_risk: [],
};

const VALID_PRIORITIES = ["critical", "high", "medium", "low"];
const VALID_ITEM_TYPES = ["compliance", "finding"];

export interface CreateRemediationInput {
  frameworkSlug?: string;
  controlCode?: string;
  title: string;
  description: string;
  priority?: string;
  assignedTo?: string;
  dueDate?: Date;
  linkedFindingIds?: string[];
  createdBy: string;
  parentId?: string;
  findingId?: string;
  itemType?: string;
}

export interface UpdateRemediationInput {
  status?: string;
  priority?: string;
  assignedTo?: string;
  dueDate?: Date;
  completedBy?: string;
  evidenceNotes?: string;
}

export class RemediationService {
  constructor(private db: any) {}

  async create(orgId: string, input: CreateRemediationInput) {
    // Validate parent if provided
    if (input.parentId) {
      const parent = await this.db.remediationItem.findUnique({ where: { id: input.parentId } });
      if (!parent || parent.orgId !== orgId) {
        throw new Error("Parent item not found");
      }
      if (parent.itemType !== "compliance") {
        throw new Error("Parent must be a compliance-type item");
      }
      if (parent.parentId) {
        throw new Error("Maximum nesting depth is 2");
      }
    }

    const itemType = input.itemType ?? "compliance";
    if (!VALID_ITEM_TYPES.includes(itemType)) {
      throw new Error(`Invalid item type: ${itemType}`);
    }

    const priority = input.priority ?? "medium";
    const linkedFindingIds = input.linkedFindingIds ?? [];
    const priorityScore = computePriorityScore({
      priority,
      dueDate: input.dueDate ?? null,
      linkedFindingIds,
      findingId: input.findingId ?? null,
    });

    const item = await this.db.remediationItem.create({
      data: {
        orgId,
        frameworkSlug: input.frameworkSlug ?? null,
        controlCode: input.controlCode ?? null,
        title: input.title,
        description: input.description,
        status: "open",
        priority,
        assignedTo: input.assignedTo,
        dueDate: input.dueDate,
        linkedFindingIds,
        createdBy: input.createdBy,
        parentId: input.parentId ?? null,
        findingId: input.findingId ?? null,
        itemType,
        priorityScore,
      },
    });

    // Recompute parent score if this is a child
    if (input.parentId) {
      await this.recomputeParentScore(input.parentId);
    }

    return item;
  }

  async update(orgId: string, id: string, input: UpdateRemediationInput) {
    const existing = await this.db.remediationItem.findUnique({ where: { id } });
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Remediation item not found");
    }

    if (input.status) {
      const allowed = VALID_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(input.status)) {
        throw new Error(`Invalid status transition from ${existing.status} to ${input.status}`);
      }
    }

    if (input.priority && !VALID_PRIORITIES.includes(input.priority)) {
      throw new Error(`Invalid priority: ${input.priority}. Must be one of: ${VALID_PRIORITIES.join(", ")}`);
    }

    const data: any = {};
    if (input.status) data.status = input.status;
    if (input.priority) data.priority = input.priority;
    if (input.assignedTo !== undefined) data.assignedTo = input.assignedTo;
    if (input.dueDate !== undefined) data.dueDate = input.dueDate;
    if (input.evidenceNotes !== undefined) data.evidenceNotes = input.evidenceNotes;

    if (input.status === "completed") {
      data.completedAt = new Date();
      data.completedBy = input.completedBy;
    }

    // Recompute score if priority or dueDate changed
    if (input.priority || input.dueDate !== undefined || input.status) {
      data.priorityScore = computePriorityScore({
        priority: input.priority ?? existing.priority,
        dueDate: input.dueDate !== undefined ? input.dueDate : existing.dueDate,
        linkedFindingIds: existing.linkedFindingIds,
        findingId: existing.findingId,
      });
      // Completed/accepted_risk items get score 0
      if (["completed", "accepted_risk"].includes(data.status ?? existing.status)) {
        data.priorityScore = 0;
      }
    }

    const updated = await this.db.remediationItem.update({ where: { id }, data });

    // Recompute parent score if this item has a parent
    if (existing.parentId) {
      await this.recomputeParentScore(existing.parentId);
    }

    return updated;
  }

  async getById(orgId: string, id: string) {
    const item = await this.db.remediationItem.findUnique({
      where: { id },
      include: { children: true },
    });
    if (!item || item.orgId !== orgId) return null;
    return item;
  }

  async list(orgId: string, filters: { frameworkSlug?: string; status?: string; itemType?: string; parentId?: string } = {}) {
    const where: any = { orgId };
    if (filters.frameworkSlug) where.frameworkSlug = filters.frameworkSlug;
    if (filters.status) where.status = filters.status;
    if (filters.itemType) where.itemType = filters.itemType;
    if (filters.parentId) where.parentId = filters.parentId;
    if (filters.parentId === undefined && !filters.itemType) {
      // Default: top-level items only (no parentId filter means show parents + orphans)
    }
    return this.db.remediationItem.findMany({
      where,
      include: { children: true },
      orderBy: { priorityScore: "desc" },
    });
  }

  async getOverdue(orgId: string) {
    return this.db.remediationItem.findMany({
      where: {
        orgId,
        status: { in: ["open", "in_progress"] },
        dueDate: { lt: new Date() },
      },
      orderBy: { dueDate: "asc" },
    });
  }

  async getStats(orgId: string) {
    const [open, inProgress, overdue, completed, acceptedRisk] = await Promise.all([
      this.db.remediationItem.count({ where: { orgId, status: "open" } }),
      this.db.remediationItem.count({ where: { orgId, status: "in_progress" } }),
      this.db.remediationItem.count({
        where: { orgId, status: { in: ["open", "in_progress"] }, dueDate: { lt: new Date() } },
      }),
      this.db.remediationItem.count({ where: { orgId, status: "completed" } }),
      this.db.remediationItem.count({ where: { orgId, status: "accepted_risk" } }),
    ]);

    // Average resolution time from completed items
    const completedItems = await this.db.remediationItem.findMany({
      where: { orgId, status: "completed", completedAt: { not: null } },
      select: { createdAt: true, completedAt: true, dueDate: true },
    });

    let avgResolutionDays = 0;
    let slaCompliance = 100;

    if (completedItems.length > 0) {
      const totalMs = completedItems.reduce((sum: number, item: any) => {
        return sum + (new Date(item.completedAt).getTime() - new Date(item.createdAt).getTime());
      }, 0);
      avgResolutionDays = Math.round((totalMs / completedItems.length / 86_400_000) * 10) / 10;

      // SLA compliance: % of completed items finished before due date
      const withDueDate = completedItems.filter((i: any) => i.dueDate);
      if (withDueDate.length > 0) {
        const onTime = withDueDate.filter((i: any) =>
          new Date(i.completedAt).getTime() <= new Date(i.dueDate).getTime(),
        ).length;
        slaCompliance = Math.round((onTime / withDueDate.length) * 100);
      }
    }

    return { open, inProgress, overdue, completed, acceptedRisk, avgResolutionDays, slaCompliance };
  }

  async linkExternal(orgId: string, id: string, externalRef: string) {
    const existing = await this.db.remediationItem.findUnique({ where: { id } });
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Remediation item not found");
    }
    if (existing.externalRef) {
      throw new Error(`Item already linked to ${existing.externalRef}`);
    }
    return this.db.remediationItem.update({
      where: { id },
      data: { externalRef },
    });
  }

  private async recomputeParentScore(parentId: string) {
    const children = await this.db.remediationItem.findMany({
      where: { parentId },
    });
    const maxChildScore = children.reduce(
      (max: number, c: any) => Math.max(max, c.priorityScore ?? 0),
      0,
    );
    await this.db.remediationItem.update({
      where: { id: parentId },
      data: { priorityScore: maxChildScore },
    });
  }
}
```

**Step 4: Update the package export**

Ensure `packages/compliance/src/index.ts` exports the new types:

```typescript
export { RemediationService, type CreateRemediationInput, type UpdateRemediationInput } from "./remediation/service.js";
```

**Step 5: Run all tests**

Run: `cd packages/compliance && npx vitest run`
Expected: All tests pass (existing 6 + new ~10)

**Step 6: Commit**

```bash
git add packages/compliance/src/remediation/service.ts packages/compliance/src/__tests__/remediation-service.test.ts packages/compliance/src/index.ts
git commit -m "feat(compliance): extend RemediationService with parent-child, scoring, getById, stats, linkExternal"
```

---

## Task 5: Extend API Routes — GetById, Stats, LinkExternal, SSE

**Files:**
- Modify: `apps/api/src/routes/remediations.ts:1-29`
- Modify: `apps/api/src/server.ts:1118-1145`
- Modify: `packages/security/src/rbac.ts:56-60`

**Step 1: Extend route builder**

Replace `apps/api/src/routes/remediations.ts`:

```typescript
import { RemediationService } from "@sentinel/compliance";

interface RemediationRouteDeps {
  db: any;
}

export function buildRemediationRoutes(deps: RemediationRouteDeps) {
  const { db } = deps;
  const service = new RemediationService(db);

  async function create(orgId: string, body: any) {
    return service.create(orgId, body);
  }

  async function list(orgId: string, filters: any) {
    return service.list(orgId, filters);
  }

  async function getById(orgId: string, id: string) {
    return service.getById(orgId, id);
  }

  async function update(orgId: string, id: string, body: any) {
    return service.update(orgId, id, body);
  }

  async function getOverdue(orgId: string) {
    return service.getOverdue(orgId);
  }

  async function getStats(orgId: string) {
    return service.getStats(orgId);
  }

  async function linkExternal(orgId: string, id: string, externalRef: string) {
    return service.linkExternal(orgId, id, externalRef);
  }

  return { create, list, getById, update, getOverdue, getStats, linkExternal };
}
```

**Step 2: Register new routes in server.ts**

Add between the existing GET `/v1/compliance/remediations/overdue` (line 1136) and PATCH (line 1138):

```typescript
app.get("/v1/compliance/remediations/stats", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  return withTenant(db, orgId, () => remediationRoutes.getStats(orgId));
});

app.get("/v1/compliance/remediations/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const result = await withTenant(db, orgId, () => remediationRoutes.getById(orgId, id));
  if (!result) { reply.code(404).send({ error: "Remediation item not found" }); return; }
  return result;
});
```

Add after the PATCH route (line 1145):

```typescript
app.post("/v1/compliance/remediations/:id/link-external", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const { externalRef } = request.body as { externalRef: string };
  const userId = (request as any).userId ?? "unknown";
  try {
    const result = await withTenant(db, orgId, () => remediationRoutes.linkExternal(orgId, id, externalRef));
    await auditLog.append(orgId, {
      actor: { type: "user", id: userId, name: userId },
      action: "remediation.link_external",
      resource: { type: "remediation_item", id },
      detail: { externalRef },
    });
    await eventBus.publish("sentinel.notifications", {
      id: `evt-${id}-linked`,
      orgId,
      topic: "remediation.linked",
      payload: { itemId: id, externalRef },
      timestamp: new Date().toISOString(),
    });
    return result;
  } catch (err: any) {
    const msg = err.message ?? "";
    if (msg.includes("not found")) { reply.code(404).send({ error: msg }); }
    else if (msg.includes("already linked")) { reply.code(409).send({ error: msg }); }
    else { reply.code(400).send({ error: msg }); }
  }
});
```

Also add audit logging and event publishing to the existing POST (create) and PATCH (update) routes. Follow the same pattern as the approval routes (lines 872-925 in server.ts):

For POST `/v1/compliance/remediations` (create), add after `reply.code(201).send(result)`:
```typescript
    await auditLog.append(orgId, {
      actor: { type: "user", id: (request as any).userId ?? "unknown", name: (request as any).userId ?? "unknown" },
      action: "remediation.create",
      resource: { type: "remediation_item", id: result.id },
      detail: { title: result.title, itemType: result.itemType },
    });
    await eventBus.publish("sentinel.notifications", {
      id: `evt-${result.id}-created`, orgId, topic: "remediation.created",
      payload: { itemId: result.id, title: result.title },
      timestamp: new Date().toISOString(),
    });
```

For PATCH `/v1/compliance/remediations/:id` (update), add after `return result`:
```typescript
    await auditLog.append(orgId, {
      actor: { type: "user", id: (request as any).userId ?? "unknown", name: (request as any).userId ?? "unknown" },
      action: "remediation.update",
      resource: { type: "remediation_item", id },
      detail: request.body,
    });
    const topic = result.status === "completed" ? "remediation.completed" : "remediation.updated";
    await eventBus.publish("sentinel.notifications", {
      id: `evt-${id}-${Date.now()}`, orgId, topic,
      payload: { itemId: id, status: result.status },
      timestamp: new Date().toISOString(),
    });
```

Also improve error handling on PATCH to return 404/409 (currently all 400):
```typescript
  } catch (err: any) {
    const msg = err.message ?? "";
    if (msg.includes("not found")) { reply.code(404).send({ error: msg }); }
    else if (msg.includes("transition")) { reply.code(409).send({ error: msg }); }
    else { reply.code(400).send({ error: msg }); }
  }
```

**Step 3: Add RBAC entries**

In `packages/security/src/rbac.ts`, find the remediation section (lines 56-60) and replace with:

```typescript
  // Remediations
  { method: "POST", path: "/v1/compliance/remediations", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/compliance/remediations", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/compliance/remediations/stats", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/compliance/remediations/overdue", roles: ["admin", "manager", "developer"] },
  { method: "GET", path: "/v1/compliance/remediations/:id", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "PATCH", path: "/v1/compliance/remediations/:id", roles: ["admin", "manager"] },
  { method: "POST", path: "/v1/compliance/remediations/:id/link-external", roles: ["admin", "manager"] },
```

**Step 4: Run all tests**

Run: `npx turbo test --filter=@sentinel/api --filter=@sentinel/security`
Expected: All pass (update RBAC test assertions if viewer endpoint count changed)

**Step 5: Commit**

```bash
git add apps/api/src/routes/remediations.ts apps/api/src/server.ts packages/security/src/rbac.ts
git commit -m "feat(api): add remediation stats, getById, linkExternal endpoints with audit + events"
```

---

## Task 6: API Route Tests

**Files:**
- Create: `apps/api/src/routes/remediations.test.ts`

**Step 1: Write route tests**

Create `apps/api/src/routes/remediations.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  remediationItem: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
};

vi.mock("@sentinel/compliance", () => ({
  RemediationService: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockImplementation((_orgId: string, body: any) => mockDb.remediationItem.create({ data: body })),
    list: vi.fn().mockImplementation(() => mockDb.remediationItem.findMany()),
    getById: vi.fn().mockImplementation((_orgId: string, id: string) => mockDb.remediationItem.findUnique({ where: { id } })),
    update: vi.fn().mockImplementation((_orgId: string, id: string, body: any) => mockDb.remediationItem.update({ where: { id }, data: body })),
    getOverdue: vi.fn().mockImplementation(() => mockDb.remediationItem.findMany()),
    getStats: vi.fn().mockResolvedValue({ open: 3, inProgress: 2, overdue: 1, completed: 5, acceptedRisk: 0, avgResolutionDays: 4.2, slaCompliance: 87 }),
    linkExternal: vi.fn().mockImplementation((_orgId: string, id: string, ref: string) =>
      mockDb.remediationItem.update({ where: { id }, data: { externalRef: ref } }),
    ),
  })),
}));

import { buildRemediationRoutes } from "./remediations.js";

describe("buildRemediationRoutes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("create returns the created item", async () => {
    const routes = buildRemediationRoutes({ db: mockDb as any });
    mockDb.remediationItem.create.mockResolvedValue({ id: "rem-1", title: "Test" });

    const result = await routes.create("org-1", { title: "Test", description: "Desc", createdBy: "u1" });
    expect(result).toHaveProperty("id", "rem-1");
  });

  it("list returns items", async () => {
    const routes = buildRemediationRoutes({ db: mockDb as any });
    mockDb.remediationItem.findMany.mockResolvedValue([{ id: "rem-1" }]);

    const result = await routes.list("org-1", {});
    expect(result).toHaveLength(1);
  });

  it("getById returns item with children", async () => {
    const routes = buildRemediationRoutes({ db: mockDb as any });
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "rem-1", orgId: "org-1", children: [] });

    const result = await routes.getById("org-1", "rem-1");
    expect(result).toHaveProperty("id", "rem-1");
  });

  it("getStats returns correct shape", async () => {
    const routes = buildRemediationRoutes({ db: mockDb as any });
    const result = await routes.getStats("org-1");
    expect(result).toHaveProperty("open", 3);
    expect(result).toHaveProperty("slaCompliance", 87);
    expect(result).toHaveProperty("avgResolutionDays", 4.2);
  });

  it("linkExternal stores ref", async () => {
    const routes = buildRemediationRoutes({ db: mockDb as any });
    mockDb.remediationItem.update.mockResolvedValue({ id: "rem-1", externalRef: "jira:PROJ-1" });

    const result = await routes.linkExternal("org-1", "rem-1", "jira:PROJ-1");
    expect(result.externalRef).toBe("jira:PROJ-1");
  });

  it("update returns updated item", async () => {
    const routes = buildRemediationRoutes({ db: mockDb as any });
    mockDb.remediationItem.update.mockResolvedValue({ id: "rem-1", status: "in_progress" });

    const result = await routes.update("org-1", "rem-1", { status: "in_progress" });
    expect(result.status).toBe("in_progress");
  });
});
```

**Step 2: Run**

Run: `cd apps/api && npx vitest run src/routes/remediations.test.ts`
Expected: 6 tests PASS

**Step 3: Commit**

```bash
git add apps/api/src/routes/remediations.test.ts
git commit -m "test(api): add remediation route tests"
```

---

## Task 7: Dashboard Types and Mock Data

**Files:**
- Modify: `apps/dashboard/lib/types.ts:125`
- Modify: `apps/dashboard/lib/mock-data.ts` (append)

**Step 1: Add types to `apps/dashboard/lib/types.ts`**

Append after line 125:

```typescript

// ── Remediations ─────────────────────────────────────────────────────

export type RemediationStatus = "open" | "in_progress" | "completed" | "accepted_risk";
export type RemediationPriority = "critical" | "high" | "medium" | "low";
export type RemediationItemType = "compliance" | "finding";

export interface RemediationItem {
  id: string;
  orgId: string;
  frameworkSlug: string | null;
  controlCode: string | null;
  title: string;
  description: string;
  status: RemediationStatus;
  priority: RemediationPriority;
  priorityScore: number;
  assignedTo: string | null;
  dueDate: string | null;
  completedAt: string | null;
  completedBy: string | null;
  evidenceNotes: string | null;
  linkedFindingIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  parentId: string | null;
  findingId: string | null;
  itemType: RemediationItemType;
  externalRef: string | null;
  children: RemediationItem[];
}

export interface RemediationStats {
  open: number;
  inProgress: number;
  overdue: number;
  completed: number;
  acceptedRisk: number;
  avgResolutionDays: number;
  slaCompliance: number; // 0-100
}
```

**Step 2: Add mock data to `apps/dashboard/lib/mock-data.ts`**

Append at the end of the file:

```typescript

// ── Remediations ─────────────────────────────────────────────────────

export const MOCK_REMEDIATION_STATS: import("./types").RemediationStats = {
  open: 5,
  inProgress: 3,
  overdue: 2,
  completed: 12,
  acceptedRisk: 1,
  avgResolutionDays: 4.2,
  slaCompliance: 87,
};

export const MOCK_REMEDIATION_ITEMS: import("./types").RemediationItem[] = [
  {
    id: "rem-1",
    orgId: "org-1",
    frameworkSlug: "soc2",
    controlCode: "CC6.1",
    title: "Fix critical CVEs in auth-service",
    description: "Multiple critical CVEs found in authentication service dependencies",
    status: "in_progress",
    priority: "critical",
    priorityScore: 87,
    assignedTo: "jane@company.com",
    dueDate: new Date(Date.now() + 2 * 86400000).toISOString(),
    completedAt: null,
    completedBy: null,
    evidenceNotes: null,
    linkedFindingIds: ["f-1", "f-2", "f-3"],
    createdBy: "admin@company.com",
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    parentId: null,
    findingId: null,
    itemType: "compliance",
    externalRef: "jira:SEC-142",
    children: [
      {
        id: "rem-1a",
        orgId: "org-1",
        frameworkSlug: null,
        controlCode: null,
        title: "Upgrade jsonwebtoken to 9.x",
        description: "CVE-2024-1234 — prototype pollution in jsonwebtoken <9.0",
        status: "completed",
        priority: "critical",
        priorityScore: 0,
        assignedTo: "bob@company.com",
        dueDate: new Date(Date.now() + 2 * 86400000).toISOString(),
        completedAt: new Date(Date.now() - 86400000).toISOString(),
        completedBy: "bob@company.com",
        evidenceNotes: "Patched in PR #234, verified in staging",
        linkedFindingIds: [],
        createdBy: "jane@company.com",
        createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 86400000).toISOString(),
        parentId: "rem-1",
        findingId: "f-1",
        itemType: "finding",
        externalRef: "jira:SEC-143",
        children: [],
      },
      {
        id: "rem-1b",
        orgId: "org-1",
        frameworkSlug: null,
        controlCode: null,
        title: "Fix lodash prototype pollution",
        description: "CVE-2024-5678 — lodash <4.17.21 prototype pollution",
        status: "in_progress",
        priority: "high",
        priorityScore: 65,
        assignedTo: "bob@company.com",
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        completedAt: null,
        completedBy: null,
        evidenceNotes: null,
        linkedFindingIds: [],
        createdBy: "jane@company.com",
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 7200000).toISOString(),
        parentId: "rem-1",
        findingId: "f-2",
        itemType: "finding",
        externalRef: null,
        children: [],
      },
      {
        id: "rem-1c",
        orgId: "org-1",
        frameworkSlug: null,
        controlCode: null,
        title: "Replace moment.js with date-fns",
        description: "CVE-2024-9012 — ReDoS in moment.js",
        status: "open",
        priority: "medium",
        priorityScore: 55,
        assignedTo: null,
        dueDate: new Date(Date.now() + 2 * 86400000).toISOString(),
        completedAt: null,
        completedBy: null,
        evidenceNotes: null,
        linkedFindingIds: [],
        createdBy: "jane@company.com",
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        parentId: "rem-1",
        findingId: "f-3",
        itemType: "finding",
        externalRef: null,
        children: [],
      },
    ],
  },
  {
    id: "rem-2",
    orgId: "org-1",
    frameworkSlug: "hipaa",
    controlCode: "TS-1.4",
    title: "Implement encryption at rest for PII",
    description: "HIPAA TS-1.4 requires encryption at rest for all patient data",
    status: "open",
    priority: "high",
    priorityScore: 72,
    assignedTo: "alex@company.com",
    dueDate: new Date(Date.now() + 5 * 86400000).toISOString(),
    completedAt: null,
    completedBy: null,
    evidenceNotes: null,
    linkedFindingIds: ["f-4"],
    createdBy: "admin@company.com",
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    parentId: null,
    findingId: null,
    itemType: "compliance",
    externalRef: null,
    children: [],
  },
  {
    id: "rem-3",
    orgId: "org-1",
    frameworkSlug: "soc2",
    controlCode: "CC7.2",
    title: "Remediate insecure deserialization findings",
    description: "Multiple insecure deserialization patterns found across services",
    status: "completed",
    priority: "medium",
    priorityScore: 0,
    assignedTo: "bob@company.com",
    dueDate: new Date(Date.now() - 2 * 86400000).toISOString(),
    completedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    completedBy: "bob@company.com",
    evidenceNotes: "All instances patched. Verified by automated scan.",
    linkedFindingIds: ["f-5", "f-6"],
    createdBy: "admin@company.com",
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    parentId: null,
    findingId: null,
    itemType: "compliance",
    externalRef: "github:acme/api#89",
    children: [],
  },
  {
    id: "rem-4",
    orgId: "org-1",
    frameworkSlug: null,
    controlCode: null,
    title: "Fix SQL injection in search endpoint",
    description: "Parameterized queries not used in /api/search",
    status: "open",
    priority: "critical",
    priorityScore: 44,
    assignedTo: null,
    dueDate: null,
    completedAt: null,
    completedBy: null,
    evidenceNotes: null,
    linkedFindingIds: [],
    createdBy: "scanner",
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    parentId: null,
    findingId: "f-7",
    itemType: "finding",
    externalRef: null,
    children: [],
  },
  {
    id: "rem-5",
    orgId: "org-1",
    frameworkSlug: "soc2",
    controlCode: "CC6.3",
    title: "Legacy dependency accepted risk",
    description: "Legacy Python 2 dependency — migration planned for Q3",
    status: "accepted_risk",
    priority: "low",
    priorityScore: 0,
    assignedTo: "alex@company.com",
    dueDate: null,
    completedAt: null,
    completedBy: null,
    evidenceNotes: "Risk accepted per security review 2026-03-01. Migration scheduled Q3.",
    linkedFindingIds: ["f-8"],
    createdBy: "admin@company.com",
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    parentId: null,
    findingId: null,
    itemType: "compliance",
    externalRef: null,
    children: [],
  },
];
```

**Step 3: Add mock data import to api.ts**

In `apps/dashboard/lib/mock-data.ts`, ensure the exports are importable. Then in `apps/dashboard/lib/api.ts`, add the import at the top (around line 29):

```typescript
import {
  // ... existing imports ...
  MOCK_REMEDIATION_ITEMS,
  MOCK_REMEDIATION_STATS,
} from "./mock-data";
```

**Step 4: Commit**

```bash
git add apps/dashboard/lib/types.ts apps/dashboard/lib/mock-data.ts
git commit -m "feat(dashboard): add remediation types and mock data"
```

---

## Task 8: Dashboard API Functions

**Files:**
- Modify: `apps/dashboard/lib/api.ts` (append)

**Step 1: Add remediation API functions**

Append to `apps/dashboard/lib/api.ts` before the `mapGate()` helper:

```typescript
// ── Remediations ──────────────────────────────────────────────────────

export async function getRemediationItems(filters?: {
  status?: string;
  itemType?: string;
  framework?: string;
}): Promise<import("./types").RemediationItem[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const params: Record<string, string> = {};
    if (filters?.status) params.status = filters.status;
    if (filters?.itemType) params.itemType = filters.itemType;
    if (filters?.framework) params.framework = filters.framework;
    return apiGet<import("./types").RemediationItem[]>("/v1/compliance/remediations", params, headers);
  }, MOCK_REMEDIATION_ITEMS);
}

export async function getRemediationById(id: string): Promise<import("./types").RemediationItem | null> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<import("./types").RemediationItem>(`/v1/compliance/remediations/${id}`, undefined, headers);
  }, MOCK_REMEDIATION_ITEMS.find((r) => r.id === id) ?? null);
}

export async function getRemediationStats(): Promise<import("./types").RemediationStats> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<import("./types").RemediationStats>("/v1/compliance/remediations/stats", undefined, headers);
  }, MOCK_REMEDIATION_STATS);
}

export async function linkRemediationExternal(id: string, externalRef: string): Promise<void> {
  return tryApi(async (headers) => {
    const { apiPost } = await import("./api-client");
    await apiPost(`/v1/compliance/remediations/${id}/link-external`, { externalRef }, headers);
  }, undefined);
}
```

**Step 2: Commit**

```bash
git add apps/dashboard/lib/api.ts
git commit -m "feat(dashboard): add remediation API client functions"
```

---

## Task 9: Dashboard Server Actions

**Files:**
- Create: `apps/dashboard/app/(dashboard)/remediations/actions.ts`

**Step 1: Create server actions**

```typescript
"use server";

import { revalidatePath } from "next/cache";

export async function createRemediation(body: {
  title: string;
  description: string;
  itemType?: string;
  priority?: string;
  assignedTo?: string;
  dueDate?: string;
  frameworkSlug?: string;
  controlCode?: string;
  parentId?: string;
  findingId?: string;
}) {
  const { apiPost } = await import("@/lib/api-client");
  try {
    const result = await apiPost("/v1/compliance/remediations", body);
    revalidatePath("/remediations");
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("400")) throw new Error("Validation error: check all required fields.");
    if (msg.includes("403")) throw new Error("You do not have permission to create remediation items.");
    throw err;
  }
}

export async function updateRemediation(
  id: string,
  body: { status?: string; priority?: string; assignedTo?: string; dueDate?: string; evidenceNotes?: string; completedBy?: string },
) {
  const { apiPatch } = await import("@/lib/api-client");
  try {
    await apiPatch(`/v1/compliance/remediations/${id}`, body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404")) throw new Error("This remediation item no longer exists.");
    if (msg.includes("409")) throw new Error("Invalid status transition. Refresh to see latest state.");
    if (msg.includes("400")) throw new Error(msg);
    throw err;
  }
  revalidatePath("/remediations");
  revalidatePath(`/remediations/${id}`);
}

export async function linkExternal(id: string, externalRef: string) {
  const { linkRemediationExternal } = await import("@/lib/api");
  try {
    await linkRemediationExternal(id, externalRef);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("409")) throw new Error("This item is already linked to an external tracker.");
    throw err;
  }
  revalidatePath("/remediations");
  revalidatePath(`/remediations/${id}`);
}
```

**Step 2: Check that `apiPatch` exists in api-client**

Read `apps/dashboard/lib/api-client.ts` and confirm it exports `apiPatch`. If not, you'll need to add it following the same pattern as `apiPost`.

**Step 3: Commit**

```bash
git add apps/dashboard/app/\(dashboard\)/remediations/actions.ts
git commit -m "feat(dashboard): add remediation server actions"
```

---

## Task 10: Dashboard Pages — Main Queue

**Files:**
- Create: `apps/dashboard/app/(dashboard)/remediations/page.tsx`

**Step 1: Create the remediations page**

```typescript
import { getRemediationItems, getRemediationStats } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { RemediationQueue } from "@/components/remediations/remediation-queue";

export default async function RemediationsPage() {
  const [items, stats] = await Promise.all([
    getRemediationItems(),
    getRemediationStats(),
  ]);

  const actionableCount = items.filter(
    (i) => i.status === "open" || i.status === "in_progress",
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Remediation Tracking"
        description={`${actionableCount} items in progress${stats.overdue > 0 ? ` · ${stats.overdue} overdue` : ""}`}
      />
      <RemediationQueue initialItems={items} initialStats={stats} />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/dashboard/app/\(dashboard\)/remediations/page.tsx
git commit -m "feat(dashboard): add remediations page"
```

---

## Task 11: Dashboard Pages — Detail Page

**Files:**
- Create: `apps/dashboard/app/(dashboard)/remediations/[id]/page.tsx`
- Create: `apps/dashboard/app/(dashboard)/remediations/[id]/detail-client.tsx`

**Step 1: Create detail server page**

`apps/dashboard/app/(dashboard)/remediations/[id]/page.tsx`:

```typescript
import Link from "next/link";
import { getRemediationById } from "@/lib/api";
import { IconChevronLeft } from "@/components/icons";
import { RemediationDetailClient } from "./detail-client";

interface RemediationDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function RemediationDetailPage({ params }: RemediationDetailPageProps) {
  const { id } = await params;
  const item = await getRemediationById(id);

  if (!item) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <div className="text-center">
          <p className="text-sm font-semibold text-text-primary">Item not found</p>
          <p className="mt-1 text-[13px] text-text-tertiary">
            The requested remediation item could not be located.
          </p>
        </div>
        <Link
          href="/remediations"
          className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border bg-surface-1 px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary focus-ring"
        >
          <IconChevronLeft className="h-3.5 w-3.5" />
          Back to Remediations
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <Link
          href="/remediations"
          className="inline-flex items-center gap-1 text-[13px] text-text-tertiary hover:text-accent transition-colors focus-ring rounded"
        >
          <IconChevronLeft className="h-3.5 w-3.5" />
          Remediations
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-text-primary">
          {item.title}
        </h1>
        <p className="mt-1 text-[13px] text-text-secondary">
          {item.itemType === "compliance" && item.frameworkSlug
            ? `${item.frameworkSlug.toUpperCase()} / ${item.controlCode} · `
            : ""}
          {item.priority} priority · score {item.priorityScore}
        </p>
      </div>
      <div className="animate-fade-up max-w-3xl" style={{ animationDelay: "0.05s" }}>
        <RemediationDetailClient item={item} />
      </div>
    </div>
  );
}
```

**Step 2: Create detail client wrapper**

`apps/dashboard/app/(dashboard)/remediations/[id]/detail-client.tsx`:

```typescript
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { RemediationItem } from "@/lib/types";
import { RemediationDetailPanel } from "@/components/remediations/remediation-detail-panel";
import { updateRemediation, linkExternal } from "@/app/(dashboard)/remediations/actions";

interface RemediationDetailClientProps {
  item: RemediationItem;
}

export function RemediationDetailClient({ item: initialItem }: RemediationDetailClientProps) {
  const [item, setItem] = useState(initialItem);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleStatusChange = useCallback(
    async (id: string, status: string, completedBy?: string) => {
      setIsSubmitting(true);
      try {
        await updateRemediation(id, { status, completedBy });
        setItem((prev) => ({ ...prev, status: status as any }));
        router.refresh();
      } catch (err) {
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [router],
  );

  const handleUpdate = useCallback(
    async (id: string, body: Record<string, any>) => {
      await updateRemediation(id, body);
      setItem((prev) => ({ ...prev, ...body }));
      router.refresh();
    },
    [router],
  );

  const handleLinkExternal = useCallback(
    async (id: string, ref: string) => {
      await linkExternal(id, ref);
      setItem((prev) => ({ ...prev, externalRef: ref }));
      router.refresh();
    },
    [router],
  );

  return (
    <RemediationDetailPanel
      item={item}
      onStatusChange={handleStatusChange}
      onUpdate={handleUpdate}
      onLinkExternal={handleLinkExternal}
      isSubmitting={isSubmitting}
    />
  );
}
```

**Step 3: Commit**

```bash
git add apps/dashboard/app/\(dashboard\)/remediations/\[id\]/page.tsx apps/dashboard/app/\(dashboard\)/remediations/\[id\]/detail-client.tsx
git commit -m "feat(dashboard): add remediation detail page with client wrapper"
```

---

## Task 12: Dashboard Components — Stats Bar, Card, Filters, View Toggle

These are the shared building blocks. Implement them following the exact patterns from the approval queue components (`components/approvals/approval-stats-bar.tsx`, `approval-card.tsx`).

**Files:**
- Create: `apps/dashboard/components/remediations/remediation-stats-bar.tsx`
- Create: `apps/dashboard/components/remediations/remediation-card.tsx`
- Create: `apps/dashboard/components/remediations/remediation-filters.tsx`
- Create: `apps/dashboard/components/remediations/view-toggle.tsx`

Implement each component following the existing design system tokens (`text-text-primary`, `bg-surface-1`, `border-border`, `text-accent`, `bg-status-pass`, `bg-status-fail`, `bg-status-warn`, etc.) and the exact patterns from the approval queue components.

**Key behaviors:**
- Stats bar: 6 metrics in a row (open, inProgress, overdue, completed, avgResolution, slaCompliance)
- Card: Shows title, priority badge, status, SLA countdown, assignee, child progress "2/3 ✓", external ref link
- Filters: Type (all/compliance/finding), status dropdown, priority dropdown, search input
- View toggle: Two buttons (Table/Kanban), persists in localStorage

**Step: Commit after each component**

```bash
git commit -m "feat(dashboard): add remediation stats bar, card, filters, view toggle components"
```

---

## Task 13: Dashboard Components — Table View

**Files:**
- Create: `apps/dashboard/components/remediations/remediation-table.tsx`

Table view with expandable parent rows. Parents show a ▶ chevron that expands to show children indented below. Sorted by `priorityScore` descending. Click row to navigate to detail page.

Follow the pattern from `approval-queue.tsx` but with expandable rows instead of a flat list. Use `useState` to track expanded row IDs.

**Commit:**
```bash
git commit -m "feat(dashboard): add remediation table view with expandable parents"
```

---

## Task 14: Dashboard Components — Kanban View

**Files:**
- Create: `apps/dashboard/components/remediations/remediation-kanban.tsx`

4 columns: Open, In Progress, Completed, Accepted Risk. Shows only top-level items (where `parentId === null`). Cards sorted by `priorityScore` within each column. Cards show child progress badge.

Status change on drag: call `onStatusChange(itemId, newStatus)` callback.

**Commit:**
```bash
git commit -m "feat(dashboard): add remediation kanban view"
```

---

## Task 15: Dashboard Components — Detail Panel

**Files:**
- Create: `apps/dashboard/components/remediations/remediation-detail-panel.tsx`

Full detail view matching the wireframe from the design doc: item detail grid, progress roll-up bar for parents, children list, action buttons (Mark Complete / Accept Risk / Reassign), evidence notes textarea, external link section, activity display from children status history.

**Commit:**
```bash
git commit -m "feat(dashboard): add remediation detail panel"
```

---

## Task 16: Dashboard Components — Queue (Orchestrator)

**Files:**
- Create: `apps/dashboard/components/remediations/remediation-queue.tsx`

The main orchestrator that wires stats bar, filters, view toggle, and table/kanban views together. Manages shared state (filter, search, selected view, items). Pattern follows `approval-queue.tsx` exactly.

**Commit:**
```bash
git commit -m "feat(dashboard): add remediation queue orchestrator"
```

---

## Task 17: Dashboard Components — Create Modal

**Files:**
- Create: `apps/dashboard/components/remediations/remediation-create-modal.tsx`

Modal form with: title, description, type selector (compliance/finding), priority, assignee, due date, framework/control (if compliance), parent picker (searchable dropdown), finding linker (if finding type). Calls `createRemediation` server action.

**Commit:**
```bash
git commit -m "feat(dashboard): add remediation create modal"
```

---

## Task 18: Dashboard Tests

**Files:**
- Create: `apps/dashboard/__tests__/remediation-mock-data.test.ts`
- Create: `apps/dashboard/__tests__/remediation-card.test.ts`
- Create: `apps/dashboard/__tests__/remediation-stats.test.ts`
- Create: `apps/dashboard/__tests__/remediation-table-logic.test.ts`

**Test structure follows existing patterns** (see `approval-card.test.ts`, `approval-queue-logic.test.ts`, `approval-mock-data.test.ts`):

- **mock-data.test.ts**: Validate mock data matches type shapes, parent-child consistency, all statuses represented
- **card.test.ts**: Renders priority badge, SLA countdown, child progress, external ref
- **stats.test.ts**: Renders all values, SLA compliance red below 80%, overdue red when > 0
- **table-logic.test.ts**: Filters by type/status/priority, search matches title/framework/assignee, sorts by score

**Run:** `cd apps/dashboard && npx vitest run`
Expected: All existing tests still pass + ~25 new tests pass

**Commit:**
```bash
git commit -m "test(dashboard): add remediation dashboard tests"
```

---

## Task 19: Add Navigation Link

**Files:**
- Modify: `apps/dashboard/components/sidebar.tsx` (or equivalent nav component)

Add "Remediations" link to the dashboard sidebar, between existing items. Use an appropriate icon.

**Commit:**
```bash
git commit -m "feat(dashboard): add remediations to sidebar navigation"
```

---

## Task 20: Final Integration Test — Run All Tests

**Run:**
```bash
npx turbo test --filter=@sentinel/api --filter=@sentinel/security --filter=@sentinel/compliance
cd apps/dashboard && npx vitest run
```

Expected: All tests pass across all packages.

**Final commit (if any fixes needed):**
```bash
git commit -m "fix: address integration test issues for remediation dashboard"
```

---

---

## Task 21: Custom Workflow FSM + WorkflowConfig Schema

**Files:**
- Create: `packages/compliance/src/remediation/workflow-fsm.ts`
- Create: `packages/compliance/src/__tests__/workflow-fsm.test.ts`
- Modify: `packages/db/prisma/schema.prisma` (add WorkflowConfig model)
- Create: `packages/db/prisma/migrations/20260313110000_add_workflow_config/migration.sql`

**Step 1: Add WorkflowConfig model to schema.prisma**

Add after EvidenceAttachment model (or after IntegrationConfig if evidence not yet added):

```prisma
model WorkflowConfig {
  id            String   @id @default(uuid()) @db.Uuid
  orgId         String   @map("org_id") @db.Uuid
  skipStages    String[] @map("skip_stages")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz

  organization Organization @relation(fields: [orgId], references: [id])

  @@unique([orgId])
  @@map("workflow_configs")
}
```

Add `workflowConfig WorkflowConfig?` backrelation on Organization model.

**Step 2: Write migration SQL**

```sql
CREATE TABLE "workflow_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "skip_stages" TEXT[] NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "workflow_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_configs_org_id_key" ON "workflow_configs"("org_id");
ALTER TABLE "workflow_configs" ADD CONSTRAINT "workflow_configs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

**Step 3: Write failing tests for workflow FSM**

Create `packages/compliance/src/__tests__/workflow-fsm.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { WorkflowFSM, WORKFLOW_STAGES, TERMINAL_STAGES } from "../remediation/workflow-fsm.js";

describe("WorkflowFSM", () => {
  const fsm = new WorkflowFSM([]);

  it("advances open -> assigned", () => {
    expect(fsm.nextStage("open")).toBe("assigned");
  });

  it("advances through full pipeline", () => {
    let stage = "open";
    const visited = [stage];
    while (!TERMINAL_STAGES.has(stage)) {
      stage = fsm.nextStage(stage)!;
      visited.push(stage);
    }
    expect(visited).toEqual(["open", "assigned", "in_progress", "in_review", "awaiting_deployment", "completed"]);
  });

  it("allows transition to accepted_risk from any non-terminal", () => {
    expect(fsm.canTransition("open", "accepted_risk")).toBe(true);
    expect(fsm.canTransition("in_progress", "accepted_risk")).toBe(true);
    expect(fsm.canTransition("completed", "accepted_risk")).toBe(false);
  });

  it("allows transition to blocked from any non-terminal", () => {
    expect(fsm.canTransition("in_progress", "blocked")).toBe(true);
    expect(fsm.canTransition("completed", "blocked")).toBe(false);
  });

  it("skips stages when configured", () => {
    const skipFsm = new WorkflowFSM(["assigned", "in_review", "awaiting_deployment"]);
    expect(skipFsm.nextStage("open")).toBe("in_progress");
    expect(skipFsm.nextStage("in_progress")).toBe("completed");
  });

  it("allows backward transition (reopen)", () => {
    expect(fsm.canTransition("in_progress", "open")).toBe(true);
    expect(fsm.canTransition("assigned", "open")).toBe(true);
  });

  it("rejects invalid transitions from terminal states", () => {
    expect(fsm.canTransition("completed", "open")).toBe(false);
    expect(fsm.canTransition("accepted_risk", "open")).toBe(false);
  });

  it("returns all active stages (excluding skipped)", () => {
    const skipFsm = new WorkflowFSM(["in_review"]);
    const active = skipFsm.getActiveStages();
    expect(active).not.toContain("in_review");
    expect(active).toContain("open");
    expect(active).toContain("completed");
  });

  it("validates skip stages against allowed list", () => {
    expect(() => new WorkflowFSM(["invalid_stage"])).toThrow("Invalid skip stage");
  });

  it("prevents skipping required stages (open, completed)", () => {
    expect(() => new WorkflowFSM(["open"])).toThrow("Cannot skip required stage");
    expect(() => new WorkflowFSM(["completed"])).toThrow("Cannot skip required stage");
  });
});
```

**Step 4: Run tests to verify they fail**

Run: `cd packages/compliance && npx vitest run src/__tests__/workflow-fsm.test.ts`
Expected: FAIL — module not found

**Step 5: Implement WorkflowFSM**

Create `packages/compliance/src/remediation/workflow-fsm.ts`:

```typescript
export const WORKFLOW_STAGES = [
  "open",
  "assigned",
  "in_progress",
  "in_review",
  "awaiting_deployment",
  "completed",
] as const;

export const TERMINAL_STAGES = new Set(["completed", "accepted_risk"]);
export const SPECIAL_STAGES = new Set(["accepted_risk", "blocked"]);
const REQUIRED_STAGES = new Set(["open", "completed"]);
const SKIPPABLE_STAGES = new Set(["assigned", "in_progress", "in_review", "awaiting_deployment"]);

export class WorkflowFSM {
  private activeStages: string[];

  constructor(skipStages: string[]) {
    for (const s of skipStages) {
      if (!SKIPPABLE_STAGES.has(s)) {
        if (REQUIRED_STAGES.has(s)) throw new Error(`Cannot skip required stage: ${s}`);
        throw new Error(`Invalid skip stage: ${s}`);
      }
    }
    const skipSet = new Set(skipStages);
    this.activeStages = WORKFLOW_STAGES.filter((s) => !skipSet.has(s));
  }

  getActiveStages(): string[] {
    return [...this.activeStages, "accepted_risk", "blocked"];
  }

  nextStage(current: string): string | null {
    const idx = this.activeStages.indexOf(current);
    if (idx === -1 || idx >= this.activeStages.length - 1) return null;
    return this.activeStages[idx + 1];
  }

  previousStage(current: string): string | null {
    const idx = this.activeStages.indexOf(current);
    if (idx <= 0) return null;
    return this.activeStages[idx - 1];
  }

  canTransition(from: string, to: string): boolean {
    if (TERMINAL_STAGES.has(from)) return false;

    // Any non-terminal -> accepted_risk or blocked
    if (to === "accepted_risk" || to === "blocked") return true;

    // Forward transition
    const fromIdx = this.activeStages.indexOf(from);
    const toIdx = this.activeStages.indexOf(to);
    if (fromIdx === -1 || toIdx === -1) return false;

    // Allow forward by 1 step or backward to any earlier stage
    return toIdx === fromIdx + 1 || toIdx < fromIdx;
  }
}
```

**Step 6: Run tests to verify they pass**

Run: `cd packages/compliance && npx vitest run src/__tests__/workflow-fsm.test.ts`
Expected: 10 tests PASS

**Step 7: Export from package index**

Add to `packages/compliance/src/index.ts`:
```typescript
export { WorkflowFSM, WORKFLOW_STAGES, TERMINAL_STAGES, SPECIAL_STAGES } from "./remediation/workflow-fsm.js";
```

**Step 8: Generate Prisma client and commit**

```bash
cd packages/db && npx prisma generate
git add packages/compliance/src/remediation/workflow-fsm.ts packages/compliance/src/__tests__/workflow-fsm.test.ts packages/compliance/src/index.ts packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260313110000_add_workflow_config/
git commit -m "feat(compliance): add custom workflow FSM with configurable skip stages"
```

---

## Task 22: Update RemediationService for Custom Workflow

**Files:**
- Modify: `packages/compliance/src/remediation/service.ts`
- Modify: `packages/compliance/src/__tests__/remediation-service.test.ts`

**Step 1: Write failing tests**

Add to `packages/compliance/src/__tests__/remediation-service.test.ts`:

```typescript
  // --- Custom workflow tests ---

  it("validates status transitions against workflow FSM", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({
      id: "rem-1", orgId: "org-1", status: "open", parentId: null,
    });
    mockDb.workflowConfig.findUnique.mockResolvedValue(null); // default workflow

    await expect(service.update("org-1", "rem-1", { status: "in_review" })).rejects.toThrow();
  });

  it("respects org skip stages", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({
      id: "rem-1", orgId: "org-1", status: "open", parentId: null,
    });
    mockDb.workflowConfig.findUnique.mockResolvedValue({ skipStages: ["assigned"] });
    mockDb.remediationItem.update.mockResolvedValue({ id: "rem-1", status: "in_progress" });

    const result = await service.update("org-1", "rem-1", { status: "in_progress" });
    expect(result.status).toBe("in_progress");
  });

  it("allows accepted_risk from any non-terminal state", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({
      id: "rem-1", orgId: "org-1", status: "in_review", parentId: null,
    });
    mockDb.workflowConfig.findUnique.mockResolvedValue(null);
    mockDb.remediationItem.update.mockResolvedValue({ id: "rem-1", status: "accepted_risk" });

    const result = await service.update("org-1", "rem-1", { status: "accepted_risk" });
    expect(result.status).toBe("accepted_risk");
  });
```

**Step 2: Update service to use WorkflowFSM**

In `service.ts`, replace the static `VALID_TRANSITIONS` map with WorkflowFSM-based validation:
- Load `WorkflowConfig` for the org on status change
- Construct `WorkflowFSM(config.skipStages ?? [])`
- Use `fsm.canTransition(existing.status, input.status)` instead of the map lookup
- Keep backward compat: old 4-status items still work since those statuses are subset of the 8-stage pipeline

**Step 3: Run tests, verify pass, commit**

```bash
git commit -m "feat(compliance): integrate custom workflow FSM into RemediationService"
```

---

## Task 23: Workflow Config API Routes + RBAC

**Files:**
- Modify: `apps/api/src/routes/remediations.ts` or create `apps/api/src/routes/workflow-config.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `packages/security/src/rbac.ts`

**Step 1: Add RBAC entries**

```typescript
{ method: "GET", path: "/v1/compliance/workflow-config", roles: ["admin", "manager"] },
{ method: "PUT", path: "/v1/compliance/workflow-config", roles: ["admin"] },
```

**Step 2: Implement routes**

- `GET /v1/compliance/workflow-config` — Return org's WorkflowConfig or default (empty skipStages)
- `PUT /v1/compliance/workflow-config` — Upsert skipStages array, validate against allowed skippable stages

**Step 3: Wire into server.ts, commit**

```bash
git commit -m "feat(api): add workflow config API routes"
```

---

## Task 24: Evidence Attachment Schema + S3 Presigned URLs

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (add EvidenceAttachment model)
- Create: `packages/db/prisma/migrations/20260313120000_add_evidence_attachments/migration.sql`
- Create: `packages/compliance/src/remediation/evidence-service.ts`
- Create: `packages/compliance/src/__tests__/evidence-service.test.ts`

**Step 1: Add EvidenceAttachment model**

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

Add `evidenceAttachments EvidenceAttachment[]` backrelation on RemediationItem and Organization.

**Step 2: Write migration SQL**

```sql
CREATE TABLE "evidence_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "remediation_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evidence_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "evidence_attachments_remediation_id_idx" ON "evidence_attachments"("remediation_id");
CREATE INDEX "evidence_attachments_org_id_idx" ON "evidence_attachments"("org_id");
ALTER TABLE "evidence_attachments" ADD CONSTRAINT "evidence_attachments_remediation_id_fkey" FOREIGN KEY ("remediation_id") REFERENCES "remediation_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evidence_attachments" ADD CONSTRAINT "evidence_attachments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

**Step 3: Write failing tests for EvidenceService**

Create `packages/compliance/src/__tests__/evidence-service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EvidenceService } from "../remediation/evidence-service.js";

const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "text/csv", "application/json", "text/plain", "text/markdown"];
const MAX_FILE_SIZE = 25 * 1024 * 1024;

describe("EvidenceService", () => {
  let service: EvidenceService;
  let mockDb: any;
  let mockS3: any;

  beforeEach(() => {
    mockDb = {
      evidenceAttachment: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
      remediationItem: { findUnique: vi.fn() },
    };
    mockS3 = { getPresignedUploadUrl: vi.fn(), getPresignedDownloadUrl: vi.fn() };
    service = new EvidenceService(mockDb, mockS3);
  });

  it("rejects files larger than 25MB", async () => {
    await expect(service.requestUpload("org-1", "rem-1", "huge.pdf", MAX_FILE_SIZE + 1, "application/pdf", "user-1"))
      .rejects.toThrow("25MB");
  });

  it("rejects disallowed MIME types", async () => {
    await expect(service.requestUpload("org-1", "rem-1", "malware.exe", 1024, "application/x-executable", "user-1"))
      .rejects.toThrow("not allowed");
  });

  it("generates presigned upload URL for valid file", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "rem-1", orgId: "org-1" });
    mockS3.getPresignedUploadUrl.mockResolvedValue({ url: "https://s3.example.com/upload", key: "evidence/org-1/rem-1/uuid/test.pdf" });

    const result = await service.requestUpload("org-1", "rem-1", "test.pdf", 1024, "application/pdf", "user-1");
    expect(result).toHaveProperty("uploadUrl");
    expect(result).toHaveProperty("s3Key");
  });

  it("confirms upload and creates DB record", async () => {
    mockDb.evidenceAttachment.create.mockResolvedValue({ id: "ev-1", fileName: "test.pdf" });

    const result = await service.confirmUpload("org-1", "rem-1", "evidence/org-1/rem-1/uuid/test.pdf", "test.pdf", 1024, "application/pdf", "user-1");
    expect(result).toHaveProperty("id");
  });

  it("lists evidence for a remediation item", async () => {
    mockDb.evidenceAttachment.findMany.mockResolvedValue([{ id: "ev-1" }]);
    const result = await service.list("org-1", "rem-1");
    expect(result).toHaveLength(1);
  });

  it("generates presigned download URL", async () => {
    mockDb.evidenceAttachment.findUnique.mockResolvedValue({ id: "ev-1", orgId: "org-1", s3Key: "evidence/key" });
    mockS3.getPresignedDownloadUrl.mockResolvedValue("https://s3.example.com/download");

    const result = await service.getDownloadUrl("org-1", "ev-1");
    expect(result).toContain("https://");
  });
});
```

**Step 4: Implement EvidenceService**

Create `packages/compliance/src/remediation/evidence-service.ts`:

```typescript
import { randomUUID } from "node:crypto";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf", "image/png", "image/jpeg", "text/csv",
  "application/json", "text/plain", "text/markdown",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export interface S3Presigner {
  getPresignedUploadUrl(key: string, contentType: string, maxSize: number): Promise<{ url: string; key: string }>;
  getPresignedDownloadUrl(key: string): Promise<string>;
}

export class EvidenceService {
  constructor(private db: any, private s3: S3Presigner) {}

  async requestUpload(orgId: string, remediationId: string, fileName: string, fileSize: number, mimeType: string, userId: string) {
    if (fileSize > MAX_FILE_SIZE) throw new Error("File exceeds 25MB limit");
    if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error(`File type ${mimeType} not allowed`);

    const item = await this.db.remediationItem.findUnique({ where: { id: remediationId } });
    if (!item || item.orgId !== orgId) throw new Error("Remediation item not found");

    const s3Key = `evidence/${orgId}/${remediationId}/${randomUUID()}/${fileName}`;
    const { url } = await this.s3.getPresignedUploadUrl(s3Key, mimeType, fileSize);

    return { uploadUrl: url, s3Key, expiresIn: 900 };
  }

  async confirmUpload(orgId: string, remediationId: string, s3Key: string, fileName: string, fileSize: number, mimeType: string, userId: string) {
    return this.db.evidenceAttachment.create({
      data: { orgId, remediationId, fileName, fileSize, mimeType, s3Key, uploadedBy: userId },
    });
  }

  async list(orgId: string, remediationId: string) {
    return this.db.evidenceAttachment.findMany({
      where: { orgId, remediationId },
      orderBy: { createdAt: "desc" },
    });
  }

  async getDownloadUrl(orgId: string, evidenceId: string) {
    const evidence = await this.db.evidenceAttachment.findUnique({ where: { id: evidenceId } });
    if (!evidence || evidence.orgId !== orgId) throw new Error("Evidence not found");
    return this.s3.getPresignedDownloadUrl(evidence.s3Key);
  }

  async delete(orgId: string, evidenceId: string) {
    const evidence = await this.db.evidenceAttachment.findUnique({ where: { id: evidenceId } });
    if (!evidence || evidence.orgId !== orgId) throw new Error("Evidence not found");
    return this.db.evidenceAttachment.delete({ where: { id: evidenceId } });
  }
}
```

**Step 5: Run tests, export, commit**

```bash
cd packages/compliance && npx vitest run src/__tests__/evidence-service.test.ts
git commit -m "feat(compliance): add evidence attachment service with S3 presigned URLs"
```

---

## Task 25: Evidence Upload API Routes + RBAC

**Files:**
- Modify: `apps/api/src/routes/remediations.ts` or `apps/api/src/server.ts`
- Modify: `packages/security/src/rbac.ts`
- Create: `packages/compliance/src/remediation/s3-presigner.ts`

**Step 1: Add RBAC entries**

```typescript
{ method: "POST", path: "/v1/compliance/remediations/:id/evidence/presign", roles: ["admin", "manager"] },
{ method: "POST", path: "/v1/compliance/remediations/:id/evidence/confirm", roles: ["admin", "manager"] },
{ method: "GET", path: "/v1/compliance/remediations/:id/evidence", roles: ["admin", "manager", "developer"] },
{ method: "GET", path: "/v1/compliance/remediations/:id/evidence/:eid/url", roles: ["admin", "manager", "developer"] },
{ method: "DELETE", path: "/v1/compliance/remediations/:id/evidence/:eid", roles: ["admin", "manager"] },
```

**Step 2: Create S3 presigner adapter**

Create `packages/compliance/src/remediation/s3-presigner.ts` that wraps `@aws-sdk/s3-request-presigner`:

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { S3Presigner } from "./evidence-service.js";

export function createS3Presigner(bucket: string): S3Presigner {
  const client = new S3Client({});

  return {
    async getPresignedUploadUrl(key: string, contentType: string, maxSize: number) {
      const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
      const url = await getSignedUrl(client, command, { expiresIn: 900 });
      return { url, key };
    },
    async getPresignedDownloadUrl(key: string) {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      return getSignedUrl(client, command, { expiresIn: 3600 });
    },
  };
}
```

**Step 3: Wire routes into server.ts**

- `POST /:id/evidence/presign` — Validate input, call `evidenceService.requestUpload()`, return `{ uploadUrl, s3Key }`
- `POST /:id/evidence/confirm` — Validate s3Key matches org prefix, call `evidenceService.confirmUpload()`
- `GET /:id/evidence` — Call `evidenceService.list()`
- `GET /:id/evidence/:eid/url` — Call `evidenceService.getDownloadUrl()`
- `DELETE /:id/evidence/:eid` — Call `evidenceService.delete()`

**Step 4: Install dependency, commit**

```bash
cd packages/compliance && pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
git commit -m "feat(api): add evidence upload routes with S3 presigned URLs"
```

---

## Task 26: RemediationSnapshot Schema + Snapshot Cron Job

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (add RemediationSnapshot model)
- Create: `packages/db/prisma/migrations/20260313130000_add_remediation_snapshots/migration.sql`
- Create: `apps/api/src/scheduler/jobs/remediation-snapshot.ts`
- Create: `apps/api/src/scheduler/jobs/__tests__/remediation-snapshot.test.ts`

**Step 1: Add RemediationSnapshot model**

```prisma
model RemediationSnapshot {
  id                String   @id @default(uuid()) @db.Uuid
  orgId             String   @map("org_id") @db.Uuid
  snapshotDate      DateTime @map("snapshot_date") @db.Date
  scope             String   @default("org")
  scopeValue        String?  @map("scope_value")
  openCount         Int      @map("open_count")
  inProgressCount   Int      @map("in_progress_count")
  completedCount    Int      @map("completed_count")
  acceptedRiskCount Int      @map("accepted_risk_count")
  avgResolutionHours Float?  @map("avg_resolution_hours")
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz

  organization Organization @relation(fields: [orgId], references: [id])

  @@unique([orgId, snapshotDate, scope, scopeValue])
  @@index([orgId, scope, snapshotDate])
  @@map("remediation_snapshots")
}
```

**Step 2: Write migration SQL**

```sql
CREATE TABLE "remediation_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'org',
    "scope_value" TEXT,
    "open_count" INTEGER NOT NULL,
    "in_progress_count" INTEGER NOT NULL,
    "completed_count" INTEGER NOT NULL,
    "accepted_risk_count" INTEGER NOT NULL,
    "avg_resolution_hours" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "remediation_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "remediation_snapshots_org_scope_date_key" ON "remediation_snapshots"("org_id", "snapshot_date", "scope", "scope_value");
CREATE INDEX "remediation_snapshots_org_scope_idx" ON "remediation_snapshots"("org_id", "scope", "snapshot_date");
ALTER TABLE "remediation_snapshots" ADD CONSTRAINT "remediation_snapshots_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

**Step 3: Write failing test for snapshot job**

Create `apps/api/src/scheduler/jobs/__tests__/remediation-snapshot.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RemediationSnapshotJob } from "../remediation-snapshot.js";

describe("RemediationSnapshotJob", () => {
  let job: RemediationSnapshotJob;
  let ctx: any;

  beforeEach(() => {
    job = new RemediationSnapshotJob();
    ctx = {
      db: {
        organization: { findMany: vi.fn().mockResolvedValue([{ id: "org-1" }]) },
        remediationItem: { count: vi.fn().mockResolvedValue(5), findMany: vi.fn().mockResolvedValue([]) },
        remediationSnapshot: { upsert: vi.fn().mockResolvedValue({}) },
      },
      eventBus: { publish: vi.fn() },
      logger: { info: vi.fn(), error: vi.fn() },
      metrics: { recordTrigger: vi.fn(), recordError: vi.fn() },
      audit: { log: vi.fn() },
      redis: {},
    };
  });

  it("has correct schedule (daily at 2am)", () => {
    expect(job.schedule).toBe("0 2 * * *");
  });

  it("creates org-level snapshot", async () => {
    await job.execute(ctx);
    expect(ctx.db.remediationSnapshot.upsert).toHaveBeenCalled();
  });

  it("handles multiple orgs", async () => {
    ctx.db.organization.findMany.mockResolvedValue([{ id: "org-1" }, { id: "org-2" }]);
    await job.execute(ctx);
    expect(ctx.db.remediationSnapshot.upsert).toHaveBeenCalledTimes(2);
  });
});
```

**Step 4: Implement RemediationSnapshotJob**

Create `apps/api/src/scheduler/jobs/remediation-snapshot.ts`:

```typescript
import type { SchedulerJob, JobContext } from "../types.js";

export class RemediationSnapshotJob implements SchedulerJob {
  name = "remediation-snapshot" as const;
  schedule = "0 2 * * *";
  tier = "non-critical" as const;
  dependencies = ["postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const { db, logger } = ctx;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const orgs = await db.organization.findMany({ select: { id: true } });

    for (const org of orgs) {
      const [openCount, inProgressCount, completedCount, acceptedRiskCount] = await Promise.all([
        db.remediationItem.count({ where: { orgId: org.id, status: "open" } }),
        db.remediationItem.count({ where: { orgId: org.id, status: { in: ["in_progress", "assigned", "in_review", "awaiting_deployment"] } } }),
        db.remediationItem.count({ where: { orgId: org.id, status: "completed" } }),
        db.remediationItem.count({ where: { orgId: org.id, status: "accepted_risk" } }),
      ]);

      await db.remediationSnapshot.upsert({
        where: { orgId_snapshotDate_scope_scopeValue: { orgId: org.id, snapshotDate: today, scope: "org", scopeValue: null } },
        create: { orgId: org.id, snapshotDate: today, scope: "org", openCount, inProgressCount, completedCount, acceptedRiskCount },
        update: { openCount, inProgressCount, completedCount, acceptedRiskCount },
      });
    }

    logger.info({ orgs: orgs.length }, "Remediation snapshots captured");
  }
}
```

**Step 5: Register job in scheduler index, run tests, commit**

Add to `apps/api/src/scheduler/index.ts` job registry:
```typescript
import { RemediationSnapshotJob } from "./jobs/remediation-snapshot.js";
// Add to jobs array: new RemediationSnapshotJob()
```

```bash
git commit -m "feat(scheduler): add remediation snapshot cron job for burndown data"
```

---

## Task 27: Charts API Endpoints

**Files:**
- Modify: `apps/api/src/routes/remediations.ts` or `apps/api/src/server.ts`
- Create: `packages/compliance/src/remediation/charts-service.ts`
- Modify: `packages/security/src/rbac.ts`

**Step 1: Add RBAC entries**

```typescript
{ method: "GET", path: "/v1/compliance/remediations/charts/burndown", roles: ["admin", "manager", "developer"] },
{ method: "GET", path: "/v1/compliance/remediations/charts/velocity", roles: ["admin", "manager", "developer"] },
{ method: "GET", path: "/v1/compliance/remediations/charts/aging", roles: ["admin", "manager", "developer"] },
{ method: "GET", path: "/v1/compliance/remediations/charts/sla", roles: ["admin", "manager", "developer"] },
```

**Step 2: Implement ChartsService**

```typescript
export class ChartsService {
  constructor(private db: any) {}

  async getBurndown(orgId: string, opts: { scope?: string; scopeValue?: string; days?: number }) {
    const since = new Date();
    since.setDate(since.getDate() - (opts.days ?? 30));

    return this.db.remediationSnapshot.findMany({
      where: {
        orgId,
        scope: opts.scope ?? "org",
        scopeValue: opts.scopeValue ?? null,
        snapshotDate: { gte: since },
      },
      orderBy: { snapshotDate: "asc" },
    });
  }

  async getVelocity(orgId: string, opts: { scope?: string; scopeValue?: string; days?: number }) {
    const since = new Date();
    since.setDate(since.getDate() - (opts.days ?? 90));

    return this.db.remediationItem.findMany({
      where: { orgId, status: "completed", completedAt: { gte: since } },
      select: { completedAt: true },
      orderBy: { completedAt: "asc" },
    });
  }

  async getAging(orgId: string) {
    const items = await this.db.remediationItem.findMany({
      where: { orgId, status: { in: ["open", "in_progress", "assigned", "in_review", "awaiting_deployment"] } },
      select: { createdAt: true, priority: true },
    });

    const now = Date.now();
    const buckets = { "0-7d": 0, "7-14d": 0, "14-30d": 0, "30d+": 0 };
    for (const item of items) {
      const ageDays = (now - new Date(item.createdAt).getTime()) / 86400000;
      if (ageDays <= 7) buckets["0-7d"]++;
      else if (ageDays <= 14) buckets["7-14d"]++;
      else if (ageDays <= 30) buckets["14-30d"]++;
      else buckets["30d+"]++;
    }
    return buckets;
  }

  async getSlaCompliance(orgId: string, opts: { days?: number }) {
    const since = new Date();
    since.setDate(since.getDate() - (opts.days ?? 90));

    const completed = await this.db.remediationItem.findMany({
      where: { orgId, status: "completed", completedAt: { gte: since }, dueDate: { not: null } },
      select: { completedAt: true, dueDate: true },
    });

    const total = completed.length;
    const onTime = completed.filter((i: any) => new Date(i.completedAt) <= new Date(i.dueDate)).length;
    return { total, onTime, rate: total > 0 ? Math.round((onTime / total) * 100) : 100 };
  }
}
```

**Step 3: Wire routes, commit**

```bash
git commit -m "feat(api): add remediation chart endpoints (burndown, velocity, aging, SLA)"
```

---

## Task 28: Auto-Remediation Service

**Files:**
- Create: `packages/compliance/src/remediation/auto-fix-service.ts`
- Create: `packages/compliance/src/__tests__/auto-fix-service.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AutoFixService } from "../remediation/auto-fix-service.js";

describe("AutoFixService", () => {
  let service: AutoFixService;
  let mockDb: any;
  let mockGitHub: any;
  let mockEventBus: any;

  beforeEach(() => {
    mockDb = {
      remediationItem: { findUnique: vi.fn(), update: vi.fn() },
      finding: { findUnique: vi.fn() },
    };
    mockGitHub = {
      createBranch: vi.fn().mockResolvedValue("fix/cve-2024-1234"),
      commitFile: vi.fn().mockResolvedValue("abc123"),
      createPullRequest: vi.fn().mockResolvedValue({ html_url: "https://github.com/org/repo/pull/42", number: 42 }),
    };
    mockEventBus = { publish: vi.fn() };
    service = new AutoFixService(mockDb, mockGitHub, mockEventBus);
  });

  it("rejects item without linked finding", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "rem-1", orgId: "org-1", findingId: null });
    await expect(service.triggerAutoFix("org-1", "rem-1", "user-1")).rejects.toThrow("No linked finding");
  });

  it("rejects finding without fix strategy", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "rem-1", orgId: "org-1", findingId: "f-1" });
    mockDb.finding.findUnique.mockResolvedValue({ id: "f-1", type: "custom", metadata: {} });
    await expect(service.triggerAutoFix("org-1", "rem-1", "user-1")).rejects.toThrow("No auto-fix strategy");
  });

  it("creates a PR for dependency vulnerability fix", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "rem-1", orgId: "org-1", findingId: "f-1", title: "CVE-2024-1234" });
    mockDb.finding.findUnique.mockResolvedValue({
      id: "f-1", type: "dependency", metadata: { packageName: "jsonwebtoken", fixedVersion: "9.0.3", manifestPath: "package.json" },
    });
    mockDb.remediationItem.update.mockResolvedValue({ id: "rem-1", externalRef: "github:org/repo#42" });

    const result = await service.triggerAutoFix("org-1", "rem-1", "user-1");
    expect(result).toHaveProperty("prUrl");
    expect(mockGitHub.createPullRequest).toHaveBeenCalled();
  });

  it("publishes remediation.auto_fix event", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "rem-1", orgId: "org-1", findingId: "f-1", title: "CVE-2024-1234" });
    mockDb.finding.findUnique.mockResolvedValue({
      id: "f-1", type: "dependency", metadata: { packageName: "jsonwebtoken", fixedVersion: "9.0.3", manifestPath: "package.json" },
    });
    mockDb.remediationItem.update.mockResolvedValue({});

    await service.triggerAutoFix("org-1", "rem-1", "user-1");
    expect(mockEventBus.publish).toHaveBeenCalledWith("sentinel.notifications", expect.objectContaining({ topic: "remediation.auto_fix" }));
  });
});
```

**Step 2: Implement AutoFixService**

```typescript
export interface GitHubPRClient {
  createBranch(repo: string, baseBranch: string, branchName: string): Promise<string>;
  commitFile(repo: string, branch: string, path: string, content: string, message: string): Promise<string>;
  createPullRequest(repo: string, head: string, base: string, title: string, body: string, draft: boolean): Promise<{ html_url: string; number: number }>;
}

const FIX_STRATEGIES: Record<string, (finding: any) => { path: string; content: string; message: string } | null> = {
  dependency: (finding) => {
    const { packageName, fixedVersion, manifestPath } = finding.metadata ?? {};
    if (!fixedVersion || !manifestPath) return null;
    return {
      path: manifestPath,
      content: `// Auto-fix: upgrade ${packageName} to ${fixedVersion}`,
      message: `fix(deps): upgrade ${packageName} to ${fixedVersion}`,
    };
  },
};

export class AutoFixService {
  constructor(private db: any, private github: GitHubPRClient, private eventBus: any) {}

  async triggerAutoFix(orgId: string, remediationId: string, userId: string) {
    const item = await this.db.remediationItem.findUnique({ where: { id: remediationId } });
    if (!item || item.orgId !== orgId) throw new Error("Remediation item not found");
    if (!item.findingId) throw new Error("No linked finding for auto-fix");

    const finding = await this.db.finding.findUnique({ where: { id: item.findingId } });
    const strategy = FIX_STRATEGIES[finding?.type];
    const fix = strategy?.(finding);
    if (!fix) throw new Error("No auto-fix strategy available for this finding type");

    const branchName = `sentinel/fix/${remediationId.slice(0, 8)}`;
    // In real implementation: clone, apply fix, push, create PR
    // For now: use GitHub API to create branch + commit + PR
    const repo = finding.metadata?.repo ?? "unknown/repo";
    await this.github.createBranch(repo, "main", branchName);
    await this.github.commitFile(repo, branchName, fix.path, fix.content, fix.message);
    const pr = await this.github.createPullRequest(repo, branchName, "main", fix.message, `Auto-fix for ${item.title}\n\n[Sentinel] Remediation: ${remediationId}`, true);

    await this.db.remediationItem.update({
      where: { id: remediationId },
      data: { externalRef: `github:${repo}#${pr.number}` },
    });

    await this.eventBus.publish("sentinel.notifications", {
      id: `evt-${remediationId}-autofix`,
      orgId,
      topic: "remediation.auto_fix",
      payload: { remediationId, prUrl: pr.html_url, triggeredBy: userId },
      timestamp: new Date().toISOString(),
    });

    return { prUrl: pr.html_url, prNumber: pr.number, branch: branchName };
  }
}
```

**Step 3: Run tests, export, commit**

```bash
cd packages/compliance && npx vitest run src/__tests__/auto-fix-service.test.ts
git commit -m "feat(compliance): add auto-remediation service with PR creation"
```

---

## Task 29: Auto-Fix API Route + RBAC

**Files:**
- Modify: `apps/api/src/server.ts`
- Modify: `packages/security/src/rbac.ts`

**Step 1: Add RBAC entries**

```typescript
{ method: "POST", path: "/v1/compliance/remediations/:id/auto-fix", roles: ["admin", "manager"] },
{ method: "GET", path: "/v1/compliance/remediations/:id/auto-fix/status", roles: ["admin", "manager", "developer"] },
```

**Step 2: Wire routes**

- `POST /:id/auto-fix` — Call `autoFixService.triggerAutoFix()`, return `{ prUrl, prNumber }`
- `GET /:id/auto-fix/status` — Read `externalRef`, return PR status if linked

**Step 3: Commit**

```bash
git commit -m "feat(api): add auto-fix routes for remediation items"
```

---

## Task 30: Two-Way Sync — Inbound Webhook Routes

**Files:**
- Create: `apps/api/src/routes/integration-webhooks.ts`
- Create: `packages/compliance/src/remediation/sync-handler.ts`
- Create: `packages/compliance/src/__tests__/sync-handler.test.ts`
- Modify: `apps/api/src/server.ts`

**Step 1: Write failing tests for SyncHandler**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncHandler } from "../remediation/sync-handler.js";

describe("SyncHandler", () => {
  let handler: SyncHandler;
  let mockDb: any;
  let mockEventBus: any;

  beforeEach(() => {
    mockDb = {
      remediationItem: { findFirst: vi.fn(), update: vi.fn() },
      integrationConfig: { findUnique: vi.fn() },
    };
    mockEventBus = { publish: vi.fn() };
    handler = new SyncHandler(mockDb, mockEventBus);
  });

  it("ignores updates with [Sentinel] prefix (echo prevention)", async () => {
    const result = await handler.handleJiraWebhook({
      issue: { key: "PROJ-123", fields: { summary: "[Sentinel] Fix CVE", status: { name: "Done" } } },
      webhookEvent: "jira:issue_updated",
      comment: { body: "[Sentinel] Auto-comment" },
    }, "org-1");
    expect(result.skipped).toBe(true);
  });

  it("maps Jira status to Sentinel status", async () => {
    mockDb.remediationItem.findFirst.mockResolvedValue({ id: "rem-1", orgId: "org-1", status: "open", externalRef: "jira:PROJ-123" });
    mockDb.remediationItem.update.mockResolvedValue({ id: "rem-1", status: "completed" });

    await handler.handleJiraWebhook({
      issue: { key: "PROJ-123", fields: { summary: "Fix something", status: { name: "Done" } } },
      webhookEvent: "jira:issue_updated",
    }, "org-1");

    expect(mockDb.remediationItem.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "completed" }),
    }));
  });

  it("maps GitHub issue close to completed", async () => {
    mockDb.remediationItem.findFirst.mockResolvedValue({ id: "rem-1", orgId: "org-1", status: "open", externalRef: "github:org/repo#42" });
    mockDb.remediationItem.update.mockResolvedValue({ id: "rem-1", status: "completed" });

    await handler.handleGitHubWebhook({
      action: "closed",
      issue: { number: 42, state: "closed" },
      repository: { full_name: "org/repo" },
    }, "org-1");

    expect(mockDb.remediationItem.update).toHaveBeenCalled();
  });

  it("skips if no matching remediation item found", async () => {
    mockDb.remediationItem.findFirst.mockResolvedValue(null);

    const result = await handler.handleJiraWebhook({
      issue: { key: "PROJ-999", fields: { summary: "Unknown", status: { name: "In Progress" } } },
      webhookEvent: "jira:issue_updated",
    }, "org-1");

    expect(result.skipped).toBe(true);
    expect(mockDb.remediationItem.update).not.toHaveBeenCalled();
  });

  it("publishes remediation.synced event", async () => {
    mockDb.remediationItem.findFirst.mockResolvedValue({ id: "rem-1", orgId: "org-1", status: "open", externalRef: "jira:PROJ-123" });
    mockDb.remediationItem.update.mockResolvedValue({ id: "rem-1", status: "in_progress" });

    await handler.handleJiraWebhook({
      issue: { key: "PROJ-123", fields: { summary: "Fix it", status: { name: "In Progress" } } },
      webhookEvent: "jira:issue_updated",
    }, "org-1");

    expect(mockEventBus.publish).toHaveBeenCalledWith("sentinel.notifications", expect.objectContaining({ topic: "remediation.synced" }));
  });
});
```

**Step 2: Implement SyncHandler**

```typescript
const JIRA_STATUS_MAP: Record<string, string> = {
  "To Do": "open",
  "In Progress": "in_progress",
  "In Review": "in_review",
  "Done": "completed",
};

const GITHUB_STATE_MAP: Record<string, string> = {
  open: "open",
  closed: "completed",
};

export class SyncHandler {
  constructor(private db: any, private eventBus: any) {}

  async handleJiraWebhook(payload: any, orgId: string) {
    const issueKey = payload.issue?.key;
    const summary = payload.issue?.fields?.summary ?? "";
    const commentBody = payload.comment?.body ?? "";

    // Echo prevention
    if (summary.startsWith("[Sentinel]") || commentBody.startsWith("[Sentinel]")) {
      return { skipped: true, reason: "echo_prevention" };
    }

    const externalRef = `jira:${issueKey}`;
    const item = await this.db.remediationItem.findFirst({ where: { orgId, externalRef } });
    if (!item) return { skipped: true, reason: "no_matching_item" };

    const jiraStatus = payload.issue?.fields?.status?.name;
    const newStatus = JIRA_STATUS_MAP[jiraStatus];
    if (!newStatus || newStatus === item.status) return { skipped: true, reason: "no_status_change" };

    await this.db.remediationItem.update({
      where: { id: item.id },
      data: { status: newStatus, ...(newStatus === "completed" ? { completedAt: new Date() } : {}) },
    });

    await this.eventBus.publish("sentinel.notifications", {
      id: `evt-${item.id}-sync`,
      orgId,
      topic: "remediation.synced",
      payload: { remediationId: item.id, source: "jira", externalRef, newStatus },
      timestamp: new Date().toISOString(),
    });

    return { skipped: false, itemId: item.id, newStatus };
  }

  async handleGitHubWebhook(payload: any, orgId: string) {
    const repo = payload.repository?.full_name;
    const issueNumber = payload.issue?.number;
    const externalRef = `github:${repo}#${issueNumber}`;

    const item = await this.db.remediationItem.findFirst({ where: { orgId, externalRef } });
    if (!item) return { skipped: true, reason: "no_matching_item" };

    const newStatus = GITHUB_STATE_MAP[payload.issue?.state];
    if (!newStatus || newStatus === item.status) return { skipped: true, reason: "no_status_change" };

    await this.db.remediationItem.update({
      where: { id: item.id },
      data: { status: newStatus, ...(newStatus === "completed" ? { completedAt: new Date() } : {}) },
    });

    await this.eventBus.publish("sentinel.notifications", {
      id: `evt-${item.id}-sync`,
      orgId,
      topic: "remediation.synced",
      payload: { remediationId: item.id, source: "github", externalRef, newStatus },
      timestamp: new Date().toISOString(),
    });

    return { skipped: false, itemId: item.id, newStatus };
  }
}
```

**Step 3: Create webhook routes**

Create `apps/api/src/routes/integration-webhooks.ts`:

```typescript
// POST /webhooks/jira — HMAC verification using shared secret from IntegrationConfig
// POST /webhooks/integration/github — HMAC verification using X-Hub-Signature-256
// Both: parse raw body, verify signature, extract orgId from URL or config, call SyncHandler
// Rate limiting disabled (matching existing webhook pattern)
```

Wire into server.ts alongside existing VCS webhook routes.

**Step 4: Run tests, commit**

```bash
cd packages/compliance && npx vitest run src/__tests__/sync-handler.test.ts
git commit -m "feat(compliance): add two-way sync handler for Jira/GitHub inbound webhooks"
```

---

## Task 31: Score Refresh Cron Job

**Files:**
- Create: `apps/api/src/scheduler/jobs/remediation-score-refresh.ts`
- Modify: `apps/api/src/scheduler/index.ts` (register job)

**Step 1: Implement score refresh job**

```typescript
import type { SchedulerJob, JobContext } from "../types.js";
import { computePriorityScore } from "@sentinel/compliance";

export class RemediationScoreRefreshJob implements SchedulerJob {
  name = "remediation-score-refresh" as const;
  schedule = "*/15 * * * *"; // every 15 minutes
  tier = "non-critical" as const;
  dependencies = ["postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const { db, logger } = ctx;

    const activeItems = await db.remediationItem.findMany({
      where: { status: { notIn: ["completed", "accepted_risk"] } },
      select: { id: true, priority: true, dueDate: true, linkedFindingIds: true, findingId: true, priorityScore: true },
    });

    let updated = 0;
    for (const item of activeItems) {
      const newScore = computePriorityScore({
        priority: item.priority,
        dueDate: item.dueDate,
        linkedFindingIds: item.linkedFindingIds,
        findingId: item.findingId,
      });

      if (newScore !== item.priorityScore) {
        await db.remediationItem.update({ where: { id: item.id }, data: { priorityScore: newScore } });
        updated++;
      }
    }

    logger.info({ total: activeItems.length, updated }, "Priority score refresh complete");
  }
}
```

**Step 2: Register in scheduler, commit**

```bash
git commit -m "feat(scheduler): add 15-min priority score refresh cron job"
```

---

## Task 32: Dashboard — Evidence Upload Component

**Files:**
- Create: `apps/dashboard/components/remediations/evidence-upload.tsx`
- Modify: `apps/dashboard/components/remediations/remediation-detail-panel.tsx` (integrate)
- Modify: `apps/dashboard/app/(dashboard)/remediations/actions.ts` (add server actions)
- Modify: `apps/dashboard/lib/api.ts` (add API functions)

**Step 1: Add API functions and server actions for evidence**

Add to `lib/api.ts`:
```typescript
export async function requestEvidenceUpload(remediationId: string, fileName: string, fileSize: number, mimeType: string) { ... }
export async function confirmEvidenceUpload(remediationId: string, s3Key: string, fileName: string, fileSize: number, mimeType: string) { ... }
export async function listEvidence(remediationId: string) { ... }
export async function getEvidenceDownloadUrl(remediationId: string, evidenceId: string) { ... }
export async function deleteEvidence(remediationId: string, evidenceId: string) { ... }
```

**Step 2: Create evidence-upload component**

Drag-drop file zone, file list with download links, delete buttons. Uses presigned URL flow:
1. Call `requestEvidenceUpload` -> get presigned URL
2. `fetch(presignedUrl, { method: "PUT", body: file })` direct to S3
3. Call `confirmEvidenceUpload` -> create DB record
4. Show progress bar during upload

**Step 3: Integrate into detail panel**

Add evidence section to `remediation-detail-panel.tsx` below the evidence notes field.

**Commit:**
```bash
git commit -m "feat(dashboard): add evidence upload component with S3 presigned URLs"
```

---

## Task 33: Dashboard — Burndown/Velocity Charts Page

**Files:**
- Create: `apps/dashboard/app/(dashboard)/remediations/charts/page.tsx`
- Create: `apps/dashboard/components/remediations/burndown-chart.tsx`
- Create: `apps/dashboard/components/remediations/velocity-chart.tsx`
- Create: `apps/dashboard/components/remediations/aging-chart.tsx`
- Create: `apps/dashboard/components/remediations/sla-chart.tsx`

**Step 1: Install Recharts**

```bash
cd apps/dashboard && pnpm add recharts
```

**Step 2: Create chart components**

Each chart component takes typed data props and renders using Recharts:
- `burndown-chart.tsx` — AreaChart with stacked open/inProgress areas
- `velocity-chart.tsx` — BarChart with weekly completed counts
- `aging-chart.tsx` — BarChart with stacked age buckets
- `sla-chart.tsx` — LineChart with SLA compliance % over time

All charts include scope selector dropdown (org/framework/assignee/project) and date range preset buttons (30d/60d/90d).

**Step 3: Create charts page**

Server component that fetches chart data for all 4 endpoints, renders in a 2x2 grid.

**Step 4: Add navigation link**

Add "Charts" sub-link under Remediations in sidebar.

**Commit:**
```bash
git commit -m "feat(dashboard): add burndown/velocity/aging/SLA chart components and page"
```

---

## Task 34: Dashboard — Workflow Config Editor + Auto-Fix Button

**Files:**
- Create: `apps/dashboard/app/(dashboard)/settings/workflow/page.tsx`
- Create: `apps/dashboard/components/remediations/workflow-config-editor.tsx`
- Create: `apps/dashboard/components/remediations/auto-fix-button.tsx`
- Modify: `apps/dashboard/components/remediations/remediation-detail-panel.tsx`

**Step 1: Create workflow config editor**

Toggle switches for each skippable stage (assigned, in_progress, in_review, awaiting_deployment). Shows preview of active workflow pipeline. Save button calls `PUT /v1/compliance/workflow-config`.

**Step 2: Create auto-fix button**

Button in detail panel that:
- Shows only when item has a linked finding
- Calls `POST /:id/auto-fix`
- Shows loading state, then PR link on success
- Disabled if item already has an external ref

**Step 3: Integrate into detail panel and settings**

**Commit:**
```bash
git commit -m "feat(dashboard): add workflow config editor and auto-fix button"
```

---

## Task 35: Extended Dashboard Tests

**Files:**
- Create: `apps/dashboard/__tests__/evidence-upload.test.tsx`
- Create: `apps/dashboard/__tests__/burndown-chart.test.tsx`
- Create: `apps/dashboard/__tests__/workflow-config-editor.test.tsx`
- Create: `apps/dashboard/__tests__/auto-fix-button.test.tsx`
- Create: `apps/dashboard/__tests__/sync-handler.test.tsx`

**Tests:**
- Evidence upload: renders file zone, validates file size/type, shows progress, calls presign/confirm
- Burndown chart: renders with mock data, handles empty data, scope selector changes refetch
- Workflow config: renders stage toggles, prevents skipping required stages, saves config
- Auto-fix button: renders when finding linked, disabled when already linked, shows PR link on success
- Sync handler (integration test): Jira webhook maps status correctly, GitHub webhook maps state

```bash
cd apps/dashboard && npx vitest run __tests__/evidence-upload.test.tsx __tests__/burndown-chart.test.tsx __tests__/workflow-config-editor.test.tsx __tests__/auto-fix-button.test.tsx
git commit -m "test(dashboard): add tests for evidence, charts, workflow config, auto-fix"
```

---

## Task 36: Final Integration Test — Run All Tests

**Run:**
```bash
npx turbo test --filter=@sentinel/api --filter=@sentinel/security --filter=@sentinel/compliance
cd apps/dashboard && npx vitest run
```

Expected: All tests pass across all packages.

**Final commit (if any fixes needed):**
```bash
git commit -m "fix: address integration test issues for expanded remediation dashboard"
```

---

## Task Summary

| # | Task | Files | Tests |
|---|------|-------|-------|
| 1 | Extend Prisma schema | schema.prisma, migration.sql | — |
| 2 | IntegrationConfig model | schema.prisma, migration.sql | — |
| 3 | Priority scoring function | priority-score.ts | 8 |
| 4 | Extend RemediationService | service.ts | ~10 |
| 5 | Extend API routes + RBAC | remediations.ts, server.ts, rbac.ts | — |
| 6 | API route tests | remediations.test.ts | 6 |
| 7 | Dashboard types + mock data | types.ts, mock-data.ts | — |
| 8 | Dashboard API functions | api.ts | — |
| 9 | Server actions | actions.ts | — |
| 10 | Main page | page.tsx | — |
| 11 | Detail page + client | page.tsx, detail-client.tsx | — |
| 12 | Stats bar, card, filters, toggle | 4 components | — |
| 13 | Table view | remediation-table.tsx | — |
| 14 | Kanban view | remediation-kanban.tsx | — |
| 15 | Detail panel | remediation-detail-panel.tsx | — |
| 16 | Queue orchestrator | remediation-queue.tsx | — |
| 17 | Create modal | remediation-create-modal.tsx | — |
| 18 | Dashboard tests | 4 test files | ~25 |
| 19 | Navigation link | sidebar | — |
| 20 | Final integration test (core) | — | all |
| 21 | Custom workflow FSM + schema | workflow-fsm.ts, schema.prisma | 10 |
| 22 | Update service for workflow | service.ts | 3 |
| 23 | Workflow config API routes | routes, rbac.ts | — |
| 24 | Evidence schema + service | evidence-service.ts, schema.prisma | 6 |
| 25 | Evidence upload API routes | routes, rbac.ts, s3-presigner.ts | — |
| 26 | Snapshot schema + cron job | remediation-snapshot.ts, schema.prisma | 3 |
| 27 | Charts API endpoints | charts-service.ts, routes | — |
| 28 | Auto-remediation service | auto-fix-service.ts | 4 |
| 29 | Auto-fix API routes | routes, rbac.ts | — |
| 30 | Two-way sync handler + webhooks | sync-handler.ts, integration-webhooks.ts | 5 |
| 31 | Score refresh cron job | remediation-score-refresh.ts | — |
| 32 | Evidence upload component | evidence-upload.tsx | — |
| 33 | Charts page + components | 5 chart files | — |
| 34 | Workflow config + auto-fix UI | 3 components | — |
| 35 | Extended dashboard tests | 5 test files | ~12 |
| 36 | Final integration test (all) | — | all |
| **Total** | | | **~92** |
