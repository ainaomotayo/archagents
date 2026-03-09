# Backend Completion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete all remaining backend work — data retention cron, RBAC path normalization, scheduler health/metrics, SAML Jackson in docker-compose, API integration tests, and dashboard-to-API user context wiring.

**Architecture:** Five independent workstreams touching the API server, scheduler, security package, dashboard API client, and docker-compose configs. Each workstream is self-contained with its own tests.

**Tech Stack:** TypeScript, Fastify 5, Vitest, Node.js `http` module, Prisma, Redis/ioredis, NextAuth.js, Prometheus text format

---

### Task 1: RBAC Path Normalization

**Files:**
- Modify: `packages/security/src/rbac.ts`
- Modify: `apps/api/src/middleware/auth.ts`
- Test: `apps/api/src/middleware/auth.test.ts`

**Step 1: Write failing test for trailing slash normalization**

Add to `apps/api/src/middleware/auth.test.ts`:

```typescript
it("normalizes trailing slash before RBAC check", async () => {
  const hook = createAuthHook({
    getOrgSecret: async () => SECRET,
  });

  const body = "";
  const signature = signRequest(body, SECRET);

  const request = mockRequest(
    { "x-sentinel-signature": signature, "x-sentinel-api-key": "key-1", "x-sentinel-role": "viewer" },
    body,
    { method: "GET", url: "/v1/scans/" },
  );
  const reply = mockReply();

  await hook(request, reply);

  // Should pass — /v1/scans/ normalized to /v1/scans which viewer can access
  expect(reply.code).not.toHaveBeenCalledWith(403);
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/middleware/auth.test.ts`
Expected: FAIL — trailing slash `/v1/scans/` doesn't match `/v1/scans` in RBAC

**Step 3: Add path normalization in auth middleware**

In `apps/api/src/middleware/auth.ts`, before the RBAC check (line 43), add normalization:

```typescript
    // Normalize path: strip trailing slashes (except root)
    const rawPath = request.routeOptions?.url ?? request.url;
    const routePath = rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;
```

Replace the existing line 43 (`const routePath = request.routeOptions?.url ?? request.url;`) with those two lines.

**Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run src/middleware/auth.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/security/src/rbac.ts apps/api/src/middleware/auth.ts apps/api/src/middleware/auth.test.ts
git commit -m "fix: normalize trailing slashes in RBAC path matching"
```

---

### Task 2: Data Retention Cron in Scheduler

**Files:**
- Modify: `apps/api/src/scheduler.ts`
- Modify: `apps/api/src/__tests__/scheduler.test.ts`

**Step 1: Write failing test for retention schedule**

Add to `apps/api/src/__tests__/scheduler.test.ts`:

```typescript
import { buildSchedulerConfig, shouldTriggerScan, RETENTION_SCHEDULE } from "../scheduler.js";

