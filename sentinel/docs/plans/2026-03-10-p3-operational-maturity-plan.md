# P3: Operational Maturity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden SENTINEL's API surface and data lifecycle to enterprise-grade: HashMap RBAC, policy input validation, audit logging, soft delete, version history, chunked per-org retention, and dashboard DELETE wiring.

**Architecture:** Enhance existing route handlers with cross-cutting concerns (audit, validation) using Fastify JSON Schema and hooks. Add PolicyVersion model for change tracking. Upgrade data retention to chunked per-org. Optimize RBAC from O(n) to O(1) HashMap.

**Tech Stack:** Fastify JSON Schema (ajv), Prisma, `@sentinel/audit` AuditLog, `@sentinel/security` RBAC, vitest.

---

### Task 1: HashMap RBAC Optimization

**Files:**
- Modify: `packages/security/src/rbac.ts`
- Test: `apps/api/src/__tests__/rbac-enforcement.test.ts` (existing, add new test)

**Step 1: Write the failing test**

Add to `apps/api/src/__tests__/rbac-enforcement.test.ts`:

```typescript
it("returns false for completely unknown paths", () => {
  expect(isAuthorized("admin", "GET", "/v1/nonexistent")).toBe(false);
});

it("GET /v1/policies/:id/versions accessible by all authenticated roles", () => {
  expect(isAuthorized("admin", "GET", "/v1/policies/:id/versions")).toBe(true);
  expect(isAuthorized("viewer", "GET", "/v1/policies/:id/versions")).toBe(true);
  expect(isAuthorized("service", "GET", "/v1/policies/:id/versions")).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/rbac-enforcement.test.ts`
Expected: FAIL — unknown path test passes (already returns false), but `/v1/policies/:id/versions` test fails (endpoint not registered yet)

**Step 3: Implement HashMap optimization + add new permission**

Replace `packages/security/src/rbac.ts` internals. Keep the `API_PERMISSIONS` array for readability, but build a HashMap from it:

```typescript
export type ApiRole = "admin" | "manager" | "developer" | "viewer" | "service";

export interface EndpointPermission {
  method: string;
  path: string;
  roles: ApiRole[];
}

export const API_PERMISSIONS: EndpointPermission[] = [
  { method: "POST", path: "/v1/scans", roles: ["admin", "manager", "developer", "service"] },
  { method: "GET", path: "/v1/scans", roles: ["admin", "manager", "developer", "viewer", "service"] },
  { method: "GET", path: "/v1/scans/:id", roles: ["admin", "manager", "developer", "viewer", "service"] },
  { method: "GET", path: "/v1/scans/:id/poll", roles: ["admin", "manager", "developer", "viewer", "service"] },
  { method: "GET", path: "/v1/findings", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/findings/:id", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "PATCH", path: "/v1/findings/:id", roles: ["admin", "manager", "developer"] },
  { method: "GET", path: "/v1/certificates", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/certificates/:id", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "POST", path: "/v1/certificates/:id/verify", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "POST", path: "/v1/certificates/:id/revoke", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/projects", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/projects/:id", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/projects/:id/findings", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/policies", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/policies/:id", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "POST", path: "/v1/policies", roles: ["admin", "manager"] },
  { method: "PUT", path: "/v1/policies/:id", roles: ["admin", "manager"] },
  { method: "DELETE", path: "/v1/policies/:id", roles: ["admin"] },
  { method: "GET", path: "/v1/policies/:id/versions", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/audit", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/admin/dlq", roles: ["admin"] },
];

// Build O(1) lookup map at module load
const PERMISSION_MAP = new Map<string, Set<ApiRole>>();
for (const p of API_PERMISSIONS) {
  PERMISSION_MAP.set(`${p.method}:${p.path}`, new Set(p.roles));
}

/**
 * Check whether a given role is authorized to access a specific endpoint.
 * O(1) average via HashMap lookup.
 * Returns false for unknown roles or unregistered endpoints.
 */
export function isAuthorized(role: ApiRole, method: string, path: string): boolean {
  const roles = PERMISSION_MAP.get(`${method.toUpperCase()}:${path}`);
  return roles?.has(role) ?? false;
}

/**
 * Return all endpoints a given role is permitted to access.
 */
export function getPermittedEndpoints(role: ApiRole): EndpointPermission[] {
  return API_PERMISSIONS.filter((p) => p.roles.includes(role));
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/rbac-enforcement.test.ts`
Expected: ALL PASS (existing tests + new tests)

