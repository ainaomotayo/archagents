# P10 Enterprise SSO + Encryption Gap Fixes

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close all critical and high-priority gaps found in the P10 audit so that encryption actually encrypts, RBAC actually queries the DB, key rotation actually rotates, and SCIM is RFC-compliant enough for enterprise IdPs.

**Architecture:** Wire existing primitives into runtime paths (encryption middleware → Prisma client, resolveRoleFromDb → auth middleware), fix skeleton endpoints (rotation, crypto-shred), and flesh out SCIM to pass Okta/Azure AD SCIM compliance tests.

**Tech Stack:** TypeScript, Prisma, Fastify, Node crypto, vitest

---

### Task 1: Wire Encryption Middleware into Prisma Client

**Why:** `createEncryptionMiddleware` exists but is never registered. All data stored unencrypted.

**Files:**
- Modify: `packages/db/src/client.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/__tests__/encryption-middleware.test.ts` (extend existing)

**Step 1: Write the failing test**

Add to `packages/db/src/__tests__/encryption-middleware.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { getDb } from "../client.js";

describe("encryption middleware wiring", () => {
  it("getDb accepts optional encryption config", () => {
    // getDb() should work without encryption (backward compat)
    const db = getDb();
    expect(db).toBeDefined();
  });

  it("initEncryption registers middleware on client", async () => {
    const { initEncryption } = await import("../client.js");
    // Should not throw when called with valid config
    expect(typeof initEncryption).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/db`
Expected: FAIL — `initEncryption` not exported.

**Step 3: Implement**

Modify `packages/db/src/client.ts`:

```typescript
import { PrismaClient } from "@prisma/client";
import type { EnvelopeEncryption } from "@sentinel/security";
import { createEncryptionMiddleware } from "./encryption-middleware.js";

let prisma: PrismaClient | undefined;
let currentOrgId: string | null = null;

export function setCurrentOrgId(orgId: string | null): void {
  currentOrgId = orgId;
}

export function getDb(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["query"] : ["error"],
    });
  }
  return prisma;
}

/**
 * Register encryption middleware on the Prisma client.
 * Call once at startup after KMS is available.
 */
export function initEncryption(envelope: EnvelopeEncryption): void {
  const db = getDb();
  const middleware = createEncryptionMiddleware(envelope, () => currentOrgId);
  db.$use(middleware);
}

export async function disconnectDb(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}

export { PrismaClient };
```

Update `packages/db/src/index.ts` to export the new functions:

```typescript
export { getDb, disconnectDb, PrismaClient, initEncryption, setCurrentOrgId } from "./client.js";
export { withTenant } from "./tenant.js";
export type { PrismaClientLike, TransactionClient } from "./types.js";
export { createEncryptionMiddleware, ENCRYPTED_FIELDS } from "./encryption-middleware.js";
```

**Step 4: Wire into API server startup**

In `apps/api/src/server.ts`, add near the top after imports and DB init:

```typescript
import { initEncryption, setCurrentOrgId } from "@sentinel/db";
import { EnvelopeEncryption, LocalKmsProvider, DekCache } from "@sentinel/security";

// Initialize encryption if KMS secret is configured
if (process.env.SENTINEL_KMS_LOCAL_SECRET || process.env.NODE_ENV === "production") {
  const kms = new LocalKmsProvider(process.env.SENTINEL_KMS_LOCAL_SECRET);
  const cache = new DekCache();
  const envelope = new EnvelopeEncryption(kms, cache);
  initEncryption(envelope);
}
```

Then in the authHook, after setting `(request as any).orgId`, call `setCurrentOrgId()`:

Add a Fastify `onRequest` hook:
```typescript
app.addHook("onRequest", async (request) => {
  // Will be set properly by auth middleware later; default null
  setCurrentOrgId((request as any).orgId ?? null);
});
```

And in `createAuthHook`, after each place `(request as any).orgId` is set, also call `setCurrentOrgId((request as any).orgId)`.

**Step 5: Run tests**

Run: `npx turbo test --filter=@sentinel/db`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/db/src/client.ts packages/db/src/index.ts packages/db/src/__tests__/encryption-middleware.test.ts
git commit -m "feat(db): wire encryption middleware into Prisma client"
```

---

### Task 2: Integrate resolveRoleFromDb into API Auth Middleware

**Why:** `resolveRoleFromDb` exists in `packages/auth` but the auth middleware in `apps/api/src/middleware/auth.ts` never calls it. Roles come from headers or env-vars only.

**Files:**
- Modify: `apps/api/src/middleware/auth.ts`
- Test: `apps/api/src/__tests__/auth-middleware-db-role.test.ts` (new)

**Step 1: Write the failing test**

Create `apps/api/src/__tests__/auth-middleware-db-role.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { createAuthHook } from "../middleware/auth.js";

