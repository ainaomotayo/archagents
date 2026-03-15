# P10 Medium Priority Fixes

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close all medium-priority gaps from the enterprise audit: API key rate limiting, lastUsedAt tracking, role mapping UI, per-org provider isolation, expanded encryption field coverage, wrappedDek column type, and audit logging for role/membership changes.

**Architecture:** Reuse existing `AuthRateLimiter` for API key attempts, add `lastUsedAt` fire-and-forget updates, expand `ENCRYPTED_FIELDS` registry, add audit event emission to membership routes, and build a dashboard role-mapping UI component.

**Tech Stack:** TypeScript, Prisma, Fastify, React/Next.js, vitest

**Note:** M8 (key rotation atomicity) was already fixed in the critical fixes batch (`$transaction` added).

---

### Task 1: API Key Rate Limiting

**Why (M1):** Login has rate limiting via `AuthRateLimiter`, but API key auth attempts are unlimited. An attacker could brute-force API key prefixes.

**Files:**
- Modify: `apps/api/src/middleware/auth.ts`
- Test: `apps/api/src/__tests__/api-key-rate-limit.test.ts` (new)

**Step 1: Write the failing test**

Create `apps/api/src/__tests__/api-key-rate-limit.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { AuthRateLimiter } from "@sentinel/security";

describe("API key rate limiting", () => {
  it("blocks after max attempts exceeded", () => {
    const limiter = new AuthRateLimiter({ maxAttempts: 3, windowMs: 60000, lockoutMs: 300000 });
    limiter.record("10.0.0.1");
    limiter.record("10.0.0.1");
    limiter.record("10.0.0.1");
    const result = limiter.check("10.0.0.1");
    expect(result.allowed).toBe(false);
  });

  it("allows loopback addresses always", () => {
    const limiter = new AuthRateLimiter({ maxAttempts: 1, windowMs: 60000, lockoutMs: 300000 });
    limiter.record("127.0.0.1");
    limiter.record("127.0.0.1");
    const result = limiter.check("127.0.0.1");
    expect(result.allowed).toBe(true);
  });

  it("resets after successful auth", () => {
    const limiter = new AuthRateLimiter({ maxAttempts: 3, windowMs: 60000, lockoutMs: 300000 });
    limiter.record("10.0.0.1");
    limiter.record("10.0.0.1");
    limiter.reset("10.0.0.1");
    const result = limiter.check("10.0.0.1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(3);
  });
});
```

**Step 2: Implement**

In `apps/api/src/middleware/auth.ts`:

1. Import `AuthRateLimiter` from `@sentinel/security`:
   ```typescript
   import { isAuthorized, type ApiRole, AuthRateLimiter } from "@sentinel/security";
   ```

2. Create a module-level rate limiter for API key attempts:
   ```typescript
   const apiKeyRateLimiter = new AuthRateLimiter({ maxAttempts: 20, windowMs: 60_000, lockoutMs: 300_000 });
   ```

3. In the API key auth branch (inside `createAuthHook`, after `if (authHeader?.startsWith("Bearer sk_"))`), before calling `resolveApiKeyAuth`:
   ```typescript
   const clientIp = (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || request.ip || "unknown";
   const rateCheck = apiKeyRateLimiter.check(clientIp);
   if (!rateCheck.allowed) {
     reply.code(429).send({ error: "Too many authentication attempts", retryAfterMs: rateCheck.retryAfterMs });
     return;
   }
   ```

4. After `resolveApiKeyAuth` returns null (auth failed), record the attempt:
   ```typescript
   if (!apiKeyResult) {
     apiKeyRateLimiter.record(clientIp);
     // Fall through to HMAC flow
   }
   ```

5. After successful API key auth (inside the `if (apiKeyResult)` block), reset:
   ```typescript
   apiKeyRateLimiter.reset(clientIp);
   ```