**Step 5: Commit**

```bash
git add packages/security/src/rbac.ts apps/api/src/__tests__/rbac-enforcement.test.ts
git commit -m "perf: optimize RBAC to O(1) HashMap lookup + add policy versions permission"
```

---

### Task 2: Prisma Schema Migration — Soft Delete + PolicyVersion

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Step 1: Add deletedAt to Policy model and create PolicyVersion model**

In `packages/db/prisma/schema.prisma`, update the Policy model and add PolicyVersion:

```prisma
model Policy {
  id        String    @id @default(uuid()) @db.Uuid
  orgId     String    @map("org_id") @db.Uuid
  projectId String?   @map("project_id") @db.Uuid
  name      String
  rules     Json
  version   Int       @default(1)
  createdBy String    @map("created_by")
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")

  organization Organization @relation(fields: [orgId], references: [id])
  versions     PolicyVersion[]

  @@index([orgId])
  @@map("policies")
}

model PolicyVersion {
  id         String   @id @default(uuid()) @db.Uuid
  policyId   String   @map("policy_id") @db.Uuid
  version    Int
  name       String
  rules      Json
  changedBy  String   @map("changed_by")
  changedAt  DateTime @default(now()) @map("changed_at")
  changeType String   @map("change_type")

  policy Policy @relation(fields: [policyId], references: [id])

  @@index([policyId, version])
  @@map("policy_versions")
}
```

**Step 2: Generate Prisma client (skip migration in dev — use db push)**

Run: `cd packages/db && npx prisma db push --accept-data-loss 2>/dev/null; npx prisma generate`

Note: `db push` works for dev. In production, use `prisma migrate dev` to create a proper migration file. For CI/testing with mocked DB, only `prisma generate` is needed.

**Step 3: Build the db package**

