# P3 Operational Maturity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete API surface (policy CRUD, OpenAPI spec), add data retention jobs, and fix RBAC path mismatches.

**Architecture:** Add PUT/DELETE policy endpoints to server.ts with tenant isolation and audit logging. Update OpenAPI spec to document all implemented endpoints. Add a data retention cleanup function for old scans/findings. Fix RBAC paths to use `:id` parameter patterns matching Fastify route patterns.

**Tech Stack:** Fastify, Prisma, TypeScript, OpenAPI 3.1

---

### Task 1: Add PUT /v1/policies/:id and DELETE /v1/policies/:id Endpoints

**Files:**
- Modify: `apps/api/src/server.ts` (add PUT and DELETE routes after existing POST /v1/policies)
- Modify: `packages/security/src/rbac.ts` (fix paths from `/v1/policies` to `/v1/policies/:id`)
- Test: `apps/api/src/__tests__/rbac-enforcement.test.ts` (add tests for new routes)

**Step 1: Write the failing test**

Add to `apps/api/src/__tests__/rbac-enforcement.test.ts`:

```typescript
test("PUT /v1/policies/:id requires admin or manager", () => {
  expect(isAuthorized("admin", "PUT", "/v1/policies/:id")).toBe(true);
  expect(isAuthorized("manager", "PUT", "/v1/policies/:id")).toBe(true);
  expect(isAuthorized("developer", "PUT", "/v1/policies/:id")).toBe(false);
  expect(isAuthorized("viewer", "PUT", "/v1/policies/:id")).toBe(false);
});

test("DELETE /v1/policies/:id requires admin only", () => {
  expect(isAuthorized("admin", "DELETE", "/v1/policies/:id")).toBe(true);
  expect(isAuthorized("manager", "DELETE", "/v1/policies/:id")).toBe(false);
  expect(isAuthorized("developer", "DELETE", "/v1/policies/:id")).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/rbac-enforcement.test.ts`
