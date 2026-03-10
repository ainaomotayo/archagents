# P3: Operational Maturity — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden SENTINEL's API surface and data lifecycle to enterprise-grade: add policy audit logging, input validation, soft delete with version history, chunked per-org data retention, HashMap RBAC optimization, and dashboard DELETE wiring.

**Architecture:** Enhance existing route handlers with cross-cutting concerns (audit, validation) using Fastify hooks and inline JSON Schema. Add PolicyVersion model for change tracking. Upgrade data retention from bulk delete to chunked per-org. Optimize RBAC from O(n) linear scan to O(1) HashMap lookup.

**Tech Stack:** Fastify JSON Schema (ajv), Prisma, existing `@sentinel/audit` AuditLog, existing `@sentinel/security` RBAC.

---

## Why These Changes

| Gap | Risk Without Fix | Enterprise Requirement |
|-----|-----------------|----------------------|
| No policy audit logging | Compliance audit failure — mutations invisible | SOC2 CC7.2, ISO 27001 A.12.4 |
| No input validation | Garbage data, Prisma errors leak internals | OWASP API Security Top 10 |
| Hard delete only | No recovery, legal hold impossible | Data governance, eDiscovery |
| No version history | "Who changed what" unanswerable | Change management audit trail |
| Bulk delete locks tables | Multi-second query locks at scale | SLA compliance (99.9% uptime) |
| Fixed 90-day retention | Can't meet per-customer SLAs | Multi-tenant flexibility |
| O(n) RBAC lookup | Negligible now, technical debt at scale | Performance engineering |
| No apiDelete() | Dashboard can't delete policies | Feature completeness |

---

## 3 Enterprise Approaches Evaluated

### Algorithms & Data Structures — RBAC Authorization

**A. Flat Array + Linear Scan (Current)** — `Array.find()` O(n), n=31. Works at current scale, degrades at 1000+ permissions.

**B. Trie-Based Path Matching** — O(d) where d=URL depth. Supports wildcards. Overkill — SENTINEL doesn't need wildcard path patterns since Fastify provides normalized route patterns.

**C. HashMap Composite Key (Chosen)** — `Map<"METHOD:/path", Set<role>>` built at startup. O(1) average lookup. Dead simple, handles 100K+ entries.

**Hybrid verdict: Not needed.** HashMap gives O(1) with trivial implementation. Trie adds complexity without benefit at SENTINEL's scale.

### System Design — Code Organization

**A. Monolithic Enhancement** — Add everything to server.ts. Low cost, but file heading toward 700+ lines.

**B. Domain-Separated Route Modules (Chosen base)** — Extract policy routes into dedicated module with own validation and audit hooks.

**C. Event-Sourced CQRS** — Policy changes as events, current state as projection. Overkill for 4 CRUD operations.

**Hybrid verdict: B + selective C elements.** Domain-separated modules for clean organization, plus a PolicyVersion table (borrowed from event-sourcing) for change history without full CQRS infrastructure.

### Software Design Patterns

**A. Procedural Handlers (Current)** — Inline everything. Easy to read but duplicates audit/validation logic.

**B. Layered Service Architecture (Chosen base)** — Route handlers call Prisma directly (Prisma IS the repository), with cross-cutting concerns in hooks.

**C. Decorator/Plugin Composition** — Fastify plugin decorators for each concern. Too abstract for current team size.

**Hybrid verdict: B + Fastify hooks from C.** Keep Prisma direct access in handlers, use `onResponse` hooks for audit logging, use Fastify's built-in JSON Schema for validation.

### Data Retention Architecture

**A. Fixed-Window Bulk Delete (Current)** — One `deleteMany()` per table. Locks tables at scale.

**B. Chunked Delete + Per-Org Config (Chosen)** — Process 1000 records per batch. Read retention days from `Organization.settings`.

**C. Archive-Then-Delete** — Serialize to cloud storage before delete. Full recoverability but doubles complexity.

**Hybrid verdict: Not needed now.** Chunked + per-org solves real problems (table locks, multi-tenant flexibility) without archive complexity. Archive is a future enhancement when customers require 7-year cold retention.

---

## Component Design

### 1. Policy Audit Logging

Add `auditLog.append()` to POST, PUT, DELETE handlers in server.ts, following the certificate revocation pattern (server.ts:307-312):

```typescript
await auditLog.append(orgId, {
  actor: { type: "api", id: role, name: "API" },
  action: "policy.created" | "policy.updated" | "policy.deleted",
  resource: { type: "policy", id: policy.id },
  detail: { name: policy.name, version: policy.version },
});
```

### 2. Policy Input Validation