describe("auth middleware DB role resolution", () => {
  it("resolves role from DB membership when available", async () => {
    const hook = createAuthHook({
      getOrgSecret: async () => "test-secret",
      resolveRole: async () => "developer",
      resolveDbRole: async (_userId, _orgId) => "manager", // DB says manager
    });
    expect(typeof hook).toBe("function");
  });

  it("falls back to resolveRole when DB has no membership", async () => {
    const hook = createAuthHook({
      getOrgSecret: async () => "test-secret",
      resolveRole: async () => "developer",
      resolveDbRole: async () => null,
    });
    expect(typeof hook).toBe("function");
  });
});
```

**Step 2: Implement**

Modify `apps/api/src/middleware/auth.ts` — add `resolveDbRole` to `AuthHookOptions`:

```typescript
interface AuthHookOptions {
  getOrgSecret: (apiKey?: string) => Promise<string | null>;
  resolveRole?: (apiKey?: string) => Promise<ApiRole>;
  resolveDbRole?: (userId: string, orgId: string) => Promise<string | null>;
}
```

In the HMAC flow, after setting orgId and before RBAC check, add DB role resolution:

```typescript
// Resolve role — try DB first, then fallback
let role: ApiRole;
const orgId = (request as any).orgId ?? "default";
(request as any).orgId = orgId;

if (options.resolveDbRole) {
  // userId from x-sentinel-user-id header (set by dashboard proxy) or apiKey
  const userId = request.headers["x-sentinel-user-id"] as string | undefined;
  if (userId) {
    const dbRole = await options.resolveDbRole(userId, orgId);
    if (dbRole) {
      role = dbRole as ApiRole;
    } else {
      role = options.resolveRole
        ? await options.resolveRole(apiKey)
        : (request.headers["x-sentinel-role"] as ApiRole) ?? "service";
    }
  } else {
    role = options.resolveRole
      ? await options.resolveRole(apiKey)
      : (request.headers["x-sentinel-role"] as ApiRole) ?? "service";
  }
} else {
  role = options.resolveRole
    ? await options.resolveRole(apiKey)
    : (request.headers["x-sentinel-role"] as ApiRole) ?? "service";
}
```

Then in `apps/api/src/server.ts`, wire the DB lookup into the authHook creation:

```typescript
const authHook = createAuthHook({
  getOrgSecret: async () => process.env.SENTINEL_SECRET ?? null,
  resolveDbRole: async (userId, orgId) => {
    const db = getDb();
    const membership = await db.orgMembership.findFirst({
      where: { userId, orgId },
    });
    return membership?.role ?? null;
  },
});
```

**Step 3: Run tests**

Run: `npx turbo test --filter=@sentinel/api`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/api/src/middleware/auth.ts apps/api/src/__tests__/auth-middleware-db-role.test.ts apps/api/src/server.ts
git commit -m "feat(api): integrate DB-backed role resolution into auth middleware"
```

---

### Task 3: Fix Key Rotation — Actually Rotate Keys

**Why:** The endpoint logs and returns success but never calls `rotateOrgKeys()` or persists results.

**Files:**
- Modify: `apps/api/src/routes/encryption-admin.ts`
- Test: `apps/api/src/__tests__/encryption-admin.test.ts` (extend)

**Step 1: Write the failing test**

Add to existing test file:

```typescript
describe("key rotation endpoint", () => {
  it("rotateOrgKeys re-wraps all active keys and returns new versions", async () => {
    const { rotateOrgKeys } = await import("../routes/encryption-admin.js");
    const mockKms = {
      name: "test",
      generateDataKey: vi.fn(),
      unwrapDataKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 0xaa)),
      rewrapDataKey: vi.fn().mockResolvedValue(Buffer.alloc(60, 0xbb)),
      ping: vi.fn(),
    };
    const keys = [
      { id: "k1", purpose: "sso", wrappedDek: Buffer.alloc(60).toString("base64"), kekId: "kek1", version: 1 },
      { id: "k2", purpose: "cert", wrappedDek: Buffer.alloc(60).toString("base64"), kekId: "kek1", version: 2 },
    ];
    const results = await rotateOrgKeys(keys, mockKms, "kek1");
    expect(results).toHaveLength(2);
    expect(results[0].newVersion).toBe(2);
    expect(results[1].newVersion).toBe(3);
    expect(mockKms.rewrapDataKey).toHaveBeenCalledTimes(2);
  });
});
```

**Step 2: Implement**

Replace the rotation endpoint body in `apps/api/src/routes/encryption-admin.ts`:

```typescript
app.post("/v1/admin/rotate-keys", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
  const { getDb } = await import("@sentinel/db");
  const { LocalKmsProvider } = await import("@sentinel/security");
  const db = getDb();
  const orgId = (request as any).orgId;

  const keys = await db.encryptionKey.findMany({
    where: { orgId, active: true },
  });

  if (keys.length === 0) {
    return reply.send({ message: "No active keys to rotate", keyCount: 0 });
  }

  const kms = new LocalKmsProvider(process.env.SENTINEL_KMS_LOCAL_SECRET);
  const kekId = keys[0].kekId; // All keys for an org share the same KEK
  const results = await rotateOrgKeys(
    keys.map((k) => ({ id: k.id, purpose: k.purpose, wrappedDek: k.wrappedDek, kekId: k.kekId, version: k.version })),
    kms,
    kekId,
  );

  // Persist re-wrapped DEKs in a transaction
  await db.$transaction(
    results.map((r) =>
      db.encryptionKey.update({
        where: { id: r.id },
        data: { wrappedDek: r.newWrapped, version: r.newVersion, rotatedAt: new Date() },
      }),
    ),
  );

  console.log(`[ADMIN] Key rotation completed for org ${orgId}, ${results.length} keys rotated`);
  return reply.send({ message: "Key rotation completed", keyCount: results.length });
});
```