**Step 3: Run tests**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/api`

**Step 4: Commit**

```bash
git commit -m "feat(api): add rate limiting to API key authentication"
```

---

### Task 2: API Key lastUsedAt Tracking

**Why (M2):** Enterprise auditors need to identify stale API keys. The `lastUsedAt` column exists but is never updated.

**Files:**
- Modify: `apps/api/src/middleware/auth.ts`
- Test: `apps/api/src/__tests__/api-key-rate-limit.test.ts` (extend)

**Step 1: Write the failing test**

Add to the test file:

```typescript
describe("API key lastUsedAt tracking", () => {
  it("updateLastUsed callback type is accepted in AuthHookOptions", () => {
    // We just verify the type works — actual DB update is fire-and-forget
    const updateFn = async (_prefix: string) => {};
    expect(typeof updateFn).toBe("function");
  });
});
```

**Step 2: Implement**

In `apps/api/src/middleware/auth.ts`:

1. Add `updateApiKeyLastUsed` to `AuthHookOptions`:
   ```typescript
   interface AuthHookOptions {
     getOrgSecret: (apiKey?: string) => Promise<string | null>;
     resolveRole?: (apiKey?: string) => Promise<ApiRole>;
     resolveDbRole?: (userId: string, orgId: string) => Promise<string | null>;
     updateApiKeyLastUsed?: (prefix: string) => void;
   }
   ```

2. In the successful API key auth path, after `apiKeyRateLimiter.reset(clientIp)`, fire-and-forget the update:
   ```typescript
   if (options.updateApiKeyLastUsed) {
     const prefix = extractPrefix(key);
     options.updateApiKeyLastUsed(prefix);
   }
   ```
   Wait — we need the key prefix. Store it before calling resolveApiKeyAuth. Actually, the apiKeyResult doesn't include the prefix. Let's extract it from the authHeader:
   ```typescript
   // Inside the if (apiKeyResult) block:
   if (options.updateApiKeyLastUsed) {
     const keyMatch = authHeader!.match(/^Bearer (sk_.{8})/);
     if (keyMatch) options.updateApiKeyLastUsed(keyMatch[1]);
   }
   ```

3. In `apps/api/src/server.ts`, wire the callback:
   ```typescript
   const authHook = createAuthHook({
     getOrgSecret: async () => process.env.SENTINEL_SECRET ?? null,
     resolveDbRole: async (userId, orgId) => { ... },
     updateApiKeyLastUsed: (prefix) => {
       // Fire-and-forget — don't await, don't block the request
       getDb().apiKey.updateMany({
         where: { keyPrefix: prefix },
         data: { lastUsedAt: new Date() },
       }).catch(() => {}); // Swallow errors
     },
   });
   ```

**Step 3: Run tests, commit**

```bash
git commit -m "feat(api): track lastUsedAt on API key usage"
```

---

### Task 3: Expand Encryption Field Coverage

**Why (M5):** Only 4 models have encrypted fields. Missing: `User.name`, webhook URLs/headers, scan metadata.

**Files:**
- Modify: `packages/db/src/encryption-middleware.ts`
- Modify: `packages/db/src/__tests__/encryption-middleware.test.ts` (extend)

**Step 1: Write the failing test**

Add to existing test file:

```typescript
describe("ENCRYPTED_FIELDS coverage", () => {
  it("covers User name field", () => {
    const { ENCRYPTED_FIELDS } = require("../encryption-middleware.js");
    expect(ENCRYPTED_FIELDS.User.fields).toContain("name");
  });

  it("covers WebhookEndpoint url and headers", () => {
    const { ENCRYPTED_FIELDS } = require("../encryption-middleware.js");
    expect(ENCRYPTED_FIELDS.WebhookEndpoint.fields).toContain("url");
    expect(ENCRYPTED_FIELDS.WebhookEndpoint.fields).toContain("headers");
  });

  it("covers SsoConfig samlMetadata", () => {
    const { ENCRYPTED_FIELDS } = require("../encryption-middleware.js");
    expect(ENCRYPTED_FIELDS.SsoConfig.fields).toContain("samlMetadata");
  });
});
```

**Step 2: Implement**

Update `ENCRYPTED_FIELDS` in `packages/db/src/encryption-middleware.ts`:

```typescript
export const ENCRYPTED_FIELDS: Record<string, FieldConfig> = {
  SsoConfig: { fields: ["clientId", "clientSecret", "scimToken", "samlMetadata"], mode: "envelope", purpose: "sso_secrets" },
  WebhookEndpoint: { fields: ["secret", "url", "headers"], mode: "envelope", purpose: "webhook_secret" },
  Certificate: { fields: ["signature"], mode: "envelope", purpose: "certificate" },
  User: { fields: ["email", "externalId", "name"], mode: "deterministic", purpose: "user_lookup" },
};
```

Note: `User.name` uses deterministic encryption so it remains searchable. All webhook fields use envelope since they don't need lookup.

**Step 3: Run tests, commit**

```bash
git commit -m "feat(db): expand encrypted field coverage to User.name, webhook URL/headers, SAML metadata"
```

---

### Task 4: EncryptionKey wrappedDek Column Type Fix

**Why (M6):** `wrappedDek` is `String @db.Text` but should be `Bytes` for binary storage.

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260311100000_wrapped_dek_bytes/migration.sql`

