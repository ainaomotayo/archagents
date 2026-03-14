# Per-Repo Risk Trend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add sparkline charts and trend badges to the Projects page showing each project's risk score trajectory over the last 90 days.

**Architecture:** Pure computation functions for gap filling and trend math, a service layer for DB queries, a Fastify batch endpoint, and two React components (sparkline + badge) using Recharts.

**Tech Stack:** TypeScript, Prisma (existing `scan` table), Fastify, Recharts `AreaChart`, Vitest, React Testing Library.

---

## Context for the Implementer

- **Monorepo layout:** `packages/compliance/` holds business logic, `apps/api/` has routes, `apps/dashboard/` is Next.js 15.
- **Existing pattern to follow:** AI metrics (`packages/compliance/src/ai-metrics/`) uses pure compute functions + a service class. Risk trend mirrors this.
- **Scan model fields:** `riskScore` (nullable Int), `startedAt` (DateTime), `projectId` (UUID), `orgId` (UUID), `status` (String). Index exists on `[projectId, startedAt DESC]`.
- **Route pattern:** `buildXxxRoutes({ db })` returns handler object, registered in `server.ts` with `app.get(path, { preHandler: authHook }, handler)`.
- **Dashboard pattern:** `tryApi(async (headers) => { ... }, fallbackData)` in `lib/api.ts`, components are `"use client"` with Recharts mocked in tests.
- **Test commands:** API/compliance: `npx turbo test --filter=@sentinel/api` or `--filter=@sentinel/compliance`. Dashboard: `npx turbo test --filter=@sentinel/dashboard`.

---

### Task 1: Pure Computation — `fillGaps`

**Files:**
- Create: `packages/compliance/src/risk-trend/compute.ts`
- Create: `packages/compliance/src/__tests__/risk-trend-compute.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/compliance/src/__tests__/risk-trend-compute.test.ts
import { describe, it, expect } from "vitest";
import { fillGaps } from "../risk-trend/compute.js";

describe("fillGaps", () => {
  it("returns empty array for empty input", () => {
    const result = fillGaps([], "2026-01-01", "2026-01-05");
    expect(result).toEqual([]);
  });

  it("carry-forwards score across missing days", () => {
    const points = [
      { date: "2026-01-01", score: 70 },
      { date: "2026-01-04", score: 60 },
    ];
    const result = fillGaps(points, "2026-01-01", "2026-01-05");
    expect(result).toEqual([
      { date: "2026-01-01", score: 70 },
      { date: "2026-01-02", score: 70 },
      { date: "2026-01-03", score: 70 },
      { date: "2026-01-04", score: 60 },
      { date: "2026-01-05", score: 60 },
    ]);
  });

  it("does not fill before first data point", () => {
    const points = [{ date: "2026-01-03", score: 50 }];
    const result = fillGaps(points, "2026-01-01", "2026-01-05");
    expect(result).toEqual([
      { date: "2026-01-03", score: 50 },
      { date: "2026-01-04", score: 50 },
      { date: "2026-01-05", score: 50 },
    ]);
  });

  it("handles single point on start date", () => {
    const points = [{ date: "2026-01-01", score: 80 }];
    const result = fillGaps(points, "2026-01-01", "2026-01-03");
    expect(result).toEqual([
      { date: "2026-01-01", score: 80 },
      { date: "2026-01-02", score: 80 },
      { date: "2026-01-03", score: 80 },
    ]);
  });

  it("handles consecutive days with no gaps", () => {
    const points = [
      { date: "2026-01-01", score: 70 },
      { date: "2026-01-02", score: 65 },
      { date: "2026-01-03", score: 60 },
    ];
    const result = fillGaps(points, "2026-01-01", "2026-01-03");
    expect(result).toEqual(points);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/.worktrees/human-escalation-approval/sentinel && npx turbo test --filter=@sentinel/compliance -- --run risk-trend-compute`
Expected: FAIL — module `../risk-trend/compute.js` not found

**Step 3: Write minimal implementation**

