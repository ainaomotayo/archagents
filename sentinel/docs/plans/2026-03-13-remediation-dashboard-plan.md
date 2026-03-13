# Remediation Tracking Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unified remediation tracking dashboard with parent-child hierarchy, priority scoring, hybrid table/kanban views, SSE toast notifications, and Jira/GitHub Issues outbound integration.

**Architecture:** Modular monolith — extend existing Fastify API with new endpoints, add integration worker for async Jira/GitHub calls. Dashboard uses hybrid table/kanban with SSE toast + targeted refetch.

**Tech Stack:** Prisma 6, PostgreSQL, Fastify 5, Redis Streams, Next.js 15, SSE, Vitest

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
| 20 | Final integration test | — | all |
