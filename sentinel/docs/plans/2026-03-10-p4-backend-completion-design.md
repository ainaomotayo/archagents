# P4: Full Backend Completion — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close all remaining backend gaps: enrich scheduler health with `lastTrigger`/`nextScheduled` using cron-parser, add assessor-worker Docker healthcheck, create shared healthcheck script, add scheduler HTTP server tests, and verify full build.

**Architecture:** Enhance existing `SchedulerMetrics` class with schedule tracking and next-occurrence computation via `cron-parser`. Add minimal health HTTP server to assessor worker. Create reusable `docker/healthcheck.js` script for all services. Fix the pre-existing docker-tests failure.

**Tech Stack:** TypeScript, cron-parser, node-cron, http module, Docker Compose, vitest.

---

## Why These Changes

| Gap | Risk Without Fix | Enterprise Requirement |
|-----|-----------------|----------------------|
| Health response missing lastTrigger/nextScheduled | Ops team can't monitor scheduler timing | Observability (Prometheus/Grafana dashboards) |
| assessor-worker no healthcheck | Docker can't detect worker crashes; test suite fails | Container orchestration (K8s readiness) |
| Verbose inline healthcheck scripts | Copy-paste across compose files, hard to maintain | DRY infrastructure |
| No scheduler HTTP server test | Health endpoint untested in CI | Test coverage requirements |

---

## 3 Enterprise Approaches Evaluated

### Algorithms & Data Structures — Scheduler Health State

**A. Polling-Based Timestamp Cache** — `Map<string, number>` for lastTrigger, manual next-occurrence math. O(1) but error-prone for non-trivial cron.

**B. cron-parser Library (Chosen)** — Well-tested npm package (`cron-parser`) computes next occurrence from any cron expression. O(1) per call. Handles edge cases (DST, month boundaries) correctly.

**C. WAL-Based Durable State (Suna pattern)** — Persist scheduler state to Redis Streams. Survives restarts but adds Redis dependency to health endpoint.

**Hybrid verdict: Not needed.** cron-parser gives correct next-occurrence for all cron expressions with zero custom logic. WAL is overkill — scheduler rebuilds state from config on restart. Manual calculation is fragile.

### System Design — Health Endpoint Architecture

**A. Standalone HTTP Server (Current + Chosen)** — `http.createServer` on port 9091. Already exists, just needs enriched payload.

**B. Fastify Plugin Composition** — Embed in main API. Couples scheduler to API lifecycle.

**C. Aggregated Health Gateway (Mission Control pattern)** — Central health service probing all components. New service, overkill for 4 services.

**Hybrid verdict: Not needed.** Standalone server is already working. Enhancement is additive — enrich the response, don't change the architecture.

### Software Design Patterns — Docker Healthcheck Strategy

**A. Node.js Inline Script (Current)** — Verbose, duplicated across services.

**B. Dedicated Health Script (Chosen)** — `docker/healthcheck.js` takes PORT as arg. Reusable across API, scheduler, github-bridge, assessor-worker.

**C. Shell curl/wget** — Requires curl in minimal Node images.

**Hybrid verdict: Not needed.** Shared script eliminates duplication. One file, all services.

### Data Retention — Cron Next-Occurrence

**A. Manual Calculation** — Parse cron fields manually. Error-prone for complex expressions.

**B. cron-parser Library (Chosen)** — `parseExpression(expr).next().toDate()`. Handles all cron syntax, DST, leap years. Well-maintained (20M+ weekly downloads).

**C. Cache + Timer** — Store next occurrence via setTimeout. Race-prone with node-cron.

**Hybrid verdict: Not needed.** cron-parser is the standard solution. Battle-tested, zero custom logic needed.

---

## Component Design

### 1. Scheduler Health Payload Enhancement

Add `schedules` Map and `getHealthStatus()` to `SchedulerMetrics`:

```typescript
import { parseExpression } from "cron-parser";

// In SchedulerMetrics:
private schedules = new Map<string, string>(); // type -> cron expression

registerSchedule(type: string, cronExpr: string) {
  this.schedules.set(type, cronExpr);
}

getHealthStatus(): Record<string, unknown> {
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

Update `createHealthServer` to use `metrics.getHealthStatus()`.

Register schedules in main entrypoint:
```typescript
metrics.registerSchedule("self_scan", config.schedule);
metrics.registerSchedule("retention", RETENTION_SCHEDULE);
if (config.cveRescanEnabled) metrics.registerSchedule("cve_rescan", config.cveRescanSchedule);
```

### 2. Assessor-Worker Health Server

Add minimal HTTP health server to `apps/api/src/worker.ts` (the assessor-worker entrypoint), matching the scheduler pattern:

```typescript
import http from "node:http";

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
```

### 3. Shared Docker Healthcheck Script

```javascript
// docker/healthcheck.js
const port = process.argv[2] || "9091";
fetch(`http://localhost:${port}/health`)
  .then(r => { if (!r.ok) process.exit(1); })
  .catch(() => process.exit(1));
```

Docker Compose usage:
```yaml
healthcheck:
  test: ["CMD", "node", "docker/healthcheck.js", "9091"]
  interval: 30s
  timeout: 5s
  retries: 3
```

### 4. Scheduler HTTP Server Tests

Test `createHealthServer` by starting on a random port, making real HTTP requests:

```typescript
test("GET /health returns status with lastTrigger and nextScheduled", async () => {
  const metrics = new SchedulerMetrics();
  metrics.registerSchedule("self_scan", "0 2 * * *");
  metrics.recordTrigger("self_scan");
  const server = createHealthServer(metrics, 0); // random port
  const port = (server.address() as any).port;
  const res = await fetch(`http://localhost:${port}/health`);
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.lastTrigger.self_scan).toBeDefined();
  expect(body.nextScheduled.self_scan).toBeDefined();
  server.close();
});
```

---

## Data Flow

```
Cron fires (self_scan | cve_rescan | retention)
    |
    v
metrics.recordTrigger(type)  -- stores timestamp in lastTrigger Map
    |
    v
GET /health request arrives
    |
    v
metrics.getHealthStatus()
    |
    +-- lastTrigger: read from Map, format as ISO strings
    +-- nextScheduled: cron-parser computes next from registered expressions
    +-- uptime: process.uptime()
    |
    v
JSON response: { status, uptime, lastTrigger, nextScheduled }
```

## Error Handling

| Failure | Behavior | Recovery |
|---------|----------|----------|
| cron-parser throws on invalid expression | Skip that entry in nextScheduled | Fix config |
| Health server port in use | Process crashes on startup | Change SCHEDULER_PORT env |
| Assessor-worker health server fails | Docker marks unhealthy, restarts | Auto-restart via `unless-stopped` |
| Healthcheck script fetch timeout | Exit code 1, Docker retries | Retries 3 times before unhealthy |

## Testing Strategy

| Component | Tests | Type |
|-----------|-------|------|
| getHealthStatus() payload shape | 2 | Unit (lastTrigger present, nextScheduled computed) |
| createHealthServer HTTP responses | 2 | Integration (GET /health, GET /metrics) |
| Docker compose validation | 0 | Existing test passes once healthcheck added |

Estimated: ~4 new test cases, ~60 lines of test code.

## File Impact

| File | Action | Est. Lines |
|------|--------|-----------|
| `apps/api/src/scheduler.ts` | Modify | ~25 |
| `apps/api/src/__tests__/scheduler.test.ts` | Modify | ~40 |
| `apps/api/src/worker.ts` | Modify | ~15 |
| `docker/healthcheck.js` | Create | ~5 |
| `docker-compose.sentinel.yml` | Modify | ~10 |
| `docker-compose.yml` | Modify | ~5 |
| `apps/api/package.json` | Modify | ~1 (add cron-parser) |

No new services, no new Docker containers.