Expected: FAIL (paths don't match current RBAC config which uses `/v1/policies` not `/v1/policies/:id`)

**Step 3: Fix RBAC paths in rbac.ts**

In `packages/security/src/rbac.ts`, change:
```typescript
// OLD:
{ method: "PUT", path: "/v1/policies", roles: ["admin", "manager"] },
{ method: "DELETE", path: "/v1/policies", roles: ["admin"] },

// NEW:
{ method: "PUT", path: "/v1/policies/:id", roles: ["admin", "manager"] },
{ method: "DELETE", path: "/v1/policies/:id", roles: ["admin"] },
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/rbac-enforcement.test.ts`
Expected: PASS

**Step 5: Add PUT and DELETE routes to server.ts**

After the existing `app.post("/v1/policies", ...)` block, add:

```typescript
app.put("/v1/policies/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const body = request.body as any;
  return withTenant(db, orgId, async (tx) => {
    const existing = await tx.policy.findUnique({ where: { id } });
    if (!existing) {
      reply.code(404).send({ error: "Policy not found" });
      return;
    }
    const updated = await tx.policy.update({
      where: { id },
      data: { name: body.name, rules: body.rules, version: { increment: 1 } },
    });
    return updated;
  });
});

app.delete("/v1/policies/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, async (tx) => {
    const existing = await tx.policy.findUnique({ where: { id } });
    if (!existing) {
      reply.code(404).send({ error: "Policy not found" });
      return;
    }
    await tx.policy.delete({ where: { id } });
    reply.code(204).send();
  });
});
```

**Step 6: Run all API tests**

Run: `cd apps/api && npx vitest run`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add packages/security/src/rbac.ts apps/api/src/server.ts apps/api/src/__tests__/rbac-enforcement.test.ts
git commit -m "feat: add PUT/DELETE /v1/policies/:id endpoints and fix RBAC paths"
```

---

### Task 2: Update OpenAPI Spec with All Implemented Endpoints

**Files:**
- Modify: `docs/api/openapi.yaml`

The current spec is missing these implemented endpoints:
- `GET /v1/scans` (list with pagination)
- `GET /v1/scans/{id}` (get single scan)
- `GET /v1/findings/{id}` (get single finding)
- `GET /v1/certificates/{id}` (get single certificate)
- `POST /v1/certificates/{id}/verify` (verify certificate)
- `GET /v1/projects` (list projects)
- `GET /v1/projects/{id}` (get single project)
- `GET /v1/admin/dlq` (DLQ monitoring)
- `GET /metrics` (Prometheus metrics)

**Step 1: Add GET /v1/scans path**

Add after the existing `POST /v1/scans` under the `/v1/scans` path:

```yaml
    get:
      operationId: listScans
      summary: List scans
      description: List scans with filtering and pagination.
      tags: [Scans]
      security:
        - hmacAuth: []
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [pending, scanning, completed, failed]
        - name: projectId
          in: query
          schema:
            type: string
            format: uuid
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 50
        - name: offset
          in: query
          schema:
            type: integer
            minimum: 0
            default: 0
      responses:
        "200":
          description: Paginated list of scans
          content:
            application/json:
              schema:
                type: object
                required: [scans, total, limit, offset]
                properties:
                  scans:
                    type: array
                    items:
                      $ref: "#/components/schemas/Assessment"
                  total:
                    type: integer
                  limit:
                    type: integer
                  offset:
                    type: integer
        "401":
          description: Unauthorized
```

**Step 2: Add GET /v1/scans/{id} path**

```yaml
  /v1/scans/{id}:
    get:
      operationId: getScan
      summary: Get a scan
      description: Get details of a specific scan by ID.
      tags: [Scans]
      security:
        - hmacAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        "200":
          description: Scan details
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Assessment"
        "404":
          description: Scan not found
```

**Step 3: Add remaining missing paths**

Add `/v1/findings/{id}`, `/v1/certificates/{id}`, `/v1/certificates/{id}/verify`, `/v1/projects`, `/v1/projects/{id}`, `/v1/admin/dlq`, `/metrics` paths with correct request/response schemas matching the server implementation.

**Step 4: Validate YAML syntax**

Run: `npx yaml docs/api/openapi.yaml` or `python3 -c "import yaml; yaml.safe_load(open('docs/api/openapi.yaml'))"`

**Step 5: Commit**

```bash
git add docs/api/openapi.yaml
git commit -m "docs: add all missing endpoints to OpenAPI spec"
```

---

### Task 3: Add Data Retention Cleanup Function

**Files:**
- Create: `packages/security/src/data-retention.ts`
- Modify: `packages/security/src/index.ts` (export new module)
- Test: `packages/security/src/__tests__/data-retention.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, test, expect } from "vitest";
import { buildRetentionQuery, DEFAULT_RETENTION_DAYS } from "../data-retention.js";

