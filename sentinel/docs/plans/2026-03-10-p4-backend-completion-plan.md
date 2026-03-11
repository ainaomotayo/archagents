# P4: Full Backend Completion — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close all remaining backend gaps: enrich scheduler health with `lastTrigger`/`nextScheduled` via cron-parser, add assessor-worker Docker healthcheck, create shared healthcheck script, add scheduler HTTP server tests, and verify full build.

**Architecture:** Enhance `SchedulerMetrics` with schedule tracking and next-occurrence computation via `cron-parser`. Add minimal health HTTP server to assessor worker. Create reusable `docker/healthcheck.js`. Update both Docker Compose files.

**Tech Stack:** TypeScript, cron-parser, node-cron, http module, Docker Compose, vitest.

---

## Task 1: Install cron-parser and Enrich Scheduler Health

**Files:**
- Modify: `apps/api/package.json` (add cron-parser dependency)
- Modify: `apps/api/src/scheduler.ts:1-124` (SchedulerMetrics + createHealthServer)
- Test: `apps/api/src/__tests__/scheduler.test.ts`

**Step 1: Install cron-parser**

Run:
```bash
cd /home/ainaomotayo/archagents/sentinel && pnpm add cron-parser --filter @sentinel/api
```

Expected: `cron-parser` added to `apps/api/package.json` dependencies.

**Step 2: Write the failing tests for getHealthStatus and registerSchedule**

Add to `apps/api/src/__tests__/scheduler.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { buildSchedulerConfig, shouldTriggerScan, RETENTION_SCHEDULE, SchedulerMetrics } from "../scheduler.js";

// ... existing tests remain unchanged ...

describe("SchedulerMetrics health status", () => {
  test("getHealthStatus includes lastTrigger timestamps as ISO strings", () => {
    const metrics = new SchedulerMetrics();
    metrics.recordTrigger("self_scan");
    const health = metrics.getHealthStatus();
    expect(health.status).toBe("ok");
    expect(health.uptime).toBeGreaterThan(0);
    expect(health.lastTrigger).toBeDefined();
    expect(health.lastTrigger.self_scan).toBeDefined();
    // Should be a valid ISO date string
    expect(new Date(health.lastTrigger.self_scan).toISOString()).toBe(health.lastTrigger.self_scan);
  });

  test("getHealthStatus includes nextScheduled computed by cron-parser", () => {
    const metrics = new SchedulerMetrics();
    metrics.registerSchedule("self_scan", "0 2 * * *");
    const health = metrics.getHealthStatus();
    expect(health.nextScheduled).toBeDefined();
    expect(health.nextScheduled.self_scan).toBeDefined();
    // Should be a valid ISO date string in the future
    const next = new Date(health.nextScheduled.self_scan);
    expect(next.getTime()).toBeGreaterThan(Date.now());
  });

  test("getHealthStatus skips invalid cron expressions gracefully", () => {
    const metrics = new SchedulerMetrics();
    metrics.registerSchedule("bad_schedule", "not-a-cron");
    const health = metrics.getHealthStatus();
    expect(health.nextScheduled.bad_schedule).toBeUndefined();
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm --filter @sentinel/api test`
Expected: FAIL — `metrics.getHealthStatus is not a function`, `metrics.registerSchedule is not a function`

**Step 4: Implement registerSchedule and getHealthStatus in SchedulerMetrics**

In `apps/api/src/scheduler.ts`, add the import at the top:

```typescript
import { parseExpression } from "cron-parser";
```

Add to `SchedulerMetrics` class (after the existing `lastTrigger` field, line 69):

```typescript
private schedules = new Map<string, string>();

registerSchedule(type: string, cronExpr: string) {
  this.schedules.set(type, cronExpr);
}

getHealthStatus(): { status: string; uptime: number; lastTrigger: Record<string, string>; nextScheduled: Record<string, string> } {
  const lastTrigger: Record<string, string> = {};
  const nextScheduled: Record<string, string> = {};
  for (const [type, ts] of this.lastTrigger) {
    lastTrigger[type] = new Date(ts).toISOString();
  }
  for (const [type, expr] of this.schedules) {
    try {
      nextScheduled[type] = parseExpression(expr).next().toDate().toISOString();
    } catch { /* skip invalid */ }
  }
  return { status: "ok", uptime: process.uptime(), lastTrigger, nextScheduled };
}
```