Run: `npx turbo build --filter=@sentinel/db`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat: add Policy soft delete (deletedAt) and PolicyVersion model"
```

---

### Task 3: Policy Input Validation with Fastify JSON Schema

**Files:**
- Modify: `apps/api/src/server.ts:391-416` (POST and PUT policy routes)
- Test: `apps/api/src/__tests__/api-integration.test.ts` (add validation tests)

**Step 1: Write the failing test**

Add to the end of `apps/api/src/__tests__/api-integration.test.ts` (inside the `describe("API integration"` block):

```typescript
// ── Policy validation ──────────────────────────────────────────────────
it("POST /v1/policies rejects missing name (400)", async () => {
  const body = JSON.stringify({ rules: [{ field: "severity", operator: "gte", value: "high" }] });
  const res = await app.inject({
    method: "POST",
    url: "/v1/policies",
    headers: { ...signedHeaders(body), "content-type": "application/json" },
    payload: body,
  });
  expect(res.statusCode).toBe(400);
});

it("POST /v1/policies rejects empty name (400)", async () => {
  const body = JSON.stringify({ name: "", rules: [] });
  const res = await app.inject({
    method: "POST",
    url: "/v1/policies",
    headers: { ...signedHeaders(body), "content-type": "application/json" },
    payload: body,
  });
  expect(res.statusCode).toBe(400);
});

it("POST /v1/policies accepts valid body (201)", async () => {
  const body = JSON.stringify({ name: "test-policy", rules: [{ field: "sev", operator: "gte", value: "high" }] });
  const res = await app.inject({
    method: "POST",
    url: "/v1/policies",
    headers: { ...signedHeaders(body), "content-type": "application/json" },
    payload: body,
  });
  expect(res.statusCode).toBe(201);
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/api-integration.test.ts`
Expected: FAIL — "rejects missing name" returns 201 instead of 400 (no validation currently)

**Step 3: Add JSON Schema validation to POST and PUT routes**

In `apps/api/src/server.ts`, define the policy body schema once, then apply to both routes:

```typescript
// Add before the policy routes section (~line 370):
const policyBodySchema = {
  type: "object",
  required: ["name", "rules"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 255 },
    rules: { type: "array", items: { type: "object" } },
    projectId: { type: "string", format: "uuid" },
  },
  additionalProperties: false,
} as const;
```

Update the POST route (~line 391):

```typescript
app.post("/v1/policies", { preHandler: authHook, schema: { body: policyBodySchema } }, async (request, reply) => {
```

Update the PUT route (~line 400):

```typescript
app.put("/v1/policies/:id", { preHandler: authHook, schema: { body: policyBodySchema } }, async (request, reply) => {
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/api-integration.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add apps/api/src/server.ts apps/api/src/__tests__/api-integration.test.ts
git commit -m "feat: add JSON Schema validation to policy POST/PUT endpoints"
```

---

### Task 4: Policy Audit Logging

**Files:**
- Modify: `apps/api/src/server.ts:391-430` (POST, PUT, DELETE policy handlers)
- Test: `apps/api/src/__tests__/api-integration.test.ts` (add audit test)

**Step 1: Write the failing test**

Add to `apps/api/src/__tests__/api-integration.test.ts`:

```typescript
it("POST /v1/policies triggers audit log", async () => {
  // Get the mock auditLog instance
  const { AuditLog } = await import("@sentinel/audit");
  const auditInstance = (AuditLog as any).mock.results[0].value;
  const callsBefore = auditInstance.append.mock.calls.length;

  const body = JSON.stringify({ name: "audit-test", rules: [] });
  await app.inject({
    method: "POST",
    url: "/v1/policies",
    headers: { ...signedHeaders(body), "content-type": "application/json" },
    payload: body,
  });

  expect(auditInstance.append.mock.calls.length).toBeGreaterThan(callsBefore);
  const lastCall = auditInstance.append.mock.calls[auditInstance.append.mock.calls.length - 1];
  expect(lastCall[1].action).toBe("policy.created");
  expect(lastCall[1].resource.type).toBe("policy");
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/api-integration.test.ts`
Expected: FAIL — `auditInstance.append` not called by POST /v1/policies

**Step 3: Add audit logging to the three policy mutation handlers**

In `apps/api/src/server.ts`, update each handler. The `auditLog` variable is already instantiated at line 38 (`const auditLog = new AuditLog(createAuditEventStore(db));`).

**POST /v1/policies** — after `tx.policy.create()`:

```typescript
app.post("/v1/policies", { preHandler: authHook, schema: { body: policyBodySchema } }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const role = (request as any).role ?? "unknown";
  const body = request.body as any;
  return withTenant(db, orgId, async (tx) => {
    const policy = await tx.policy.create({ data: body });
    await auditLog.append(orgId, {
      actor: { type: "api", id: role, name: "API" },
      action: "policy.created",
      resource: { type: "policy", id: policy.id },
      detail: { name: policy.name, version: policy.version },
    });
    reply.code(201).send(policy);
  });
});
```

**PUT /v1/policies/:id** — after `tx.policy.update()`:

```typescript
app.put("/v1/policies/:id", { preHandler: authHook, schema: { body: policyBodySchema } }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const role = (request as any).role ?? "unknown";
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
    await auditLog.append(orgId, {
      actor: { type: "api", id: role, name: "API" },
      action: "policy.updated",
      resource: { type: "policy", id },
      detail: { name: updated.name, version: updated.version },
    });
    return updated;
  });
});
```

**DELETE /v1/policies/:id** — after `tx.policy.delete()`:

```typescript
app.delete("/v1/policies/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const role = (request as any).role ?? "unknown";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, async (tx) => {
    const existing = await tx.policy.findUnique({ where: { id } });
    if (!existing) {
      reply.code(404).send({ error: "Policy not found" });
      return;
    }
    await tx.policy.delete({ where: { id } });
    await auditLog.append(orgId, {
      actor: { type: "api", id: role, name: "API" },
      action: "policy.deleted",
      resource: { type: "policy", id },
      detail: { name: existing.name },
    });
    reply.code(204).send();
  });
});
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/api-integration.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add apps/api/src/server.ts apps/api/src/__tests__/api-integration.test.ts
git commit -m "feat: add audit logging to policy POST/PUT/DELETE operations"
```

---

### Task 5: Soft Delete + Version History in Policy Routes

**Files:**
- Modify: `apps/api/src/server.ts:370-430` (all policy routes)
- Test: `apps/api/src/__tests__/api-integration.test.ts` (add soft delete + version tests)

**Step 1: Write the failing tests**

Add to `apps/api/src/__tests__/api-integration.test.ts`:

```typescript
it("DELETE /v1/policies/:id returns 204 (soft delete)", async () => {
  const res = await app.inject({
    method: "DELETE",
    url: "/v1/policies/pol-1",
    headers: signedHeaders(),
  });
  expect(res.statusCode).toBe(204);
});

it("GET /v1/policies/:id/versions returns version history", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/v1/policies/pol-1/versions",
    headers: signedHeaders(),
  });
  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.payload);
  expect(body).toHaveProperty("versions");
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/api-integration.test.ts`
Expected: FAIL — versions endpoint doesn't exist yet

**Step 3: Update policy routes for soft delete + add version snapshots + versions endpoint**

First, update the mock in `api-integration.test.ts` to include `policyVersion` model. In the mocks section, add after `const policyModel = makeModel(policies);`:

```typescript
const policyVersionModel = makeModel([], "changedAt");
```

And add to the `tenant` object:

```typescript
policyVersion: policyVersionModel,
```

Then update `apps/api/src/server.ts`:

**A. Update all GET queries to filter `deletedAt: null`:**

```typescript
// GET /v1/policies — add where filter
app.get("/v1/policies", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  return withTenant(db, orgId, async (tx) => {
    return tx.policy.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  });
});