describe("data-retention", () => {
  test("DEFAULT_RETENTION_DAYS is 90", () => {
    expect(DEFAULT_RETENTION_DAYS).toBe(90);
  });

  test("buildRetentionQuery returns correct cutoff date and table list", () => {
    const now = new Date("2026-03-09T00:00:00Z");
    const result = buildRetentionQuery(90, now);
    expect(result.cutoffDate).toEqual(new Date("2025-12-09T00:00:00Z"));
    expect(result.tables).toEqual(["findings", "agentResults", "scans"]);
  });

  test("buildRetentionQuery respects custom days", () => {
    const now = new Date("2026-03-09T00:00:00Z");
    const result = buildRetentionQuery(30, now);
    expect(result.cutoffDate).toEqual(new Date("2026-02-07T00:00:00Z"));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/security && npx vitest run src/__tests__/data-retention.test.ts`
Expected: FAIL (module not found)

**Step 3: Write minimal implementation**

Create `packages/security/src/data-retention.ts`:

```typescript
export const DEFAULT_RETENTION_DAYS = 90;

export interface RetentionQuery {
  cutoffDate: Date;
  tables: string[];
}

export function buildRetentionQuery(
  retentionDays: number = DEFAULT_RETENTION_DAYS,
  now: Date = new Date(),
): RetentionQuery {
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  return {
    cutoffDate,
    tables: ["findings", "agentResults", "scans"],
  };
}

/**
 * Delete old scan data beyond the retention period.
 * Deletes in order: findings -> agentResults -> scans (respecting FK constraints).
 * Certificates and audit events are NEVER deleted (compliance requirement).
 */
export async function runRetentionCleanup(
  db: {
    finding: { deleteMany: (args: any) => Promise<{ count: number }> };
    agentResult: { deleteMany: (args: any) => Promise<{ count: number }> };
    scan: { deleteMany: (args: any) => Promise<{ count: number }> };
  },
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): Promise<{ deletedFindings: number; deletedAgentResults: number; deletedScans: number }> {
  const { cutoffDate } = buildRetentionQuery(retentionDays);

  const deletedFindings = await db.finding.deleteMany({
    where: { createdAt: { lt: cutoffDate } },
  });

  const deletedAgentResults = await db.agentResult.deleteMany({
    where: { scan: { startedAt: { lt: cutoffDate } } },
  });

  const deletedScans = await db.scan.deleteMany({
    where: { startedAt: { lt: cutoffDate }, certificate: null },
  });

  return {
    deletedFindings: deletedFindings.count,
    deletedAgentResults: deletedAgentResults.count,
    deletedScans: deletedScans.count,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/security && npx vitest run src/__tests__/data-retention.test.ts`
Expected: PASS

**Step 5: Export from index.ts**

Add to `packages/security/src/index.ts`:
```typescript
export { buildRetentionQuery, runRetentionCleanup, DEFAULT_RETENTION_DAYS } from "./data-retention.js";
```

**Step 6: Run all security package tests**

Run: `cd packages/security && npx vitest run`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add packages/security/src/data-retention.ts packages/security/src/__tests__/data-retention.test.ts packages/security/src/index.ts
git commit -m "feat: add data retention cleanup function for old scans/findings"
```

---

### Task 4: Add GET /v1/projects/:id/findings Endpoint for Dashboard

**Files:**
- Modify: `apps/api/src/server.ts` (add new route)
- Modify: `packages/security/src/rbac.ts` (add RBAC entry)
- Modify: `apps/dashboard/lib/api.ts` (wire dashboard to real endpoint)
- Test: `apps/api/src/__tests__/rbac-enforcement.test.ts`

**Step 1: Write the failing test**

Add to RBAC test:
```typescript
test("GET /v1/projects/:id/findings is accessible by all authenticated roles", () => {
  expect(isAuthorized("admin", "GET", "/v1/projects/:id/findings")).toBe(true);
  expect(isAuthorized("viewer", "GET", "/v1/projects/:id/findings")).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/rbac-enforcement.test.ts`
Expected: FAIL

**Step 3: Add RBAC entry**

Add to `API_PERMISSIONS` in `packages/security/src/rbac.ts`:
```typescript
{ method: "GET", path: "/v1/projects/:id/findings", roles: ["admin", "manager", "developer", "viewer"] },
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/rbac-enforcement.test.ts`
Expected: PASS

**Step 5: Add route to server.ts**

After the existing `GET /v1/projects/:id` route, add:

```typescript
app.get("/v1/projects/:id/findings", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const { limit = "50", offset = "0", severity, category } = request.query as any;
  return withTenant(db, orgId, async (tx) => {
    const where: any = { scan: { projectId: id } };
    if (severity) where.severity = severity;
    if (category) where.category = category;
    const [findings, total] = await Promise.all([
      tx.finding.findMany({
        where,
        take: Number(limit),
        skip: Number(offset),
        orderBy: { createdAt: "desc" },
      }),
      tx.finding.count({ where }),
    ]);
    return { findings, total, limit: Number(limit), offset: Number(offset) };
  });
});
```

**Step 6: Wire dashboard getProjectFindingCounts()**

In `apps/dashboard/lib/api.ts`, replace the stub:

```typescript
export async function getProjectFindingCounts(
  projectId: string,
): Promise<FindingCountByCategory[]> {
  return tryApi(async () => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<{ findings: any[] }>(`/v1/projects/${projectId}/findings`, { limit: "500" });
    const counts = new Map<string, number>();
    for (const f of data.findings ?? []) {
      const cat = f.category ?? f.type ?? "other";
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([category, count]) => ({ category, count }));
  }, MOCK_FINDING_COUNTS_BY_CATEGORY);
}
```

**Step 7: Run all tests**

Run: `cd apps/api && npx vitest run`
Expected: All PASS

**Step 8: Commit**

```bash
git add packages/security/src/rbac.ts apps/api/src/server.ts apps/dashboard/lib/api.ts apps/api/src/__tests__/rbac-enforcement.test.ts
git commit -m "feat: add GET /v1/projects/:id/findings endpoint and wire dashboard"
```
