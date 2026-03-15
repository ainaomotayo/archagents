# Org-Wide AI Code Metrics — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add org-wide AI code metrics dashboard showing % of AI-generated code, tool breakdown, trends, project leaderboard, compliance gaps, and anomaly alerts.

**Architecture:** Modular monolith — pure computation functions in `packages/compliance/src/ai-metrics/`, service orchestrates DB access, cron jobs in scheduler for daily snapshots and rollups, API routes in Fastify, Next.js dashboard with Recharts visualizations. Post-scan incremental update via existing event system.

**Tech Stack:** Prisma 6 (PostgreSQL), Fastify 5, Redis Streams, Next.js 15, Recharts, Vitest

---

## Reference Files

Before starting, familiarize yourself with these existing patterns:

| Pattern | File | Key Lines |
|---------|------|-----------|
| Prisma schema | `packages/db/prisma/schema.prisma` | Organization:11-41, Project:43-60, Finding:91-119 |
| Service class | `packages/compliance/src/remediation/service.ts` | Constructor:31, create:34-89, list:191-202 |
| Pure computation | `packages/compliance/src/remediation/priority-score.ts` | Full file (34 lines) |
| Scheduler job | `apps/api/src/scheduler/jobs/compliance-snapshot.ts` | Full file (108 lines) |
| Job types | `apps/api/src/scheduler/types.ts` | SchedulerJob:26-32, JobContext:8-16 |
| Job registration | `apps/api/src/scheduler/index.ts` | Lines 20-31 (imports), 229-248 (registration) |
| Route factory | `apps/api/src/routes/remediations.ts` | Full file (41 lines) |
| Server routes | `apps/api/src/server.ts` | Lines 1-45 (imports), route handlers throughout |
| RBAC rules | `packages/security/src/rbac.ts` | API_PERMISSIONS array |
| Auth middleware | `apps/api/src/middleware/auth.ts` | createAuthHook:36-146 |
| Dashboard API | `apps/dashboard/lib/api.ts` | getSessionHeaders:45-59, fetch pattern |
| Dashboard types | `apps/dashboard/lib/types.ts` | Type definitions |
| Dashboard RBAC | `apps/dashboard/lib/rbac.ts` | NAV_ITEMS:48-61, ROUTE_PERMISSIONS:22-35 |
| Server actions | `apps/dashboard/app/(dashboard)/remediations/actions.ts` | Pattern for all actions |
| Test pattern | `apps/dashboard/__tests__/remediation-card.test.ts` | Factory function, vi.useFakeTimers |
| AI detector output | `agents/ai-detector/sentinel_aidetector/agent.py` | Finding extra fields:148-174 |
| Package exports | `packages/compliance/src/index.ts` | Full file (46 lines) |

---

### Task 1: Prisma Schema — Add AIMetricsSnapshot and AIMetricsConfig models

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Step 1: Add AIMetricsSnapshot model**

Add after the `RemediationSnapshot` model (around line 824):

```prisma
model AIMetricsSnapshot {
  id                String    @id @default(uuid()) @db.Uuid
  orgId             String    @map("org_id") @db.Uuid
  projectId         String?   @map("project_id") @db.Uuid
  snapshotDate      DateTime  @map("snapshot_date") @db.Date
  granularity       String    @default("daily")

  totalFiles        Int       @map("total_files")
  aiFiles           Int       @map("ai_files")
  totalLoc          Int       @map("total_loc")
  aiLoc             Int       @map("ai_loc")
  aiRatio           Float     @map("ai_ratio")
  aiInfluenceScore  Float     @map("ai_influence_score")

  avgProbability    Float     @map("avg_probability")
  medianProbability Float     @map("median_probability")
  p95Probability    Float     @map("p95_probability")

  toolBreakdown     Json      @default("[]") @map("tool_breakdown")
  complianceGaps    Json      @default("{}") @map("compliance_gaps")

  scanCount         Int       @map("scan_count")
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz

  organization      Organization @relation(fields: [orgId], references: [id])
  project           Project?     @relation(fields: [projectId], references: [id])

  @@unique([orgId, projectId, snapshotDate, granularity])
  @@index([orgId, granularity, snapshotDate(sort: Desc)])
  @@index([projectId, granularity, snapshotDate(sort: Desc)])
  @@map("ai_metrics_snapshots")
}

model AIMetricsConfig {
  id                String   @id @default(uuid()) @db.Uuid
  orgId             String   @unique @map("org_id") @db.Uuid
  threshold         Float    @default(0.50)
  strictMode        Boolean  @default(false) @map("strict_mode")
  alertEnabled      Boolean  @default(false) @map("alert_enabled")
  alertMaxRatio     Float?   @map("alert_max_ratio")
  alertSpikeStdDev  Float    @default(2.0) @map("alert_spike_std_dev")
  alertNewTool      Boolean  @default(true) @map("alert_new_tool")
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt         DateTime @updatedAt @map("updated_at") @db.Timestamptz

  organization      Organization @relation(fields: [orgId], references: [id])
  @@map("ai_metrics_configs")
}
```

**Step 2: Add relations to Organization model**

In the `Organization` model (around line 11), add these two relation fields alongside existing relations:

```prisma
  aiMetricsSnapshots AIMetricsSnapshot[]
  aiMetricsConfig    AIMetricsConfig?
```

**Step 3: Add relation to Project model**

In the `Project` model (around line 43), add:

```prisma
  aiMetricsSnapshots AIMetricsSnapshot[]
```

**Step 4: Generate Prisma client**

Run: `cd packages/db && npx prisma generate`
Expected: "Generated Prisma Client"

**Step 5: Run existing tests to ensure schema is valid**

Run: `npx turbo test --filter=@sentinel/db`
Expected: All existing tests pass

**Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(ai-metrics): add AIMetricsSnapshot and AIMetricsConfig schema models"
```

---

### Task 2: Pure Function — compute-ai-ratio.ts

**Files:**
- Create: `packages/compliance/src/ai-metrics/compute-ai-ratio.ts`
- Create: `packages/compliance/src/__tests__/compute-ai-ratio.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/compliance/src/__tests__/compute-ai-ratio.test.ts
import { describe, it, expect } from "vitest";
import { computeAIRatio, type FileSignal } from "../ai-metrics/compute-ai-ratio.js";

function makeFile(overrides: Partial<FileSignal> = {}): FileSignal {
  return {
    file: "src/index.ts",
    loc: 100,
    aiProbability: 0.7,
    markerTools: [],
    estimatedTool: null,
    ...overrides,
  };
}