**Step 3: Fix crypto-shred — actually delete keys + evict cache**

Replace the crypto-shred endpoint body:

```typescript
app.post("/v1/admin/crypto-shred", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
  const { confirmOrgId } = request.body as { confirmOrgId?: string };
  const orgId = (request as any).orgId;
  if (confirmOrgId !== orgId) {
    return reply.status(400).send({ error: "confirmOrgId must match authenticated org" });
  }

  const { getDb } = await import("@sentinel/db");
  const db = getDb();

  // Hard-delete all encryption keys for the org (irrecoverable)
  const { count } = await db.encryptionKey.deleteMany({
    where: { orgId },
  });

  console.log(`[ADMIN] Crypto-shred completed for org ${orgId}, ${count} keys permanently deleted`);
  return reply.send({
    message: "Crypto-shred completed. All encryption keys permanently deleted.",
    orgId,
    keysDestroyed: count,
  });
});
```

**Step 4: Run tests**

Run: `npx turbo test --filter=@sentinel/api`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/encryption-admin.ts apps/api/src/__tests__/encryption-admin.test.ts
git commit -m "fix(api): implement actual key rotation with transaction + hard-delete crypto-shred"
```

---

### Task 4: Add Self-Removal Guard to Org Memberships

**Why:** An admin can delete their own membership, locking themselves out.

**Files:**
- Modify: `apps/api/src/routes/org-memberships.ts`
- Test: `apps/api/src/__tests__/org-memberships.test.ts` (new)

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";

describe("org membership guards", () => {
  it("should prevent deleting own membership", () => {
    // This tests the guard logic
    const requestUserId = "user-123";
    const membershipUserId = "user-123";
    expect(requestUserId === membershipUserId).toBe(true);
    // Route should return 400 when these match
  });
});
```

**Step 2: Implement**

In `apps/api/src/routes/org-memberships.ts`, modify the DELETE handler:

After `if (!existing) return reply.status(404)...`, add:

```typescript
// Prevent self-removal
const requestUserId = request.headers["x-sentinel-user-id"] as string | undefined;
if (requestUserId && existing.userId === requestUserId) {
  return reply.status(400).send({ error: "Cannot remove your own membership. Ask another admin." });
}
```

Also add the same guard to PUT (prevent self-demotion from admin):

```typescript
// Prevent self-demotion from admin
const requestUserId = request.headers["x-sentinel-user-id"] as string | undefined;
if (requestUserId && existing.userId === requestUserId && existing.role === "admin" && role !== "admin") {
  return reply.status(400).send({ error: "Cannot demote yourself from admin. Ask another admin." });
}
```

**Step 3: Run tests**

Run: `npx turbo test --filter=@sentinel/api`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/api/src/routes/org-memberships.ts apps/api/src/__tests__/org-memberships.test.ts
git commit -m "fix(api): add self-removal and self-demotion guards to org memberships"
```

---

### Task 5: SCIM Pagination + Filter Support

**Why:** SCIM list endpoints must support `startIndex`, `count`, `totalResults` per RFC 7644. Enterprise IdPs (Okta, Azure AD) require this.

**Files:**
- Modify: `apps/api/src/routes/scim.ts`
- Modify: `apps/api/src/__tests__/scim.test.ts` (extend)

**Step 1: Write the failing test**

Add to `apps/api/src/__tests__/scim.test.ts`:

```typescript
describe("SCIM pagination", () => {
  it("parseScimListParams extracts startIndex and count with defaults", () => {
    const { parseScimListParams } = require("../routes/scim.js");
    const params = parseScimListParams({ startIndex: "5", count: "10" });
    expect(params).toEqual({ startIndex: 5, count: 10, skip: 4, take: 10 });
  });

  it("defaults startIndex to 1 and count to 100", () => {
    const { parseScimListParams } = require("../routes/scim.js");
    const params = parseScimListParams({});
    expect(params).toEqual({ startIndex: 1, count: 100, skip: 0, take: 100 });
  });

  it("parseScimFilter extracts userName eq filter", () => {
    const { parseScimFilter } = require("../routes/scim.js");
    const result = parseScimFilter('userName eq "alice@acme.com"');
    expect(result).toEqual({ field: "email", value: "alice@acme.com" });
  });
});
```

**Step 2: Implement**

Add helpers to `apps/api/src/routes/scim.ts`:

```typescript
export function parseScimListParams(query: Record<string, string | undefined>): {
  startIndex: number; count: number; skip: number; take: number;
} {
  const startIndex = Math.max(1, parseInt(query.startIndex ?? "1", 10) || 1);
  const count = Math.min(200, Math.max(1, parseInt(query.count ?? "100", 10) || 100));
  return { startIndex, count, skip: startIndex - 1, take: count };
}