```typescript
// packages/compliance/src/risk-trend/compute.ts

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  score: number;
}

/**
 * Fill gaps in sparse date-score pairs using carry-forward.
 * Points before the first data point are omitted (no data = no display).
 */
export function fillGaps(
  points: TrendPoint[],
  startDate: string,
  endDate: string,
): TrendPoint[] {
  if (points.length === 0) return [];

  const lookup = new Map(points.map((p) => [p.date, p.score]));
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = sorted[0].date;

  const result: TrendPoint[] = [];
  let lastScore: number | null = null;
  const cursor = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");

  while (cursor <= end) {
    const dateStr = cursor.toISOString().slice(0, 10);

    if (lookup.has(dateStr)) {
      lastScore = lookup.get(dateStr)!;
    }

    if (dateStr >= firstDate && lastScore !== null) {
      result.push({ date: dateStr, score: lastScore });
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/.worktrees/human-escalation-approval/sentinel && npx turbo test --filter=@sentinel/compliance -- --run risk-trend-compute`
Expected: 5 PASS

**Step 5: Commit**

```bash
git add packages/compliance/src/risk-trend/compute.ts packages/compliance/src/__tests__/risk-trend-compute.test.ts
git commit -m "feat(risk-trend): add fillGaps pure computation with tests"
```

---

### Task 2: Pure Computation — `computeDirection` and `computeChangePercent`

**Files:**
- Modify: `packages/compliance/src/risk-trend/compute.ts`
- Modify: `packages/compliance/src/__tests__/risk-trend-compute.test.ts`

**Step 1: Write the failing tests**

Append to the existing test file:

```typescript
import { computeDirection, computeChangePercent } from "../risk-trend/compute.js";

describe("computeDirection", () => {
  it("returns 'flat' for empty points", () => {
    expect(computeDirection([])).toBe("flat");
  });

  it("returns 'flat' for single point", () => {
    expect(computeDirection([{ date: "2026-01-01", score: 50 }])).toBe("flat");
  });

  it("returns 'up' when later scores are higher", () => {
    const points = [
      { date: "2026-01-01", score: 30 },
      { date: "2026-01-02", score: 40 },
      { date: "2026-01-03", score: 50 },
      { date: "2026-01-04", score: 55 },
      { date: "2026-01-05", score: 60 },
      { date: "2026-01-06", score: 65 },
    ];
    expect(computeDirection(points)).toBe("up");
  });

  it("returns 'down' when later scores are lower", () => {
    const points = [
      { date: "2026-01-01", score: 80 },
      { date: "2026-01-02", score: 75 },
      { date: "2026-01-03", score: 70 },
      { date: "2026-01-04", score: 50 },
      { date: "2026-01-05", score: 45 },
      { date: "2026-01-06", score: 40 },
    ];
    expect(computeDirection(points)).toBe("down");
  });

  it("returns 'flat' when scores are roughly equal", () => {
    const points = [
      { date: "2026-01-01", score: 50 },
      { date: "2026-01-02", score: 51 },
      { date: "2026-01-03", score: 50 },
    ];
    expect(computeDirection(points)).toBe("flat");
  });
});

describe("computeChangePercent", () => {
  it("returns 0 for empty points", () => {
    expect(computeChangePercent([])).toBe(0);
  });

  it("returns 0 for single point", () => {
    expect(computeChangePercent([{ date: "2026-01-01", score: 50 }])).toBe(0);
  });

  it("computes positive change", () => {
    const points = [
      { date: "2026-01-01", score: 50 },
      { date: "2026-01-02", score: 60 },
    ];
    expect(computeChangePercent(points)).toBe(20);
  });

  it("computes negative change", () => {
    const points = [
      { date: "2026-01-01", score: 80 },
      { date: "2026-01-02", score: 60 },
    ];
    expect(computeChangePercent(points)).toBe(-25);
  });

  it("returns 0 when first score is 0", () => {
    const points = [
      { date: "2026-01-01", score: 0 },
      { date: "2026-01-02", score: 50 },
    ];
    expect(computeChangePercent(points)).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/.worktrees/human-escalation-approval/sentinel && npx turbo test --filter=@sentinel/compliance -- --run risk-trend-compute`