describe("computeAIRatio", () => {
  it("returns zeros for empty file list", () => {
    const result = computeAIRatio([], 0.5);
    expect(result.aiRatio).toBe(0);
    expect(result.totalFiles).toBe(0);
    expect(result.aiFiles).toBe(0);
    expect(result.totalLoc).toBe(0);
    expect(result.aiLoc).toBe(0);
    expect(result.aiInfluenceScore).toBe(0);
    expect(result.avgProbability).toBe(0);
    expect(result.medianProbability).toBe(0);
    expect(result.p95Probability).toBe(0);
  });

  it("classifies files above threshold as AI", () => {
    const files = [
      makeFile({ loc: 200, aiProbability: 0.8 }),  // above 0.5
      makeFile({ loc: 100, aiProbability: 0.3 }),  // below 0.5
    ];
    const result = computeAIRatio(files, 0.5);
    expect(result.aiFiles).toBe(1);
    expect(result.totalFiles).toBe(2);
    expect(result.aiLoc).toBe(200);
    expect(result.totalLoc).toBe(300);
    expect(result.aiRatio).toBeCloseTo(200 / 300, 4);
  });

  it("computes fractional influence score using LOC weighting", () => {
    const files = [
      makeFile({ loc: 200, aiProbability: 0.8 }),
      makeFile({ loc: 100, aiProbability: 0.3 }),
    ];
    const result = computeAIRatio(files, 0.5);
    // (0.8*200 + 0.3*100) / (200+100) = 190/300
    expect(result.aiInfluenceScore).toBeCloseTo(190 / 300, 4);
  });

  it("counts all files as AI when all above threshold", () => {
    const files = [
      makeFile({ loc: 50, aiProbability: 0.9 }),
      makeFile({ loc: 50, aiProbability: 0.6 }),
    ];
    const result = computeAIRatio(files, 0.5);
    expect(result.aiFiles).toBe(2);
    expect(result.aiRatio).toBe(1.0);
  });

  it("counts no files as AI when all below threshold", () => {
    const files = [
      makeFile({ loc: 50, aiProbability: 0.1 }),
      makeFile({ loc: 50, aiProbability: 0.4 }),
    ];
    const result = computeAIRatio(files, 0.5);
    expect(result.aiFiles).toBe(0);
    expect(result.aiRatio).toBe(0);
  });

  it("uses strict threshold (file at exactly threshold is AI)", () => {
    const files = [makeFile({ loc: 100, aiProbability: 0.5 })];
    const result = computeAIRatio(files, 0.5);
    expect(result.aiFiles).toBe(1);
  });

  it("computes correct percentiles", () => {
    const files = Array.from({ length: 20 }, (_, i) =>
      makeFile({ aiProbability: (i + 1) / 20 })
    );
    const result = computeAIRatio(files, 0.5);
    expect(result.avgProbability).toBeCloseTo(0.525, 2);
    expect(result.medianProbability).toBeCloseTo(0.525, 2);
    expect(result.p95Probability).toBeCloseTo(0.95, 1);
  });

  it("handles single file", () => {
    const result = computeAIRatio([makeFile({ loc: 50, aiProbability: 0.9 })], 0.5);
    expect(result.totalFiles).toBe(1);
    expect(result.aiFiles).toBe(1);
    expect(result.medianProbability).toBe(0.9);
    expect(result.p95Probability).toBe(0.9);
  });

  it("handles files with 0 LOC gracefully", () => {
    const files = [
      makeFile({ loc: 0, aiProbability: 0.9 }),
      makeFile({ loc: 100, aiProbability: 0.8 }),
    ];
    const result = computeAIRatio(files, 0.5);
    expect(result.totalLoc).toBe(100);
    expect(result.aiRatio).toBe(1.0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/compliance && npx vitest run src/__tests__/compute-ai-ratio.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// packages/compliance/src/ai-metrics/compute-ai-ratio.ts
export interface FileSignal {
  file: string;
  loc: number;
  aiProbability: number;
  markerTools: string[];
  estimatedTool: string | null;
}

export interface AIRatioResult {
  aiRatio: number;
  aiFiles: number;
  totalFiles: number;
  aiLoc: number;
  totalLoc: number;
  aiInfluenceScore: number;
  avgProbability: number;
  medianProbability: number;
  p95Probability: number;
}

export function computeAIRatio(files: FileSignal[], threshold: number): AIRatioResult {
  if (files.length === 0) {
    return {
      aiRatio: 0, aiFiles: 0, totalFiles: 0,
      aiLoc: 0, totalLoc: 0, aiInfluenceScore: 0,
      avgProbability: 0, medianProbability: 0, p95Probability: 0,
    };
  }

  let totalLoc = 0;
  let aiLoc = 0;
  let aiFiles = 0;
  let weightedProbSum = 0;
  let probSum = 0;
  const probs: number[] = [];

  for (const f of files) {
    totalLoc += f.loc;
    probSum += f.aiProbability;
    probs.push(f.aiProbability);
    weightedProbSum += f.aiProbability * f.loc;

    if (f.aiProbability >= threshold) {
      aiFiles++;
      aiLoc += f.loc;
    }
  }

  probs.sort((a, b) => a - b);

  const aiRatio = totalLoc > 0 ? aiLoc / totalLoc : 0;
  const aiInfluenceScore = totalLoc > 0 ? weightedProbSum / totalLoc : 0;
  const avgProbability = probSum / files.length;
  const medianProbability = percentile(probs, 0.5);
  const p95Probability = percentile(probs, 0.95);

  return {
    aiRatio, aiFiles, totalFiles: files.length,
    aiLoc, totalLoc, aiInfluenceScore,
    avgProbability, medianProbability, p95Probability,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/compliance && npx vitest run src/__tests__/compute-ai-ratio.test.ts`
Expected: All 8 tests PASS

**Step 5: Commit**

```bash
git add packages/compliance/src/ai-metrics/compute-ai-ratio.ts packages/compliance/src/__tests__/compute-ai-ratio.test.ts
git commit -m "feat(ai-metrics): add compute-ai-ratio pure function with tests"
```

---

### Task 3: Pure Function — compute-tool-breakdown.ts

**Files:**
- Create: `packages/compliance/src/ai-metrics/compute-tool-breakdown.ts`
- Create: `packages/compliance/src/__tests__/compute-tool-breakdown.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/compliance/src/__tests__/compute-tool-breakdown.test.ts
import { describe, it, expect } from "vitest";
import { computeToolBreakdown, type ToolBreakdownEntry } from "../ai-metrics/compute-tool-breakdown.js";
import type { FileSignal } from "../ai-metrics/compute-ai-ratio.js";

function makeFile(overrides: Partial<FileSignal> = {}): FileSignal {
  return {
    file: "src/index.ts",
    loc: 100,
    aiProbability: 0.7,
    markerTools: [],
    estimatedTool: null,
    ...overrides,
  };
}

describe("computeToolBreakdown", () => {
  it("returns empty array for no files", () => {
    expect(computeToolBreakdown([], 0.5)).toEqual([]);
  });

  it("groups confirmed tools from markerTools", () => {
    const files = [
      makeFile({ loc: 100, markerTools: ["copilot"], aiProbability: 0.8 }),
      makeFile({ loc: 200, markerTools: ["copilot"], aiProbability: 0.9 }),
      makeFile({ loc: 50, markerTools: ["claude"], aiProbability: 0.7 }),
    ];
    const result = computeToolBreakdown(files, 0.5);
    const copilot = result.find((e) => e.tool === "copilot");
    expect(copilot).toBeDefined();
    expect(copilot!.confirmedFiles).toBe(2);
    expect(copilot!.totalLoc).toBe(300);
  });

  it("groups estimated tools separately", () => {
    const files = [
      makeFile({ loc: 100, estimatedTool: "cursor", aiProbability: 0.8 }),
    ];
    const result = computeToolBreakdown(files, 0.5);
    const cursor = result.find((e) => e.tool === "cursor");
    expect(cursor).toBeDefined();
    expect(cursor!.confirmedFiles).toBe(0);
    expect(cursor!.estimatedFiles).toBe(1);
  });

  it("only includes files above threshold", () => {
    const files = [
      makeFile({ loc: 100, markerTools: ["copilot"], aiProbability: 0.3 }),
    ];
    const result = computeToolBreakdown(files, 0.5);
    expect(result).toEqual([]);
  });

  it("calculates correct percentages", () => {
    const files = [
      makeFile({ loc: 100, markerTools: ["copilot"], aiProbability: 0.8 }),
      makeFile({ loc: 100, markerTools: ["claude"], aiProbability: 0.9 }),
    ];
    const result = computeToolBreakdown(files, 0.5);
    expect(result.length).toBe(2);
    for (const entry of result) {
      expect(entry.percentage).toBeCloseTo(50, 0);
    }
  });

  it("sorts by totalLoc descending", () => {
    const files = [
      makeFile({ loc: 50, markerTools: ["claude"], aiProbability: 0.8 }),
      makeFile({ loc: 200, markerTools: ["copilot"], aiProbability: 0.8 }),
    ];
    const result = computeToolBreakdown(files, 0.5);
    expect(result[0].tool).toBe("copilot");
    expect(result[1].tool).toBe("claude");
  });

  it("handles file with multiple marker tools", () => {
    const files = [
      makeFile({ loc: 100, markerTools: ["copilot", "chatgpt"], aiProbability: 0.8 }),
    ];
    const result = computeToolBreakdown(files, 0.5);
    // File counted once under first tool
    expect(result.length).toBeGreaterThanOrEqual(1);
    const total = result.reduce((s, e) => s + e.confirmedFiles, 0);
    expect(total).toBeGreaterThanOrEqual(1);
  });

  it("buckets files with no tool as 'unknown'", () => {
    const files = [
      makeFile({ loc: 100, aiProbability: 0.8 }),
    ];
    const result = computeToolBreakdown(files, 0.5);
    const unknown = result.find((e) => e.tool === "unknown");
    expect(unknown).toBeDefined();
    expect(unknown!.estimatedFiles).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/compliance && npx vitest run src/__tests__/compute-tool-breakdown.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// packages/compliance/src/ai-metrics/compute-tool-breakdown.ts
import type { FileSignal } from "./compute-ai-ratio.js";

export interface ToolBreakdownEntry {
  tool: string;
  confirmedFiles: number;
  estimatedFiles: number;
  totalLoc: number;
  percentage: number;
}

export function computeToolBreakdown(
  files: FileSignal[],
  threshold: number,
): ToolBreakdownEntry[] {
  const aiFiles = files.filter((f) => f.aiProbability >= threshold);
  if (aiFiles.length === 0) return [];

  const map = new Map<string, { confirmed: number; estimated: number; loc: number }>();

  for (const f of aiFiles) {
    if (f.markerTools.length > 0) {
      // Use first marker tool as primary attribution
      const tool = f.markerTools[0].toLowerCase();
      const entry = map.get(tool) ?? { confirmed: 0, estimated: 0, loc: 0 };
      entry.confirmed++;
      entry.loc += f.loc;
      map.set(tool, entry);
    } else if (f.estimatedTool) {
      const tool = f.estimatedTool.toLowerCase();
      const entry = map.get(tool) ?? { confirmed: 0, estimated: 0, loc: 0 };
      entry.estimated++;
      entry.loc += f.loc;
      map.set(tool, entry);
    } else {
      const entry = map.get("unknown") ?? { confirmed: 0, estimated: 0, loc: 0 };
      entry.estimated++;
      entry.loc += f.loc;
      map.set("unknown", entry);
    }
  }

  const totalLoc = aiFiles.reduce((s, f) => s + f.loc, 0);
  const result: ToolBreakdownEntry[] = [];

  for (const [tool, data] of map) {
    result.push({
      tool,
      confirmedFiles: data.confirmed,
      estimatedFiles: data.estimated,
      totalLoc: data.loc,
      percentage: totalLoc > 0 ? (data.loc / totalLoc) * 100 : 0,
    });
  }

  return result.sort((a, b) => b.totalLoc - a.totalLoc);
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/compliance && npx vitest run src/__tests__/compute-tool-breakdown.test.ts`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add packages/compliance/src/ai-metrics/compute-tool-breakdown.ts packages/compliance/src/__tests__/compute-tool-breakdown.test.ts
git commit -m "feat(ai-metrics): add compute-tool-breakdown pure function with tests"
```

---

### Task 4: Pure Functions — compute-trends.ts and compute-granularity.ts

**Files:**
- Create: `packages/compliance/src/ai-metrics/compute-granularity.ts`
- Create: `packages/compliance/src/ai-metrics/compute-trends.ts`
- Create: `packages/compliance/src/__tests__/compute-trends.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/compliance/src/__tests__/compute-trends.test.ts
import { describe, it, expect } from "vitest";
import { selectGranularity } from "../ai-metrics/compute-granularity.js";
import { computeTrends, type SnapshotInput } from "../ai-metrics/compute-trends.js";

describe("selectGranularity", () => {
  it("returns daily for 90 days or fewer", () => {
    expect(selectGranularity(30)).toBe("daily");
    expect(selectGranularity(90)).toBe("daily");
  });

  it("returns weekly for 91-365 days", () => {
    expect(selectGranularity(91)).toBe("weekly");
    expect(selectGranularity(365)).toBe("weekly");
  });

  it("returns monthly for over 365 days", () => {
    expect(selectGranularity(366)).toBe("monthly");
    expect(selectGranularity(730)).toBe("monthly");
  });
});

function makeSnapshot(date: string, aiRatio: number, scanCount = 1): SnapshotInput {
  return {
    snapshotDate: new Date(date),
    aiRatio,
    aiInfluenceScore: aiRatio * 0.9,
    scanCount,
  };
}

describe("computeTrends", () => {
  it("returns empty points for no snapshots", () => {
    const result = computeTrends([], 30);
    expect(result.points).toEqual([]);
    expect(result.momChange).toBe(0);
    expect(result.movingAvg7d).toBe(0);
    expect(result.movingAvg30d).toBe(0);
  });

  it("maps snapshots to trend points", () => {
    const snapshots = [
      makeSnapshot("2026-03-01", 0.2),
      makeSnapshot("2026-03-02", 0.25),
      makeSnapshot("2026-03-03", 0.3),
    ];
    const result = computeTrends(snapshots, 30);
    expect(result.points).toHaveLength(3);
    expect(result.points[0].date).toBe("2026-03-01");
    expect(result.points[0].aiRatio).toBe(0.2);
  });

  it("computes 7-day moving average from last 7 points", () => {
    const snapshots = Array.from({ length: 10 }, (_, i) =>
      makeSnapshot(`2026-03-${String(i + 1).padStart(2, "0")}`, 0.1 * (i + 1))
    );
    const result = computeTrends(snapshots, 30);
    // Last 7 ratios: 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0 → avg = 0.7
    expect(result.movingAvg7d).toBeCloseTo(0.7, 2);
  });

  it("computes month-over-month change", () => {
    const snapshots = [
      makeSnapshot("2026-02-01", 0.2),
      makeSnapshot("2026-02-15", 0.2),
      makeSnapshot("2026-03-01", 0.3),
      makeSnapshot("2026-03-10", 0.3),
    ];
    const result = computeTrends(snapshots, 90);
    // Current month avg (March): 0.3, Previous month avg (Feb): 0.2
    // MoM = (0.3 - 0.2) / 0.2 = 0.5
    expect(result.momChange).toBeCloseTo(0.5, 2);
  });

  it("handles single snapshot", () => {
    const result = computeTrends([makeSnapshot("2026-03-01", 0.5)], 30);
    expect(result.points).toHaveLength(1);
    expect(result.movingAvg7d).toBe(0.5);
    expect(result.movingAvg30d).toBe(0.5);
    expect(result.momChange).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/compliance && npx vitest run src/__tests__/compute-trends.test.ts`
Expected: FAIL — module not found

**Step 3: Write compute-granularity.ts**

```typescript
// packages/compliance/src/ai-metrics/compute-granularity.ts
export function selectGranularity(days: number): "daily" | "weekly" | "monthly" {
  if (days <= 90) return "daily";
  if (days <= 365) return "weekly";
  return "monthly";
}
```

**Step 4: Write compute-trends.ts**

```typescript
// packages/compliance/src/ai-metrics/compute-trends.ts
export interface SnapshotInput {
  snapshotDate: Date;
  aiRatio: number;
  aiInfluenceScore: number;
  scanCount: number;
}

export interface TrendPoint {
  date: string;
  aiRatio: number;
  aiInfluenceScore: number;
  scanCount: number;
}

export interface TrendResult {
  points: TrendPoint[];
  momChange: number;
  movingAvg7d: number;
  movingAvg30d: number;
}

export function computeTrends(snapshots: SnapshotInput[], days: number): TrendResult {
  if (snapshots.length === 0) {
    return { points: [], momChange: 0, movingAvg7d: 0, movingAvg30d: 0 };
  }

  const sorted = [...snapshots].sort(
    (a, b) => a.snapshotDate.getTime() - b.snapshotDate.getTime(),
  );

  const points: TrendPoint[] = sorted.map((s) => ({
    date: s.snapshotDate.toISOString().slice(0, 10),
    aiRatio: s.aiRatio,
    aiInfluenceScore: s.aiInfluenceScore,
    scanCount: s.scanCount,
  }));

  const movingAvg7d = movingAverage(sorted.map((s) => s.aiRatio), 7);
  const movingAvg30d = movingAverage(sorted.map((s) => s.aiRatio), 30);
  const momChange = computeMoM(sorted);

  return { points, momChange, movingAvg7d, movingAvg30d };
}

function movingAverage(values: number[], window: number): number {
  if (values.length === 0) return 0;
  const slice = values.slice(-window);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function computeMoM(sorted: SnapshotInput[]): number {
  if (sorted.length < 2) return 0;

  const latest = sorted[sorted.length - 1].snapshotDate;
  const currentMonth = latest.getUTCMonth();
  const currentYear = latest.getUTCFullYear();

  const currentMonthData = sorted.filter((s) => {
    return s.snapshotDate.getUTCMonth() === currentMonth
      && s.snapshotDate.getUTCFullYear() === currentYear;
  });

  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  const prevMonthData = sorted.filter((s) => {
    return s.snapshotDate.getUTCMonth() === prevMonth
      && s.snapshotDate.getUTCFullYear() === prevYear;
  });

  if (prevMonthData.length === 0) return 0;

  const currentAvg = currentMonthData.reduce((s, d) => s + d.aiRatio, 0) / currentMonthData.length;
  const prevAvg = prevMonthData.reduce((s, d) => s + d.aiRatio, 0) / prevMonthData.length;

  if (prevAvg === 0) return 0;
  return (currentAvg - prevAvg) / prevAvg;
}
```

**Step 5: Run test to verify it passes**

Run: `cd packages/compliance && npx vitest run src/__tests__/compute-trends.test.ts`
Expected: All 8 tests PASS

**Step 6: Commit**

```bash
git add packages/compliance/src/ai-metrics/compute-granularity.ts packages/compliance/src/ai-metrics/compute-trends.ts packages/compliance/src/__tests__/compute-trends.test.ts
git commit -m "feat(ai-metrics): add compute-trends and compute-granularity with tests"
```

---

### Task 5: Pure Function — detect-anomalies.ts

**Files:**
- Create: `packages/compliance/src/ai-metrics/detect-anomalies.ts`
- Create: `packages/compliance/src/__tests__/detect-anomalies.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/compliance/src/__tests__/detect-anomalies.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { detectAnomalies, type AnomalyAlert, type AnomalyConfig, type ProjectSnapshot } from "../ai-metrics/detect-anomalies.js";

function makeConfig(overrides: Partial<AnomalyConfig> = {}): AnomalyConfig {
  return {
    alertEnabled: true,
    alertMaxRatio: 0.5,
    alertSpikeStdDev: 2.0,
    alertNewTool: true,
    ...overrides,
  };
}

function makeProjectSnapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    projectId: "proj-1",
    projectName: "frontend",
    aiRatio: 0.3,
    toolBreakdown: [{ tool: "copilot", confirmedFiles: 5, estimatedFiles: 0, totalLoc: 500, percentage: 100 }],
    ...overrides,
  };
}

describe("detectAnomalies", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-14T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty when alerts disabled", () => {
    const result = detectAnomalies(0.6, [makeProjectSnapshot()], makeConfig({ alertEnabled: false }), []);
    expect(result).toEqual([]);
  });

  it("detects threshold exceeded", () => {
    const config = makeConfig({ alertMaxRatio: 0.5 });
    const result = detectAnomalies(0.6, [], config, []);
    const alert = result.find((a) => a.type === "threshold_exceeded");
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("critical");
    expect(alert!.detail).toContain("60");
  });

  it("does not alert when below threshold", () => {
    const config = makeConfig({ alertMaxRatio: 0.5 });
    const result = detectAnomalies(0.3, [], config, []);
    expect(result.find((a) => a.type === "threshold_exceeded")).toBeUndefined();
  });

  it("detects spike in project ratio", () => {
    const orgMean = 0.2;
    const orgStdDev = 0.05;
    // Project at 0.35 = 3 stddev above mean (0.2 + 2*0.05 = 0.3 < 0.35)
    const projects = [makeProjectSnapshot({ aiRatio: 0.35 })];
    const history = Array.from({ length: 10 }, () => 0.2);
    const config = makeConfig({ alertSpikeStdDev: 2.0 });

    const result = detectAnomalies(orgMean, projects, config, history);
    const spike = result.find((a) => a.type === "spike_detected");
    expect(spike).toBeDefined();
    expect(spike!.projectId).toBe("proj-1");
    expect(spike!.severity).toBe("warning");
  });

  it("detects new tool appearance", () => {
    const projects = [
      makeProjectSnapshot({
        toolBreakdown: [
          { tool: "copilot", confirmedFiles: 5, estimatedFiles: 0, totalLoc: 500, percentage: 80 },
          { tool: "devin", confirmedFiles: 1, estimatedFiles: 0, totalLoc: 100, percentage: 20 },
        ],
      }),
    ];
    const knownTools = ["copilot", "claude"];
    const config = makeConfig({ alertNewTool: true });
    const result = detectAnomalies(0.3, projects, config, [], knownTools);
    const newTool = result.find((a) => a.type === "new_tool");
    expect(newTool).toBeDefined();
    expect(newTool!.detail).toContain("devin");
  });

  it("does not detect new tool when alertNewTool is false", () => {
    const projects = [
      makeProjectSnapshot({
        toolBreakdown: [{ tool: "devin", confirmedFiles: 1, estimatedFiles: 0, totalLoc: 100, percentage: 100 }],
      }),
    ];
    const config = makeConfig({ alertNewTool: false });
    const result = detectAnomalies(0.3, projects, config, [], []);
    expect(result.find((a) => a.type === "new_tool")).toBeUndefined();
  });

  it("handles null alertMaxRatio gracefully", () => {
    const config = makeConfig({ alertMaxRatio: null as any });
    const result = detectAnomalies(0.9, [], config, []);
    expect(result.find((a) => a.type === "threshold_exceeded")).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/compliance && npx vitest run src/__tests__/detect-anomalies.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// packages/compliance/src/ai-metrics/detect-anomalies.ts
import type { ToolBreakdownEntry } from "./compute-tool-breakdown.js";

export interface AnomalyConfig {
  alertEnabled: boolean;
  alertMaxRatio: number | null;
  alertSpikeStdDev: number;
  alertNewTool: boolean;
}

export interface ProjectSnapshot {
  projectId: string;
  projectName: string;
  aiRatio: number;
  toolBreakdown: ToolBreakdownEntry[];
}

export interface AnomalyAlert {
  type: "threshold_exceeded" | "spike_detected" | "new_tool";
  projectId?: string;
  projectName?: string;
  detail: string;
  severity: "warning" | "critical";
  detectedAt: string;
}

export function detectAnomalies(
  orgRatio: number,
  projects: ProjectSnapshot[],
  config: AnomalyConfig,
  orgRatioHistory: number[],
  knownTools?: string[],
): AnomalyAlert[] {
  if (!config.alertEnabled) return [];

  const alerts: AnomalyAlert[] = [];
  const now = new Date().toISOString();

  // 1. Threshold exceeded
  if (config.alertMaxRatio != null && orgRatio > config.alertMaxRatio) {
    alerts.push({
      type: "threshold_exceeded",
      detail: `Org AI ratio ${(orgRatio * 100).toFixed(1)}% exceeds limit of ${(config.alertMaxRatio * 100).toFixed(1)}%`,
      severity: "critical",
      detectedAt: now,
    });
  }

  // 2. Spike detection per project
  if (orgRatioHistory.length >= 3) {
    const mean = orgRatioHistory.reduce((s, v) => s + v, 0) / orgRatioHistory.length;
    const variance = orgRatioHistory.reduce((s, v) => s + (v - mean) ** 2, 0) / orgRatioHistory.length;
    const stdDev = Math.sqrt(variance);
    const spikeThreshold = mean + config.alertSpikeStdDev * stdDev;

    for (const proj of projects) {
      if (proj.aiRatio > spikeThreshold) {
        alerts.push({
          type: "spike_detected",
          projectId: proj.projectId,
          projectName: proj.projectName,
          detail: `Project "${proj.projectName}" AI ratio ${(proj.aiRatio * 100).toFixed(1)}% is ${((proj.aiRatio - mean) / (stdDev || 1)).toFixed(1)} std devs above org mean`,
          severity: "warning",
          detectedAt: now,
        });
      }
    }
  }

  // 3. New tool detection
  if (config.alertNewTool && knownTools) {
    const knownSet = new Set(knownTools.map((t) => t.toLowerCase()));
    for (const proj of projects) {
      for (const entry of proj.toolBreakdown) {
        if (entry.tool !== "unknown" && !knownSet.has(entry.tool.toLowerCase())) {
          alerts.push({
            type: "new_tool",
            projectId: proj.projectId,
            projectName: proj.projectName,
            detail: `New AI tool "${entry.tool}" detected in project "${proj.projectName}"`,
            severity: "warning",
            detectedAt: now,
          });
          knownSet.add(entry.tool.toLowerCase()); // Don't duplicate per project
        }
      }
    }
  }

  return alerts;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/compliance && npx vitest run src/__tests__/detect-anomalies.test.ts`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add packages/compliance/src/ai-metrics/detect-anomalies.ts packages/compliance/src/__tests__/detect-anomalies.test.ts
git commit -m "feat(ai-metrics): add detect-anomalies pure function with tests"
```

---

### Task 6: AIMetricsService — Service Layer

**Files:**
- Create: `packages/compliance/src/ai-metrics/service.ts`
- Create: `packages/compliance/src/__tests__/ai-metrics-service.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/compliance/src/__tests__/ai-metrics-service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AIMetricsService } from "../ai-metrics/service.js";

function createMockDb() {
  return {
    finding: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    aIMetricsSnapshot: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
    },
    aIMetricsConfig: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async (args: any) => args.update ?? args.create),
    },
    project: {
      findMany: vi.fn(async () => []),
    },
  };
}

describe("AIMetricsService", () => {
  let db: ReturnType<typeof createMockDb>;
  let service: AIMetricsService;

  beforeEach(() => {
    db = createMockDb();
    service = new AIMetricsService(db as any);
  });

  describe("getCurrentStats", () => {
    it("returns zero stats when no AI findings exist", async () => {
      const result = await service.getCurrentStats("org-1");
      expect(result.hasData).toBe(false);
      expect(result.stats.aiRatio).toBe(0);
      expect(result.stats.totalFiles).toBe(0);
    });

    it("computes stats from AI findings", async () => {
      db.finding.findMany.mockResolvedValueOnce([
        {
          id: "f-1", file: "src/a.ts", rawData: { loc: 100 },
          confidence: 0.8, category: "ai-generated",
          agentName: "ai-detector", suppressed: false,
          rawData: { ai_probability: 0.8, marker_tools: ["copilot"], loc: 100 },
        },
        {
          id: "f-2", file: "src/b.ts", rawData: { loc: 50 },
          confidence: 0.3, category: "ai-generated",
          agentName: "ai-detector", suppressed: false,
          rawData: { ai_probability: 0.3, marker_tools: [], loc: 50 },
        },
      ]);
      const result = await service.getCurrentStats("org-1");
      expect(result.hasData).toBe(true);
      expect(result.stats.totalFiles).toBe(2);
      expect(result.stats.aiFiles).toBe(1); // only 0.8 >= 0.5 default
    });
  });

  describe("getTrend", () => {
    it("returns empty trend for no snapshots", async () => {
      const result = await service.getTrend("org-1", { days: 30 });
      expect(result.points).toEqual([]);
    });

    it("fetches snapshots with correct granularity", async () => {
      await service.getTrend("org-1", { days: 30 });
      expect(db.aIMetricsSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orgId: "org-1",
            granularity: "daily",
          }),
        }),
      );
    });
  });

  describe("getConfig", () => {
    it("returns default config when none exists", async () => {
      const config = await service.getConfig("org-1");
      expect(config.threshold).toBe(0.5);
      expect(config.alertEnabled).toBe(false);
    });

    it("returns stored config", async () => {
      db.aIMetricsConfig.findUnique.mockResolvedValueOnce({
        threshold: 0.65,
        alertEnabled: true,
        alertMaxRatio: 0.4,
        alertSpikeStdDev: 2.0,
        alertNewTool: true,
        strictMode: false,
      });
      const config = await service.getConfig("org-1");
      expect(config.threshold).toBe(0.65);
      expect(config.alertEnabled).toBe(true);
    });
  });

  describe("updateConfig", () => {
    it("validates threshold range", async () => {
      await expect(
        service.updateConfig("org-1", { threshold: 1.5 }),
      ).rejects.toThrow("Threshold must be between 0.0 and 1.0");
    });

    it("upserts config", async () => {
      await service.updateConfig("org-1", { threshold: 0.65 });
      expect(db.aIMetricsConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: "org-1" },
        }),
      );
    });
  });

  describe("getToolBreakdown", () => {
    it("returns empty for no findings", async () => {
      const result = await service.getToolBreakdown("org-1");
      expect(result).toEqual([]);
    });
  });

  describe("getProjectLeaderboard", () => {
    it("returns projects with metrics", async () => {
      db.project.findMany.mockResolvedValueOnce([
        { id: "p-1", name: "Frontend", aiBaseline: 0 },
      ]);
      db.aIMetricsSnapshot.findFirst.mockResolvedValueOnce({
        aiRatio: 0.3,
        aiInfluenceScore: 0.25,
        aiFiles: 10,
        totalFiles: 30,
      });
      const result = await service.getProjectLeaderboard("org-1");
      expect(result).toHaveLength(1);
      expect(result[0].projectName).toBe("Frontend");
      expect(result[0].aiRatio).toBe(0.3);
    });
  });

  describe("generateDailySnapshot", () => {
    it("creates snapshot from current findings", async () => {
      db.finding.findMany.mockResolvedValueOnce([
        {
          id: "f-1", file: "src/a.ts", projectId: null,
          agentName: "ai-detector", category: "ai-generated",
          suppressed: false, confidence: 0.8,
          rawData: { ai_probability: 0.8, marker_tools: ["copilot"], loc: 100 },
        },
      ]);
      await service.generateDailySnapshot("org-1", new Date("2026-03-14"));
      expect(db.aIMetricsSnapshot.upsert).toHaveBeenCalled();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/compliance && npx vitest run src/__tests__/ai-metrics-service.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// packages/compliance/src/ai-metrics/service.ts
import { computeAIRatio, type FileSignal } from "./compute-ai-ratio.js";
import { computeToolBreakdown, type ToolBreakdownEntry } from "./compute-tool-breakdown.js";
import { computeTrends, type TrendResult } from "./compute-trends.js";
import { selectGranularity } from "./compute-granularity.js";
import { detectAnomalies, type AnomalyAlert } from "./detect-anomalies.js";

const DEFAULT_THRESHOLD = 0.50;

interface AIMetricsConfigData {
  threshold: number;
  strictMode: boolean;
  alertEnabled: boolean;
  alertMaxRatio: number | null;
  alertSpikeStdDev: number;
  alertNewTool: boolean;
}

export interface ProjectAIMetric {
  projectId: string;
  projectName: string;
  aiRatio: number;
  aiInfluenceScore: number;
  aiFiles: number;
  totalFiles: number;
}

export class AIMetricsService {
  constructor(private db: any) {}

  async getCurrentStats(orgId: string, threshold?: number) {
    const config = await this.getConfig(orgId);
    const t = threshold ?? config.threshold;

    const findings = await this.db.finding.findMany({
      where: {
        orgId,
        agentName: "ai-detector",
        category: "ai-generated",
        suppressed: false,
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    if (findings.length === 0) {
      return {
        hasData: false,
        stats: computeAIRatio([], t),
        toolBreakdown: [],
      };
    }

    const signals = this.findingsToSignals(findings);
    const stats = computeAIRatio(signals, t);
    const toolBreakdown = computeToolBreakdown(signals, t);

    return { hasData: true, stats, toolBreakdown };
  }

  async getTrend(
    orgId: string,
    opts: { days?: number; projectId?: string } = {},
  ): Promise<TrendResult> {
    const days = opts.days ?? 30;
    const granularity = selectGranularity(days);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: any = {
      orgId,
      granularity,
      snapshotDate: { gte: since },
    };
    if (opts.projectId) {
      where.projectId = opts.projectId;
    } else {
      where.projectId = null; // org-wide
    }

    const snapshots = await this.db.aIMetricsSnapshot.findMany({
      where,
      orderBy: { snapshotDate: "asc" },
    });

    return computeTrends(
      snapshots.map((s: any) => ({
        snapshotDate: s.snapshotDate,
        aiRatio: s.aiRatio,
        aiInfluenceScore: s.aiInfluenceScore,
        scanCount: s.scanCount,
      })),
      days,
    );
  }

  async getToolBreakdown(
    orgId: string,
    opts: { projectId?: string } = {},
  ): Promise<ToolBreakdownEntry[]> {
    const config = await this.getConfig(orgId);
    const where: any = {
      orgId,
      agentName: "ai-detector",
      category: "ai-generated",
      suppressed: false,
    };
    if (opts.projectId) where.projectId = opts.projectId;

    const findings = await this.db.finding.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    return computeToolBreakdown(this.findingsToSignals(findings), config.threshold);
  }

  async getProjectLeaderboard(
    orgId: string,
    opts: { limit?: number; sortBy?: string } = {},
  ): Promise<ProjectAIMetric[]> {
    const limit = opts.limit ?? 50;
    const projects = await this.db.project.findMany({
      where: { orgId },
      select: { id: true, name: true, aiBaseline: true },
      take: limit,
    });

    const results: ProjectAIMetric[] = [];
    for (const proj of projects) {
      const latest = await this.db.aIMetricsSnapshot.findFirst({
        where: { orgId, projectId: proj.id, granularity: "daily" },
        orderBy: { snapshotDate: "desc" },
      });
      results.push({
        projectId: proj.id,
        projectName: proj.name,
        aiRatio: latest?.aiRatio ?? 0,
        aiInfluenceScore: latest?.aiInfluenceScore ?? 0,
        aiFiles: latest?.aiFiles ?? 0,
        totalFiles: latest?.totalFiles ?? 0,
      });
    }

    const sortBy = opts.sortBy ?? "aiRatio";
    return results.sort((a, b) => (b as any)[sortBy] - (a as any)[sortBy]);
  }

  async compareProjects(orgId: string, projectIds: string[], days = 30): Promise<any> {
    if (projectIds.length < 2 || projectIds.length > 5) {
      throw new Error("Select 2-5 projects to compare");
    }
    const granularity = selectGranularity(days);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const series: Record<string, any[]> = {};
    for (const pid of projectIds) {
      const snapshots = await this.db.aIMetricsSnapshot.findMany({
        where: { orgId, projectId: pid, granularity, snapshotDate: { gte: since } },
        orderBy: { snapshotDate: "asc" },
      });
      series[pid] = snapshots.map((s: any) => ({
        date: s.snapshotDate.toISOString().slice(0, 10),
        aiRatio: s.aiRatio,
        aiInfluenceScore: s.aiInfluenceScore,
      }));
    }
    return { projectIds, days, series };
  }

  async getActiveAlerts(orgId: string): Promise<AnomalyAlert[]> {
    const config = await this.getConfig(orgId);
    if (!config.alertEnabled) return [];

    const current = await this.getCurrentStats(orgId, config.threshold);
    const orgRatio = current.stats.aiRatio;

    // Get recent org-wide daily snapshots for stddev
    const history = await this.db.aIMetricsSnapshot.findMany({
      where: { orgId, projectId: null, granularity: "daily" },
      orderBy: { snapshotDate: "desc" },
      take: 30,
    });
    const ratioHistory = history.map((s: any) => s.aiRatio);

    // Get per-project latest stats
    const projects = await this.db.project.findMany({
      where: { orgId },
      select: { id: true, name: true },
    });
    const projectSnapshots = [];
    for (const p of projects) {
      const latest = await this.db.aIMetricsSnapshot.findFirst({
        where: { orgId, projectId: p.id, granularity: "daily" },
        orderBy: { snapshotDate: "desc" },
      });
      if (latest) {
        projectSnapshots.push({
          projectId: p.id,
          projectName: p.name,
          aiRatio: latest.aiRatio,
          toolBreakdown: latest.toolBreakdown as any[],
        });
      }
    }

    // Known tools from all historical snapshots
    const allSnapshots = await this.db.aIMetricsSnapshot.findMany({
      where: { orgId, granularity: "daily" },
      select: { toolBreakdown: true },
      orderBy: { snapshotDate: "desc" },
      take: 100,
    });
    const knownTools = new Set<string>();
    for (const s of allSnapshots) {
      for (const t of (s.toolBreakdown as any[])) {
        knownTools.add(t.tool);
      }
    }

    return detectAnomalies(
      orgRatio,
      projectSnapshots,
      config,
      ratioHistory,
      Array.from(knownTools),
    );
  }

  async getConfig(orgId: string): Promise<AIMetricsConfigData> {
    const config = await this.db.aIMetricsConfig.findUnique({
      where: { orgId },
    });
    if (!config) {
      return {
        threshold: DEFAULT_THRESHOLD,
        strictMode: false,
        alertEnabled: false,
        alertMaxRatio: null,
        alertSpikeStdDev: 2.0,
        alertNewTool: true,
      };
    }
    return {
      threshold: config.threshold,
      strictMode: config.strictMode,
      alertEnabled: config.alertEnabled,
      alertMaxRatio: config.alertMaxRatio,
      alertSpikeStdDev: config.alertSpikeStdDev,
      alertNewTool: config.alertNewTool,
    };
  }

  async updateConfig(orgId: string, data: Partial<AIMetricsConfigData>) {
    if (data.threshold != null && (data.threshold < 0 || data.threshold > 1)) {
      throw new Error("Threshold must be between 0.0 and 1.0");
    }
    return this.db.aIMetricsConfig.upsert({
      where: { orgId },
      update: data,
      create: { orgId, ...data },
    });
  }

  async generateDailySnapshot(orgId: string, date: Date): Promise<void> {
    const config = await this.getConfig(orgId);
    const snapshotDate = new Date(date);
    snapshotDate.setUTCHours(0, 0, 0, 0);

    const findings = await this.db.finding.findMany({
      where: {
        orgId,
        agentName: "ai-detector",
        category: "ai-generated",
        suppressed: false,
      },
      take: 50000,
    });

    const signals = this.findingsToSignals(findings);
    const stats = computeAIRatio(signals, config.threshold);
    const toolBreakdown = computeToolBreakdown(signals, config.threshold);

    await this.db.aIMetricsSnapshot.upsert({
      where: {
        orgId_projectId_snapshotDate_granularity: {
          orgId,
          projectId: null as any,
          snapshotDate,
          granularity: "daily",
        },
      },
      update: {
        ...this.snapshotData(stats, toolBreakdown, findings.length),
      },
      create: {
        orgId,
        projectId: null,
        snapshotDate,
        granularity: "daily",
        ...this.snapshotData(stats, toolBreakdown, findings.length),
      },
    });

    // Per-project snapshots
    const byProject = new Map<string, typeof findings>();
    for (const f of findings) {
      if (f.projectId) {
        const list = byProject.get(f.projectId) ?? [];
        list.push(f);
        byProject.set(f.projectId, list);
      }
    }

    for (const [projectId, projectFindings] of byProject) {
      const pSignals = this.findingsToSignals(projectFindings);
      const pStats = computeAIRatio(pSignals, config.threshold);
      const pTools = computeToolBreakdown(pSignals, config.threshold);

      await this.db.aIMetricsSnapshot.upsert({
        where: {
          orgId_projectId_snapshotDate_granularity: {
            orgId,
            projectId,
            snapshotDate,
            granularity: "daily",
          },
        },
        update: this.snapshotData(pStats, pTools, projectFindings.length),
        create: {
          orgId,
          projectId,
          snapshotDate,
          granularity: "daily",
          ...this.snapshotData(pStats, pTools, projectFindings.length),
        },
      });
    }
  }

  private findingsToSignals(findings: any[]): FileSignal[] {
    return findings.map((f) => {
      const raw = f.rawData ?? {};
      return {
        file: f.file ?? "",
        loc: raw.loc ?? 0,
        aiProbability: raw.ai_probability ?? f.confidence ?? 0,
        markerTools: raw.marker_tools ?? [],
        estimatedTool: raw.estimated_tool ?? null,
      };
    });
  }

  private snapshotData(stats: any, toolBreakdown: any[], scanCount: number) {
    return {
      totalFiles: stats.totalFiles,
      aiFiles: stats.aiFiles,
      totalLoc: stats.totalLoc,
      aiLoc: stats.aiLoc,
      aiRatio: stats.aiRatio,
      aiInfluenceScore: stats.aiInfluenceScore,
      avgProbability: stats.avgProbability,
      medianProbability: stats.medianProbability,
      p95Probability: stats.p95Probability,
      toolBreakdown,
      complianceGaps: {},
      scanCount,
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/compliance && npx vitest run src/__tests__/ai-metrics-service.test.ts`
Expected: All 9 tests PASS

**Step 5: Commit**

```bash
git add packages/compliance/src/ai-metrics/service.ts packages/compliance/src/__tests__/ai-metrics-service.test.ts
git commit -m "feat(ai-metrics): add AIMetricsService with tests"
```

---

### Task 7: Package Exports — Wire ai-metrics into @sentinel/compliance

**Files:**
- Modify: `packages/compliance/src/index.ts`

**Step 1: Add exports**

Add these lines to the end of `packages/compliance/src/index.ts`:

```typescript
// AI Metrics
export { computeAIRatio, type FileSignal, type AIRatioResult } from "./ai-metrics/compute-ai-ratio.js";
export { computeToolBreakdown, type ToolBreakdownEntry } from "./ai-metrics/compute-tool-breakdown.js";
export { computeTrends, type TrendResult, type TrendPoint, type SnapshotInput } from "./ai-metrics/compute-trends.js";
export { selectGranularity } from "./ai-metrics/compute-granularity.js";
export { detectAnomalies, type AnomalyAlert, type AnomalyConfig, type ProjectSnapshot } from "./ai-metrics/detect-anomalies.js";
export { AIMetricsService, type ProjectAIMetric } from "./ai-metrics/service.js";
```

**Step 2: Build the package**

Run: `cd packages/compliance && npx tsc --noEmit`
Expected: No errors

**Step 3: Run all compliance tests**

Run: `cd packages/compliance && npx vitest run`
Expected: All tests pass (existing + new ai-metrics tests)

**Step 4: Commit**

```bash
git add packages/compliance/src/index.ts
git commit -m "feat(ai-metrics): export ai-metrics modules from @sentinel/compliance"
```

---

### Task 8: RBAC Rules — Add AI Metrics permissions

**Files:**
- Modify: `packages/security/src/rbac.ts`

**Step 1: Add RBAC entries**

In the `API_PERMISSIONS` array in `packages/security/src/rbac.ts`, add after the Charts section (around line 78):

```typescript
  // AI Metrics
  { method: "GET", path: "/v1/ai-metrics/stats", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/ai-metrics/trend", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/ai-metrics/tools", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/ai-metrics/projects", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/ai-metrics/projects/compare", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/ai-metrics/compliance", roles: ["admin", "manager", "developer"] },
  { method: "GET", path: "/v1/ai-metrics/alerts", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/ai-metrics/config", roles: ["admin", "manager"] },
  { method: "PUT", path: "/v1/ai-metrics/config", roles: ["admin"] },
```

**Step 2: Run RBAC tests**

Run: `cd packages/security && npx vitest run src/rbac.test.ts`
Expected: All existing tests pass

**Step 3: Commit**

```bash
git add packages/security/src/rbac.ts
git commit -m "feat(ai-metrics): add RBAC rules for AI metrics endpoints"
```

---

### Task 9: API Route Factory — buildAIMetricsRoutes

**Files:**
- Create: `apps/api/src/routes/ai-metrics.ts`
- Create: `apps/api/src/__tests__/ai-metrics-routes.test.ts`

**Step 1: Write the failing tests**

```typescript
// apps/api/src/__tests__/ai-metrics-routes.test.ts
import { describe, test, expect, vi } from "vitest";
import { buildAIMetricsRoutes } from "../routes/ai-metrics.js";

function createMockDb() {
  return {
    finding: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    aIMetricsSnapshot: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
    },
    aIMetricsConfig: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async (args: any) => args.update ?? args.create),
    },
    project: { findMany: vi.fn(async () => []) },
  };
}

describe("buildAIMetricsRoutes", () => {
  test("getStats returns stats with hasData flag", async () => {
    const db = createMockDb();
    const routes = buildAIMetricsRoutes({ db: db as any });
    const result = await routes.getStats("org-1");
    expect(result).toHaveProperty("hasData", false);
    expect(result).toHaveProperty("stats");
  });

  test("getTrend returns trend result", async () => {
    const db = createMockDb();
    const routes = buildAIMetricsRoutes({ db: db as any });
    const result = await routes.getTrend("org-1", { days: 30 });
    expect(result).toHaveProperty("points");
    expect(result).toHaveProperty("momChange");
  });

  test("getTools returns breakdown array", async () => {
    const db = createMockDb();
    const routes = buildAIMetricsRoutes({ db: db as any });
    const result = await routes.getTools("org-1");
    expect(Array.isArray(result)).toBe(true);
  });

  test("getProjects returns leaderboard", async () => {
    const db = createMockDb();
    const routes = buildAIMetricsRoutes({ db: db as any });
    const result = await routes.getProjects("org-1", {});
    expect(Array.isArray(result)).toBe(true);
  });

  test("compareProjects rejects <2 projects", async () => {
    const db = createMockDb();
    const routes = buildAIMetricsRoutes({ db: db as any });
    await expect(routes.compareProjects("org-1", ["p1"])).rejects.toThrow("Select 2-5 projects");
  });

  test("getConfig returns default config", async () => {
    const db = createMockDb();
    const routes = buildAIMetricsRoutes({ db: db as any });
    const result = await routes.getConfig("org-1");
    expect(result.threshold).toBe(0.5);
  });

  test("updateConfig validates threshold", async () => {
    const db = createMockDb();
    const routes = buildAIMetricsRoutes({ db: db as any });
    await expect(routes.updateConfig("org-1", { threshold: -0.1 })).rejects.toThrow("Threshold must be between");
  });

  test("getAlerts returns empty when disabled", async () => {
    const db = createMockDb();
    const routes = buildAIMetricsRoutes({ db: db as any });
    const result = await routes.getAlerts("org-1");
    expect(result).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/ai-metrics-routes.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// apps/api/src/routes/ai-metrics.ts
import { AIMetricsService } from "@sentinel/compliance";

interface AIMetricsRouteDeps {
  db: any;
}

export function buildAIMetricsRoutes(deps: AIMetricsRouteDeps) {
  const service = new AIMetricsService(deps.db);

  async function getStats(orgId: string) {
    return service.getCurrentStats(orgId);
  }

  async function getTrend(orgId: string, opts: { days?: number; projectId?: string }) {
    return service.getTrend(orgId, opts);
  }

  async function getTools(orgId: string, opts?: { projectId?: string }) {
    return service.getToolBreakdown(orgId, opts ?? {});
  }

  async function getProjects(orgId: string, opts: { limit?: number; sortBy?: string }) {
    return service.getProjectLeaderboard(orgId, opts);
  }

  async function compareProjects(orgId: string, projectIds: string[], days?: number) {
    return service.compareProjects(orgId, projectIds, days);
  }

  async function getCompliance(orgId: string) {
    // Compliance gaps are stored in the latest org-wide snapshot
    const snap = await deps.db.aIMetricsSnapshot.findFirst({
      where: { orgId, projectId: null, granularity: "daily" },
      orderBy: { snapshotDate: "desc" },
      select: { complianceGaps: true },
    });
    return snap?.complianceGaps ?? {};
  }

  async function getAlerts(orgId: string) {
    return service.getActiveAlerts(orgId);
  }

  async function getConfig(orgId: string) {
    return service.getConfig(orgId);
  }

  async function updateConfig(orgId: string, data: any) {
    return service.updateConfig(orgId, data);
  }

  return { getStats, getTrend, getTools, getProjects, compareProjects, getCompliance, getAlerts, getConfig, updateConfig };
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/ai-metrics-routes.test.ts`
Expected: All 8 tests PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/ai-metrics.ts apps/api/src/__tests__/ai-metrics-routes.test.ts
git commit -m "feat(ai-metrics): add API route factory with tests"
```

---

### Task 10: API Route Registration — Wire into server.ts

**Files:**
- Modify: `apps/api/src/server.ts`

**Step 1: Add import**

Add at the top of `apps/api/src/server.ts` with other route imports (around line 26):

```typescript
import { buildAIMetricsRoutes } from "./routes/ai-metrics.js";
```

**Step 2: Instantiate route factory**

After the other route factory instantiations (search for `buildRemediationRoutes` around line 100-120), add:

```typescript
const aiMetricsRoutes = buildAIMetricsRoutes({ db });
```

**Step 3: Register GET endpoints**

Add the following route handlers. Find an appropriate location after existing routes (search for the last `app.get` or `app.put` block):

```typescript
  // ── AI Metrics ─────────────────────────────────────────
  app.get("/v1/ai-metrics/stats", { preHandler: authHook }, async (request) => {
    const orgId = (request as any).orgId ?? "default";
    return withTenant(db, orgId, () => aiMetricsRoutes.getStats(orgId));
  });

  app.get("/v1/ai-metrics/trend", { preHandler: authHook }, async (request) => {
    const orgId = (request as any).orgId ?? "default";
    const { days, projectId } = request.query as any;
    return withTenant(db, orgId, () =>
      aiMetricsRoutes.getTrend(orgId, {
        days: days ? Number(days) : undefined,
        projectId: projectId || undefined,
      }),
    );
  });

  app.get("/v1/ai-metrics/tools", { preHandler: authHook }, async (request) => {
    const orgId = (request as any).orgId ?? "default";
    const { projectId } = request.query as any;
    return withTenant(db, orgId, () =>
      aiMetricsRoutes.getTools(orgId, { projectId: projectId || undefined }),
    );
  });

  app.get("/v1/ai-metrics/projects", { preHandler: authHook }, async (request) => {
    const orgId = (request as any).orgId ?? "default";
    const { limit, sortBy } = request.query as any;
    return withTenant(db, orgId, () =>
      aiMetricsRoutes.getProjects(orgId, {
        limit: limit ? Number(limit) : undefined,
        sortBy: sortBy || undefined,
      }),
    );
  });

  app.get("/v1/ai-metrics/projects/compare", { preHandler: authHook }, async (request, reply) => {
    const orgId = (request as any).orgId ?? "default";
    const { projectIds, days } = request.query as any;
    if (!projectIds) return reply.code(400).send({ error: "projectIds required" });
    const ids = Array.isArray(projectIds) ? projectIds : projectIds.split(",");
    try {
      return await withTenant(db, orgId, () =>
        aiMetricsRoutes.compareProjects(orgId, ids, days ? Number(days) : undefined),
      );
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  app.get("/v1/ai-metrics/compliance", { preHandler: authHook }, async (request) => {
    const orgId = (request as any).orgId ?? "default";
    return withTenant(db, orgId, () => aiMetricsRoutes.getCompliance(orgId));
  });

  app.get("/v1/ai-metrics/alerts", { preHandler: authHook }, async (request) => {
    const orgId = (request as any).orgId ?? "default";
    return withTenant(db, orgId, () => aiMetricsRoutes.getAlerts(orgId));
  });

  app.get("/v1/ai-metrics/config", { preHandler: authHook }, async (request) => {
    const orgId = (request as any).orgId ?? "default";
    return withTenant(db, orgId, () => aiMetricsRoutes.getConfig(orgId));
  });

  app.put("/v1/ai-metrics/config", { preHandler: authHook }, async (request, reply) => {
    const orgId = (request as any).orgId ?? "default";
    const userId = (request as any).userId ?? "unknown";
    try {
      const result = await withTenant(db, orgId, () =>
        aiMetricsRoutes.updateConfig(orgId, request.body),
      );
      await auditLog.append(orgId, {
        actor: { type: "user", id: userId, name: userId },
        action: "ai_metrics_config.update",
        resource: { type: "ai_metrics_config", id: orgId },
        detail: request.body as any,
      });
      return result;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });
```

**Step 4: Build the API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No type errors

**Step 5: Run API tests**

Run: `npx turbo test --filter=@sentinel/api`
Expected: All existing + new tests pass

**Step 6: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "feat(ai-metrics): register AI metrics API endpoints in server"
```

---

### Task 11: Scheduler Jobs — Daily Snapshot, Weekly/Monthly Rollup, Anomaly Check

**Files:**
- Create: `apps/api/src/scheduler/jobs/ai-metrics-snapshot.ts`
- Create: `apps/api/src/scheduler/jobs/ai-metrics-rollup.ts`
- Create: `apps/api/src/scheduler/jobs/ai-metrics-anomaly.ts`
- Create: `apps/api/src/scheduler/jobs/__tests__/ai-metrics-jobs.test.ts`

**Step 1: Write the failing tests**

```typescript
// apps/api/src/scheduler/jobs/__tests__/ai-metrics-jobs.test.ts
import { describe, test, expect, vi } from "vitest";
import { AIMetricsSnapshotJob } from "../ai-metrics-snapshot.js";
import { AIMetricsRollupJob } from "../ai-metrics-rollup.js";
import { AIMetricsAnomalyJob } from "../ai-metrics-anomaly.js";
import type { JobContext } from "../../types.js";

function createMockContext(overrides?: Record<string, any>): JobContext {
  return {
    eventBus: { publish: vi.fn(async () => "msg-1") } as any,
    db: {
      organization: { findMany: vi.fn(async () => [{ id: "org-1" }]) },
      finding: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
      aIMetricsSnapshot: {
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => null),
        upsert: vi.fn(async () => ({})),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
      aIMetricsConfig: { findUnique: vi.fn(async () => null) },
      project: { findMany: vi.fn(async () => []) },
      ...overrides,
    } as any,
    redis: {} as any,
    metrics: { recordTrigger: vi.fn(), recordError: vi.fn() } as any,
    audit: { log: vi.fn(async () => {}) } as any,
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any,
  };
}

describe("AIMetricsSnapshotJob", () => {
  test("has correct metadata", () => {
    const job = new AIMetricsSnapshotJob();
    expect(job.name).toBe("ai-metrics-daily-snapshot");
    expect(job.schedule).toBe("0 3 * * *");
    expect(job.tier).toBe("non-critical");
    expect(job.dependencies).toContain("postgres");
  });

  test("generates snapshots for all orgs", async () => {
    const job = new AIMetricsSnapshotJob();
    const ctx = createMockContext();
    await job.execute(ctx);
    expect(ctx.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ orgs: 1 }),
      expect.stringContaining("AI metrics"),
    );
  });
});

describe("AIMetricsRollupJob", () => {
  test("has correct metadata for weekly schedule", () => {
    const job = new AIMetricsRollupJob();
    expect(job.name).toBe("ai-metrics-rollup");
    expect(job.schedule).toBe("0 4 * * 1");
    expect(job.tier).toBe("non-critical");
  });
});

describe("AIMetricsAnomalyJob", () => {
  test("has correct metadata for hourly schedule", () => {
    const job = new AIMetricsAnomalyJob();
    expect(job.name).toBe("ai-metrics-anomaly-check");
    expect(job.schedule).toBe("0 * * * *");
    expect(job.tier).toBe("non-critical");
  });

  test("publishes alerts when anomalies detected", async () => {
    const job = new AIMetricsAnomalyJob();
    const ctx = createMockContext({
      aIMetricsConfig: {
        findUnique: vi.fn(async () => ({
          threshold: 0.5, alertEnabled: true, alertMaxRatio: 0.3,
          alertSpikeStdDev: 2, alertNewTool: true, strictMode: false,
        })),
      },
      finding: {
        findMany: vi.fn(async () => [
          {
            id: "f-1", file: "a.ts", projectId: null,
            agentName: "ai-detector", category: "ai-generated",
            suppressed: false, confidence: 0.9,
            rawData: { ai_probability: 0.9, marker_tools: [], loc: 100 },
          },
        ]),
      },
    });
    await job.execute(ctx);
    expect(ctx.eventBus.publish).toHaveBeenCalledWith(
      "sentinel.notifications",
      expect.objectContaining({ topic: "ai-metrics.alert.threshold" }),
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/scheduler/jobs/__tests__/ai-metrics-jobs.test.ts`
Expected: FAIL — modules not found

**Step 3: Write ai-metrics-snapshot.ts**

```typescript
// apps/api/src/scheduler/jobs/ai-metrics-snapshot.ts
import { AIMetricsService } from "@sentinel/compliance";
import type { SchedulerJob, JobContext } from "../types.js";

export class AIMetricsSnapshotJob implements SchedulerJob {
  name = "ai-metrics-daily-snapshot" as const;
  schedule = "0 3 * * *";
  tier = "non-critical" as const;
  dependencies = ["postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const orgs = await ctx.db.organization.findMany({ select: { id: true } });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const service = new AIMetricsService(ctx.db);

    for (const org of orgs) {
      try {
        await service.generateDailySnapshot(org.id, today);
      } catch (err) {
        ctx.logger.error({ orgId: org.id, err }, "Failed to generate AI metrics snapshot");
      }
    }

    ctx.logger.info({ orgs: orgs.length }, "AI metrics daily snapshots generated");
  }
}
```

**Step 4: Write ai-metrics-rollup.ts**

```typescript
// apps/api/src/scheduler/jobs/ai-metrics-rollup.ts
import type { SchedulerJob, JobContext } from "../types.js";

export class AIMetricsRollupJob implements SchedulerJob {
  name = "ai-metrics-rollup" as const;
  schedule = "0 4 * * 1"; // Weekly on Monday
  tier = "non-critical" as const;
  dependencies = ["postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const orgs = await ctx.db.organization.findMany({ select: { id: true } });
    let rolledUp = 0;

    for (const org of orgs) {
      try {
        // Weekly rollup: aggregate daily snapshots older than 90 days
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);

        const oldDailies = await ctx.db.aIMetricsSnapshot.findMany({
          where: { orgId: org.id, granularity: "daily", snapshotDate: { lt: cutoff } },
          orderBy: { snapshotDate: "asc" },
        });

        // Group by week (ISO week start = Monday)
        const weeks = new Map<string, any[]>();
        for (const snap of oldDailies) {
          const d = new Date(snap.snapshotDate);
          const day = d.getUTCDay();
          const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
          const weekStart = new Date(d);
          weekStart.setUTCDate(diff);
          const key = `${snap.projectId ?? "org"}_${weekStart.toISOString().slice(0, 10)}`;
          const list = weeks.get(key) ?? [];
          list.push(snap);
          weeks.set(key, list);
        }

        for (const [, snaps] of weeks) {
          if (snaps.length === 0) continue;
          const avg = (field: string) =>
            snaps.reduce((s: number, snap: any) => s + (snap[field] ?? 0), 0) / snaps.length;

          const weekStart = new Date(snaps[0].snapshotDate);
          const day = weekStart.getUTCDay();
          const diff = weekStart.getUTCDate() - day + (day === 0 ? -6 : 1);
          weekStart.setUTCDate(diff);
          weekStart.setUTCHours(0, 0, 0, 0);

          await ctx.db.aIMetricsSnapshot.upsert({
            where: {
              orgId_projectId_snapshotDate_granularity: {
                orgId: org.id,
                projectId: snaps[0].projectId,
                snapshotDate: weekStart,
                granularity: "weekly",
              },
            },
            update: {
              totalFiles: Math.round(avg("totalFiles")),
              aiFiles: Math.round(avg("aiFiles")),
              totalLoc: Math.round(avg("totalLoc")),
              aiLoc: Math.round(avg("aiLoc")),
              aiRatio: avg("aiRatio"),
              aiInfluenceScore: avg("aiInfluenceScore"),
              avgProbability: avg("avgProbability"),
              medianProbability: avg("medianProbability"),
              p95Probability: avg("p95Probability"),
              toolBreakdown: snaps[snaps.length - 1].toolBreakdown,
              complianceGaps: snaps[snaps.length - 1].complianceGaps,
              scanCount: snaps.reduce((s: number, snap: any) => s + snap.scanCount, 0),
            },
            create: {
              orgId: org.id,
              projectId: snaps[0].projectId,
              snapshotDate: weekStart,
              granularity: "weekly",
              totalFiles: Math.round(avg("totalFiles")),
              aiFiles: Math.round(avg("aiFiles")),
              totalLoc: Math.round(avg("totalLoc")),
              aiLoc: Math.round(avg("aiLoc")),
              aiRatio: avg("aiRatio"),
              aiInfluenceScore: avg("aiInfluenceScore"),
              avgProbability: avg("avgProbability"),
              medianProbability: avg("medianProbability"),
              p95Probability: avg("p95Probability"),
              toolBreakdown: snaps[snaps.length - 1].toolBreakdown,
              complianceGaps: snaps[snaps.length - 1].complianceGaps,
              scanCount: snaps.reduce((s: number, snap: any) => s + snap.scanCount, 0),
            },
          });
          rolledUp++;
        }

        // Delete rolled-up dailies
        if (oldDailies.length > 0) {
          await ctx.db.aIMetricsSnapshot.deleteMany({
            where: { orgId: org.id, granularity: "daily", snapshotDate: { lt: cutoff } },
          });
        }
      } catch (err) {
        ctx.logger.error({ orgId: org.id, err }, "AI metrics rollup failed");
      }
    }

    ctx.logger.info({ rolledUp }, "AI metrics weekly rollup complete");
  }
}
```

**Step 5: Write ai-metrics-anomaly.ts**

```typescript
// apps/api/src/scheduler/jobs/ai-metrics-anomaly.ts
import { AIMetricsService } from "@sentinel/compliance";
import type { SchedulerJob, JobContext } from "../types.js";

export class AIMetricsAnomalyJob implements SchedulerJob {
  name = "ai-metrics-anomaly-check" as const;
  schedule = "0 * * * *";
  tier = "non-critical" as const;
  dependencies = ["postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const orgs = await ctx.db.organization.findMany({ select: { id: true } });
    const service = new AIMetricsService(ctx.db);
    let alertCount = 0;

    for (const org of orgs) {
      try {
        const alerts = await service.getActiveAlerts(org.id);
        for (const alert of alerts) {
          const topicMap: Record<string, string> = {
            threshold_exceeded: "ai-metrics.alert.threshold",
            spike_detected: "ai-metrics.alert.spike",
            new_tool: "ai-metrics.alert.new-tool",
          };
          await ctx.eventBus.publish("sentinel.notifications", {
            id: `evt-ai-alert-${org.id}-${alert.type}-${Date.now()}`,
            orgId: org.id,
            topic: topicMap[alert.type] ?? "ai-metrics.alert",
            payload: alert,
            timestamp: new Date().toISOString(),
          });
          alertCount++;
        }
      } catch (err) {
        ctx.logger.error({ orgId: org.id, err }, "AI metrics anomaly check failed");
      }
    }

    ctx.logger.info({ alertCount }, "AI metrics anomaly check complete");
  }
}
```

**Step 6: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run src/scheduler/jobs/__tests__/ai-metrics-jobs.test.ts`
Expected: All 5 tests PASS

**Step 7: Commit**

```bash
git add apps/api/src/scheduler/jobs/ai-metrics-snapshot.ts apps/api/src/scheduler/jobs/ai-metrics-rollup.ts apps/api/src/scheduler/jobs/ai-metrics-anomaly.ts apps/api/src/scheduler/jobs/__tests__/ai-metrics-jobs.test.ts
git commit -m "feat(ai-metrics): add scheduler jobs for snapshot, rollup, and anomaly detection"
```

---

### Task 12: Register Scheduler Jobs — Wire into scheduler/index.ts

**Files:**
- Modify: `apps/api/src/scheduler/index.ts`

**Step 1: Add imports**

Add after the existing job imports (around line 31):

```typescript
import { AIMetricsSnapshotJob } from "./jobs/ai-metrics-snapshot.js";
import { AIMetricsRollupJob } from "./jobs/ai-metrics-rollup.js";
import { AIMetricsAnomalyJob } from "./jobs/ai-metrics-anomaly.js";
```

**Step 2: Register jobs**

In the `allJobs` array (around line 229-241), add before the closing bracket:

```typescript
    new AIMetricsSnapshotJob(),
    new AIMetricsRollupJob(),
    new AIMetricsAnomalyJob(),
```

**Step 3: Build and test**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/api/src/scheduler/index.ts
git commit -m "feat(ai-metrics): register AI metrics jobs in scheduler"
```

---

### Task 13: Dashboard Types and API Client

**Files:**
- Modify: `apps/dashboard/lib/types.ts`
- Modify: `apps/dashboard/lib/api.ts`

**Step 1: Add TypeScript types**

Add to the end of `apps/dashboard/lib/types.ts`:

```typescript
// ── AI Metrics ──────────────────────────────────────────
export interface AIMetricsStats {
  hasData: boolean;
  stats: {
    aiRatio: number;
    aiFiles: number;
    totalFiles: number;
    aiLoc: number;
    totalLoc: number;
    aiInfluenceScore: number;
    avgProbability: number;
    medianProbability: number;
    p95Probability: number;
  };
  toolBreakdown: AIToolBreakdownEntry[];
}

export interface AIToolBreakdownEntry {
  tool: string;
  confirmedFiles: number;
  estimatedFiles: number;
  totalLoc: number;
  percentage: number;
}

export interface AITrendPoint {
  date: string;
  aiRatio: number;
  aiInfluenceScore: number;
  scanCount: number;
}

export interface AITrendResult {
  points: AITrendPoint[];
  momChange: number;
  movingAvg7d: number;
  movingAvg30d: number;
}

export interface AIProjectMetric {
  projectId: string;
  projectName: string;
  aiRatio: number;
  aiInfluenceScore: number;
  aiFiles: number;
  totalFiles: number;
}

export interface AIProjectComparison {
  projectIds: string[];
  days: number;
  series: Record<string, { date: string; aiRatio: number; aiInfluenceScore: number }[]>;
}

export interface AIAnomalyAlert {
  type: "threshold_exceeded" | "spike_detected" | "new_tool";
  projectId?: string;
  projectName?: string;
  detail: string;
  severity: "warning" | "critical";
  detectedAt: string;
}

export interface AIMetricsConfig {
  threshold: number;
  strictMode: boolean;
  alertEnabled: boolean;
  alertMaxRatio: number | null;
  alertSpikeStdDev: number;
  alertNewTool: boolean;
}
```

**Step 2: Add API client functions**

Add to the end of `apps/dashboard/lib/api.ts`:

```typescript
// ── AI Metrics ──────────────────────────────────────────

export async function getAIMetricsStats(): Promise<AIMetricsStats> {
  if (USE_MOCK) {
    return {
      hasData: true,
      stats: {
        aiRatio: 0.23, aiFiles: 45, totalFiles: 196, aiLoc: 3200, totalLoc: 14000,
        aiInfluenceScore: 0.31, avgProbability: 0.42, medianProbability: 0.38, p95Probability: 0.89,
      },
      toolBreakdown: [
        { tool: "copilot", confirmedFiles: 25, estimatedFiles: 5, totalLoc: 1800, percentage: 56 },
        { tool: "claude", confirmedFiles: 10, estimatedFiles: 3, totalLoc: 900, percentage: 28 },
        { tool: "chatgpt", confirmedFiles: 2, estimatedFiles: 0, totalLoc: 500, percentage: 16 },
      ],
    };
  }
  const headers = await getSessionHeaders();
  const res = await fetch(`${process.env.SENTINEL_API_URL}/v1/ai-metrics/stats`, { headers, next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`AI metrics stats: ${res.status}`);
  return res.json();
}

export async function getAIMetricsTrend(days = 30, projectId?: string): Promise<AITrendResult> {
  if (USE_MOCK) {
    const points = Array.from({ length: days }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (days - i - 1));
      return { date: d.toISOString().slice(0, 10), aiRatio: 0.2 + Math.random() * 0.1, aiInfluenceScore: 0.25 + Math.random() * 0.1, scanCount: 1 };
    });
    return { points, momChange: 0.05, movingAvg7d: 0.24, movingAvg30d: 0.23 };
  }
  const headers = await getSessionHeaders();
  const params = new URLSearchParams({ days: String(days) });
  if (projectId) params.set("projectId", projectId);
  const res = await fetch(`${process.env.SENTINEL_API_URL}/v1/ai-metrics/trend?${params}`, { headers, next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`AI metrics trend: ${res.status}`);
  return res.json();
}

export async function getAIMetricsTools(projectId?: string): Promise<AIToolBreakdownEntry[]> {
  if (USE_MOCK) {
    return [
      { tool: "copilot", confirmedFiles: 25, estimatedFiles: 5, totalLoc: 1800, percentage: 56 },
      { tool: "claude", confirmedFiles: 10, estimatedFiles: 3, totalLoc: 900, percentage: 28 },
      { tool: "chatgpt", confirmedFiles: 2, estimatedFiles: 0, totalLoc: 500, percentage: 16 },
    ];
  }
  const headers = await getSessionHeaders();
  const params = projectId ? `?projectId=${projectId}` : "";
  const res = await fetch(`${process.env.SENTINEL_API_URL}/v1/ai-metrics/tools${params}`, { headers, next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`AI metrics tools: ${res.status}`);
  return res.json();
}

export async function getAIMetricsProjects(limit?: number, sortBy?: string): Promise<AIProjectMetric[]> {
  if (USE_MOCK) {
    return [
      { projectId: "p1", projectName: "Frontend App", aiRatio: 0.35, aiInfluenceScore: 0.4, aiFiles: 20, totalFiles: 57 },
      { projectId: "p2", projectName: "API Service", aiRatio: 0.18, aiInfluenceScore: 0.22, aiFiles: 10, totalFiles: 56 },
      { projectId: "p3", projectName: "Mobile SDK", aiRatio: 0.12, aiInfluenceScore: 0.15, aiFiles: 8, totalFiles: 65 },
    ];
  }
  const headers = await getSessionHeaders();
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (sortBy) params.set("sortBy", sortBy);
  const res = await fetch(`${process.env.SENTINEL_API_URL}/v1/ai-metrics/projects?${params}`, { headers, next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`AI metrics projects: ${res.status}`);
  return res.json();
}

export async function getAIMetricsCompare(projectIds: string[], days = 30): Promise<AIProjectComparison> {
  if (USE_MOCK) {
    const series: Record<string, any[]> = {};
    for (const id of projectIds) {
      series[id] = Array.from({ length: days }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (days - i - 1));
        return { date: d.toISOString().slice(0, 10), aiRatio: 0.15 + Math.random() * 0.2, aiInfluenceScore: 0.2 + Math.random() * 0.15 };
      });
    }
    return { projectIds, days, series };
  }
  const headers = await getSessionHeaders();
  const params = new URLSearchParams({ projectIds: projectIds.join(","), days: String(days) });
  const res = await fetch(`${process.env.SENTINEL_API_URL}/v1/ai-metrics/projects/compare?${params}`, { headers, next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`AI metrics compare: ${res.status}`);
  return res.json();
}

export async function getAIMetricsAlerts(): Promise<AIAnomalyAlert[]> {
  if (USE_MOCK) {
    return [
      { type: "threshold_exceeded", detail: "Org AI ratio 35% exceeds limit of 30%", severity: "critical", detectedAt: new Date().toISOString() },
    ];
  }
  const headers = await getSessionHeaders();
  const res = await fetch(`${process.env.SENTINEL_API_URL}/v1/ai-metrics/alerts`, { headers, next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`AI metrics alerts: ${res.status}`);
  return res.json();
}

export async function getAIMetricsConfig(): Promise<AIMetricsConfig> {
  if (USE_MOCK) {
    return { threshold: 0.5, strictMode: false, alertEnabled: false, alertMaxRatio: null, alertSpikeStdDev: 2.0, alertNewTool: true };
  }
  const headers = await getSessionHeaders();
  const res = await fetch(`${process.env.SENTINEL_API_URL}/v1/ai-metrics/config`, { headers, next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`AI metrics config: ${res.status}`);
  return res.json();
}

export async function updateAIMetricsConfig(data: Partial<AIMetricsConfig>): Promise<AIMetricsConfig> {
  if (USE_MOCK) return { threshold: 0.5, strictMode: false, alertEnabled: false, alertMaxRatio: null, alertSpikeStdDev: 2.0, alertNewTool: true, ...data };
  const headers = await getSessionHeaders();
  const res = await fetch(`${process.env.SENTINEL_API_URL}/v1/ai-metrics/config`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`AI metrics config update: ${res.status}`);
  return res.json();
}
```

Also add the type imports at the top of `api.ts` alongside existing imports:

```typescript
import type {
  // ... existing imports ...
  AIMetricsStats,
  AIToolBreakdownEntry,
  AITrendResult,
  AIProjectMetric,
  AIProjectComparison,
  AIAnomalyAlert,
  AIMetricsConfig,
} from "./types";
```

**Step 3: Verify build**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/dashboard/lib/types.ts apps/dashboard/lib/api.ts
git commit -m "feat(ai-metrics): add dashboard types and API client functions"
```

---

### Task 14: Dashboard Component — AI Metrics Stat Cards

**Files:**
- Create: `apps/dashboard/components/ai-metrics/ai-metrics-stat-cards.tsx`
- Create: `apps/dashboard/__tests__/ai-metrics-stat-cards.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/dashboard/__tests__/ai-metrics-stat-cards.test.ts
import { describe, it, expect } from "vitest";
import {
  formatRatio,
  formatMoMChange,
  getStatCards,
} from "@/components/ai-metrics/ai-metrics-stat-cards";
import type { AIMetricsStats, AITrendResult } from "@/lib/types";

describe("AI Metrics Stat Cards helpers", () => {
  it("formatRatio converts to percentage string", () => {
    expect(formatRatio(0.234)).toBe("23.4%");
    expect(formatRatio(0)).toBe("0.0%");
    expect(formatRatio(1)).toBe("100.0%");
  });

  it("formatMoMChange shows positive/negative with arrow", () => {
    expect(formatMoMChange(0.15)).toContain("+15.0%");
    expect(formatMoMChange(-0.08)).toContain("-8.0%");
    expect(formatMoMChange(0)).toContain("0.0%");
  });

  it("getStatCards returns 5 cards with correct labels", () => {
    const stats: AIMetricsStats = {
      hasData: true,
      stats: {
        aiRatio: 0.23, aiFiles: 45, totalFiles: 196, aiLoc: 3200, totalLoc: 14000,
        aiInfluenceScore: 0.31, avgProbability: 0.42, medianProbability: 0.38, p95Probability: 0.89,
      },
      toolBreakdown: [],
    };
    const trend: AITrendResult = { points: [], momChange: 0.05, movingAvg7d: 0.24, movingAvg30d: 0.23 };
    const cards = getStatCards(stats, trend);
    expect(cards).toHaveLength(5);
    expect(cards[0].label).toBe("AI Code Ratio");
    expect(cards[0].value).toBe("23.0%");
    expect(cards[1].label).toBe("AI Influence");
  });

  it("getStatCards handles no-data state", () => {
    const stats: AIMetricsStats = {
      hasData: false,
      stats: {
        aiRatio: 0, aiFiles: 0, totalFiles: 0, aiLoc: 0, totalLoc: 0,
        aiInfluenceScore: 0, avgProbability: 0, medianProbability: 0, p95Probability: 0,
      },
      toolBreakdown: [],
    };
    const trend: AITrendResult = { points: [], momChange: 0, movingAvg7d: 0, movingAvg30d: 0 };
    const cards = getStatCards(stats, trend);
    expect(cards[0].value).toBe("--");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run __tests__/ai-metrics-stat-cards.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// apps/dashboard/components/ai-metrics/ai-metrics-stat-cards.tsx
"use client";

import type { AIMetricsStats, AITrendResult } from "@/lib/types";

export function formatRatio(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatMoMChange(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${(change * 100).toFixed(1)}%`;
}

interface StatCard {
  label: string;
  value: string;
  sub: string;
  trend?: string;
  trendUp?: boolean;
}

export function getStatCards(stats: AIMetricsStats, trend: AITrendResult): StatCard[] {
  if (!stats.hasData) {
    return [
      { label: "AI Code Ratio", value: "--", sub: "No scan data yet" },
      { label: "AI Influence", value: "--", sub: "No scan data yet" },
      { label: "AI Files", value: "--", sub: "No scan data yet" },
      { label: "AI Tools", value: "--", sub: "No scan data yet" },
      { label: "P95 Probability", value: "--", sub: "No scan data yet" },
    ];
  }

  return [
    {
      label: "AI Code Ratio",
      value: formatRatio(stats.stats.aiRatio),
      sub: `${stats.stats.aiLoc.toLocaleString()} / ${stats.stats.totalLoc.toLocaleString()} LOC`,
      trend: formatMoMChange(trend.momChange),
      trendUp: trend.momChange <= 0,
    },
    {
      label: "AI Influence",
      value: formatRatio(stats.stats.aiInfluenceScore),
      sub: "Fractional LOC-weighted score",
      trend: `7d avg: ${formatRatio(trend.movingAvg7d)}`,
    },
    {
      label: "AI Files",
      value: `${stats.stats.aiFiles} / ${stats.stats.totalFiles}`,
      sub: `${formatRatio(stats.stats.aiFiles / Math.max(stats.stats.totalFiles, 1))} of files`,
    },
    {
      label: "AI Tools",
      value: String(stats.toolBreakdown.length),
      sub: stats.toolBreakdown[0]?.tool
        ? `Top: ${stats.toolBreakdown[0].tool}`
        : "None detected",
    },
    {
      label: "P95 Probability",
      value: formatRatio(stats.stats.p95Probability),
      sub: `Median: ${formatRatio(stats.stats.medianProbability)}`,
    },
  ];
}

interface AIMetricsStatCardsProps {
  stats: AIMetricsStats;
  trend: AITrendResult;
}

const CARD_ACCENTS = [
  "from-accent/20",
  "from-status-info/20",
  "from-status-warn/20",
  "from-status-pass/20",
  "from-status-fail/20",
];

export function AIMetricsStatCards({ stats, trend }: AIMetricsStatCardsProps) {
  const cards = getStatCards(stats, trend);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card, i) => (
        <div
          key={card.label}
          className="group relative overflow-hidden rounded-xl border border-border bg-surface-1 p-4 transition-shadow hover:shadow-md"
        >
          <div className={`absolute inset-0 bg-gradient-to-br ${CARD_ACCENTS[i]} to-transparent opacity-50`} />
          <div className="relative">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              {card.label}
            </p>
            <p className="mt-1 text-[22px] font-bold leading-tight text-text-primary">
              {card.value}
            </p>
            <p className="mt-0.5 text-[11px] text-text-tertiary">{card.sub}</p>
            {card.trend && (
              <p
                className={`mt-1 text-[11px] font-semibold ${
                  card.trendUp ? "text-status-pass" : "text-status-fail"
                }`}
              >
                {card.trend}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run __tests__/ai-metrics-stat-cards.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add apps/dashboard/components/ai-metrics/ai-metrics-stat-cards.tsx apps/dashboard/__tests__/ai-metrics-stat-cards.test.ts
git commit -m "feat(ai-metrics): add stat cards component with tests"
```

---

### Task 15: Dashboard Component — Trend Chart + Tool Breakdown Donut

**Files:**
- Create: `apps/dashboard/components/ai-metrics/ai-metrics-trend-chart.tsx`
- Create: `apps/dashboard/components/ai-metrics/ai-tool-breakdown-chart.tsx`
- Create: `apps/dashboard/__tests__/ai-metrics-charts.test.ts`

**Step 1: Write the failing tests**

```typescript
// apps/dashboard/__tests__/ai-metrics-charts.test.ts
import { describe, it, expect } from "vitest";
import { TOOL_COLORS, getToolColor, PERIOD_PRESETS } from "@/components/ai-metrics/ai-tool-breakdown-chart";

describe("AI Tool Breakdown helpers", () => {
  it("has curated colors for known tools", () => {
    expect(TOOL_COLORS.copilot).toBeDefined();
    expect(TOOL_COLORS.claude).toBeDefined();
    expect(TOOL_COLORS.cursor).toBeDefined();
    expect(TOOL_COLORS.chatgpt).toBeDefined();
  });

  it("getToolColor returns curated color or generic", () => {
    expect(getToolColor("copilot")).toBe(TOOL_COLORS.copilot);
    expect(getToolColor("some-unknown-tool")).toBeTruthy();
  });

  it("PERIOD_PRESETS has 30d, 90d, 6m, 1y", () => {
    const labels = PERIOD_PRESETS.map((p) => p.label);
    expect(labels).toContain("30d");
    expect(labels).toContain("90d");
    expect(labels).toContain("6m");
    expect(labels).toContain("1y");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run __tests__/ai-metrics-charts.test.ts`
Expected: FAIL — module not found

**Step 3: Write ai-metrics-trend-chart.tsx**

```typescript
// apps/dashboard/components/ai-metrics/ai-metrics-trend-chart.tsx
"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AITrendPoint } from "@/lib/types";

interface AIMetricsTrendChartProps {
  points: AITrendPoint[];
  onPeriodChange?: (days: number) => void;
  activePeriod?: number;
}

const PERIODS = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "6m", days: 180 },
  { label: "1y", days: 365 },
];

export function AIMetricsTrendChart({
  points,
  onPeriodChange,
  activePeriod = 30,
}: AIMetricsTrendChartProps) {
  const data = points.map((p) => ({
    date: p.date,
    ratio: +(p.aiRatio * 100).toFixed(1),
    influence: +(p.aiInfluenceScore * 100).toFixed(1),
  }));

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-text-primary">AI Code Trend</h3>
        <div className="flex gap-1">
          {PERIODS.map(({ label, days }) => (
            <button
              key={label}
              onClick={() => onPeriodChange?.(days)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                activePeriod === days
                  ? "bg-accent text-white"
                  : "text-text-tertiary hover:bg-surface-2"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex h-48 items-center justify-center">
          <p className="text-[12px] text-text-tertiary">Not enough data for trend chart</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
              tickFormatter={(v) => v.slice(5)}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
              tickFormatter={(v) => `${v}%`}
              domain={[0, "auto"]}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(value: number, name: string) => [
                `${value}%`,
                name === "ratio" ? "AI Ratio" : "Influence",
              ]}
            />
            <Area
              type="monotone"
              dataKey="ratio"
              stroke="var(--color-accent)"
              fill="var(--color-accent)"
              fillOpacity={0.1}
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="influence"
              stroke="var(--color-status-info)"
              fill="var(--color-status-info)"
              fillOpacity={0.05}
              strokeWidth={1.5}
              strokeDasharray="5 3"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

**Step 4: Write ai-tool-breakdown-chart.tsx**

```typescript
// apps/dashboard/components/ai-metrics/ai-tool-breakdown-chart.tsx
"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { AIToolBreakdownEntry } from "@/lib/types";

export const TOOL_COLORS: Record<string, string> = {
  copilot: "#2563eb",
  claude: "#f97316",
  cursor: "#8b5cf6",
  chatgpt: "#22c55e",
  codewhisperer: "#ec4899",
  devin: "#06b6d4",
  unknown: "#6b7280",
};

const GENERIC_COLORS = ["#3b82f6", "#a855f7", "#14b8a6", "#f59e0b", "#ef4444", "#84cc16"];

export function getToolColor(tool: string): string {
  return TOOL_COLORS[tool.toLowerCase()] ?? GENERIC_COLORS[Math.abs(hashCode(tool)) % GENERIC_COLORS.length];
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

export const PERIOD_PRESETS = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "6m", days: 180 },
  { label: "1y", days: 365 },
];

interface AIToolBreakdownChartProps {
  data: AIToolBreakdownEntry[];
}

export function AIToolBreakdownChart({ data }: AIToolBreakdownChartProps) {
  const [showEstimated, setShowEstimated] = useState(true);

  const filtered = showEstimated
    ? data
    : data.filter((d) => d.confirmedFiles > 0);

  const chartData = filtered.map((d) => ({
    name: d.tool,
    value: d.totalLoc,
    percentage: d.percentage,
    confirmed: d.confirmedFiles,
    estimated: d.estimatedFiles,
  }));

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-text-primary">Tool Breakdown</h3>
        <label className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
          <input
            type="checkbox"
            checked={showEstimated}
            onChange={(e) => setShowEstimated(e.target.checked)}
            className="h-3 w-3 rounded border-border"
          />
          Include estimated
        </label>
      </div>

      {chartData.length === 0 ? (
        <div className="flex h-48 items-center justify-center">
          <p className="text-[12px] text-text-tertiary">No tool data available</p>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width={160} height={160}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={getToolColor(entry.name)} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(value: number, name: string) => [
                  `${value.toLocaleString()} LOC`,
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="flex-1 space-y-1.5">
            {chartData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: getToolColor(entry.name) }}
                />
                <span className="flex-1 text-[11px] font-medium capitalize text-text-primary">
                  {entry.name}
                </span>
                <span className="font-mono text-[11px] text-text-tertiary">
                  {entry.percentage.toFixed(0)}%
                </span>
                <span className="font-mono text-[10px] text-text-tertiary">
                  ({entry.confirmed}c + {entry.estimated}e)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 5: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run __tests__/ai-metrics-charts.test.ts`
Expected: All 3 tests PASS

**Step 6: Commit**

```bash
git add apps/dashboard/components/ai-metrics/ai-metrics-trend-chart.tsx apps/dashboard/components/ai-metrics/ai-tool-breakdown-chart.tsx apps/dashboard/__tests__/ai-metrics-charts.test.ts
git commit -m "feat(ai-metrics): add trend chart and tool breakdown donut components"
```

---

### Task 16: Dashboard Components — Project Leaderboard + Compare

**Files:**
- Create: `apps/dashboard/components/ai-metrics/ai-project-leaderboard.tsx`
- Create: `apps/dashboard/components/ai-metrics/ai-project-compare.tsx`
- Create: `apps/dashboard/__tests__/ai-project-leaderboard.test.ts`

**Step 1: Write the failing tests**

```typescript
// apps/dashboard/__tests__/ai-project-leaderboard.test.ts
import { describe, it, expect } from "vitest";
import {
  SORT_OPTIONS,
  formatProjectRatio,
} from "@/components/ai-metrics/ai-project-leaderboard";

describe("AI Project Leaderboard helpers", () => {
  it("SORT_OPTIONS has 4 sort keys", () => {
    expect(SORT_OPTIONS).toHaveLength(4);
    const keys = SORT_OPTIONS.map((o) => o.key);
    expect(keys).toContain("aiRatio");
    expect(keys).toContain("aiInfluenceScore");
    expect(keys).toContain("aiFiles");
    expect(keys).toContain("totalFiles");
  });

  it("formatProjectRatio formats as percentage", () => {
    expect(formatProjectRatio(0.35)).toBe("35.0%");
    expect(formatProjectRatio(0)).toBe("0.0%");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run __tests__/ai-project-leaderboard.test.ts`
Expected: FAIL — module not found

**Step 3: Write ai-project-leaderboard.tsx**

```typescript
// apps/dashboard/components/ai-metrics/ai-project-leaderboard.tsx
"use client";

import { useState, useCallback } from "react";
import type { AIProjectMetric } from "@/lib/types";

export const SORT_OPTIONS = [
  { key: "aiRatio", label: "AI Ratio" },
  { key: "aiInfluenceScore", label: "Influence" },
  { key: "aiFiles", label: "AI Files" },
  { key: "totalFiles", label: "Total Files" },
] as const;

export function formatProjectRatio(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

interface AIProjectLeaderboardProps {
  projects: AIProjectMetric[];
  onCompare?: (projectIds: string[]) => void;
}

export function AIProjectLeaderboard({ projects, onCompare }: AIProjectLeaderboardProps) {
  const [sortBy, setSortBy] = useState<string>("aiRatio");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sorted = [...projects].sort((a, b) => {
    return ((b as any)[sortBy] ?? 0) - ((a as any)[sortBy] ?? 0);
  });

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      return next;
    });
  }, []);

  const canCompare = selected.size >= 2 && selected.size <= 5;

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-text-primary">Project Leaderboard</h3>
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-text-primary"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
          {onCompare && (
            <button
              onClick={() => onCompare(Array.from(selected))}
              disabled={!canCompare}
              className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-40"
            >
              Compare ({selected.size})
            </button>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex h-24 items-center justify-center">
          <p className="text-[12px] text-text-tertiary">No projects with AI metrics</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-left text-text-tertiary">
                {onCompare && <th className="pb-2 pr-2 w-6" />}
                <th className="pb-2 pr-4 font-medium">Project</th>
                <th className="pb-2 pr-4 font-medium text-right">AI Ratio</th>
                <th className="pb-2 pr-4 font-medium text-right">Influence</th>
                <th className="pb-2 pr-4 font-medium text-right">AI Files</th>
                <th className="pb-2 font-medium text-right">Total Files</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((proj) => (
                <tr key={proj.projectId} className="border-b border-border/50 hover:bg-surface-2/50">
                  {onCompare && (
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={selected.has(proj.projectId)}
                        onChange={() => toggleSelect(proj.projectId)}
                        className="h-3 w-3 rounded border-border"
                      />
                    </td>
                  )}
                  <td className="py-2 pr-4 font-medium text-text-primary">{proj.projectName}</td>
                  <td className="py-2 pr-4 text-right font-mono">{formatProjectRatio(proj.aiRatio)}</td>
                  <td className="py-2 pr-4 text-right font-mono">{formatProjectRatio(proj.aiInfluenceScore)}</td>
                  <td className="py-2 pr-4 text-right font-mono">{proj.aiFiles}</td>
                  <td className="py-2 text-right font-mono">{proj.totalFiles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

**Step 4: Write ai-project-compare.tsx**

```typescript
// apps/dashboard/components/ai-metrics/ai-project-compare.tsx
"use client";

import {
  LineChart,
  Line,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AIProjectComparison, AIProjectMetric } from "@/lib/types";

const LINE_COLORS = ["#2563eb", "#f97316", "#8b5cf6", "#22c55e", "#ef4444"];

interface AIProjectCompareProps {
  comparison: AIProjectComparison | null;
  projects: AIProjectMetric[];
  onClose: () => void;
}

export function AIProjectCompare({ comparison, projects, onClose }: AIProjectCompareProps) {
  if (!comparison) return null;

  // Build unified data points
  const allDates = new Set<string>();
  for (const series of Object.values(comparison.series)) {
    for (const pt of series) allDates.add(pt.date);
  }
  const dates = Array.from(allDates).sort();

  const data = dates.map((date) => {
    const point: any = { date };
    for (const [pid, series] of Object.entries(comparison.series)) {
      const found = series.find((s) => s.date === date);
      point[pid] = found ? +(found.aiRatio * 100).toFixed(1) : null;
    }
    return point;
  });

  const nameMap: Record<string, string> = {};
  for (const p of projects) nameMap[p.projectId] = p.projectName;

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-text-primary">
          Project Comparison ({comparison.projectIds.length})
        </h3>
        <button
          onClick={onClose}
          className="rounded-md px-2 py-0.5 text-[11px] text-text-tertiary hover:bg-surface-2"
        >
          Close
        </button>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
            tickFormatter={(v) => v.slice(5)}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 11,
            }}
            formatter={(value: number, name: string) => [
              `${value}%`,
              nameMap[name] ?? name,
            ]}
          />
          {comparison.projectIds.map((pid, i) => (
            <Line
              key={pid}
              type="monotone"
              dataKey={pid}
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
              name={pid}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-2 flex flex-wrap gap-3">
        {comparison.projectIds.map((pid, i) => (
          <div key={pid} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }}
            />
            <span className="text-[11px] text-text-primary">{nameMap[pid] ?? pid}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 5: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run __tests__/ai-project-leaderboard.test.ts`
Expected: All 2 tests PASS

**Step 6: Commit**

```bash
git add apps/dashboard/components/ai-metrics/ai-project-leaderboard.tsx apps/dashboard/components/ai-metrics/ai-project-compare.tsx apps/dashboard/__tests__/ai-project-leaderboard.test.ts
git commit -m "feat(ai-metrics): add project leaderboard and comparison components"
```

---

### Task 17: Dashboard Components — Alerts Panel + Config Modal

**Files:**
- Create: `apps/dashboard/components/ai-metrics/ai-alerts-panel.tsx`
- Create: `apps/dashboard/components/ai-metrics/ai-metrics-config-modal.tsx`
- Create: `apps/dashboard/__tests__/ai-metrics-config-modal.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/dashboard/__tests__/ai-metrics-config-modal.test.ts
import { describe, it, expect } from "vitest";
import {
  THRESHOLD_PRESETS,
  validateThreshold,
} from "@/components/ai-metrics/ai-metrics-config-modal";

describe("AI Metrics Config Modal helpers", () => {
  it("THRESHOLD_PRESETS has 3 presets", () => {
    expect(THRESHOLD_PRESETS).toHaveLength(3);
    expect(THRESHOLD_PRESETS.map((p) => p.label)).toEqual(["Balanced", "Conservative", "Strict"]);
  });

  it("validateThreshold accepts valid values", () => {
    expect(validateThreshold(0)).toBe(true);
    expect(validateThreshold(0.5)).toBe(true);
    expect(validateThreshold(1)).toBe(true);
  });

  it("validateThreshold rejects invalid values", () => {
    expect(validateThreshold(-0.1)).toBe(false);
    expect(validateThreshold(1.1)).toBe(false);
    expect(validateThreshold(NaN)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run __tests__/ai-metrics-config-modal.test.ts`
Expected: FAIL — module not found

**Step 3: Write ai-alerts-panel.tsx**

```typescript
// apps/dashboard/components/ai-metrics/ai-alerts-panel.tsx
"use client";

import type { AIAnomalyAlert } from "@/lib/types";

const SEVERITY_STYLES: Record<string, { bg: string; text: string }> = {
  critical: { bg: "bg-status-fail/10", text: "text-status-fail" },
  warning: { bg: "bg-status-warn/10", text: "text-status-warn" },
};

const TYPE_LABELS: Record<string, string> = {
  threshold_exceeded: "Threshold Exceeded",
  spike_detected: "Spike Detected",
  new_tool: "New Tool",
};

interface AIAlertsPanelProps {
  alerts: AIAnomalyAlert[];
}

export function AIAlertsPanel({ alerts }: AIAlertsPanelProps) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <h3 className="mb-3 text-[13px] font-semibold text-text-primary">
        Active Alerts ({alerts.length})
      </h3>

      {alerts.length === 0 ? (
        <div className="flex h-20 items-center justify-center">
          <p className="text-[12px] text-text-tertiary">No active alerts</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert, i) => {
            const style = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.warning;
            return (
              <div
                key={`${alert.type}-${alert.projectId ?? "org"}-${i}`}
                className={`rounded-lg border border-border p-3 ${style.bg}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold uppercase ${style.text}`}>
                        {alert.severity}
                      </span>
                      <span className="text-[11px] font-medium text-text-primary">
                        {TYPE_LABELS[alert.type] ?? alert.type}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-text-secondary">{alert.detail}</p>
                    {alert.projectName && (
                      <p className="mt-0.5 text-[11px] text-text-tertiary">
                        Project: {alert.projectName}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-text-tertiary">
                    {new Date(alert.detectedAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

**Step 4: Write ai-metrics-config-modal.tsx**

```typescript
// apps/dashboard/components/ai-metrics/ai-metrics-config-modal.tsx
"use client";

import { useState, useCallback } from "react";
import type { AIMetricsConfig } from "@/lib/types";

export const THRESHOLD_PRESETS = [
  { label: "Balanced", value: 0.50, description: "General use" },
  { label: "Conservative", value: 0.65, description: "Higher confidence" },
  { label: "Strict", value: 0.75, description: "Regulated industries" },
];

export function validateThreshold(value: number): boolean {
  return typeof value === "number" && !isNaN(value) && value >= 0 && value <= 1;
}

interface AIMetricsConfigModalProps {
  open: boolean;
  config: AIMetricsConfig;
  onClose: () => void;
  onSave: (data: Partial<AIMetricsConfig>) => Promise<void>;
}

export function AIMetricsConfigModal({ open, config, onClose, onSave }: AIMetricsConfigModalProps) {
  const [threshold, setThreshold] = useState(config.threshold);
  const [alertEnabled, setAlertEnabled] = useState(config.alertEnabled);
  const [alertMaxRatio, setAlertMaxRatio] = useState(config.alertMaxRatio ?? 0.5);
  const [alertSpikeStdDev, setAlertSpikeStdDev] = useState(config.alertSpikeStdDev);
  const [alertNewTool, setAlertNewTool] = useState(config.alertNewTool);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!validateThreshold(threshold)) return;
    setSaving(true);
    try {
      await onSave({
        threshold,
        alertEnabled,
        alertMaxRatio: alertEnabled ? alertMaxRatio : null,
        alertSpikeStdDev,
        alertNewTool,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }, [threshold, alertEnabled, alertMaxRatio, alertSpikeStdDev, alertNewTool, onSave, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface-1 p-6 shadow-xl">
        <h2 className="text-[15px] font-bold text-text-primary">AI Metrics Configuration</h2>

        {/* Threshold */}
        <div className="mt-4">
          <label className="text-[12px] font-medium text-text-secondary">
            Detection Threshold: {(threshold * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={threshold * 100}
            onChange={(e) => setThreshold(Number(e.target.value) / 100)}
            className="mt-1 w-full"
          />
          <div className="mt-1 flex gap-2">
            {THRESHOLD_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => setThreshold(preset.value)}
                className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${
                  Math.abs(threshold - preset.value) < 0.01
                    ? "bg-accent text-white"
                    : "bg-surface-2 text-text-tertiary hover:bg-surface-2/80"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Alert toggles */}
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={alertEnabled}
              onChange={(e) => setAlertEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <span className="text-[12px] text-text-primary">Enable anomaly alerts</span>
          </label>

          {alertEnabled && (
            <div className="ml-6 space-y-3">
              <div>
                <label className="text-[11px] text-text-secondary">
                  Max AI Ratio: {(alertMaxRatio * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={alertMaxRatio * 100}
                  onChange={(e) => setAlertMaxRatio(Number(e.target.value) / 100)}
                  className="mt-0.5 w-full"
                />
              </div>

              <div>
                <label className="text-[11px] text-text-secondary">
                  Spike Detection (std devs): {alertSpikeStdDev.toFixed(1)}
                </label>
                <input
                  type="range"
                  min={10}
                  max={40}
                  value={alertSpikeStdDev * 10}
                  onChange={(e) => setAlertSpikeStdDev(Number(e.target.value) / 10)}
                  className="mt-0.5 w-full"
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={alertNewTool}
                  onChange={(e) => setAlertNewTool(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                <span className="text-[11px] text-text-primary">Alert on new AI tools</span>
              </label>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-[12px] text-text-tertiary hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !validateThreshold(threshold)}
            className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent/90 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 5: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run __tests__/ai-metrics-config-modal.test.ts`
Expected: All 3 tests PASS

**Step 6: Commit**

```bash
git add apps/dashboard/components/ai-metrics/ai-alerts-panel.tsx apps/dashboard/components/ai-metrics/ai-metrics-config-modal.tsx apps/dashboard/__tests__/ai-metrics-config-modal.test.ts
git commit -m "feat(ai-metrics): add alerts panel and config modal components"
```

---

### Task 18: Dashboard Component — Compliance Gaps

**Files:**
- Create: `apps/dashboard/components/ai-metrics/ai-compliance-gaps.tsx`

**Step 1: Write the component**

```typescript
// apps/dashboard/components/ai-metrics/ai-compliance-gaps.tsx
"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const GAP_COLORS: Record<string, string> = {
  provenance: "#ef4444",
  bias: "#f59e0b",
  oversight: "#3b82f6",
  transparency: "#8b5cf6",
  accountability: "#22c55e",
};

interface AIComplianceGapsProps {
  gaps: Record<string, number>;
}

export function AIComplianceGaps({ gaps }: AIComplianceGapsProps) {
  const data = Object.entries(gaps)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <h3 className="mb-3 text-[13px] font-semibold text-text-primary">Compliance Gaps</h3>

      {data.length === 0 ? (
        <div className="flex h-24 items-center justify-center">
          <p className="text-[12px] text-text-tertiary">No compliance gaps detected</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(120, data.length * 32)}>
          <BarChart data={data} layout="vertical" margin={{ left: 80 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
            />
            <YAxis
              type="category"
              dataKey="category"
              tick={{ fontSize: 11, fill: "var(--color-text-primary)" }}
              width={75}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                fontSize: 11,
              }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((entry) => (
                <rect
                  key={entry.category}
                  fill={GAP_COLORS[entry.category] ?? "#6b7280"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/dashboard/components/ai-metrics/ai-compliance-gaps.tsx
git commit -m "feat(ai-metrics): add compliance gaps horizontal bar chart component"
```

---

### Task 19: Dashboard Server Actions

**Files:**
- Create: `apps/dashboard/app/(dashboard)/ai-metrics/actions.ts`

**Step 1: Write the server actions**

```typescript
// apps/dashboard/app/(dashboard)/ai-metrics/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import type { AIMetricsConfig } from "@/lib/types";

export async function updateAIMetricsConfigAction(data: Partial<AIMetricsConfig>) {
  const { updateAIMetricsConfig } = await import("@/lib/api");
  const result = await updateAIMetricsConfig(data);
  revalidatePath("/ai-metrics");
  return result;
}

export async function fetchAIMetricsCompareAction(projectIds: string[], days: number) {
  const { getAIMetricsCompare } = await import("@/lib/api");
  return getAIMetricsCompare(projectIds, days);
}

export async function fetchAIMetricsTrendAction(days: number, projectId?: string) {
  const { getAIMetricsTrend } = await import("@/lib/api");
  return getAIMetricsTrend(days, projectId);
}
```

**Step 2: Commit**

```bash
git add apps/dashboard/app/\(dashboard\)/ai-metrics/actions.ts
git commit -m "feat(ai-metrics): add server actions for AI metrics page"
```

---

### Task 20: Dashboard Pages — AI Metrics dedicated page

**Files:**
- Create: `apps/dashboard/app/(dashboard)/ai-metrics/page.tsx`
- Create: `apps/dashboard/app/(dashboard)/ai-metrics/ai-metrics-client.tsx`

**Step 1: Write the server page component**

```typescript
// apps/dashboard/app/(dashboard)/ai-metrics/page.tsx
import { PageHeader } from "@/components/page-header";
import {
  getAIMetricsStats,
  getAIMetricsTrend,
  getAIMetricsProjects,
  getAIMetricsAlerts,
  getAIMetricsConfig,
} from "@/lib/api";
import { AIMetricsClient } from "./ai-metrics-client";

export default async function AIMetricsPage() {
  const [stats, trend, projects, alerts, config] = await Promise.all([
    getAIMetricsStats(),
    getAIMetricsTrend(30),
    getAIMetricsProjects(),
    getAIMetricsAlerts(),
    getAIMetricsConfig(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="AI Code Metrics" description="Org-wide AI-generated code analysis" />
      <AIMetricsClient
        initialStats={stats}
        initialTrend={trend}
        initialProjects={projects}
        initialAlerts={alerts}
        initialConfig={config}
      />
    </div>
  );
}
```

**Step 2: Write the client wrapper**

```typescript
// apps/dashboard/app/(dashboard)/ai-metrics/ai-metrics-client.tsx
"use client";

import { useState, useCallback } from "react";
import type {
  AIMetricsStats,
  AITrendResult,
  AIProjectMetric,
  AIAnomalyAlert,
  AIMetricsConfig,
  AIProjectComparison,
} from "@/lib/types";
import { AIMetricsStatCards } from "@/components/ai-metrics/ai-metrics-stat-cards";
import { AIMetricsTrendChart } from "@/components/ai-metrics/ai-metrics-trend-chart";
import { AIToolBreakdownChart } from "@/components/ai-metrics/ai-tool-breakdown-chart";
import { AIProjectLeaderboard } from "@/components/ai-metrics/ai-project-leaderboard";
import { AIProjectCompare } from "@/components/ai-metrics/ai-project-compare";
import { AIComplianceGaps } from "@/components/ai-metrics/ai-compliance-gaps";
import { AIAlertsPanel } from "@/components/ai-metrics/ai-alerts-panel";
import { AIMetricsConfigModal } from "@/components/ai-metrics/ai-metrics-config-modal";
import {
  updateAIMetricsConfigAction,
  fetchAIMetricsCompareAction,
  fetchAIMetricsTrendAction,
} from "./actions";

interface AIMetricsClientProps {
  initialStats: AIMetricsStats;
  initialTrend: AITrendResult;
  initialProjects: AIProjectMetric[];
  initialAlerts: AIAnomalyAlert[];
  initialConfig: AIMetricsConfig;
}

export function AIMetricsClient({
  initialStats,
  initialTrend,
  initialProjects,
  initialAlerts,
  initialConfig,
}: AIMetricsClientProps) {
  const [trend, setTrend] = useState(initialTrend);
  const [activePeriod, setActivePeriod] = useState(30);
  const [comparison, setComparison] = useState<AIProjectComparison | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [config, setConfig] = useState(initialConfig);

  const handlePeriodChange = useCallback(async (days: number) => {
    setActivePeriod(days);
    const newTrend = await fetchAIMetricsTrendAction(days);
    setTrend(newTrend);
  }, []);

  const handleCompare = useCallback(async (projectIds: string[]) => {
    const result = await fetchAIMetricsCompareAction(projectIds, activePeriod);
    setComparison(result);
  }, [activePeriod]);

  const handleConfigSave = useCallback(async (data: Partial<AIMetricsConfig>) => {
    const updated = await updateAIMetricsConfigAction(data);
    setConfig(updated);
  }, []);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="animate-fade-up" style={{ animationDelay: "0.03s" }}>
        <AIMetricsStatCards stats={initialStats} trend={trend} />
      </div>

      {/* Trend chart + Tool donut — 2 columns */}
      <div
        className="animate-fade-up grid gap-4 lg:grid-cols-[2fr_1fr]"
        style={{ animationDelay: "0.06s" }}
      >
        <AIMetricsTrendChart
          points={trend.points}
          onPeriodChange={handlePeriodChange}
          activePeriod={activePeriod}
        />
        <AIToolBreakdownChart data={initialStats.toolBreakdown} />
      </div>

      {/* Project leaderboard — full width */}
      <div className="animate-fade-up" style={{ animationDelay: "0.09s" }}>
        <AIProjectLeaderboard
          projects={initialProjects}
          onCompare={handleCompare}
        />
      </div>

      {/* Compare overlay */}
      {comparison && (
        <div className="animate-fade-up">
          <AIProjectCompare
            comparison={comparison}
            projects={initialProjects}
            onClose={() => setComparison(null)}
          />
        </div>
      )}

      {/* Compliance gaps + Alerts — 2 columns */}
      <div
        className="animate-fade-up grid gap-4 lg:grid-cols-2"
        style={{ animationDelay: "0.12s" }}
      >
        <AIComplianceGaps gaps={{}} />
        <AIAlertsPanel alerts={initialAlerts} />
      </div>

      {/* Config button */}
      <div className="flex justify-end">
        <button
          onClick={() => setConfigOpen(true)}
          className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:bg-surface-2"
        >
          Configure Thresholds
        </button>
      </div>

      {/* Config modal */}
      <AIMetricsConfigModal
        open={configOpen}
        config={config}
        onClose={() => setConfigOpen(false)}
        onSave={handleConfigSave}
      />
    </div>
  );
}
```

**Step 3: Verify build**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/dashboard/app/\(dashboard\)/ai-metrics/page.tsx apps/dashboard/app/\(dashboard\)/ai-metrics/ai-metrics-client.tsx
git commit -m "feat(ai-metrics): add AI metrics page with client wrapper"
```

---

### Task 21: Dashboard Nav + RBAC — Add AI Metrics navigation

**Files:**
- Modify: `apps/dashboard/lib/rbac.ts`
- Modify: `apps/dashboard/components/icons.tsx`

**Step 1: Add AI Metrics to navigation**

In `apps/dashboard/lib/rbac.ts`:

Add to `ROUTE_PERMISSIONS` array (before the catch-all `/` entry):
```typescript
  { path: "/ai-metrics", roles: ["admin", "manager", "dev", "viewer"] },
```

Add to `NAV_ITEMS` array (after the "Charts" entry):
```typescript
  { label: "AI Metrics", href: "/ai-metrics", icon: "cpu" },
```

**Step 2: Add CPU icon**

In `apps/dashboard/components/icons.tsx`, add an icon for `cpu`. Check if a suitable icon already exists. If not, add:

```typescript
function IconCpu(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2" />
    </svg>
  );
}
```

And add to the `ICON_MAP`:
```typescript
cpu: IconCpu,
```

**Step 3: Verify build**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/dashboard/lib/rbac.ts apps/dashboard/components/icons.tsx
git commit -m "feat(ai-metrics): add AI metrics to navigation and RBAC"
```

---

### Task 22: Overview Page — Add AI Metrics stat row

**Files:**
- Modify: `apps/dashboard/app/(dashboard)/page.tsx`

**Step 1: Add AI metrics data fetch**

In the `OverviewPage` server component, add the import and data fetch:

At the top, add:
```typescript
import { getAIMetricsStats, getAIMetricsTrend } from "@/lib/api";
```

Inside the function, add alongside existing data fetches:
```typescript
  const [aiStats, aiTrend] = await Promise.all([
    getAIMetricsStats(),
    getAIMetricsTrend(30),
  ]);
```

**Step 2: Add AI metrics stat cards after existing stats**

After the existing stat cards grid (the `statCards.map` block), add a new section:

```tsx
      {/* AI Code Metrics highlights */}
      <div className="animate-fade-up mt-4" style={{ animationDelay: "0.04s" }}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-text-primary">AI Code Analysis</h2>
          <a
            href="/ai-metrics"
            className="text-[11px] font-medium text-accent hover:underline"
          >
            View Details
          </a>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-surface-1 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">AI Code Ratio</p>
            <p className="mt-1 text-[20px] font-bold text-text-primary">
              {aiStats.hasData ? `${(aiStats.stats.aiRatio * 100).toFixed(1)}%` : "--"}
            </p>
            {aiStats.hasData && (
              <p className={`mt-0.5 text-[11px] font-semibold ${aiTrend.momChange <= 0 ? "text-status-pass" : "text-status-fail"}`}>
                {aiTrend.momChange >= 0 ? "+" : ""}{(aiTrend.momChange * 100).toFixed(1)}% MoM
              </p>
            )}
          </div>
          <div className="rounded-xl border border-border bg-surface-1 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">AI Influence</p>
            <p className="mt-1 text-[20px] font-bold text-text-primary">
              {aiStats.hasData ? `${(aiStats.stats.aiInfluenceScore * 100).toFixed(1)}%` : "--"}
            </p>
            <p className="mt-0.5 text-[11px] text-text-tertiary">Fractional score</p>
          </div>
          <div className="rounded-xl border border-border bg-surface-1 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">AI Tools Detected</p>
            <p className="mt-1 text-[20px] font-bold text-text-primary">
              {aiStats.hasData ? aiStats.toolBreakdown.length : "--"}
            </p>
            {aiStats.toolBreakdown[0] && (
              <p className="mt-0.5 text-[11px] text-text-tertiary capitalize">
                Top: {aiStats.toolBreakdown[0].tool}
              </p>
            )}
          </div>
        </div>
      </div>
```

**Step 3: Verify build**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/dashboard/app/\(dashboard\)/page.tsx
git commit -m "feat(ai-metrics): add AI metrics highlights to overview page"
```

---

### Task 23: Final Integration — Run all tests and verify

**Files:**
- No new files — verification only

**Step 1: Run all compliance package tests**

Run: `cd packages/compliance && npx vitest run`
Expected: All tests pass (existing + ~33 new ai-metrics tests)

**Step 2: Run all API tests**

Run: `npx turbo test --filter=@sentinel/api`
Expected: All tests pass (existing + ~13 new ai-metrics tests)

**Step 3: Run all dashboard tests**

Run: `cd apps/dashboard && npx vitest run`
Expected: All tests pass (existing + ~9 new ai-metrics tests)

**Step 4: Run security package tests (RBAC)**

Run: `cd packages/security && npx vitest run`
Expected: All tests pass

**Step 5: Type check entire monorepo**

Run: `npx turbo build --filter=@sentinel/compliance && npx turbo build --filter=@sentinel/api`
Expected: Build succeeds

**Step 6: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix(ai-metrics): integration fixups from final test run"
```

---

## Summary

| Layer | Files Created | Files Modified | Tests |
|-------|--------------|----------------|-------|
| Schema | 0 | `packages/db/prisma/schema.prisma` | — |
| Computation | 4 new in `packages/compliance/src/ai-metrics/` | — | ~33 |
| Service | 1 new `service.ts` | `packages/compliance/src/index.ts` | ~9 |
| API Routes | 1 new `routes/ai-metrics.ts` | `server.ts`, `rbac.ts` | ~8 |
| Scheduler | 3 new jobs | `scheduler/index.ts` | ~5 |
| Dashboard Types | 0 | `lib/types.ts`, `lib/api.ts` | — |
| Dashboard Components | 8 new in `components/ai-metrics/` | — | ~9 |
| Dashboard Pages | 3 new (page, client, actions) | `page.tsx`, `rbac.ts`, `icons.tsx` | — |
| **Total** | **20 new** | **8 modified** | **~64** |

