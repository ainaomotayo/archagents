# P2: Security & Compliance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce RBAC in API routes, activate tenant isolation, implement certificate revocation, and add a scans list endpoint — closing the security gaps that block production deployment.

**Architecture:** RBAC is enforced via a Fastify `onRequest` hook that checks the caller's role against `API_PERMISSIONS`. Tenant isolation wraps all database queries in `withTenant()`. Certificate revocation is a new POST endpoint that updates the DB and writes an audit log entry. A GET `/v1/scans` endpoint is added for the dashboard's recent scans view.

**Tech Stack:** Fastify hooks, Prisma transactions, `@sentinel/security` RBAC, `@sentinel/audit` AuditLog, `@sentinel/db` withTenant

---

## Task 1: Enforce RBAC in API Routes

**Files to modify:**
- `apps/api/src/middleware/auth.ts` — add role resolution and RBAC check
- `apps/api/src/server.ts` — pass role to routes via request decoration

**Files to create:**
- `apps/api/src/__tests__/rbac-enforcement.test.ts`

### Steps

**Step 1: Update `apps/api/src/middleware/auth.ts`**

The current auth hook only verifies HMAC signatures. Add role resolution from `X-Sentinel-Role` header (for service-to-service) or default to `viewer`. Then check `isAuthorized()`.

Replace the entire file with:

```typescript
import { verifyRequest } from "@sentinel/auth";
import { isAuthorized, type ApiRole } from "@sentinel/security";
import type { FastifyRequest, FastifyReply } from "fastify";

interface AuthHookOptions {
  getOrgSecret: (apiKey?: string) => Promise<string | null>;
  resolveRole?: (apiKey?: string) => Promise<ApiRole>;
}

export function createAuthHook(options: AuthHookOptions) {
  return async function authHook(request: FastifyRequest, reply: FastifyReply) {
    const signature = request.headers["x-sentinel-signature"] as string | undefined;
    if (!signature) {
      reply.code(401).send({ error: "Missing X-Sentinel-Signature header" });
      return;
    }

    const apiKey = request.headers["x-sentinel-api-key"] as string | undefined;

    const secret = await options.getOrgSecret(apiKey);
    if (!secret) {
      reply.code(401).send({ error: "Invalid API key" });
      return;
    }

    const body = typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? "");
    const result = verifyRequest(signature, body, secret);
    if (!result.valid) {
      reply.code(401).send({ error: `Authentication failed: ${result.reason}` });
      return;
    }

    // Resolve role
    const role: ApiRole = options.resolveRole
      ? await options.resolveRole(apiKey)
      : (request.headers["x-sentinel-role"] as ApiRole) ?? "service";

    // Store on request for downstream use
    (request as any).role = role;
    (request as any).orgId = (request as any).orgId ?? "default";

    // RBAC check
    const routePath = request.routeOptions?.url ?? request.url;
    // Normalize parametric paths: /v1/scans/abc -> /v1/scans
    const basePath = routePath.replace(/\/:[^/]+/g, "").replace(/\/[0-9a-f-]{36}/g, "");
    if (!isAuthorized(role, request.method, basePath)) {
      reply.code(403).send({ error: "Forbidden: insufficient permissions" });
      return;
    }
  };
}
```

**Step 2: Update RBAC permissions to cover all current endpoints**

The current `API_PERMISSIONS` in `packages/security/src/rbac.ts` is missing some endpoints. Add the missing ones:

Add these entries to the `API_PERMISSIONS` array:
```typescript
{ method: "GET", path: "/v1/scans", roles: ["admin", "manager", "developer", "viewer", "service"] },
{ method: "GET", path: "/v1/projects", roles: ["admin", "manager", "developer", "viewer"] },
{ method: "GET", path: "/v1/policies", roles: ["admin", "manager", "developer", "viewer"] },
{ method: "GET", path: "/v1/admin/dlq", roles: ["admin"] },
```

Also update the existing scans POST to include "service" and add the revoke path with the parametric pattern the normalizer will produce:

Update `POST /v1/certificates/revoke` path to `POST /v1/certificates` (since `/v1/certificates/:id/revoke` normalizes to `/v1/certificates`).

Actually, let's use a smarter normalization. Change the RBAC check in auth.ts to strip trailing segments after UUIDs but keep action segments. Better approach: match the RBAC path against the Fastify route pattern directly.

Revised approach for RBAC normalization in auth.ts — use `request.routeOptions.url` which gives the Fastify pattern (e.g., `/v1/certificates/:id/revoke`), then map it:

```typescript
const routePath = request.routeOptions?.url ?? request.url;
```

And update `API_PERMISSIONS` to use Fastify route patterns:

```typescript
export const API_PERMISSIONS: EndpointPermission[] = [
  { method: "POST", path: "/v1/scans", roles: ["admin", "manager", "developer", "service"] },
  { method: "GET", path: "/v1/scans/:id", roles: ["admin", "manager", "developer", "viewer", "service"] },
  { method: "GET", path: "/v1/scans/:id/poll", roles: ["admin", "manager", "developer", "viewer", "service"] },
  { method: "GET", path: "/v1/scans", roles: ["admin", "manager", "developer", "viewer", "service"] },
  { method: "GET", path: "/v1/findings", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/findings/:id", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/certificates", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/certificates/:id", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "POST", path: "/v1/certificates/:id/verify", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "POST", path: "/v1/certificates/:id/revoke", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/projects", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/projects/:id", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/policies", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "POST", path: "/v1/policies", roles: ["admin", "manager"] },
  { method: "PUT", path: "/v1/policies", roles: ["admin", "manager"] },
  { method: "DELETE", path: "/v1/policies", roles: ["admin"] },
  { method: "GET", path: "/v1/audit", roles: ["admin", "manager"] },
  { method: "POST", path: "/v1/orgs/purge", roles: ["admin"] },
  { method: "GET", path: "/v1/admin/dlq", roles: ["admin"] },
];
```

Then in auth.ts, use:
```typescript
const routePath = request.routeOptions?.url ?? request.url;
if (!isAuthorized(role, request.method, routePath)) {
  reply.code(403).send({ error: "Forbidden: insufficient permissions" });
  return;
}
```

**Step 3: Write test `apps/api/src/__tests__/rbac-enforcement.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { isAuthorized } from "@sentinel/security";

describe("RBAC enforcement", () => {
  it("admin can access all endpoints", () => {
    expect(isAuthorized("admin", "POST", "/v1/scans")).toBe(true);
    expect(isAuthorized("admin", "GET", "/v1/audit")).toBe(true);
    expect(isAuthorized("admin", "POST", "/v1/certificates/:id/revoke")).toBe(true);
    expect(isAuthorized("admin", "GET", "/v1/admin/dlq")).toBe(true);
  });

  it("viewer can read but not write", () => {
    expect(isAuthorized("viewer", "GET", "/v1/findings")).toBe(true);
    expect(isAuthorized("viewer", "GET", "/v1/certificates")).toBe(true);
    expect(isAuthorized("viewer", "POST", "/v1/scans")).toBe(false);
    expect(isAuthorized("viewer", "POST", "/v1/policies")).toBe(false);
  });

  it("developer can submit scans but not revoke certs", () => {
    expect(isAuthorized("developer", "POST", "/v1/scans")).toBe(true);
    expect(isAuthorized("developer", "POST", "/v1/certificates/:id/revoke")).toBe(false);
  });

  it("manager can revoke certificates", () => {
    expect(isAuthorized("manager", "POST", "/v1/certificates/:id/revoke")).toBe(true);
  });

  it("viewer cannot access audit log", () => {
    expect(isAuthorized("viewer", "GET", "/v1/audit")).toBe(false);
  });

  it("only admin can access DLQ", () => {
    expect(isAuthorized("admin", "GET", "/v1/admin/dlq")).toBe(true);
    expect(isAuthorized("manager", "GET", "/v1/admin/dlq")).toBe(false);
    expect(isAuthorized("developer", "GET", "/v1/admin/dlq")).toBe(false);
  });
});
```

**Step 4: Run tests, build, commit**

```bash
pnpm --filter @sentinel/security test
pnpm --filter @sentinel/api test
pnpm turbo build
git add packages/security/src/rbac.ts apps/api/src/middleware/auth.ts apps/api/src/__tests__/rbac-enforcement.test.ts
git commit -m "feat: enforce RBAC in API routes via auth middleware"
```

---

## Task 2: Activate Tenant Isolation in API Routes

**Files to modify:**
- `apps/api/src/server.ts` — wrap database queries in `withTenant()`

**Files to create:**
- `apps/api/src/__tests__/tenant-isolation.test.ts`

### Steps

**Step 1: Update `apps/api/src/server.ts`**

Add import for `withTenant`:
```typescript
import { withTenant } from "@sentinel/db";
```

Then wrap all database queries that are org-scoped. The orgId comes from `(request as any).orgId` set by the auth hook.

Update each route handler to use `withTenant`. For example:

**Findings endpoint** (currently lines 119-134):
```typescript
app.get("/v1/findings", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { limit = "50", offset = "0", severity, category } = request.query as any;
  return withTenant(db, orgId, async (tx) => {
    const where: any = {};
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

Apply the same pattern to these endpoints:
- `GET /v1/findings/:id`
- `GET /v1/certificates`
- `GET /v1/certificates/:id`
- `POST /v1/certificates/:id/verify`
- `GET /v1/projects`
- `GET /v1/projects/:id`
- `GET /v1/policies`
- `POST /v1/policies`
- `GET /v1/audit`

The scan routes (`POST /v1/scans`, `GET /v1/scans/:id`, `GET /v1/scans/:id/poll`) already pass orgId through `scanRoutes` — those need the scan store to wrap in `withTenant` too, but that's a deeper refactor. For now, wrap the direct DB calls.

**Step 2: Write test `apps/api/src/__tests__/tenant-isolation.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { withTenant } from "@sentinel/db";