// GET /v1/policies/:id — add where filter
app.get("/v1/policies/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, async (tx) => {
    const policy = await tx.policy.findFirst({ where: { id, deletedAt: null } });
    if (!policy) {
      reply.code(404).send({ error: "Policy not found" });
      return;
    }
    return policy;
  });
});
```

**B. Add version snapshot to POST handler** (after create, before audit):

```typescript
// Inside POST handler, after const policy = await tx.policy.create({ data: body });
await tx.policyVersion.create({
  data: {
    policyId: policy.id,
    version: policy.version,
    name: policy.name,
    rules: policy.rules,
    changedBy: role,
    changeType: "created",
  },
});
```

**C. Add version snapshot to PUT handler** (after update, before audit):

```typescript
// Inside PUT handler, after const updated = await tx.policy.update(...)
await tx.policyVersion.create({
  data: {
    policyId: id,
    version: updated.version,
    name: updated.name,
    rules: updated.rules,
    changedBy: role,
    changeType: "updated",
  },
});
```

**D. Change DELETE from hard delete to soft delete + add version snapshot:**

```typescript
app.delete("/v1/policies/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const role = (request as any).role ?? "unknown";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, async (tx) => {
    const existing = await tx.policy.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      reply.code(404).send({ error: "Policy not found" });
      return;
    }
    await tx.policy.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await tx.policyVersion.create({
      data: {
        policyId: id,
        version: existing.version,
        name: existing.name,
        rules: existing.rules,
        changedBy: role,
        changeType: "deleted",
      },
    });
    await auditLog.append(orgId, {
      actor: { type: "api", id: role, name: "API" },
      action: "policy.deleted",
      resource: { type: "policy", id },
      detail: { name: existing.name },
    });
    reply.code(204).send();
  });
});
```

**E. Add GET /v1/policies/:id/versions endpoint** (after DELETE route):

```typescript
app.get("/v1/policies/:id/versions", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, async (tx) => {
    const versions = await tx.policyVersion.findMany({
      where: { policyId: id },
      orderBy: { version: "desc" },
    });
    return { versions };
  });
});
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/api-integration.test.ts`
Expected: ALL PASS

**Step 5: Run full API test suite for regression**

Run: `npx turbo test --filter=@sentinel/api`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add apps/api/src/server.ts apps/api/src/__tests__/api-integration.test.ts
git commit -m "feat: add policy soft delete, version history snapshots, and versions endpoint"
```

---

### Task 6: Chunked Per-Org Data Retention

**Files:**
- Modify: `packages/security/src/data-retention.ts`
- Modify: `apps/api/src/scheduler.ts:168-180`
- Test: `packages/security/src/__tests__/data-retention.test.ts`

**Step 1: Write the failing tests**

Replace `packages/security/src/__tests__/data-retention.test.ts` with:

```typescript
import { describe, test, expect, vi } from "vitest";
import { buildRetentionQuery, DEFAULT_RETENTION_DAYS, runRetentionCleanup } from "../data-retention.js";

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

  test("chunked deletion processes in batches", async () => {
    // Create a mock DB where finding.findMany returns 3 items first, then 0
    const mockIds = [{ id: "f1" }, { id: "f2" }, { id: "f3" }];
    const db = {
      finding: {
        findMany: vi.fn()
          .mockResolvedValueOnce(mockIds)
          .mockResolvedValueOnce([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      agentResult: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      scan: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const result = await runRetentionCleanup(db as any, 90);
    expect(result.deletedFindings).toBe(3);
    expect(result.deletedAgentResults).toBe(0);
    expect(result.deletedScans).toBe(0);
    // Verify chunked: findMany called with select and take
    expect(db.finding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1000 }),
    );
    // Verify deleteMany called with id IN (...)
    expect(db.finding.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["f1", "f2", "f3"] } },
    });
  });

  test("per-org retention uses custom retentionDays", async () => {
    const db = {
      finding: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      agentResult: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      scan: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    // 180-day retention
    await runRetentionCleanup(db as any, 180);
    // Verify the cutoff date is ~180 days ago (via the where clause)
    const findCall = db.finding.findMany.mock.calls[0][0];
    const cutoff = findCall.where.createdAt.lt;
    const now = new Date();
    const daysDiff = Math.round((now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24));
    expect(daysDiff).toBeGreaterThanOrEqual(179);
    expect(daysDiff).toBeLessThanOrEqual(181);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/security && npx vitest run src/__tests__/data-retention.test.ts`
Expected: FAIL — "chunked deletion" test fails because current implementation uses `deleteMany` directly, not `findMany` + `deleteMany` in chunks.

**Step 3: Implement chunked deletion**

Replace `packages/security/src/data-retention.ts`:

```typescript
export const DEFAULT_RETENTION_DAYS = 90;

const CHUNK_SIZE = 1000;

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

interface ChunkableModel {
  findMany: (args: any) => Promise<{ id: string }[]>;
  deleteMany: (args: any) => Promise<{ count: number }>;
}

/**
 * Delete records in chunks to avoid long table locks.
 * SELECT ids (LIMIT 1000) -> DELETE WHERE id IN (...) -> repeat until empty.
 */
async function chunkedDelete(
  model: ChunkableModel,
  where: Record<string, unknown>,
  chunkSize: number = CHUNK_SIZE,
): Promise<number> {
  let totalDeleted = 0;
  while (true) {
    const batch = await model.findMany({ where, take: chunkSize, select: { id: true } });
    if (batch.length === 0) break;
    const ids = batch.map((b) => b.id);
    const { count } = await model.deleteMany({ where: { id: { in: ids } } });
    totalDeleted += count;
    if (batch.length < chunkSize) break; // Last batch
  }
  return totalDeleted;
}

/**
 * Delete old scan data beyond the retention period.
 * Deletes in order: findings -> agentResults -> scans (respecting FK constraints).
 * Certificates and audit events are NEVER deleted (compliance requirement).
 * Uses chunked deletion to avoid long table locks.
 */
export async function runRetentionCleanup(
  db: {
    finding: ChunkableModel;
    agentResult: ChunkableModel;
    scan: ChunkableModel;
  },
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): Promise<{ deletedFindings: number; deletedAgentResults: number; deletedScans: number }> {
  const { cutoffDate } = buildRetentionQuery(retentionDays);

  const deletedFindings = await chunkedDelete(
    db.finding,
    { createdAt: { lt: cutoffDate } },
  );

  const deletedAgentResults = await chunkedDelete(
    db.agentResult,
    { scan: { startedAt: { lt: cutoffDate } } },
  );

  const deletedScans = await chunkedDelete(
    db.scan,
    { startedAt: { lt: cutoffDate }, certificate: null },
  );

  return { deletedFindings, deletedAgentResults, deletedScans };
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/security && npx vitest run src/__tests__/data-retention.test.ts`
Expected: ALL PASS

**Step 5: Update scheduler for per-org retention**

In `apps/api/src/scheduler.ts`, update the retention cron job (~line 168-180):