Expected: FAIL — `computeDirection` and `computeChangePercent` not exported

**Step 3: Write minimal implementation**

Append to `packages/compliance/src/risk-trend/compute.ts`:

```typescript
/**
 * Compare first-third vs last-third average to determine trend direction.
 * Requires > 5% difference to be "up" or "down", otherwise "flat".
 */
export function computeDirection(
  points: TrendPoint[],
): "up" | "down" | "flat" {
  if (points.length < 2) return "flat";

  const thirdLen = Math.max(1, Math.floor(points.length / 3));
  const firstThird = points.slice(0, thirdLen);
  const lastThird = points.slice(-thirdLen);

  const avgFirst = firstThird.reduce((s, p) => s + p.score, 0) / firstThird.length;
  const avgLast = lastThird.reduce((s, p) => s + p.score, 0) / lastThird.length;

  if (avgFirst === 0) return "flat";
  const pctDiff = ((avgLast - avgFirst) / avgFirst) * 100;

  if (pctDiff > 5) return "up";
  if (pctDiff < -5) return "down";
  return "flat";
}

/**
 * Percentage change from first to last point.
 * Returns 0 if empty, single point, or first score is 0.
 */
export function computeChangePercent(points: TrendPoint[]): number {
  if (points.length < 2) return 0;
  const first = points[0].score;
  const last = points[points.length - 1].score;
  if (first === 0) return 0;
  return Math.round(((last - first) / first) * 100);
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/.worktrees/human-escalation-approval/sentinel && npx turbo test --filter=@sentinel/compliance -- --run risk-trend-compute`
Expected: 15 PASS

**Step 5: Commit**

```bash
git add packages/compliance/src/risk-trend/compute.ts packages/compliance/src/__tests__/risk-trend-compute.test.ts
git commit -m "feat(risk-trend): add computeDirection and computeChangePercent"
```

---

### Task 3: Risk Trend Service

**Files:**
- Create: `packages/compliance/src/risk-trend/service.ts`
- Create: `packages/compliance/src/__tests__/risk-trend-service.test.ts`
- Modify: `packages/compliance/src/index.ts` (add exports)

**Step 1: Write the failing tests**