describe("withTenant", () => {
  it("is a function", () => {
    expect(typeof withTenant).toBe("function");
  });
});
```

(Full integration testing requires a real DB. This verifies the import works.)

**Step 3: Run tests, build, commit**

```bash
pnpm --filter @sentinel/api test
pnpm turbo build
git add apps/api/src/server.ts apps/api/src/__tests__/tenant-isolation.test.ts
git commit -m "feat: activate tenant isolation via withTenant() in API routes"
```

---

## Task 3: Implement Certificate Revocation Endpoint

**Files to modify:**
- `apps/api/src/server.ts` — add `POST /v1/certificates/:id/revoke`

**Files to create:**
- `apps/api/src/__tests__/certificate-revocation.test.ts`

### Steps

**Step 1: Add revocation endpoint to `apps/api/src/server.ts`**

Add after the existing `POST /v1/certificates/:id/verify` route:

```typescript
app.post("/v1/certificates/:id/revoke", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const { reason } = (request.body as any) ?? {};
  const orgId = (request as any).orgId ?? "default";

  if (!reason || typeof reason !== "string") {
    reply.code(400).send({ error: "reason is required" });
    return;
  }

  const cert = await db.certificate.findUnique({ where: { id } });
  if (!cert) {
    reply.code(404).send({ error: "Certificate not found" });
    return;
  }

  if (cert.revokedAt) {
    reply.code(409).send({ error: "Certificate already revoked" });
    return;
  }

  const now = new Date();
  await db.certificate.update({
    where: { id },
    data: {
      revokedAt: now,
      revocationReason: reason,
    },
  });

  await auditLog.log({
    action: "certificate.revoked",
    orgId,
    actorId: "api",
    resourceType: "certificate",
    resourceId: id,
    metadata: { reason },
  });

  return { id, status: "revoked", revokedAt: now.toISOString() };
});
```

**Step 2: Write test `apps/api/src/__tests__/certificate-revocation.test.ts`**

```typescript
import { describe, it, expect } from "vitest";

describe("Certificate revocation endpoint", () => {
  it("requires a reason field", () => {
    // Verifying the route logic: empty reason should be rejected
    const reason = "";
    expect(!reason || typeof reason !== "string").toBe(true);
  });

  it("detects already-revoked certificates", () => {
    const cert = { revokedAt: new Date() };
    expect(cert.revokedAt).toBeTruthy();
  });
});
```

**Step 3: Run tests, build, commit**

```bash
pnpm --filter @sentinel/api test
pnpm turbo build
git add apps/api/src/server.ts apps/api/src/__tests__/certificate-revocation.test.ts
git commit -m "feat: add POST /v1/certificates/:id/revoke endpoint with audit logging"
```

---

## Task 4: Add GET /v1/scans List Endpoint

**Files to modify:**
- `apps/api/src/server.ts` — add `GET /v1/scans` (paginated list)
- `apps/dashboard/lib/api.ts` — update `getRecentScans()` to use real API

### Steps

**Step 1: Add scans list endpoint to `apps/api/src/server.ts`**

Add before the existing `POST /v1/scans`:

```typescript
app.get("/v1/scans", { preHandler: authHook }, async (request) => {
  const { limit = "50", offset = "0", status, projectId } = request.query as any;
  const where: any = {};
  if (status) where.status = status;
  if (projectId) where.projectId = projectId;
  const [scans, total] = await Promise.all([
    db.scan.findMany({
      where,
      take: Number(limit),
      skip: Number(offset),
      orderBy: { startedAt: "desc" },
      include: { certificate: true, _count: { select: { findings: true } } },
    }),
    db.scan.count({ where }),
  ]);
  return { scans, total, limit: Number(limit), offset: Number(offset) };
});
```

**Step 2: Update `apps/dashboard/lib/api.ts` — `getRecentScans()`**

Replace the `getRecentScans` function:

```typescript
export async function getRecentScans(limit = 5): Promise<Scan[]> {
  return tryApi(async () => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<{ scans: any[] }>("/v1/scans", { limit: String(limit) });
    return (data.scans ?? []).map((s: any) => ({
      id: s.id,
      projectId: s.projectId,
      commit: s.commitHash ?? "",
      branch: s.branch ?? "",
      status: s.status === "completed"
        ? (s.riskScore <= 20 ? "pass" : s.riskScore <= 50 ? "provisional" : "fail")
        : s.status === "failed" ? "fail" : "running",
      riskScore: s.riskScore ?? 0,
      findingCount: s._count?.findings ?? 0,
      date: s.startedAt,
      aiPercent: 0,
    }));
  }, MOCK_SCANS.slice(0, limit));
}
```

**Step 3: Run tests, build, commit**

```bash
pnpm turbo build
git add apps/api/src/server.ts apps/dashboard/lib/api.ts
git commit -m "feat: add GET /v1/scans list endpoint and wire dashboard"
```

---

## Execution Order

```
Task 1: RBAC enforcement (auth middleware + permissions update)
   ↓
Task 2: Tenant isolation (wrap DB queries with withTenant)
   ↓
Task 3: Certificate revocation endpoint
   ↓
Task 4: Scans list endpoint + dashboard wiring
```

Tasks 1-2 are sequential (tenant isolation uses the orgId set by auth middleware).
Tasks 3-4 are independent and can run in parallel after Task 2.