test("RETENTION_SCHEDULE is a valid daily cron expression", () => {
  expect(RETENTION_SCHEDULE).toBe("0 4 * * *");
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/scheduler.test.ts`
Expected: FAIL — `RETENTION_SCHEDULE` not exported

**Step 3: Add retention cron to scheduler**

In `apps/api/src/scheduler.ts`:

1. Add import at top:
```typescript
import { runRetentionCleanup } from "@sentinel/security";
import { getDb } from "@sentinel/db";
```

2. Export the constant:
```typescript
export const RETENTION_SCHEDULE = "0 4 * * *";
```

3. In the main entrypoint block (after CVE rescan setup, before shutdown handler), add:
```typescript
  // Data retention cleanup — daily at 4 AM
  logger.info({ schedule: RETENTION_SCHEDULE }, "Starting data retention scheduler");
  cron.schedule(RETENTION_SCHEDULE, async () => {
    try {
      const db = getDb();
      const result = await runRetentionCleanup(db);
      logger.info(result, "Data retention cleanup completed");
    } catch (err) {
      logger.error({ err }, "Data retention cleanup failed");
    }
  });
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run src/__tests__/scheduler.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add apps/api/src/scheduler.ts apps/api/src/__tests__/scheduler.test.ts
git commit -m "feat: add daily data retention cleanup cron to scheduler"
```

---

### Task 3: Scheduler Health Endpoint + Prometheus Metrics

**Files:**
- Modify: `apps/api/src/scheduler.ts`
- Modify: `apps/api/src/__tests__/scheduler.test.ts`

**Step 1: Write failing tests for health server and metrics**

Add to `apps/api/src/__tests__/scheduler.test.ts`:

```typescript
import { createHealthServer, SchedulerMetrics } from "../scheduler.js";

test("SchedulerMetrics tracks trigger counts", () => {
  const metrics = new SchedulerMetrics();
  metrics.recordTrigger("self_scan");
  metrics.recordTrigger("self_scan");
  metrics.recordTrigger("retention");
  expect(metrics.getTriggerCount("self_scan")).toBe(2);
  expect(metrics.getTriggerCount("retention")).toBe(1);
});

test("SchedulerMetrics tracks errors", () => {
  const metrics = new SchedulerMetrics();
  metrics.recordError("self_scan");
  expect(metrics.getErrorCount("self_scan")).toBe(1);
});

test("SchedulerMetrics formats Prometheus output", () => {
  const metrics = new SchedulerMetrics();
  metrics.recordTrigger("self_scan");
  const output = metrics.toPrometheus();
  expect(output).toContain("sentinel_scheduler_triggers_total");
  expect(output).toContain('type="self_scan"');
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx vitest run src/__tests__/scheduler.test.ts`
Expected: FAIL — `SchedulerMetrics` not exported

**Step 3: Implement SchedulerMetrics class and health server**

Add to `apps/api/src/scheduler.ts` (before the main entrypoint block):

```typescript
import http from "node:http";

export class SchedulerMetrics {
  private triggers = new Map<string, number>();
  private errors = new Map<string, number>();
  private lastTrigger = new Map<string, number>();

  recordTrigger(type: string) {
    this.triggers.set(type, (this.triggers.get(type) ?? 0) + 1);
    this.lastTrigger.set(type, Date.now());
  }

  recordError(type: string) {
    this.errors.set(type, (this.errors.get(type) ?? 0) + 1);
  }

  getTriggerCount(type: string): number {
    return this.triggers.get(type) ?? 0;
  }

  getErrorCount(type: string): number {
    return this.errors.get(type) ?? 0;
  }

  toPrometheus(): string {
    const lines: string[] = [];
    lines.push("# HELP sentinel_scheduler_triggers_total Total scheduler triggers");
    lines.push("# TYPE sentinel_scheduler_triggers_total counter");
    for (const [type, count] of this.triggers) {
      lines.push(`sentinel_scheduler_triggers_total{type="${type}"} ${count}`);
    }
    lines.push("# HELP sentinel_scheduler_errors_total Total scheduler errors");
    lines.push("# TYPE sentinel_scheduler_errors_total counter");
    for (const [type, count] of this.errors) {
      lines.push(`sentinel_scheduler_errors_total{type="${type}"} ${count}`);
    }
    lines.push("# HELP sentinel_scheduler_last_trigger_timestamp Last trigger time");
    lines.push("# TYPE sentinel_scheduler_last_trigger_timestamp gauge");
    for (const [type, ts] of this.lastTrigger) {
      lines.push(`sentinel_scheduler_last_trigger_timestamp{type="${type}"} ${ts / 1000}`);
    }
    return lines.join("\n") + "\n";
  }
}

export function createHealthServer(metrics: SchedulerMetrics, port: number): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    } else if (req.url === "/metrics") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(metrics.toPrometheus());
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(port);
  return server;
}
```

Then in the main entrypoint block, add after the `const config = buildSchedulerConfig()` line:

```typescript
  const metrics = new SchedulerMetrics();
  const healthPort = parseInt(process.env.SCHEDULER_PORT ?? "9091", 10);
  const healthServer = createHealthServer(metrics, healthPort);
  logger.info({ port: healthPort }, "Scheduler health server listening");
```

Wrap each cron callback with metrics:
- Self-scan: add `metrics.recordTrigger("self_scan")` after success, `metrics.recordError("self_scan")` in catch
- CVE rescan: add `metrics.recordTrigger("cve_rescan")` after success, `metrics.recordError("cve_rescan")` in catch
- Retention: add `metrics.recordTrigger("retention")` after success, `metrics.recordError("retention")` in catch

In the shutdown handler, add `healthServer.close()` before `process.exit(0)`.

**Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run src/__tests__/scheduler.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add apps/api/src/scheduler.ts apps/api/src/__tests__/scheduler.test.ts
git commit -m "feat: add health endpoint and Prometheus metrics to scheduler"
```

---

### Task 4: Docker Compose Scheduler Healthcheck + SAML Jackson

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.sentinel.yml`

**Step 1: Add scheduler healthcheck to docker-compose.yml**

In `docker-compose.yml`, under the `scheduler` service (after `command`), add:

```yaml
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:9091/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
    environment:
      REDIS_URL: redis://redis:6379
      SELF_SCAN_ENABLED: ${SELF_SCAN_ENABLED:-true}
      SCHEDULER_PORT: "9091"
```

**Step 2: Add scheduler healthcheck + Jackson to docker-compose.sentinel.yml**

In `docker-compose.sentinel.yml`, under the `scheduler` service, add the same healthcheck.

Add SAML Jackson service after the scheduler block:

```yaml
  saml-jackson:
    image: boxyhq/jackson:latest
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - sentinel-internal
    environment:
      JACKSON_URL: http://saml-jackson:5225
      DB_ENGINE: sql
      DB_TYPE: postgres
      DB_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      NEXTAUTH_URL: ${NEXTAUTH_URL:-http://dashboard:3000}
    ports:
      - "5225:5225"
```

**Step 3: Verify compose files are valid**

Run: `docker compose -f docker-compose.yml config --quiet && docker compose -f docker-compose.sentinel.yml config --quiet`
Expected: No output (valid)

**Step 4: Commit**

```bash
git add docker-compose.yml docker-compose.sentinel.yml
git commit -m "feat: add scheduler healthcheck and SAML Jackson to docker-compose"
```

---

### Task 5: API Integration Tests

**Files:**
- Create: `apps/api/src/__tests__/api-integration.test.ts`

**Step 1: Write the integration test file**

```typescript
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { signRequest } from "@sentinel/auth";

const SECRET = "integration-test-secret";

// Mock external dependencies
vi.mock("@sentinel/db", () => {
  const mockScans = [
    { id: "scan-1", projectId: "proj-1", commitHash: "abc1234", branch: "main", status: "completed", riskScore: 15, startedAt: new Date().toISOString(), findings: [], certificate: null, agentResults: [], _count: { findings: 2 } },
  ];
  const mockFindings = [
    { id: "find-1", scanId: "scan-1", title: "SQL Injection", severity: "high", category: "security", confidence: 0.95, createdAt: new Date().toISOString(), scan: { projectId: "proj-1" } },
  ];
  const mockCerts = [
    { id: "cert-1", scanId: "scan-1", orgId: "default", riskScore: 12, issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), revokedAt: null, verdict: { status: "pass" }, scan: { commitHash: "abc1234", branch: "main" } },
  ];
  const mockProjects = [
    { id: "proj-1", name: "test-project", repoUrl: "https://github.com/test/repo", createdAt: new Date().toISOString(), _count: { scans: 1 }, scans: mockScans },
  ];
  const mockPolicies = [
    { id: "pol-1", name: "Default Security", rules: {}, version: 1, createdAt: new Date().toISOString() },
  ];

  const makeTx = () => ({
    scan: {
      findMany: vi.fn().mockResolvedValue(mockScans),
      findUnique: vi.fn().mockImplementation(({ where }: any) => mockScans.find(s => s.id === where.id) ?? null),
      count: vi.fn().mockResolvedValue(mockScans.length),
    },
    finding: {
      findMany: vi.fn().mockResolvedValue(mockFindings),
      findUnique: vi.fn().mockImplementation(({ where }: any) => mockFindings.find(f => f.id === where.id) ?? null),
      count: vi.fn().mockResolvedValue(mockFindings.length),
    },
    certificate: {
      findMany: vi.fn().mockResolvedValue(mockCerts),
      findUnique: vi.fn().mockImplementation(({ where }: any) => mockCerts.find(c => c.id === where.id) ?? null),
      count: vi.fn().mockResolvedValue(mockCerts.length),
      update: vi.fn().mockResolvedValue({}),
    },
    project: {
      findMany: vi.fn().mockResolvedValue(mockProjects),
      findUnique: vi.fn().mockImplementation(({ where }: any) => mockProjects.find(p => p.id === where.id) ?? null),
    },
    policy: {
      findMany: vi.fn().mockResolvedValue(mockPolicies),
      findUnique: vi.fn().mockImplementation(({ where }: any) => mockPolicies.find(p => p.id === where.id) ?? null),
      create: vi.fn().mockImplementation(({ data }: any) => ({ id: "pol-new", ...data, version: 1, createdAt: new Date().toISOString() })),
      update: vi.fn().mockImplementation(({ data }: any) => ({ ...mockPolicies[0], ...data })),
      delete: vi.fn().mockResolvedValue({}),
    },
    auditEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  });

  return {
    getDb: vi.fn().mockReturnValue(makeTx()),
    disconnectDb: vi.fn(),
    withTenant: vi.fn().mockImplementation((_db: any, _orgId: string, fn: any) => fn(makeTx())),
  };
});

vi.mock("@sentinel/events", () => ({
  EventBus: vi.fn().mockImplementation(() => ({
    publish: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  })),
  getDlqDepth: vi.fn().mockResolvedValue(0),
  readDlq: vi.fn().mockResolvedValue([]),
}));

vi.mock("@sentinel/audit", () => ({
  AuditLog: vi.fn().mockImplementation(() => ({
    append: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@sentinel/telemetry", () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnThis(),
    fatal: vi.fn(), trace: vi.fn(), silent: vi.fn(), level: "info",
  }),
  withCorrelationId: (_log: any) => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnThis(),
    fatal: vi.fn(), trace: vi.fn(), silent: vi.fn(), level: "info",
  }),
  registry: { metrics: vi.fn().mockResolvedValue("") },
  httpRequestDuration: { observe: vi.fn() },
  dlqDepthGauge: { set: vi.fn() },
}));

vi.mock("@sentinel/github", () => ({
  configureGitHubApp: vi.fn(),
}));

vi.mock("@sentinel/assessor", () => ({
  verifyCertificate: vi.fn().mockReturnValue(true),
}));

vi.mock("ioredis", () => ({
  Redis: vi.fn().mockImplementation(() => ({
    disconnect: vi.fn(),
    quit: vi.fn(),
  })),
}));

function signedHeaders(body = "", role = "admin"): Record<string, string> {
  return {
    "x-sentinel-signature": signRequest(body, SECRET),
    "x-sentinel-api-key": "test-client",
    "x-sentinel-role": role,
  };
}

describe("API Integration Tests", () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    process.env.SENTINEL_SECRET = SECRET;
    process.env.NODE_ENV = "test";
    // Dynamic import after mocks are set up
    const { app: serverApp } = await import("../server.js");
    app = serverApp;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // --- Health & Metrics ---

  it("GET /health returns 200", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("status", "ok");
  });

  it("GET /metrics returns 200 text/plain", async () => {
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
  });

  // --- Auth ---

  it("rejects request without signature", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/scans" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects request with invalid signature", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/scans",
      headers: { "x-sentinel-signature": "t=0,sig=invalid", "x-sentinel-api-key": "test" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects viewer accessing admin endpoint", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/dlq",
      headers: signedHeaders("", "viewer"),
    });
    expect(res.statusCode).toBe(403);
  });

  // --- Scans ---

  it("GET /v1/scans returns scan list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/scans",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("scans");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("limit");
    expect(body).toHaveProperty("offset");
  });

  it("GET /v1/scans supports pagination", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/scans?limit=10&offset=0",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().limit).toBe(10);
  });

  it("GET /v1/scans/:id returns scan or 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/scans/scan-1",
      headers: signedHeaders(),
    });
    expect([200, 404]).toContain(res.statusCode);
  });

  // --- Findings ---

  it("GET /v1/findings returns finding list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/findings",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("findings");
  });

  // --- Certificates ---

  it("GET /v1/certificates returns certificate list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/certificates",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("certificates");
  });

  // --- Projects ---

  it("GET /v1/projects returns project list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/projects",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
  });

  // --- Policies ---

  it("GET /v1/policies returns policy list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/policies",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
  });

  it("POST /v1/policies creates policy (admin)", async () => {
    const body = JSON.stringify({ name: "Test Policy", rules: {} });
    const res = await app.inject({
      method: "POST",
      url: "/v1/policies",
      headers: { ...signedHeaders(body, "admin"), "content-type": "application/json" },
      body,
    });
    expect(res.statusCode).toBe(201);
  });

  it("POST /v1/policies rejected for viewer", async () => {
    const body = JSON.stringify({ name: "Test" });
    const res = await app.inject({
      method: "POST",
      url: "/v1/policies",
      headers: { ...signedHeaders(body, "viewer"), "content-type": "application/json" },
      body,
    });
    expect(res.statusCode).toBe(403);
  });

  // --- Audit ---

  it("GET /v1/audit requires admin or manager", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/audit",
      headers: signedHeaders("", "developer"),
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET /v1/audit allowed for admin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/audit",
      headers: signedHeaders("", "admin"),
    });
    expect(res.statusCode).toBe(200);
  });

  // --- 404 ---

  it("unknown route returns 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/nonexistent",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run src/__tests__/api-integration.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add apps/api/src/__tests__/api-integration.test.ts
git commit -m "test: add API integration tests with fastify.inject()"
```

---

### Task 6: Dashboard API Client — Accept Extra Headers

**Files:**
- Modify: `apps/dashboard/lib/api-client.ts`
- Test: `apps/dashboard/__tests__/api.test.ts`

**Step 1: Write failing test for extra headers**

Add to `apps/dashboard/__tests__/api.test.ts`:

```typescript
test("apiGet passes extra headers to fetch", async () => {
  // This test verifies the function signature accepts extraHeaders
  const { apiGet } = await import("../lib/api-client");
  expect(apiGet).toBeDefined();
  // Type check: apiGet should accept 3 params
  expect(apiGet.length).toBeGreaterThanOrEqual(1);
});
```

**Step 2: Modify api-client.ts to accept extra headers**

Update `apps/dashboard/lib/api-client.ts`:

```typescript
export async function apiGet<T>(
  path: string,
  query?: Record<string, string>,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const url = new URL(path, API_URL);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }

  const body = "";
  const { signRequest } = await import("@sentinel/auth");
  const signature = signRequest(body, API_SECRET);

  const res = await fetch(url.toString(), {
    headers: {
      "X-Sentinel-Signature": signature,
      "X-Sentinel-API-Key": "dashboard",
      ...extraHeaders,
    },
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(
  path: string,
  data: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const url = new URL(path, API_URL);
  const bodyStr = JSON.stringify(data);
  const { signRequest } = await import("@sentinel/auth");
  const signature = signRequest(bodyStr, API_SECRET);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sentinel-Signature": signature,
      "X-Sentinel-API-Key": "dashboard",
      ...extraHeaders,
    },
    body: bodyStr,
  });

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}
```

**Step 3: Run tests**

Run: `cd apps/dashboard && npx vitest run __tests__/api.test.ts`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add apps/dashboard/lib/api-client.ts apps/dashboard/__tests__/api.test.ts
git commit -m "feat: add extraHeaders param to apiGet/apiPost"
```