**Step 5: Update createHealthServer to use getHealthStatus**

Replace line 113 in `createHealthServer`:
```typescript
// OLD:
res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
// NEW:
res.end(JSON.stringify(metrics.getHealthStatus()));
```

**Step 6: Register schedules in main entrypoint**

In the main entrypoint block (after `const metrics = new SchedulerMetrics();` on line 129), add:

```typescript
metrics.registerSchedule("self_scan", config.schedule);
metrics.registerSchedule("retention", RETENTION_SCHEDULE);
if (config.cveRescanEnabled) metrics.registerSchedule("cve_rescan", config.cveRescanSchedule);
```

**Step 7: Run test to verify it passes**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm --filter @sentinel/api test`
Expected: All tests PASS including the 3 new health status tests.

**Step 8: Commit**

```bash
git add apps/api/package.json apps/api/src/scheduler.ts apps/api/src/__tests__/scheduler.test.ts pnpm-lock.yaml
git commit -m "feat(scheduler): enrich health endpoint with lastTrigger/nextScheduled via cron-parser"
```

---

## Task 2: Add Assessor-Worker Health HTTP Server

**Files:**
- Modify: `apps/api/src/worker.ts:1-162`

**Step 1: Add health server to worker.ts**

Add after the imports (before line 15 `const logger = ...`):

```typescript
import http from "node:http";
```

Add after `logger.info("Assessor worker started, consuming sentinel.findings...");` (line 161), before the end of file:

```typescript
const healthPort = parseInt(process.env.WORKER_HEALTH_PORT ?? "9092", 10);
const healthServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
healthServer.listen(healthPort);
logger.info({ port: healthPort }, "Worker health server listening");
```

**Step 2: Add healthServer.close() to shutdown handler**

In the existing `shutdown` function (line 134), add `healthServer.close();` as the first line inside the function body (before `eventBus.disconnect()`).

Note: Since `healthServer` is defined after `shutdown`, move the health server block BEFORE the shutdown handler, or restructure so shutdown can reference it. The simplest approach: move the health server creation to just before the shutdown handler block (before line 133).

**Step 3: Add WORKER_HEALTH_PORT to Docker Compose environment**

This will be done in Task 4 when updating Docker Compose files.

**Step 4: Run the full test suite to verify no regressions**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm --filter @sentinel/api test`
Expected: All existing tests PASS. (Worker code runs in production, not in tests — no import-time side effects because it's a standalone entrypoint.)

**Step 5: Commit**

```bash
git add apps/api/src/worker.ts
git commit -m "feat(worker): add health HTTP server on port 9092 for Docker healthcheck"
```

---

## Task 3: Create Shared Docker Healthcheck Script

**Files:**
- Create: `docker/healthcheck.js`

**Step 1: Create the shared healthcheck script**

Create `docker/healthcheck.js`:

```javascript
// Shared Docker healthcheck script for all SENTINEL services.
// Usage: node docker/healthcheck.js <port>
const port = process.argv[2] || "9091";
fetch(`http://localhost:${port}/health`)
  .then(r => { if (!r.ok) process.exit(1); })
  .catch(() => process.exit(1));
```

**Step 2: Verify the script is syntactically valid**

Run: `node --check /home/ainaomotayo/archagents/sentinel/docker/healthcheck.js`
Expected: No output (syntax OK).

**Step 3: Commit**

```bash
git add docker/healthcheck.js
git commit -m "infra: add shared Docker healthcheck script"
```

---

## Task 4: Update Docker Compose Files

**Files:**
- Modify: `docker-compose.sentinel.yml:135-191` (assessor-worker + scheduler)
- Modify: `docker-compose.yml:94-141` (assessor-worker + scheduler)

**Step 1: Update docker-compose.sentinel.yml — assessor-worker**

Add to the `assessor-worker` service (after line 168, after the `command:` line):

```yaml
    healthcheck:
      test: ["CMD", "node", "docker/healthcheck.js", "9092"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
```

Also add `WORKER_HEALTH_PORT: "9092"` to the environment block.

**Step 2: Update docker-compose.sentinel.yml — scheduler**

Replace the existing scheduler healthcheck (lines 186-191):

```yaml
    healthcheck:
      test: ["CMD", "node", "docker/healthcheck.js", "9091"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
```

**Step 3: Update docker-compose.yml — assessor-worker**

Add to the `assessor-worker` service (after line 123, after the `command:` line):

```yaml
    healthcheck:
      test: ["CMD", "node", "docker/healthcheck.js", "9092"]
      interval: 30s
      timeout: 5s
      retries: 3
```

Also add `WORKER_HEALTH_PORT: "9092"` to the environment block.

**Step 4: Update docker-compose.yml — scheduler**

Replace the existing scheduler healthcheck (lines 137-141):

```yaml
    healthcheck:
      test: ["CMD", "node", "docker/healthcheck.js", "9091"]
      interval: 30s
      timeout: 5s
      retries: 3
```

**Step 5: Run docker-tests to verify healthcheck assertions pass**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm vitest run test/docker/validate-compose.test.ts`

Expected: The `every service has a healthcheck` test NOW PASSES (assessor-worker has healthcheck). All docker validation tests pass.

**Step 6: Commit**

```bash
git add docker-compose.sentinel.yml docker-compose.yml
git commit -m "infra: add assessor-worker healthcheck, use shared healthcheck script for all services"
```

---

## Task 5: Add Scheduler HTTP Server Integration Tests

**Files:**
- Modify: `apps/api/src/__tests__/scheduler.test.ts`

**Step 1: Write the failing integration tests**

Add to `apps/api/src/__tests__/scheduler.test.ts`:

```typescript
import { createHealthServer, SchedulerMetrics } from "../scheduler.js";
import type { AddressInfo } from "node:net";

describe("createHealthServer", () => {
  test("GET /health returns enriched status with lastTrigger and nextScheduled", async () => {
    const metrics = new SchedulerMetrics();
    metrics.registerSchedule("self_scan", "0 2 * * *");
    metrics.recordTrigger("self_scan");
    const server = createHealthServer(metrics, 0); // random port
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
      expect(body.uptime).toBeGreaterThan(0);
      expect(body.lastTrigger.self_scan).toBeDefined();
      expect(body.nextScheduled.self_scan).toBeDefined();
    } finally {
      server.close();
    }
  });

  test("GET /metrics returns Prometheus text format", async () => {
    const metrics = new SchedulerMetrics();
    metrics.recordTrigger("self_scan");
    const server = createHealthServer(metrics, 0);
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://localhost:${port}/metrics`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("sentinel_scheduler_triggers_total");
    } finally {
      server.close();
    }
  });

  test("GET /unknown returns 404", async () => {
    const metrics = new SchedulerMetrics();
    const server = createHealthServer(metrics, 0);
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://localhost:${port}/unknown`);
      expect(res.status).toBe(404);
    } finally {
      server.close();
    }
  });
});
```

**Step 2: Run test to verify they pass**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm --filter @sentinel/api test`
Expected: All tests PASS (implementation was done in Task 1, these just test the HTTP layer).