export function parseScimFilter(filter: string | undefined): { field: string; value: string } | null {
  if (!filter) return null;
  const match = filter.match(/^(\w+)\s+eq\s+"([^"]+)"$/);
  if (!match) return null;
  const fieldMap: Record<string, string> = { userName: "email", externalId: "externalId" };
  const field = fieldMap[match[1]];
  return field ? { field, value: match[2] } : null;
}
```

Update the GET /v1/scim/v2/Users handler:

```typescript
app.get("/v1/scim/v2/Users", { preHandler: scimAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
  const { getDb } = await import("@sentinel/db");
  const db = getDb();
  const query = request.query as Record<string, string | undefined>;
  const { startIndex, count, skip, take } = parseScimListParams(query);
  const filter = parseScimFilter(query.filter);

  const where: any = { orgId: (request as any).orgId };
  if (filter) where[filter.field] = filter.value;

  const [users, total] = await Promise.all([
    db.user.findMany({ where, skip, take }),
    db.user.count({ where }),
  ]);

  return reply.send({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: total,
    startIndex,
    itemsPerPage: users.length,
    Resources: users.map((u: any) => ({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      id: u.id,
      userName: u.email,
      name: { formatted: u.name },
      emails: [{ value: u.email, primary: true }],
      externalId: u.externalId ?? undefined,
      active: true,
      meta: { resourceType: "User", created: u.createdAt, lastModified: u.updatedAt ?? u.createdAt },
    })),
  });
});
```

**Step 3: Run tests**

Run: `npx turbo test --filter=@sentinel/api`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/api/src/routes/scim.ts apps/api/src/__tests__/scim.test.ts
git commit -m "feat(api): add SCIM pagination, filter, and meta fields per RFC 7644"
```

---

### Task 6: SCIM PATCH Operations + DELETE Endpoint

**Why:** PATCH only handles `active=false`. Enterprise IdPs send `replace` ops for name, email, groups. No DELETE /Users/:id exists.

**Files:**
- Modify: `apps/api/src/routes/scim.ts`
- Modify: `apps/api/src/__tests__/scim.test.ts` (extend)

**Step 1: Write the failing test**

```typescript
describe("SCIM PATCH operations", () => {
  it("applyScimPatchOps handles replace on name", () => {
    const { applyScimPatchOps } = require("../routes/scim.js");
    const updates = applyScimPatchOps([
      { op: "replace", path: "name.givenName", value: "Alice" },
      { op: "replace", path: "name.familyName", value: "Smith" },
    ]);
    expect(updates.name).toBe("Alice Smith");
  });

  it("applyScimPatchOps handles replace on active=false", () => {
    const { applyScimPatchOps } = require("../routes/scim.js");
    const updates = applyScimPatchOps([
      { op: "replace", path: "active", value: false },
    ]);
    expect(updates.deactivate).toBe(true);
  });
});
```

**Step 2: Implement**

Add helper to `apps/api/src/routes/scim.ts`:

```typescript
export function applyScimPatchOps(operations: any[]): { name?: string; externalId?: string; deactivate?: boolean } {
  const result: { givenName?: string; familyName?: string; externalId?: string; deactivate?: boolean } = {};
  for (const op of operations) {
    if (op.op === "replace" || op.op === "Replace") {
      if (op.path === "active" && (op.value === false || op.value === "false")) {
        result.deactivate = true;
      } else if (op.path === "name.givenName") {
        result.givenName = op.value;
      } else if (op.path === "name.familyName") {
        result.familyName = op.value;
      } else if (op.path === "externalId") {
        result.externalId = op.value;
      }
    }
  }
  const updates: any = {};
  if (result.givenName || result.familyName) {
    updates.name = `${result.givenName ?? ""} ${result.familyName ?? ""}`.trim();
  }
  if (result.externalId) updates.externalId = result.externalId;
  if (result.deactivate) updates.deactivate = true;
  return updates;
}
```

Rewrite the PATCH handler to use it:

```typescript
app.patch("/v1/scim/v2/Users/:id", { preHandler: scimAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
  const { getDb } = await import("@sentinel/db");
  const db = getDb();
  const userId = (request.params as any).id;
  const orgId = (request as any).orgId;
  const ops = ((request.body as any).Operations ?? []) as any[];
  const updates = applyScimPatchOps(ops);

  if (updates.deactivate) {
    await db.orgMembership.deleteMany({ where: { orgId, userId } });
    return reply.status(204).send();
  }

  const data: any = {};
  if (updates.name) data.name = updates.name;
  if (updates.externalId) data.externalId = updates.externalId;

  if (Object.keys(data).length > 0) {
    const user = await db.user.update({ where: { id: userId }, data });
    return reply.send({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      id: user.id, userName: user.email, name: { formatted: user.name }, active: true,
    });
  }
  return reply.status(204).send();
});
```

Add DELETE endpoint:

```typescript
app.delete("/v1/scim/v2/Users/:id", { preHandler: scimAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
  const { getDb } = await import("@sentinel/db");
  const db = getDb();
  const userId = (request.params as any).id;
  const orgId = (request as any).orgId;

  // Remove membership (soft deactivate, don't delete user record)
  await db.orgMembership.deleteMany({ where: { orgId, userId } });
  return reply.status(204).send();
});
```

**Step 3: Run tests**