```typescript
// packages/compliance/src/__tests__/risk-trend-service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RiskTrendService } from "../risk-trend/service.js";

function makeMockDb() {
  return {
    scan: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

const ORG = "org-1";

describe("RiskTrendService", () => {
  let db: ReturnType<typeof makeMockDb>;
  let service: RiskTrendService;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeMockDb();
    service = new RiskTrendService(db as any);
  });

  describe("getTrends", () => {
    it("returns empty trends when no completed scans exist", async () => {
      db.scan.findMany.mockResolvedValue([]);
      const result = await service.getTrends(ORG, { days: 90 });
      expect(result.trends).toEqual({});
      expect(result.meta.days).toBe(90);
      expect(result.meta).toHaveProperty("generatedAt");
    });

    it("queries scans with correct filters", async () => {
      db.scan.findMany.mockResolvedValue([]);
      await service.getTrends(ORG, { days: 30 });

      expect(db.scan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orgId: ORG,
            status: "completed",
            riskScore: { not: null },
          }),
          select: expect.objectContaining({
            projectId: true,
            riskScore: true,
            startedAt: true,
          }),
          orderBy: { startedAt: "asc" },
        }),
      );
    });

    it("groups scans by project and fills gaps", async () => {
      const today = new Date();
      const daysAgo = (n: number) => {
        const d = new Date(today);
        d.setDate(d.getDate() - n);
        return d;
      };

      db.scan.findMany.mockResolvedValue([
        { projectId: "p1", riskScore: 70, startedAt: daysAgo(5) },
        { projectId: "p1", riskScore: 60, startedAt: daysAgo(2) },
        { projectId: "p2", riskScore: 40, startedAt: daysAgo(3) },
      ]);

      const result = await service.getTrends(ORG, { days: 10 });

      expect(result.trends).toHaveProperty("p1");
      expect(result.trends).toHaveProperty("p2");
      expect(result.trends.p1.points.length).toBeGreaterThan(2);
      expect(result.trends.p1).toHaveProperty("direction");
      expect(result.trends.p1).toHaveProperty("changePercent");
      expect(result.trends.p2.points.length).toBeGreaterThan(1);
    });

    it("takes MAX risk score when multiple scans on same day", async () => {
      const today = new Date();
      const sameDay = new Date(today);
      sameDay.setDate(sameDay.getDate() - 5);

      db.scan.findMany.mockResolvedValue([
        { projectId: "p1", riskScore: 50, startedAt: new Date(sameDay) },
        { projectId: "p1", riskScore: 80, startedAt: new Date(sameDay) },
        { projectId: "p1", riskScore: 60, startedAt: new Date(sameDay) },
      ]);

      const result = await service.getTrends(ORG, { days: 10 });
      const firstPoint = result.trends.p1.points[0];
      expect(firstPoint.score).toBe(80);
    });

    it("defaults to 90 days", async () => {
      db.scan.findMany.mockResolvedValue([]);
      const result = await service.getTrends(ORG);
      expect(result.meta.days).toBe(90);
    });

    it("clamps days to max 365", async () => {
      db.scan.findMany.mockResolvedValue([]);
      const result = await service.getTrends(ORG, { days: 500 });
      expect(result.meta.days).toBe(365);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/.worktrees/human-escalation-approval/sentinel && npx turbo test --filter=@sentinel/compliance -- --run risk-trend-service`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// packages/compliance/src/risk-trend/service.ts
import { fillGaps, computeDirection, computeChangePercent, type TrendPoint } from "./compute.js";

export interface ProjectTrend {
  points: TrendPoint[];
  direction: "up" | "down" | "flat";
  changePercent: number;
}

export interface RiskTrendResult {
  trends: Record<string, ProjectTrend>;
  meta: {
    days: number;
    generatedAt: string;
  };
}

export class RiskTrendService {
  constructor(private db: any) {}