**Step 3: Commit**

```bash
git add apps/api/src/__tests__/scheduler.test.ts
git commit -m "test(scheduler): add HTTP server integration tests for health and metrics endpoints"
```

---

## Task 6: Full Regression Test

**Files:** None (verification only)

**Step 1: Run the full monorepo test suite**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm -r test`

Expected: ALL tests pass, including:
- `apps/api` — scheduler tests (existing + 6 new), API integration tests
- `packages/security` — data-retention, RBAC, assessor tests
- `test/docker` — validate-compose tests (assessor-worker healthcheck now passes)

**Step 2: Run TypeScript type check**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm -r build`
Expected: No type errors. Clean build.

**Step 3: Verify final test count**

Expected: ~200+ tests, 0 failures, 0 skipped.

---

## File Impact Summary

| File | Action | Est. Lines |
|------|--------|-----------|
| `apps/api/package.json` | Modify | ~1 |
| `apps/api/src/scheduler.ts` | Modify | ~25 |
| `apps/api/src/__tests__/scheduler.test.ts` | Modify | ~70 |
| `apps/api/src/worker.ts` | Modify | ~15 |
| `docker/healthcheck.js` | Create | ~5 |
| `docker-compose.sentinel.yml` | Modify | ~12 |
| `docker-compose.yml` | Modify | ~10 |
| `pnpm-lock.yaml` | Auto-update | N/A |

Total: ~140 lines of new/modified code across 7 files.