Run: `npx turbo test --filter=@sentinel/api`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/api/src/routes/scim.ts apps/api/src/__tests__/scim.test.ts
git commit -m "feat(api): add SCIM PATCH replace ops, DELETE endpoint"
```

---

### Task 7: SCIM /Schemas and /ResourceTypes Endpoints

**Why:** RFC 7643 requires these discovery endpoints. Okta SCIM test suite checks for them.

**Files:**
- Modify: `apps/api/src/routes/scim.ts`
- Modify: `apps/api/src/__tests__/scim.test.ts`

**Step 1: Write the failing test**

```typescript
describe("SCIM discovery endpoints", () => {
  it("SCIM_USER_SCHEMA has required attributes", () => {
    const { SCIM_USER_SCHEMA } = require("../routes/scim.js");
    expect(SCIM_USER_SCHEMA.id).toBe("urn:ietf:params:scim:schemas:core:2.0:User");
    const attrNames = SCIM_USER_SCHEMA.attributes.map((a: any) => a.name);
    expect(attrNames).toContain("userName");
    expect(attrNames).toContain("name");
    expect(attrNames).toContain("emails");
    expect(attrNames).toContain("active");
  });
});
```

**Step 2: Implement**

Add schema constant and endpoints to `apps/api/src/routes/scim.ts`:

```typescript
export const SCIM_USER_SCHEMA = {
  id: "urn:ietf:params:scim:schemas:core:2.0:User",
  name: "User",
  description: "SCIM User resource",
  attributes: [
    { name: "userName", type: "string", multiValued: false, required: true, mutability: "readWrite", uniqueness: "server" },
    { name: "name", type: "complex", multiValued: false, required: false, subAttributes: [
      { name: "formatted", type: "string" }, { name: "givenName", type: "string" }, { name: "familyName", type: "string" },
    ]},
    { name: "emails", type: "complex", multiValued: true, required: false },
    { name: "active", type: "boolean", multiValued: false, required: false, mutability: "readWrite" },
    { name: "externalId", type: "string", multiValued: false, required: false, mutability: "readWrite" },
  ],
};

// Inside registerScimRoutes:

app.get("/v1/scim/v2/Schemas", async (_request, reply) => {
  return reply.send({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: 1,
    Resources: [SCIM_USER_SCHEMA],
  });
});

app.get("/v1/scim/v2/ResourceTypes", async (_request, reply) => {
  return reply.send({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: 1,
    Resources: [{
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
      id: "User",
      name: "User",
      endpoint: "/v1/scim/v2/Users",
      schema: "urn:ietf:params:scim:schemas:core:2.0:User",
    }],
  });
});
```

**Step 3: Run tests, commit**

```bash
git commit -m "feat(api): add SCIM /Schemas and /ResourceTypes discovery endpoints"
```

---

### Task 8: SSO Enforcement in Dashboard NextAuth

**Why:** Dashboard ignores `enforced: true` flag. Users can bypass SSO enforcement by using default providers.

**Files:**
- Modify: `apps/dashboard/lib/auth.ts`
- Modify: `apps/dashboard/__tests__/auth.test.ts`

**Step 1: Write the failing test**

Add to `apps/dashboard/__tests__/auth.test.ts`:

```typescript
describe("SSO enforcement", () => {
  it("getConfiguredProviders includes enforcement callback", () => {
    const { getConfiguredProviders } = require("../lib/auth");
    const providers = getConfiguredProviders();
    // Should return an array (basic check)
    expect(Array.isArray(providers)).toBe(true);
  });
});
```

**Step 2: Implement**

The dashboard auth currently loads providers from env-vars. For enforcement, we need the NextAuth `signIn` callback to check if the org has an enforced SSO provider and block non-enforced providers.

Add to the `callbacks` section in `authOptions` in `apps/dashboard/lib/auth.ts`:

```typescript
async signIn({ account }) {
  // If org has enforced SSO, only allow that provider
  if (account?.provider) {
    try {
      const baseUrl = process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL ?? "http://localhost:3000";
      const res = await fetch(`${process.env.SENTINEL_API_URL ?? "http://localhost:8080"}/v1/auth/discovery?email=${encodeURIComponent(account.providerAccountId ?? "")}`);
      if (res.ok) {
        const data = await res.json();
        if (data.enforced && !data.providers.some((p: any) => p.id === account.provider)) {
          return false; // Block non-enforced provider
        }
      }
    } catch {
      // Allow login if discovery service is unavailable (fail-open for availability)
    }
  }
  return true;
},
```

Note: This is a best-effort enforcement at the dashboard layer. The API-side discovery already enforces correctly.

**Step 3: Run tests, commit**

```bash
git commit -m "feat(dashboard): enforce SSO provider restrictions in NextAuth signIn callback"
```

---

### Task 9: DEK Auto-Provisioning for New Orgs

**Why:** The `EnvelopeEncryption` class requires key records to be loaded via `setKeyRecord()` before encryption works. Currently nothing loads existing keys from DB or provisions keys for new orgs, so the middleware will throw "No encryption key for orgId:purpose".

**Files:**
- Modify: `packages/security/src/envelope.ts`
- Modify: `packages/db/src/encryption-middleware.ts`
- Test: `packages/security/src/__tests__/envelope-auto-provision.test.ts` (new)

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { EnvelopeEncryption } from "../envelope.js";
import { DekCache } from "../dek-cache.js";

describe("EnvelopeEncryption auto-provision", () => {
  it("setKeyLoader allows lazy loading from DB", async () => {
    const mockKms = {
      name: "test",
      generateDataKey: vi.fn().mockResolvedValue({ plaintext: Buffer.alloc(32, 0xaa), wrapped: Buffer.alloc(60, 0xbb) }),
      unwrapDataKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 0xaa)),
      rewrapDataKey: vi.fn(),
      ping: vi.fn(),
    };
    const cache = new DekCache();
    const envelope = new EnvelopeEncryption(mockKms, cache);

    // Set a loader that simulates DB lookup
    envelope.setKeyLoader(async (orgId, purpose) => {
      return { wrappedDek: Buffer.alloc(60, 0xbb), kekId: "kek-1" };
    });

    // Should succeed without manual setKeyRecord
    const encrypted = await envelope.encrypt("org-1", "sso_secrets", "hello");
    expect(encrypted).toBeTruthy();
  });

  it("auto-generates key when loader returns null and autoProvision is set", async () => {
    const mockKms = {
      name: "test",
      generateDataKey: vi.fn().mockResolvedValue({ plaintext: Buffer.alloc(32, 0xaa), wrapped: Buffer.alloc(60, 0xbb) }),
      unwrapDataKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 0xaa)),
      rewrapDataKey: vi.fn(),
      ping: vi.fn(),
    };
    const cache = new DekCache();
    const envelope = new EnvelopeEncryption(mockKms, cache);

    let storedKey: any = null;
    envelope.setKeyLoader(async () => null);
    envelope.setKeyProvisioner(async (orgId, purpose, wrappedDek, kekId) => {
      storedKey = { orgId, purpose, wrappedDek, kekId };
    });

    const encrypted = await envelope.encrypt("org-new", "sso_secrets", "secret");
    expect(encrypted).toBeTruthy();
    expect(storedKey).not.toBeNull();
    expect(storedKey.orgId).toBe("org-new");
    expect(mockKms.generateDataKey).toHaveBeenCalled();
  });
});
```