  async getTrends(
    orgId: string,
    opts: { days?: number } = {},
  ): Promise<RiskTrendResult> {
    const days = Math.min(opts.days ?? 90, 365);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const today = new Date();
    const startDate = since.toISOString().slice(0, 10);
    const endDate = today.toISOString().slice(0, 10);

    const scans = await this.db.scan.findMany({
      where: {
        orgId,
        status: "completed",
        riskScore: { not: null },
        startedAt: { gte: since },
      },
      select: {
        projectId: true,
        riskScore: true,
        startedAt: true,
      },
      orderBy: { startedAt: "asc" },
    });

    // Group by project, then by day (take MAX per day)
    const byProject = new Map<string, Map<string, number>>();
    for (const scan of scans) {
      const pid = scan.projectId;
      const dateStr = new Date(scan.startedAt).toISOString().slice(0, 10);
      if (!byProject.has(pid)) byProject.set(pid, new Map());
      const dayMap = byProject.get(pid)!;
      const existing = dayMap.get(dateStr) ?? 0;
      dayMap.set(dateStr, Math.max(existing, scan.riskScore));
    }

    // Build trends per project
    const trends: Record<string, ProjectTrend> = {};
    for (const [projectId, dayMap] of byProject) {
      const rawPoints: TrendPoint[] = Array.from(dayMap.entries())
        .map(([date, score]) => ({ date, score }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const points = fillGaps(rawPoints, startDate, endDate);
      trends[projectId] = {
        points,
        direction: computeDirection(points),
        changePercent: computeChangePercent(points),
      };
    }

    return {
      trends,
      meta: {
        days,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
```

**Step 4: Add exports to `packages/compliance/src/index.ts`**

Append after the `// AI Metrics` section:

```typescript
// Risk Trend
export { fillGaps, computeDirection, computeChangePercent, type TrendPoint } from "./risk-trend/compute.js";
export { RiskTrendService, type ProjectTrend, type RiskTrendResult } from "./risk-trend/service.js";
```

**Step 5: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/.worktrees/human-escalation-approval/sentinel && npx turbo test --filter=@sentinel/compliance -- --run risk-trend-service`
Expected: 6 PASS

**Step 6: Commit**

```bash
git add packages/compliance/src/risk-trend/service.ts packages/compliance/src/__tests__/risk-trend-service.test.ts packages/compliance/src/index.ts
git commit -m "feat(risk-trend): add RiskTrendService with batch query and exports"
```

---

### Task 4: API Route

**Files:**
- Create: `apps/api/src/routes/risk-trends.ts`
- Create: `apps/api/src/__tests__/risk-trend-routes.test.ts`
- Modify: `apps/api/src/server.ts` (register endpoint)

**Step 1: Write the failing tests**

```typescript
// apps/api/src/__tests__/risk-trend-routes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildRiskTrendRoutes } from "../routes/risk-trends.js";

vi.mock("@sentinel/compliance", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    RiskTrendService: class {
      getTrends = vi.fn().mockResolvedValue({
        trends: {
          "p1": {
            points: [{ date: "2026-01-01", score: 70 }],
            direction: "down",
            changePercent: -5,
          },
        },
        meta: { days: 90, generatedAt: "2026-03-14T00:00:00Z" },
      });
    },
  };
});

describe("buildRiskTrendRoutes", () => {
  const mockDb = {} as any;
  let routes: ReturnType<typeof buildRiskTrendRoutes>;

  beforeEach(() => {
    vi.clearAllMocks();
    routes = buildRiskTrendRoutes({ db: mockDb });
  });

  it("getTrends returns trends and meta", async () => {
    const result = await routes.getTrends("org-1", { days: 90 });
    expect(result).toHaveProperty("trends");
    expect(result).toHaveProperty("meta");
    expect(result.trends.p1.direction).toBe("down");
  });

  it("getTrends passes days option through", async () => {
    const result = await routes.getTrends("org-1", { days: 30 });
    expect(result).toHaveProperty("trends");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/.worktrees/human-escalation-approval/sentinel && npx turbo test --filter=@sentinel/api -- --run risk-trend-routes`
Expected: FAIL — module not found

**Step 3: Write the route handler**

```typescript
// apps/api/src/routes/risk-trends.ts
import { RiskTrendService } from "@sentinel/compliance";

interface RiskTrendRouteDeps {
  db: any;
}

export function buildRiskTrendRoutes(deps: RiskTrendRouteDeps) {
  const service = new RiskTrendService(deps.db);

  return {
    getTrends: async (orgId: string, opts: { days?: number } = {}) =>
      service.getTrends(orgId, opts),
  };
}
```

**Step 4: Register the endpoint in `apps/api/src/server.ts`**

Add import near the top with other route imports:

```typescript
import { buildRiskTrendRoutes } from "./routes/risk-trends.js";
```

Add after the `aiMetricsRoutes` initialization (around line 111):

```typescript
const riskTrendRoutes = buildRiskTrendRoutes({ db });
```

Add the endpoint registration after the AI metrics endpoints:

```typescript
app.get("/v1/risk-trends", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { days = "90" } = request.query as any;
  return riskTrendRoutes.getTrends(orgId, { days: parseInt(days, 10) });
});
```

**Step 5: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/.worktrees/human-escalation-approval/sentinel && npx turbo test --filter=@sentinel/api -- --run risk-trend-routes`
Expected: 2 PASS

**Step 6: Commit**

```bash
git add apps/api/src/routes/risk-trends.ts apps/api/src/__tests__/risk-trend-routes.test.ts apps/api/src/server.ts
git commit -m "feat(risk-trend): add GET /v1/risk-trends batch endpoint"
```

---

### Task 5: Dashboard API Client

**Files:**
- Modify: `apps/dashboard/lib/types.ts` (add types)
- Modify: `apps/dashboard/lib/api.ts` (add `getRiskTrends`)

**Step 1: Add types to `apps/dashboard/lib/types.ts`**

Append after the existing type definitions:

```typescript
// Risk Trend
export interface RiskTrendPoint {
  date: string;
  score: number;
}

export interface ProjectRiskTrend {
  points: RiskTrendPoint[];
  direction: "up" | "down" | "flat";
  changePercent: number;
}

export interface RiskTrendResult {
  trends: Record<string, ProjectRiskTrend>;
  meta: {
    days: number;
    generatedAt: string;
  };
}
```

**Step 2: Add API function to `apps/dashboard/lib/api.ts`**

Append after the AI metrics section:

```typescript
// ── Risk Trends ──────────────────────────────────────────

export async function getRiskTrends(days = 90): Promise<RiskTrendResult> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<RiskTrendResult>("/v1/risk-trends", { days: String(days) }, headers);
  }, { trends: {}, meta: { days, generatedAt: new Date().toISOString() } });
}
```

Also add `RiskTrendResult` to the imports at the top of the file:

```typescript
import type {
  // ... existing imports ...
  RiskTrendResult,
} from "./types";
```

**Step 3: Commit**

```bash
git add apps/dashboard/lib/types.ts apps/dashboard/lib/api.ts
git commit -m "feat(risk-trend): add dashboard API client for risk trends"
```

---

### Task 6: RiskSparkline Component

**Files:**
- Create: `apps/dashboard/components/risk-sparkline.tsx`
- Create: `apps/dashboard/__tests__/risk-sparkline.test.tsx`

**Step 1: Write the failing tests**

```typescript
// apps/dashboard/__tests__/risk-sparkline.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

vi.mock("recharts", () => ({
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}));

import { RiskSparkline } from "@/components/risk-sparkline";

const samplePoints = [
  { date: "2026-01-01", score: 70 },
  { date: "2026-01-02", score: 65 },
  { date: "2026-01-03", score: 60 },
];

describe("RiskSparkline", () => {
  afterEach(cleanup);

  it("renders area chart when points are provided", () => {
    render(<RiskSparkline points={samplePoints} direction="down" />);
    expect(screen.getByTestId("area-chart")).toBeDefined();
  });

  it("renders empty state when no points", () => {
    render(<RiskSparkline points={[]} direction="flat" />);
    expect(screen.queryByTestId("area-chart")).toBeNull();
    expect(screen.getByText("No data")).toBeDefined();
  });

  it("applies green color class for 'down' direction (risk decreasing = good)", () => {
    const { container } = render(<RiskSparkline points={samplePoints} direction="down" />);
    expect(container.querySelector("[data-direction='down']")).toBeDefined();
  });

  it("applies red color class for 'up' direction (risk increasing = bad)", () => {
    const { container } = render(<RiskSparkline points={samplePoints} direction="up" />);
    expect(container.querySelector("[data-direction='up']")).toBeDefined();
  });

  it("applies gray color class for 'flat' direction", () => {
    const { container } = render(<RiskSparkline points={samplePoints} direction="flat" />);
    expect(container.querySelector("[data-direction='flat']")).toBeDefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/.worktrees/human-escalation-approval/sentinel && npx turbo test --filter=@sentinel/dashboard -- --run risk-sparkline`
Expected: FAIL — module not found

**Step 3: Write the component**

```typescript
// apps/dashboard/components/risk-sparkline.tsx
"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import type { RiskTrendPoint } from "@/lib/types";

interface RiskSparklineProps {
  points: RiskTrendPoint[];
  direction: "up" | "down" | "flat";
  width?: number;
  height?: number;
}

const COLORS = {
  down: "#22c55e",  // green — risk decreasing is good
  up: "#ef4444",    // red — risk increasing is bad
  flat: "#6b7280",  // gray — neutral
} as const;

export function RiskSparkline({
  points,
  direction,
  width = 120,
  height = 40,
}: RiskSparklineProps) {
  if (points.length === 0) {
    return (
      <div
        data-direction={direction}
        className="flex items-center justify-center text-[10px] text-text-tertiary"
        style={{ width, height }}
      >
        No data
      </div>
    );
  }

  const color = COLORS[direction];

  return (
    <div data-direction={direction} style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={`sparkGrad-${direction}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
          <Area
            type="monotone"
            dataKey="score"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#sparkGrad-${direction})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/.worktrees/human-escalation-approval/sentinel && npx turbo test --filter=@sentinel/dashboard -- --run risk-sparkline`
Expected: 5 PASS

**Step 5: Commit**

```bash
git add apps/dashboard/components/risk-sparkline.tsx apps/dashboard/__tests__/risk-sparkline.test.tsx
git commit -m "feat(risk-trend): add RiskSparkline component with tests"
```

---

### Task 7: RiskTrendBadge Component

**Files:**
- Create: `apps/dashboard/components/risk-trend-badge.tsx`
- Create: `apps/dashboard/__tests__/risk-trend-badge.test.tsx`

**Step 1: Write the failing tests**

```typescript
// apps/dashboard/__tests__/risk-trend-badge.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

import { RiskTrendBadge } from "@/components/risk-trend-badge";

describe("RiskTrendBadge", () => {
  afterEach(cleanup);

  it("shows down arrow and green text for 'down' direction", () => {
    render(<RiskTrendBadge direction="down" changePercent={-10} />);
    expect(screen.getByText("-10%")).toBeDefined();
    const badge = screen.getByText("-10%").closest("[data-direction]");
    expect(badge?.getAttribute("data-direction")).toBe("down");
  });

  it("shows up arrow and red text for 'up' direction", () => {
    render(<RiskTrendBadge direction="up" changePercent={15} />);
    expect(screen.getByText("+15%")).toBeDefined();
  });

  it("shows flat indicator for 'flat' direction", () => {
    render(<RiskTrendBadge direction="flat" changePercent={0} />);
    expect(screen.getByText("0%")).toBeDefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/.worktrees/human-escalation-approval/sentinel && npx turbo test --filter=@sentinel/dashboard -- --run risk-trend-badge`
Expected: FAIL — module not found

**Step 3: Write the component**

```typescript
// apps/dashboard/components/risk-trend-badge.tsx
interface RiskTrendBadgeProps {
  direction: "up" | "down" | "flat";
  changePercent: number;
}

const ARROWS: Record<string, string> = {
  up: "\u2191",    // ↑
  down: "\u2193",  // ↓
  flat: "\u2192",  // →
};

const COLORS: Record<string, string> = {
  down: "text-green-500",  // risk decreasing = good
  up: "text-red-500",      // risk increasing = bad
  flat: "text-text-tertiary",
};

export function RiskTrendBadge({ direction, changePercent }: RiskTrendBadgeProps) {
  const sign = changePercent > 0 ? "+" : "";
  return (
    <span
      data-direction={direction}
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${COLORS[direction]}`}
    >
      <span>{ARROWS[direction]}</span>
      <span>{sign}{changePercent}%</span>
    </span>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/.worktrees/human-escalation-approval/sentinel && npx turbo test --filter=@sentinel/dashboard -- --run risk-trend-badge`
Expected: 3 PASS

**Step 5: Commit**

```bash
git add apps/dashboard/components/risk-trend-badge.tsx apps/dashboard/__tests__/risk-trend-badge.test.tsx
git commit -m "feat(risk-trend): add RiskTrendBadge component with tests"
```

---

### Task 8: Integrate into Projects Page

**Files:**
- Modify: `apps/dashboard/app/(dashboard)/projects/page.tsx`
- Modify: `apps/dashboard/lib/api.ts` (already done in Task 5, just verify import works)

**Step 1: Update the Projects page**

Replace the entire file with the updated version that fetches risk trends and renders sparklines:

```typescript
// apps/dashboard/app/(dashboard)/projects/page.tsx
import Link from "next/link";
import { getProjects, getRiskTrends } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { IconFolder, IconExternalLink } from "@/components/icons";
import { RiskSparkline } from "@/components/risk-sparkline";
import { RiskTrendBadge } from "@/components/risk-trend-badge";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ProjectsPage() {
  const [projects, riskTrendData] = await Promise.all([
    getProjects(),
    getRiskTrends(90),
  ]);

  const activeCount = projects.filter((p) => p.lastScanStatus).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description={`${projects.length} monitored repositories \u00B7 ${activeCount} with recent scans`}
      />

      {projects.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-surface-1">
          <div className="text-center">
            <IconFolder className="mx-auto h-8 w-8 text-text-tertiary" />
            <p className="mt-3 text-[14px] font-semibold text-text-primary">
              No projects yet
            </p>
            <p className="mt-1 text-[12px] text-text-tertiary">
              Submit your first scan to create a project.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((project, i) => {
            const trend = riskTrendData.trends[project.id];
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="animate-fade-up group block rounded-xl border border-border bg-surface-1 p-5 transition-all duration-150 hover:border-border-accent hover:bg-surface-2 focus-ring"
                style={{ animationDelay: `${0.04 * i}s` }}
                aria-label={`View project ${project.name}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 transition-colors group-hover:bg-surface-3">
                      <IconFolder className="h-4 w-4 text-text-tertiary group-hover:text-accent transition-colors" />
                    </div>
                    <div>
                      <h2 className="text-[14px] font-semibold text-text-primary group-hover:text-accent transition-colors">
                        {project.name}
                      </h2>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-text-tertiary">
                        {project.repoUrl ? (
                          <>
                            <span className="truncate max-w-[200px]">
                              {project.repoUrl.replace(/^https?:\/\//, "")}
                            </span>
                            <IconExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                          </>
                        ) : (
                          project.lastScanDate
                            ? `Last scan: ${formatDate(project.lastScanDate)}`
                            : "No scans yet"
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-5">
                    {trend && (
                      <div className="flex items-center gap-2">
                        <RiskSparkline
                          points={trend.points}
                          direction={trend.direction}
                        />
                        <RiskTrendBadge
                          direction={trend.direction}
                          changePercent={trend.changePercent}
                        />
                      </div>
                    )}
                    {project.lastScanStatus && (
                      <StatusBadge status={project.lastScanStatus} />
                    )}
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-lg font-bold text-text-primary">
                          {project.findingCount}
                        </p>
                        <p className="text-[9px] uppercase tracking-wider text-text-tertiary">
                          findings
                        </p>
                      </div>
                      <div className="h-6 w-px bg-border" />
                      <div className="text-right">
                        <p className="text-lg font-bold text-text-primary">
                          {project.scanCount}
                        </p>
                        <p className="text-[9px] uppercase tracking-wider text-text-tertiary">
                          scans
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify the build compiles**

Run: `cd /home/ainaomotayo/archagents/.worktrees/human-escalation-approval/sentinel && npx turbo build --filter=@sentinel/compliance`
Expected: Build succeeds

**Step 3: Run all tests to verify nothing is broken**

Run: `cd /home/ainaomotayo/archagents/.worktrees/human-escalation-approval/sentinel && npx turbo test --filter=@sentinel/compliance && npx turbo test --filter=@sentinel/api && npx turbo test --filter=@sentinel/dashboard`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add apps/dashboard/app/\(dashboard\)/projects/page.tsx
git commit -m "feat(risk-trend): integrate sparkline and trend badge into Projects page"
```

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | `fillGaps` pure function | 5 |
| 2 | `computeDirection` + `computeChangePercent` | 10 |
| 3 | `RiskTrendService` | 6 |
| 4 | API route `GET /v1/risk-trends` | 2 |
| 5 | Dashboard API client + types | 0 (thin wrapper) |
| 6 | `RiskSparkline` component | 5 |
| 7 | `RiskTrendBadge` component | 3 |
| 8 | Projects page integration | 0 (integration, verify build) |
| **Total** | | **31** |