Use Fastify's built-in JSON Schema validation (compiled to optimized validators at startup via ajv):

```typescript
schema: {
  body: {
    type: "object",
    required: ["name", "rules"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      rules: { type: "array", items: { type: "object" } },
      projectId: { type: "string", format: "uuid" },
    },
    additionalProperties: false,
  },
}
```

Applied to POST and PUT routes. Fastify returns 400 with validation errors automatically.

### 3. Dashboard apiDelete()

Add to `apps/dashboard/lib/api-client.ts` following existing apiPost/apiPut pattern:

```typescript
export async function apiDelete(path: string, extraHeaders?: Record<string, string>): Promise<void>
```

Signs empty body with HMAC. Returns void (204 No Content).

### 4. Soft Delete for Policies

Add `deletedAt DateTime?` to Policy model. DELETE handler sets timestamp instead of removing row. All read queries filter `deletedAt: null`.

### 5. Policy Version History

New `PolicyVersion` model stores snapshot before each mutation:

```prisma
model PolicyVersion {
  id         String   @id @default(uuid()) @db.Uuid
  policyId   String   @map("policy_id") @db.Uuid
  version    Int
  name       String
  rules      Json
  changedBy  String   @map("changed_by")
  changedAt  DateTime @default(now()) @map("changed_at")
  changeType String   @map("change_type")  // "created" | "updated" | "deleted"

  policy Policy @relation(fields: [policyId], references: [id])

  @@index([policyId, version])
  @@map("policy_versions")
}
```

New endpoint: `GET /v1/policies/:id/versions` returns version timeline.

### 6. Chunked Per-Org Retention

Replace bulk `deleteMany()` with cursor-based chunked deletion (1000 per batch). Read per-org retention from `Organization.settings.retentionDays`. Scheduler iterates all organizations.

### 7. HashMap RBAC

Build `Map<string, Set<ApiRole>>` at module load. `isAuthorized()` becomes single hash lookup + set membership check.

---

## Data Flow

```
Dashboard Policy CRUD
      |
      v
apiGet/apiPost/apiPut/apiDelete (api-client.ts)
      |
      v
Fastify Route (schema validation -> authHook -> handler)
      |
      +-- Before mutation: save PolicyVersion snapshot
      +-- Execute mutation (create/update/soft-delete)
      +-- After mutation: auditLog.append()
      +-- Return response

Scheduler (daily 4 AM)
      |
      v
For each Organization:
  org.settings.retentionDays ?? 90
      |
      v
  chunkedDelete(findings, cutoff, 1000)
  chunkedDelete(agentResults, cutoff, 1000)
  chunkedDelete(scans, cutoff, 1000)  [WHERE certificate IS NULL]
```

## Schema Changes

One Prisma migration:
1. Add `deleted_at` nullable column to `policies` table
2. Create `policy_versions` table
3. Add RBAC entry for `GET /v1/policies/:id/versions`
4. No data migration — existing policies have `deleted_at = NULL` (active)

## Error Handling

| Failure | Behavior | Recovery |
|---------|----------|----------|
| Validation failure | 400 with ajv error details | Client fixes input |
| Audit log write fails | Log error, DO NOT fail the mutation | Async retry or alert |
| Version snapshot fails | Log error, proceed with mutation | Version gap is tolerable |
| Chunked delete batch fails | Stop iteration, log progress | Next cron run picks up remaining |
| Per-org settings missing | Fall back to DEFAULT_RETENTION_DAYS (90) | Auto-recovers |

## Testing Strategy

| Component | Tests | Type |
|-----------|-------|------|
| Policy audit logging | 3 | Integration (verify audit event created) |
| Policy validation | 4 | Unit (valid/invalid bodies) |
| apiDelete() | 2 | Unit (success + error) |
| Soft delete | 3 | Integration (delete, verify hidden, verify in DB) |
| PolicyVersion | 4 | Integration (create/update/delete snapshots + list) |
| Chunked retention | 3 | Unit (chunking, per-org config, fallback) |
| HashMap RBAC | 2 | Unit (O(1) lookup, unknown paths) |

Estimated: ~21 test cases, ~400 lines of test code.

## File Impact

| File | Action | Est. Lines |
|------|--------|-----------|
| `packages/security/src/rbac.ts` | Modify | ~15 |
| `packages/security/src/data-retention.ts` | Modify | ~40 |
| `packages/db/prisma/schema.prisma` | Modify | ~15 |
| `apps/api/src/server.ts` | Modify | ~60 |
| `apps/dashboard/lib/api-client.ts` | Modify | ~20 |
| New test files | Create | ~400 |

No new services, no new dependencies, no new Docker containers.