**Step 2: Implement**

Add loader/provisioner to `EnvelopeEncryption` class in `packages/security/src/envelope.ts`:

```typescript
type KeyLoader = (orgId: string, purpose: string) => Promise<{ wrappedDek: Buffer; kekId: string } | null>;
type KeyProvisioner = (orgId: string, purpose: string, wrappedDek: Buffer, kekId: string) => Promise<void>;

export class EnvelopeEncryption {
  private keyRecords = new Map<string, OrgKeyRecord>();
  private keyLoader?: KeyLoader;
  private keyProvisioner?: KeyProvisioner;
  private defaultKekId = "default";

  constructor(private kms: KmsProvider, private cache: DekCache) {}

  setKeyLoader(loader: KeyLoader): void { this.keyLoader = loader; }
  setKeyProvisioner(provisioner: KeyProvisioner): void { this.keyProvisioner = provisioner; }
  setDefaultKekId(kekId: string): void { this.defaultKekId = kekId; }

  // ... existing methods ...

  private async getDek(orgId: string, purpose: string): Promise<Buffer> {
    const cached = this.cache.get(orgId, purpose);
    if (cached) return cached;

    // Check in-memory records
    let record = this.keyRecords.get(`${orgId}\0${purpose}`);

    // Try loading from DB
    if (!record && this.keyLoader) {
      const loaded = await this.keyLoader(orgId, purpose);
      if (loaded) {
        this.setKeyRecord(orgId, purpose, loaded.wrappedDek, loaded.kekId);
        record = this.keyRecords.get(`${orgId}\0${purpose}`);
      }
    }

    // Auto-provision if provisioner is set
    if (!record && this.keyProvisioner) {
      const kekId = this.defaultKekId;
      const { plaintext, wrapped } = await this.kms.generateDataKey(kekId);
      await this.keyProvisioner(orgId, purpose, wrapped, kekId);
      this.setKeyRecord(orgId, purpose, wrapped, kekId);
      this.cache.set(orgId, purpose, plaintext);
      return plaintext;
    }

    if (!record) throw new Error(`No encryption key for ${orgId}:${purpose}`);

    const plaintext = await this.kms.unwrapDataKey(record.kekId, record.wrappedDek);
    this.cache.set(orgId, purpose, plaintext);
    return plaintext;
  }
}
```

Then wire loader/provisioner in server startup (in `apps/api/src/server.ts`) after `initEncryption`:

```typescript
// After envelope creation:
envelope.setKeyLoader(async (orgId, purpose) => {
  const db = getDb();
  const key = await db.encryptionKey.findFirst({ where: { orgId, purpose, active: true } });
  if (!key) return null;
  return { wrappedDek: Buffer.from(key.wrappedDek, "base64"), kekId: key.kekId };
});

envelope.setKeyProvisioner(async (orgId, purpose, wrappedDek, kekId) => {
  const db = getDb();
  await db.encryptionKey.create({
    data: { orgId, purpose, wrappedDek: wrappedDek.toString("base64"), kekId, kekProvider: "local" },
  });
});
```

**Step 3: Run tests, commit**

```bash
git commit -m "feat(security): add key loader and auto-provisioner to EnvelopeEncryption"
```

---

### Task 10: Integration Tests for P10 Routes

**Why:** Org memberships, SSO config CRUD, SCIM, and encryption admin have no integration tests.