Replace:
```typescript
cron.schedule(RETENTION_SCHEDULE, async () => {
  try {
    const db = getDb();
    const result = await runRetentionCleanup(db);
    metrics.recordTrigger("retention");
    logger.info(result, "Data retention cleanup completed");
  } catch (err) {
    metrics.recordError("retention");
    logger.error({ err }, "Data retention cleanup failed");
  }
});
```

With:
```typescript
cron.schedule(RETENTION_SCHEDULE, async () => {
  try {
    const db = getDb();
    // Per-org retention: each org can set retentionDays in settings
    const orgs = await db.organization.findMany({ select: { id: true, settings: true } });
    for (const org of orgs) {
      const retentionDays = (org.settings as any)?.retentionDays ?? DEFAULT_RETENTION_DAYS;
      const result = await runRetentionCleanup(db, retentionDays);
      if (result.deletedFindings + result.deletedAgentResults + result.deletedScans > 0) {
        logger.info({ orgId: org.id, retentionDays, ...result }, "Org retention cleanup completed");
      }
    }
    metrics.recordTrigger("retention");
    logger.info("Data retention cleanup completed for all orgs");
  } catch (err) {
    metrics.recordError("retention");
    logger.error({ err }, "Data retention cleanup failed");
  }
});
```

Also add the `DEFAULT_RETENTION_DAYS` import at the top of scheduler.ts (if not already present):

```typescript
import { runRetentionCleanup, DEFAULT_RETENTION_DAYS } from "@sentinel/security";
```

**Step 6: Run all security package tests**

Run: `cd packages/security && npx vitest run`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add packages/security/src/data-retention.ts packages/security/src/__tests__/data-retention.test.ts apps/api/src/scheduler.ts
git commit -m "feat: chunked per-org data retention with configurable retention days"
```

---

### Task 7: Dashboard apiDelete() Method

**Files:**
- Modify: `apps/dashboard/lib/api-client.ts`

**Step 1: Add apiDelete() function**

Add after the existing `apiPatch()` function in `apps/dashboard/lib/api-client.ts`:

```typescript
export async function apiDelete(
  path: string,
  extraHeaders?: Record<string, string>,
): Promise<void> {
  const url = new URL(path, API_URL);
  const body = "";
  const { signRequest } = await import("@sentinel/auth");
  const signature = signRequest(body, API_SECRET);

  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: {
      "X-Sentinel-Signature": signature,
      "X-Sentinel-API-Key": "dashboard",
      ...extraHeaders,
    },
  });

  if (!res.ok) {
    throw new Error(`API DELETE ${res.status}: ${await res.text()}`);
  }
}
```

**Step 2: Build the dashboard to verify it compiles**

Run: `npx turbo build --filter=@sentinel/dashboard`
Expected: SUCCESS (or skip if dashboard has build issues unrelated to this change)

**Step 3: Commit**

```bash
git add apps/dashboard/lib/api-client.ts
git commit -m "feat: add apiDelete() to dashboard API client"
```

---

### Task 8: Full Regression Test + Build Verification

**Files:** None (verification only)

**Step 1: Run all API tests**

Run: `npx turbo test --filter=@sentinel/api`
Expected: ALL PASS

**Step 2: Run all security package tests**

Run: `npx turbo test --filter=@sentinel/security`
Expected: ALL PASS

**Step 3: Run full monorepo build**

Run: `npx turbo build`
Expected: SUCCESS

**Step 4: Run all tests across monorepo**

Run: `npx turbo test`
Expected: ALL PASS

---

## Execution Order

```
Task 1: HashMap RBAC (no dependencies)
   ↓
Task 2: Prisma schema migration (no dependencies, but must be before Task 5)
   ↓
Task 3: Policy input validation (depends on server.ts, can run after Task 2)
   ↓
Task 4: Policy audit logging (depends on Task 3 — same routes modified)
   ↓
Task 5: Soft delete + version history (depends on Tasks 2 + 4)
   ↓
Task 6: Chunked per-org retention (independent, can run after Task 1)
   ↓
Task 7: Dashboard apiDelete() (independent, can run anytime)
   ↓
Task 8: Full regression (must be last)
```

Tasks 1, 6, 7 are independent and can run in parallel.
Tasks 3, 4, 5 are sequential (all modify policy routes in server.ts).
Task 8 must be last.