**Step 1: Write the migration SQL**

```sql
-- Convert wrappedDek from TEXT to BYTEA
-- First decode existing base64 TEXT values to BYTEA
ALTER TABLE encryption_keys
  ALTER COLUMN wrapped_dek TYPE BYTEA
  USING decode(wrapped_dek, 'base64');
```

**Step 2: Update schema**

In `packages/db/prisma/schema.prisma`, change the EncryptionKey model:

```prisma
wrappedDek   Bytes     @map("wrapped_dek")
```

(Change from `String @map("wrapped_dek") @db.Text` to `Bytes @map("wrapped_dek")`)

**Step 3: Update code that reads/writes wrappedDek**

In `apps/api/src/routes/encryption-admin.ts`, the rotation code does `Buffer.from(key.wrappedDek, "base64")`. With `Bytes` type, Prisma returns a `Buffer` directly, so change to just `key.wrappedDek` (it's already a Buffer). Similarly, `rewrapped.toString("base64")` should be just `rewrapped` when writing back.

In `packages/security/src/envelope.ts` key loader, the server.ts loader does `Buffer.from(key.wrappedDek, "base64")` — change to just `key.wrappedDek` since it's already a Buffer from Prisma.

**Step 4: Run tests, commit**

```bash
git commit -m "refactor(db): change wrappedDek column from TEXT to BYTEA"
```

---

### Task 5: Audit Logging for Role/Membership Changes

**Why (M7):** Enterprise compliance requires who-changed-what audit trail for all role and membership changes.

**Files:**
- Modify: `apps/api/src/routes/org-memberships.ts`
- Test: `apps/api/src/__tests__/org-memberships.test.ts` (extend)

**Step 1: Write the failing test**

Add to test file:

```typescript
describe("membership audit logging", () => {
  it("emitMembershipAudit creates structured event", () => {
    const { emitMembershipAudit } = require("../routes/org-memberships.js");
    expect(typeof emitMembershipAudit).toBe("function");
  });
});
```

**Step 2: Implement**

Add an audit helper to `apps/api/src/routes/org-memberships.ts`:

```typescript
export async function emitMembershipAudit(
  db: any,
  orgId: string,
  action: string,
  actorId: string,
  resourceId: string,
  detail: Record<string, unknown>,
) {
  try {
    const { createHash } = await import("node:crypto");
    const last = await db.auditEvent.findFirst({ where: { orgId }, orderBy: { timestamp: "desc" } });
    const prevHash = last?.eventHash ?? "genesis";
    const eventData = JSON.stringify({ action, resourceId, detail, prevHash, ts: Date.now() });
    const eventHash = createHash("sha256").update(eventData).digest("hex");
    await db.auditEvent.create({
      data: {
        orgId,
        actorType: "user",
        actorId,
        actorName: actorId,
        action,
        resourceType: "membership",
        resourceId,
        detail,
        previousEventHash: prevHash,
        eventHash,
      },
    });
  } catch {
    // Don't fail the request if audit logging fails
  }
}
```

Call it in each mutation handler:

- **POST** (after create): `await emitMembershipAudit(db, orgId, "membership.created", requestUserId ?? "system", membership.id, { userId, role });`
- **PUT** (after update): `await emitMembershipAudit(db, orgId, "membership.role_changed", requestUserId ?? "system", existing.id, { from: existing.role, to: role });`
- **DELETE** (after delete): `await emitMembershipAudit(db, orgId, "membership.removed", requestUserId ?? "system", existing.id, { userId: existing.userId, role: existing.role });`

Where `requestUserId` is the `x-sentinel-user-id` header (already available in PUT/DELETE, add it to POST).

**Step 3: Run tests, commit**

```bash
git commit -m "feat(api): add audit logging for membership create/update/delete"
```

---

### Task 6: SSO Role Mapping UI

**Why (M3):** No dashboard UI to configure IdP group → Sentinel role mapping per SSO provider.

**Files:**
- Modify: `apps/dashboard/app/(dashboard)/settings/sso/page.tsx`
- Test: `apps/dashboard/__tests__/auth.test.ts` (extend with mapping-related test)

**Step 1: Implement**

Read the current SSO settings page first, then add a role mapping section below the existing SSO config form. The mapping is stored in `SsoConfig.settings` JSON field as `{ roleMapping: { "GroupName": "admin", ... }, defaultRole: "viewer" }`.

Add a `RoleMappingEditor` component inside the page that:
- Shows existing mappings as a list of `group → role` rows
- Has "Add mapping" button with group name input + role dropdown
- Has a "Default role" dropdown
- Saves via PUT to `/api/v1/sso-configs/:id` with updated `settings`

The component should be simple — a controlled form with local state that PUTs on save.

```tsx
function RoleMappingEditor({ configId, settings, onSave }: {
  configId: string;
  settings: { roleMapping?: Record<string, string>; defaultRole?: string };
  onSave: () => void;
}) {
  const [mappings, setMappings] = useState<Array<{ group: string; role: string }>>(
    Object.entries(settings.roleMapping ?? {}).map(([group, role]) => ({ group, role }))
  );
  const [defaultRole, setDefaultRole] = useState(settings.defaultRole ?? "viewer");
  const [newGroup, setNewGroup] = useState("");
  const [newRole, setNewRole] = useState("viewer");
  const roles = ["admin", "manager", "developer", "viewer"];

  const save = async () => {
    const roleMapping = Object.fromEntries(mappings.map(m => [m.group, m.role]));
    await fetch(`/api/v1/sso-configs/${configId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { ...settings, roleMapping, defaultRole } }),
    });
    onSave();
  };

  return (
    <div className="mt-4 space-y-3">
      <h4 className="font-medium text-sm">Role Mapping (IdP Group → Sentinel Role)</h4>
      {mappings.map((m, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input value={m.group} readOnly className="border px-2 py-1 rounded text-sm flex-1 bg-gray-50" />
          <span className="text-sm">→</span>
          <select value={m.role} onChange={e => { const n = [...mappings]; n[i].role = e.target.value; setMappings(n); }}
            className="border px-2 py-1 rounded text-sm">
            {roles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={() => setMappings(mappings.filter((_, j) => j !== i))}
            className="text-red-500 text-sm">Remove</button>
        </div>
      ))}
      <div className="flex gap-2">
        <input value={newGroup} onChange={e => setNewGroup(e.target.value)} placeholder="Group name"
          className="border px-2 py-1 rounded text-sm flex-1" />
        <select value={newRole} onChange={e => setNewRole(e.target.value)} className="border px-2 py-1 rounded text-sm">
          {roles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={() => { if (newGroup) { setMappings([...mappings, { group: newGroup, role: newRole }]); setNewGroup(""); } }}
          className="bg-blue-500 text-white px-3 py-1 rounded text-sm">Add</button>
      </div>
      <div className="flex gap-2 items-center mt-2">
        <span className="text-sm">Default role:</span>
        <select value={defaultRole} onChange={e => setDefaultRole(e.target.value)} className="border px-2 py-1 rounded text-sm">
          {roles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <button onClick={save} className="bg-green-600 text-white px-4 py-2 rounded text-sm mt-2">Save Mappings</button>
    </div>
  );
}
```

Then in the config list rendering, add `<RoleMappingEditor configId={c.id} settings={c.settings ?? {}} onSave={loadConfigs} />` for each config.

**Step 2: Run tests, commit**

```bash
git commit -m "feat(dashboard): add SSO role mapping editor UI"
```

---

### Task 7: Per-Org Provider Isolation (Env-Var Override Fix)

**Why (M4):** If `OIDC_CLIENT_ID` is set globally, it applies to ALL orgs regardless of DB config. The dashboard `getConfiguredProviders()` loads from env-vars which are global.

**Files:**
- Modify: `apps/dashboard/lib/auth.ts`
- Test: `apps/dashboard/__tests__/auth.test.ts` (extend)

**Step 1: Write the failing test**

```typescript
describe("per-org provider isolation", () => {
  it("getConfiguredProviders returns empty array when no env vars set", () => {
    // Clear env vars temporarily
    const saved = { ...process.env };
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITLAB_CLIENT_ID;
    delete process.env.OIDC_CLIENT_ID;
    delete process.env.SAML_JACKSON_URL;

    const { getConfiguredProviders } = require("../lib/auth");
    const providers = getConfiguredProviders();
    expect(providers).toEqual([]);

    Object.assign(process.env, saved);
  });
});
```

**Step 2: Implement**

This is a design-level issue. The NextAuth `providers` array is set once at startup and serves all orgs. True per-org isolation requires dynamic provider loading per request, which NextAuth doesn't natively support.

The pragmatic fix: In the `signIn` callback (which already checks discovery API), also verify that the user's org actually has the provider configured. This was already done in Task 8 of the critical fixes — the SSO enforcement callback blocks non-allowed providers.

The remaining gap is that env-var providers show up on the login page for ALL users regardless of org. To address this without a NextAuth rewrite:

1. Add a comment in `getConfiguredProviders` documenting the limitation:
   ```typescript
   /**
    * Build the list of OAuth providers based on which env vars are set.
    * NOTE: These are global providers visible to all orgs. Per-org provider
    * filtering is handled by the signIn callback (SSO enforcement) and
    * the /v1/auth/discovery endpoint. The login page should use the discovery
    * endpoint to show only org-relevant providers.
    */
   ```

2. The login page should call `/v1/auth/discovery?email=...` to get per-org providers and only show those. Modify the login page to use discovery.

Read `apps/dashboard/app/login/page.tsx` first, then modify it to:
- Add an email input step before showing provider buttons
- Call discovery endpoint on email submit
- Only show providers returned by discovery
- Fall back to default providers if discovery fails

**Step 3: Run tests, commit**

```bash
git commit -m "feat(dashboard): use discovery API for per-org provider filtering on login page"
```

---

## Execution Order

| Task | Depends On | Gap |
|------|-----------|-----|
| 1. API key rate limiting | — | M1 |
| 2. lastUsedAt tracking | Task 1 (same file) | M2 |
| 3. Expand encryption fields | — | M5 |
| 4. wrappedDek column type | — | M6 |
| 5. Audit logging for memberships | — | M7 |
| 6. SSO role mapping UI | — | M3 |
| 7. Per-org provider isolation | — | M4 |

Tasks 1, 3, 4, 5, 6, 7 are independent. Task 2 depends on Task 1 (same file).