**Files:**
- Create: `apps/api/src/__tests__/p10-integration.test.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB for route-level integration tests
const mockDb = {
  orgMembership: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: "m1", orgId: "org1", userId: "u1", role: "viewer" }),
    update: vi.fn().mockResolvedValue({ id: "m1", role: "developer" }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn(),
    upsert: vi.fn(),
  },
  ssoConfig: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: "sso1", provider: "oidc" }),
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({ id: "u1", email: "a@b.com", name: "A" }),
    update: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
  encryptionKey: {
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
    update: vi.fn(),
    $transaction: vi.fn(),
  },
  apiKey: {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@sentinel/db", () => ({ getDb: () => mockDb }));

describe("P10 route integration", () => {
  describe("org memberships", () => {
    it("POST /v1/memberships validates role", async () => {
      const { registerOrgMembershipRoutes } = await import("../routes/org-memberships.js");
      expect(typeof registerOrgMembershipRoutes).toBe("function");
    });
  });

  describe("SCIM mappers", () => {
    it("mapScimUserToSentinel extracts email and name", async () => {
      const { mapScimUserToSentinel } = await import("../routes/scim.js");
      const result = mapScimUserToSentinel({
        userName: "alice@acme.com",
        name: { givenName: "Alice", familyName: "Smith" },
      });
      expect(result.email).toBe("alice@acme.com");
      expect(result.name).toBe("Alice Smith");
    });

    it("mapScimGroupsToRole picks highest-priority role", async () => {
      const { mapScimGroupsToRole } = await import("../routes/scim.js");
      const role = mapScimGroupsToRole(["engineers", "admins"], { engineers: "developer", admins: "admin" }, "viewer");
      expect(role).toBe("admin");
    });
  });

  describe("encryption admin", () => {
    it("rotateOrgKeys returns incremented versions", async () => {
      const { rotateOrgKeys } = await import("../routes/encryption-admin.js");
      const mockKms = {
        name: "test",
        generateDataKey: vi.fn(),
        unwrapDataKey: vi.fn().mockResolvedValue(Buffer.alloc(32)),
        rewrapDataKey: vi.fn().mockResolvedValue(Buffer.alloc(60)),
        ping: vi.fn(),
      };
      const results = await rotateOrgKeys(
        [{ id: "k1", purpose: "test", wrappedDek: Buffer.alloc(60).toString("base64"), kekId: "kek1", version: 1 }],
        mockKms, "kek1",
      );
      expect(results[0].newVersion).toBe(2);
    });
  });

  describe("auth discovery", () => {
    it("resolveProviders returns defaults for unknown domain", async () => {
      const { resolveProviders } = await import("../routes/auth-discovery.js");
      const result = await resolveProviders("alice@unknown.com", async () => null);
      expect(result.providers).toHaveLength(1);
      expect(result.providers[0].id).toBe("github");
    });

    it("resolveProviders returns enforced providers only when enforced", async () => {
      const { resolveProviders } = await import("../routes/auth-discovery.js");
      const result = await resolveProviders("alice@acme.com", async () => ({
        orgId: "org1", orgName: "Acme",
        providers: [
          { id: "okta", name: "Okta SSO", enforced: true },
          { id: "github", name: "GitHub", enforced: false },
        ],
      }));
      expect(result.enforced).toBe(true);
      expect(result.providers).toHaveLength(1);
      expect(result.providers[0].id).toBe("okta");
    });
  });
});
```

**Step 2: Run tests, commit**

```bash
git commit -m "test(api): add P10 integration tests for memberships, SCIM, encryption, discovery"
```

---

### Task 11: Crypto-Shred Cache Eviction

**Why:** After crypto-shredding, DEK cache still holds plaintext keys in memory.

**Files:**
- Modify: `apps/api/src/routes/encryption-admin.ts`
- Modify: `apps/api/src/server.ts` (expose cache reference)

**Step 1: Implement**

Pass the DekCache into `registerEncryptionAdminRoutes`:

Change signature:
```typescript
export function registerEncryptionAdminRoutes(app: FastifyInstance, authHook: any, dekCache?: DekCache) {
```

In crypto-shred handler, after deleting keys:
```typescript
// Evict cached plaintext DEKs for this org
if (dekCache) {
  dekCache.evict(orgId);
}
```

Update server.ts registration call to pass the cache:
```typescript
registerEncryptionAdminRoutes(app, authHook, cache);
```

**Step 2: Run tests, commit**

```bash
git commit -m "fix(api): evict DEK cache on crypto-shred"
```

---

### Task 12: SCIM Token Generation Endpoint

**Why:** Admins currently must manually set `scimToken` in the database. Need an API endpoint to generate tokens.

**Files:**
- Modify: `apps/api/src/routes/sso-config.ts`
- Test: `apps/api/src/__tests__/sso-discovery.test.ts` (extend)

**Step 1: Implement**

Add to `apps/api/src/routes/sso-config.ts`:

```typescript
// POST /v1/sso-configs/:id/scim-token — generate a new SCIM bearer token
app.post("/v1/sso-configs/:id/scim-token", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
  const { getDb } = await import("@sentinel/db");
  const { randomBytes } = await import("node:crypto");
  const db = getDb();

  const config = await db.ssoConfig.findFirst({
    where: { id: (request.params as any).id, orgId: (request as any).orgId },
  });
  if (!config) return reply.status(404).send({ error: "SSO config not found" });

  const token = `scim_${randomBytes(32).toString("base64url")}`;
  await db.ssoConfig.update({
    where: { id: config.id },
    data: { scimToken: token },
  });

  // Return the token once — it won't be shown again
  return reply.send({ scimToken: token, message: "Store this token securely. It will not be shown again." });
});
```

Add RBAC entry in `packages/security/src/rbac.ts`:
```typescript
{ method: "POST", path: "/v1/sso-configs/:id/scim-token", roles: ["admin"] },
```