---

### Task 7: Dashboard API Layer — Thread User Context

**Files:**
- Modify: `apps/dashboard/lib/api.ts`

**Step 1: Add session-based header injection**

At the top of `apps/dashboard/lib/api.ts`, add a helper to get session headers:

```typescript
async function getSessionHeaders(): Promise<Record<string, string>> {
  try {
    const { getServerSession } = await import("next-auth");
    const { authOptions } = await import("./auth");
    const session = await getServerSession(authOptions);
    if (session?.user) {
      const headers: Record<string, string> = {};
      if (session.user.role) headers["X-Sentinel-Role"] = session.user.role;
      return headers;
    }
  } catch {
    // During build or when auth is unavailable, skip
  }
  return {};
}
```

**Step 2: Update tryApi to pass headers through**

Update the `tryApi` function and each API call. Replace the existing `tryApi`:

```typescript
async function tryApi<T>(fn: (headers: Record<string, string>) => Promise<T>, fallback: T): Promise<T> {
  if (USE_MOCK) return fallback;
  try {
    const headers = await getSessionHeaders();
    return await fn(headers);
  } catch {
    return fallback;
  }
}
```

**Step 3: Update each exported function to pass headers to apiGet**

For each function that calls `apiGet`, pass the headers argument. For example, update `getOverviewStats`:

```typescript
export async function getOverviewStats(): Promise<OverviewStats> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const [scansData, findingsData, certsData] = await Promise.all([
      apiGet<{ total: number }>("/v1/scans", { limit: "0" }, headers),
      apiGet<{ total: number }>("/v1/findings", { limit: "0" }, headers),
      apiGet<{ certificates: any[]; total: number }>("/v1/certificates", { limit: "100" }, headers),
    ]);
    // ... rest unchanged
  }, MOCK_OVERVIEW_STATS);
}
```

Apply the same pattern (add `headers` param to lambda, pass as 3rd arg to `apiGet`/`apiPost`) to ALL exported functions:
- `getRecentScans`
- `getProjects`
- `getProjectById`
- `getProjectScans`
- `getProjectFindingCounts`
- `getFindings`
- `getFindingById`
- `getCertificates`
- `getCertificateById`
- `getPolicies`
- `getPolicyById`
- `getAuditLog`

**Step 4: Run tests**

Run: `cd apps/dashboard && npx vitest run`
Expected: ALL PASS (mock mode means getServerSession never fires)

**Step 5: Commit**

```bash
git add apps/dashboard/lib/api.ts
git commit -m "feat: thread user session context through dashboard API calls"
```

---

### Task 8: Backend Auth Middleware — Read Dashboard User Context

**Files:**
- Modify: `apps/api/src/middleware/auth.ts`
- Modify: `apps/api/src/middleware/auth.test.ts`

**Step 1: Write failing test for dashboard role forwarding**

Add to `apps/api/src/middleware/auth.test.ts`:

```typescript
it("reads X-Sentinel-Role header for dashboard client", async () => {
  const hook = createAuthHook({
    getOrgSecret: async () => SECRET,
  });

  const body = "";
  const signature = signRequest(body, SECRET);

  const request = mockRequest(
    {
      "x-sentinel-signature": signature,
      "x-sentinel-api-key": "dashboard",
      "x-sentinel-role": "manager",
    },
    body,
    { method: "GET", url: "/v1/policies" },
  );
  const reply = mockReply();

  await hook(request, reply);

  expect((request as any).role).toBe("manager");
  expect(reply.code).not.toHaveBeenCalledWith(403);
});

it("reads X-Sentinel-Org-Id header for dashboard client", async () => {
  const hook = createAuthHook({
    getOrgSecret: async () => SECRET,
  });

  const body = "";
  const signature = signRequest(body, SECRET);

  const request = mockRequest(
    {
      "x-sentinel-signature": signature,
      "x-sentinel-api-key": "dashboard",
      "x-sentinel-role": "admin",
      "x-sentinel-org-id": "org-123",
    },
    body,
    { method: "GET", url: "/v1/scans" },
  );
  const reply = mockReply();

  await hook(request, reply);

  expect((request as any).orgId).toBe("org-123");
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx vitest run src/middleware/auth.test.ts`
Expected: The org-id test should fail (orgId defaults to "default", not "org-123")

**Step 3: Update auth middleware to read org header**

In `apps/api/src/middleware/auth.ts`, after the role resolution (line 39), add:

```typescript
    // Read org from dashboard header
    const orgHeader = request.headers["x-sentinel-org-id"] as string | undefined;
    if (orgHeader) {
      (request as any).orgId = orgHeader;
    }
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run src/middleware/auth.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add apps/api/src/middleware/auth.ts apps/api/src/middleware/auth.test.ts
git commit -m "feat: read dashboard user role and org from request headers"
```

---

### Task 9: Full Build Verification

**Files:** None (verification only)

**Step 1: Run all tests across the monorepo**

Run: `npx turbo run test`
Expected: All test suites pass

**Step 2: Run full build**

Run: `npx turbo run build`
Expected: Build succeeds for all packages and apps

**Step 3: Final commit and push**

```bash
git push origin master
```