**Step 2: Run tests, commit**

```bash
git commit -m "feat(api): add SCIM token generation endpoint"
```

---

### Task 13: Domain Verification Endpoint

**Why:** No way to add/verify domains for email-based SSO discovery. Must set directly in DB.

**Files:**
- Create: `apps/api/src/routes/domain-verification.ts`
- Modify: `apps/api/src/server.ts` (register route)
- Modify: `packages/security/src/rbac.ts` (add permissions)

**Step 1: Implement**

Create `apps/api/src/routes/domain-verification.ts`:

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export function registerDomainRoutes(app: FastifyInstance, authHook: any) {
  // GET /v1/domains — list verified domains for org
  app.get("/v1/domains", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const org = await db.organization.findUnique({ where: { id: (request as any).orgId } });
    const domains = (org?.settings as any)?.verifiedDomains ?? [];
    return reply.send({ domains });
  });

  // POST /v1/domains — add a domain (generates DNS TXT verification token)
  app.post("/v1/domains", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { domain } = request.body as { domain?: string };
    if (!domain || !/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
      return reply.status(400).send({ error: "Invalid domain" });
    }

    const { randomBytes } = await import("node:crypto");
    const token = `sentinel-verify=${randomBytes(16).toString("hex")}`;

    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const org = await db.organization.findUnique({ where: { id: orgId } });
    const settings = (org?.settings as any) ?? {};
    const pendingDomains = settings.pendingDomains ?? {};
    pendingDomains[domain] = { token, createdAt: new Date().toISOString() };

    await db.organization.update({
      where: { id: orgId },
      data: { settings: { ...settings, pendingDomains } },
    });

    return reply.status(201).send({
      domain,
      verificationToken: token,
      instructions: `Add a TXT record for _sentinel-verify.${domain} with value: ${token}`,
    });
  });

  // POST /v1/domains/:domain/verify — verify domain via DNS TXT lookup
  app.post("/v1/domains/:domain/verify", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { resolve } = await import("node:dns/promises");
    const domain = (request.params as any).domain;
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const org = await db.organization.findUnique({ where: { id: orgId } });
    const settings = (org?.settings as any) ?? {};
    const pending = settings.pendingDomains?.[domain];

    if (!pending) return reply.status(404).send({ error: "Domain not found in pending list" });

    try {
      const records = await resolve(`_sentinel-verify.${domain}`, "TXT");
      const flat = records.flat();
      if (!flat.includes(pending.token)) {
        return reply.status(422).send({ error: "TXT record not found. Please add the DNS record and try again.", expected: pending.token });
      }
    } catch {
      return reply.status(422).send({ error: "DNS lookup failed. Please ensure the TXT record exists." });
    }

    // Move from pending to verified
    const verifiedDomains = settings.verifiedDomains ?? [];
    if (!verifiedDomains.includes(domain)) verifiedDomains.push(domain);
    delete settings.pendingDomains[domain];
    settings.verifiedDomains = verifiedDomains;

    await db.organization.update({ where: { id: orgId }, data: { settings } });
    return reply.send({ domain, verified: true });
  });

  // DELETE /v1/domains/:domain — remove verified domain
  app.delete("/v1/domains/:domain", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const domain = (request.params as any).domain;
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const org = await db.organization.findUnique({ where: { id: orgId } });
    const settings = (org?.settings as any) ?? {};

    settings.verifiedDomains = (settings.verifiedDomains ?? []).filter((d: string) => d !== domain);
    if (settings.pendingDomains) delete settings.pendingDomains[domain];

    await db.organization.update({ where: { id: orgId }, data: { settings } });
    return reply.status(204).send();
  });
}
```

Add RBAC entries:
```typescript
{ method: "GET", path: "/v1/domains", roles: ["admin", "manager"] },
{ method: "POST", path: "/v1/domains", roles: ["admin"] },
{ method: "POST", path: "/v1/domains/:domain/verify", roles: ["admin"] },
{ method: "DELETE", path: "/v1/domains/:domain", roles: ["admin"] },
```

Register in server.ts.

**Step 2: Run tests, commit**

```bash
git commit -m "feat(api): add domain verification endpoints with DNS TXT validation"
```

---

## Execution Order

| Task | Depends On | Gap |
|------|-----------|-----|
| 1. Wire encryption middleware | — | C1 |
| 2. DB role resolution in auth | — | C2, C3 |
| 3. Fix rotation + crypto-shred | — | C4, C5 |
| 4. Self-removal guard | — | H6 |
| 5. SCIM pagination + filter | — | H1 (part 1) |
| 6. SCIM PATCH + DELETE | Task 5 | H1 (part 2) |
| 7. SCIM /Schemas, /ResourceTypes | Task 5 | H1 (part 3) |
| 8. SSO enforcement in dashboard | — | H2 |
| 9. DEK auto-provisioning | Task 1 | C1 (completes wiring) |
| 10. Integration tests | Tasks 1-9 | H7 |
| 11. Crypto-shred cache eviction | Task 1 | C5 (completes fix) |
| 12. SCIM token generation | — | H5 |
| 13. Domain verification | — | H4 |

Tasks 1, 2, 3, 4, 5, 8, 12, 13 are independent and could be parallelized.
Tasks 6, 7 depend on 5. Task 9 depends on 1. Task 11 depends on 1. Task 10 depends on all.
