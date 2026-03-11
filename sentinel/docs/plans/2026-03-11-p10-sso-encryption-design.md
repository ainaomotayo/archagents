# P10: Enterprise SSO + Encryption at Rest — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create implementation plan from this design.

**Goal:** Add enterprise-grade OIDC/SAML SSO with per-org provider configuration, SCIM provisioning, database-backed RBAC, and envelope encryption at rest for all sensitive data — supporting both SaaS and self-hosted deployments.

**Architecture:** Embedded auth with shared library (SaaS-first) + optional sidecar proxy for self-hosted. Envelope encryption (DEK/KEK hierarchy) with pluggable KMS backends. Strategy pattern for provider/KMS selection, layered middleware for request lifecycle.

**Tech Stack:** NextAuth.js (OIDC/SAML via BoxyHQ Jackson), PBKDF2-HMAC-SHA256 (API key hashing), AES-256-GCM (envelope encryption), SIV-AES (deterministic encryption for lookups), Prisma middleware (transparent field encryption), AWS KMS / GCP Cloud KMS / Azure Key Vault / HashiCorp Vault / Local file-based.

---

## Table of Contents

1. [Context & Motivation](#1-context--motivation)
2. [Approach Analysis](#2-approach-analysis)
3. [Architecture Overview](#3-architecture-overview)
4. [Database Schema Changes](#4-database-schema-changes)
5. [Encryption at Rest — Component Design](#5-encryption-at-rest--component-design)
6. [SSO Component Design](#6-sso-component-design)
7. [Testing Strategy](#7-testing-strategy)
8. [Error Handling](#8-error-handling)
9. [Migration & Backward Compatibility](#9-migration--backward-compatibility)

---

## 1. Context & Motivation

### Current State

- **Dashboard auth:** NextAuth.js with GitHub, GitLab, OIDC, SAML (BoxyHQ Jackson) — providers configured via env vars
- **API auth:** Single shared `SENTINEL_SECRET` for HMAC-SHA256 request signing
- **RBAC:** 5 roles (admin, manager, developer, viewer, service) mapped via `SENTINEL_ROLE_MAP` env var
- **Encryption:** `packages/security/src/kms.ts` has AES-256-GCM + KMS stubs (AWS, GCP, Azure) but nothing wired
- **Secrets storage:** Webhook secrets, certificate signatures stored as plaintext in PostgreSQL

### Why This Matters

- Every Fortune 500 enterprise requires OIDC/SAML SSO — GitHub OAuth alone is a dealbreaker
- SOC 2, HIPAA, GDPR all mandate encryption at rest for sensitive data
- Per-org key management enables crypto-shredding (GDPR right to erasure)
- Database-backed RBAC is required for SCIM provisioning from enterprise IdPs
- Self-hosted customers need pluggable KMS (HashiCorp Vault, not just cloud KMS)

### Deployment Model

**Multi-deployment (C):** SaaS-first but must support self-hosted for regulated industries. This means:
- Cloud KMS (AWS/GCP/Azure) for SaaS
- HashiCorp Vault + local file-based keys for self-hosted
- Pluggable KMS abstraction that works across all

---

## 2. Approach Analysis

### 2.1 Algorithms & Data Structures

Three approaches evaluated for key management and token security:

#### Approach A: Single-Layer Direct Encryption (AES-256-GCM + PBKDF2)

One master key per org derived via PBKDF2 from root secret. All columns encrypted directly.

| Criterion | Rating | Justification |
|---|---|---|
| Performance | High | Single encrypt/decrypt per field, no key unwrap hop |
| Scalability | Low | Key rotation requires re-encrypting ALL rows |
| Security | Medium | Single key compromise exposes entire org |
| Complexity | Low | Straightforward implementation |
| Key rotation | Poor | Full table scan on rotation |

#### Approach B: Envelope Encryption (DEK/KEK Hierarchy)

Two-layer key hierarchy. KEK in KMS wraps per-record DEKs. Rotation only re-wraps DEKs.

| Criterion | Rating | Justification |
|---|---|---|
| Performance | Medium | Extra KMS call to unwrap DEK (cacheable) |
| Scalability | High | Key rotation is O(DEKs) not O(rows*fields) |
| Security | High | Compromised DEK exposes one record, not all |
| Complexity | Medium | Two-layer management, DEK caching needed |
| Key rotation | Excellent | Re-wrap DEKs only, no data re-encryption |

#### Approach C: Convergent Encryption (Deterministic + Searchable)

SIV-AES for deterministic encryption enabling encrypted column indexing and search. Combined with envelope for non-searchable fields.

| Criterion | Rating | Justification |
|---|---|---|
| Performance | Medium | SIV mode adds one extra AES pass |
| Scalability | High | Searchable without decrypting all rows |
| Security | Medium-High | Deterministic mode leaks equality (by design) |
| Complexity | High | Two encryption modes, careful field classification |
| Key rotation | Good | Same as envelope + re-index searchable fields |

#### Verdict: Hybrid B + selective C

**Envelope encryption (B)** for all secrets at rest. **Deterministic SIV-AES (C)** only for the 2-3 fields needing lookup (email, externalId). Everything else uses standard envelope encryption.

- **Why not pure B:** Can't search encrypted email/slug without decrypting all rows — O(n) table scan on every login.
- **Why not pure C:** Deterministic encryption leaks equality patterns. Applying to all fields weakens security.
- **Why not A:** Key rotation requires re-encrypting millions of rows. Dealbreaker at enterprise scale.

### 2.2 System Design

Three approaches for SSO + encryption across the stack:

#### Approach A: Centralized Auth Gateway

Dedicated auth service handles all authentication, token issuance, and key management.

| Criterion | Rating | Justification |
|---|---|---|
| Performance | Medium | Extra network hop for every auth check |
| Scalability | High | Auth service scales independently |
| Reliability | Medium | Single point of failure |
| Complexity | High | New service to deploy, monitor, maintain |
| Self-hosted | Good | Gateway bundles all auth logic |

#### Approach B: Embedded Auth with Shared Library

Auth logic in shared package (`packages/auth`) imported by dashboard and API. No separate service.

| Criterion | Rating | Justification |
|---|---|---|
| Performance | High | No extra network hop, in-process auth |
| Scalability | Medium | Auth scales with each service |
| Reliability | High | No SPOF — each service handles its own auth |
| Complexity | Low | Extends existing architecture |
| Self-hosted | Good | No extra service to deploy |

#### Approach C: Sidecar Auth Proxy (Envoy/OAuth2-Proxy)

Auth proxy in front of all services, handling SSO validation and injecting identity headers.

| Criterion | Rating | Justification |
|---|---|---|
| Performance | Medium | Extra proxy hop but highly optimized |
| Scalability | High | Proxy is stateless, scales horizontally |
| Reliability | Medium | Proxy failure blocks all traffic |
| Complexity | Medium | Extra infra component |
| Self-hosted | Excellent | Customer can swap for their own proxy |

#### Verdict: Hybrid B + optional C for self-hosted

**Embedded auth (B)** for SaaS — simpler, faster, no SPOF. Optional **sidecar mode (C)** for self-hosted customers with existing identity meshes (Istio, Envoy).

- **Why not pure A:** Separate auth gateway adds operational complexity and SPOF. Over-engineering for current scale.
- **Why not pure C:** Forces SaaS to run extra proxy. OAuth2-Proxy doesn't support HMAC for CLI/agent auth.
- **Why not pure B:** Self-hosted enterprises with identity meshes expect proxy-based integration.

### 2.3 Software Design

Three approaches for code structure:

#### Approach A: Strategy Pattern (Provider Registry)

Each auth provider and KMS backend implements a common interface. Registry maps names to implementations.

| Criterion | Rating | Justification |
|---|---|---|
| Extensibility | High | New providers added without modifying core |
| Testability | High | Mock any provider/KMS in tests |
| Complexity | Low | Well-understood OOP pattern |
| Type safety | Medium | Runtime registry |
| Configuration | Simple | Env-var based selection |

#### Approach B: Plugin Architecture (Dynamic Loading)

Auth providers and KMS backends as separate npm packages loaded dynamically. Third-party plugins possible.

| Criterion | Rating | Justification |
|---|---|---|
| Extensibility | Very High | Third-party plugins possible |
| Testability | Medium | Plugin loading adds complexity |
| Complexity | High | Package management, versioning |
| Type safety | Low | Dynamic imports lose type checking |
| Configuration | Complex | Plugin discovery, version pinning |

#### Approach C: Layered Service Architecture (DI + Middleware)

Auth and encryption as middleware layers in a DI container. Middleware chain: Rate Limit -> Auth -> Tenant -> Encryption -> Handler.

| Criterion | Rating | Justification |
|---|---|---|
| Extensibility | High | New layers slotted into chain |
| Testability | Very High | Each layer tested in isolation |
| Complexity | Medium | DI container adds indirection |
| Type safety | High | Compile-time interface verification |
| Configuration | Medium | Strongly typed DI config |

#### Verdict: Hybrid A + C (no plugin architecture)

**Strategy pattern (A)** for provider/KMS registries. **Layered middleware (C)** for request pipeline. Strategy picks *which* provider; middleware decides *when and how* auth and encryption run.

- **Why not B:** Dynamic loading adds security risks and version matrices. Sentinel has a finite set of providers — compile-time selection is sufficient and safer.
- **Why not pure A:** Doesn't address request lifecycle ordering.
- **Why not pure C:** DI alone doesn't give clean backend addition. Strategy's interface contract is more explicit.

### Hybrid Summary

| Category | Hybrid Approach | Key Reasoning |
|---|---|---|
| **Algorithms/DSA** | Envelope (DEK/KEK) + Convergent (SIV-AES) for lookups | Envelope for secrets; deterministic only for email/slug. Rotation without re-encryption. |
| **System Design** | Embedded Auth + optional Sidecar for self-hosted | SaaS uses embedded (no SPOF). Self-hosted can optionally use proxy. |
| **Software Design** | Strategy Pattern + Layered Middleware | Strategy for provider/KMS selection. Middleware for request lifecycle. |

---

## 3. Architecture Overview

### System Diagram

```
                    +---------------------------------------+
                    |         IDENTITY LAYER                 |
                    |                                        |
  Browser --------> |  NextAuth.js (Dashboard)               |
                    |  +- GitHub OAuth                       |
                    |  +- GitLab OAuth                       |
                    |  +- Generic OIDC (Okta/Azure/Auth0)    |
                    |  +- SAML (BoxyHQ Jackson)              |
                    |  +- Local (email/password)             |
                    |                                        |
  CLI/Agents -----> |  HMAC-SHA256 (API)                     |
                    |  +- Per-org API keys (encrypted)       |
                    |                                        |
  SCIM Provider --> |  SCIM 2.0 Endpoint (API)               |
                    |  +- Auto-provision users/groups        |
                    +------------------+--------------------+
                                       |
                    +------------------v--------------------+
                    |       TENANT RESOLUTION                |
                    |                                        |
                    |  1. Extract identity (JWT/HMAC)        |
                    |  2. Resolve org membership             |
                    |  3. Load org SSO config from DB        |
                    |  4. Enforce RBAC (DB-backed roles)     |
                    |  5. Set PostgreSQL app.current_org_id  |
                    +------------------+--------------------+
                                       |
                    +------------------v--------------------+
                    |       ENCRYPTION LAYER                 |
                    |                                        |
                    |  KEK (in KMS) --> DEK (wrapped, in DB) |
                    |                                        |
                    |  KMS Backend (Strategy Pattern):       |
                    |  +- AWS KMS                            |
                    |  +- GCP Cloud KMS                      |
                    |  +- Azure Key Vault                    |
                    |  +- HashiCorp Vault                    |
                    |  +- Local (file-based, dev only)       |
                    +---------------------------------------+
```

### Key Design Decisions

| Decision | Choice | Why |
|---|---|---|
| SSO config storage | Per-org in DB (not env vars) | Enterprise customers configure their own IdP per org |
| Role persistence | Database `OrgMembership` table | Env-var `SENTINEL_ROLE_MAP` kept as fallback for dev |
| Session strategy | JWT (signed + encrypted via JWE) | Stateless, no session store needed, encrypted claims |
| KMS abstraction | Strategy pattern in `packages/security` | Already has AWS/GCP stubs; add Vault + local |
| Encrypted columns | Prisma middleware intercepts read/write | Transparent to application code |
| DEK caching | In-memory LRU with TTL (5 min, 256 entries) | Avoids KMS call on every DB read |
| SCIM | `/v1/scim/v2/` endpoints on API | Standard provisioning for Okta/Azure AD/OneLogin |
| Key rotation | Re-wrap DEKs only (no data re-encryption) | O(DEKs) not O(rows), zero-downtime rotation |
| API keys | Per-org, PBKDF2-SHA256 hashed (200k iterations) | NIST SP 800-132 compliant, replaces single shared secret |

### What Changes vs Current State

| Component | Current | After |
|---|---|---|
| `packages/auth` | HMAC signing only | + Per-org API key management, key rotation |
| `packages/security` | AES-256-GCM + KMS stubs | Full envelope encryption, Vault backend, DEK cache |
| `packages/db` | Plain Prisma client | + Encryption middleware for sensitive columns |
| `apps/dashboard` | NextAuth with env-var providers | + DB-backed SSO config, JWE sessions, SCIM admin UI |
| `apps/api` | Single `SENTINEL_SECRET` | + Per-org secrets, encrypted at rest, SCIM endpoints |
| Schema | `User` table with `role` field | + `OrgMembership`, `SsoConfig`, `EncryptionKey`, `ApiKey`, `ScimSyncState` |

---

## 4. Database Schema Changes

### New Tables

**SsoConfig** — Per-org SSO provider configuration (replaces env-var providers):

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | UUID FK | Organization |
| `provider` | String | "github" / "gitlab" / "oidc" / "saml" |
| `display_name` | String | Shown on login page |
| `client_id` | String | Encrypted at rest (AES-256-GCM) |
| `client_secret` | String | Encrypted at rest (AES-256-GCM) |
| `issuer_url` | String? | OIDC well-known URL |
| `saml_metadata` | String? | SAML IdP XML metadata |
| `scim_token` | String? | Encrypted at rest (AES-256-GCM) |
| `enabled` | Boolean | Default true |
| `enforced` | Boolean | If true, only this provider allowed for org |
| UNIQUE | `(org_id, provider)` | One config per provider per org |

**OrgMembership** — Database-backed RBAC (replaces SENTINEL_ROLE_MAP env var):

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | UUID FK | Organization |
| `user_id` | UUID FK | User |
| `role` | String | admin / manager / developer / viewer / service |
| `source` | String | "manual" / "scim" / "saml_mapping" / "oidc_claim" |
| UNIQUE | `(org_id, user_id)` | One membership per user per org |

**EncryptionKey** — Envelope encryption key registry:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | UUID FK | Organization |
| `purpose` | String | "data" / "api_secret" / "webhook_secret" / "certificate" |
| `wrapped_dek` | String | DEK encrypted by KEK |
| `kek_id` | String | Reference to KEK in KMS |
| `kek_provider` | String | "aws" / "gcp" / "azure" / "vault" / "local" |
| `version` | Int | Incremented on rotation |
| `active` | Boolean | Only active key used for new encryption |
| INDEX | `(org_id, purpose, active)` | Fast DEK lookup |

**ApiKey** — Per-org API keys (replaces single SENTINEL_SECRET):

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | UUID FK | Organization |
| `name` | String | Human-readable label |
| `key_hash` | String | PBKDF2-SHA256 hash (200k iterations) |
| `key_salt` | String | 128-bit random salt |
| `key_prefix` | String | First 8 chars for identification (e.g., `sk_a1b2c`) |
| `role` | String | Role assigned to requests using this key |
| `expires_at` | DateTime? | Optional expiration |
| `last_used_at` | DateTime? | Updated on each use |
| `revoked_at` | DateTime? | Soft-revoke (null = active) |
| INDEX | `(key_prefix)` | Fast lookup by prefix |

**ScimSyncState** — SCIM provisioning sync tracking:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | UUID FK | UNIQUE per org |
| `last_sync_at` | DateTime | Last successful sync |
| `users_created` | Int | Counter |
| `users_updated` | Int | Counter |
| `users_deleted` | Int | Counter |
| `status` | String | "idle" / "syncing" / "error" |
| `error_detail` | String? | Last error message |

### Modified Tables

**User** — Added fields:

| Column | Type | Notes |
|---|---|---|
| `email_verified` | Boolean | Default false |
| `external_id` | String? | IdP subject ID (OIDC sub / SAML nameId) |
| `last_login_at` | DateTime? | Tracks activity |
| `email` | String | NOW: SIV-AES deterministic encrypted (was plaintext) |
| `external_id` | String? | NOW: SIV-AES deterministic encrypted |

**WebhookEndpoint** — `secret` column NOW encrypted at rest via Prisma middleware (was plaintext).

**Certificate** — `signature` column NOW encrypted at rest via Prisma middleware (was plaintext).

### Fields Encrypted at Rest

| Table | Column | Mode | Why |
|---|---|---|---|
| `SsoConfig` | `clientId`, `clientSecret`, `scimToken` | Envelope (AES-256-GCM) | OAuth/SAML credentials |
| `WebhookEndpoint` | `secret` | Envelope (AES-256-GCM) | Webhook signing secrets |
| `Certificate` | `signature` | Envelope (AES-256-GCM) | Certificate HMAC signature |
| `User` | `email` | SIV-AES (deterministic) | Needs lookup for SSO matching |
| `User` | `externalId` | SIV-AES (deterministic) | Needs lookup for SCIM matching |

### Role Resolution Priority

```
1. OrgMembership table (DB-backed, highest priority)
2. SAML role attribute mapping (from IdP assertion)
3. OIDC claim mapping (from id_token groups/roles)
4. SENTINEL_ROLE_MAP env var (fallback for dev/migration)
5. Default: "viewer"
```

---

## 5. Encryption at Rest — Component Design

### Envelope Encryption Flow

```
WRITE PATH:
  App data --> Prisma Middleware --> DEK Cache (LRU, 5min TTL)
                    |                    |
                    | cache miss         | cache hit
                    v                    v
              KMS Backend ---------> AES-256-GCM encrypt
              (unwrap DEK)           (12-byte IV + authTag)
                                         |
                                         v
                                   base64(iv + authTag + ciphertext)
                                   stored in PostgreSQL

READ PATH:
  PostgreSQL --> Prisma Middleware --> DEK Cache lookup
                      |                    |
                      | cache miss         | cache hit
                      v                    v
               KMS unwrap DEK -------> AES-256-GCM decrypt
                                         |
                                         v
                                   Plaintext returned to app
```

### KMS Provider Interface

```typescript
// packages/security/src/kms-provider.ts
interface KmsProvider {
  readonly name: string;
  generateDataKey(kekId: string): Promise<{ plaintext: Buffer; wrapped: Buffer }>;
  unwrapDataKey(kekId: string, wrappedDek: Buffer): Promise<Buffer>;
  rewrapDataKey(kekId: string, wrappedDek: Buffer): Promise<Buffer>;
  ping(): Promise<boolean>;
}
```

### Five Backend Implementations

| Backend | SaaS | Self-Hosted | KEK Storage |
|---|---|---|---|
| `AwsKmsProvider` | Primary | Optional | AWS KMS key ARN |
| `GcpKmsProvider` | Primary | Optional | GCP key resource name |
| `AzureKmsProvider` | Secondary | Optional | Azure Key Vault key ID |
| `VaultKmsProvider` | No | Primary | Vault transit engine path |
| `LocalKmsProvider` | No | Dev only | File-based master key (RFC 3394 key-wrap) |

### DEK Cache

In-memory LRU cache with 5-minute TTL, max 256 entries. Keyed by `orgId:purpose`.

- **Why in-memory, not Redis:** DEKs are plaintext key material. In-process memory is safer — process death auto-clears.
- **Why 5-minute TTL:** Balances KMS cost (~$0.03/10K calls) and latency (5-20ms) vs rotation responsiveness.
- **Eviction:** `evict(orgId)` called on key rotation to force fresh KMS unwrap.

### Prisma Encryption Middleware

Transparent field-level encryption at the ORM layer:

```typescript
// packages/db/src/encryption-middleware.ts
const ENCRYPTED_FIELDS = {
  SsoConfig:       { fields: ["clientId", "clientSecret", "scimToken"], mode: "envelope" },
  WebhookEndpoint: { fields: ["secret"], mode: "envelope" },
  Certificate:     { fields: ["signature"], mode: "envelope" },
  User:            { fields: ["email", "externalId"], mode: "deterministic" },
};
```

Middleware intercepts `create`, `update`, `upsert` (encrypt before write) and all read operations (decrypt after read). Non-sensitive fields pass through untouched.

**Why Prisma middleware (not Postgres TDE):**
- Postgres TDE encrypts entire tablespaces, not individual columns
- Per-org KEK isolation requires application-layer key routing
- Self-hosted customers on managed Postgres (RDS, Cloud SQL) have limited TDE control
- Transparent to all existing application code — zero refactoring

### Key Rotation

```
1. KMS creates new KEK version
2. SELECT id, wrapped_dek, kek_id FROM encryption_keys WHERE org_id = ? AND active = true
3. For each DEK: unwrap with OLD KEK, re-wrap with NEW KEK, UPDATE row
4. Evict DEK cache for org
5. Audit log: "encryption_key_rotated"
```

**Zero-downtime:** Data columns untouched. O(DEKs per org) which is ~5 (one per purpose).

### Crypto-Shredding (Tenant Offboarding)

```
1. DELETE KEK from KMS (ScheduleKeyDeletion with 7-day waiting period)
2. DELETE FROM encryption_keys WHERE org_id = ?
3. Evict DEK cache
4. Audit log: "org_crypto_shred"
5. After 7-day KMS waiting period: all org data permanently unrecoverable
```

---

## 6. SSO Component Design

### SSO Discovery Endpoint

Users type email, Sentinel routes to correct IdP:

```
GET /v1/auth/discovery?email=alice@acme.com

1. Extract domain: "acme.com"
2. Lookup org by verified domain in settings
3. If found: return org's SSO providers (name/type only, NO secrets)
4. If not found: return default providers (GitHub, etc.)
5. If org has enforced=true: return ONLY org's provider
```

### Per-Org SSO Configuration

Org admins configure their IdP from the dashboard (Settings > SSO Configuration):
- Select provider type (OIDC, SAML, GitHub, GitLab)
- Enter IdP credentials (encrypted at rest via Prisma middleware)
- Set verified email domains
- Configure role mapping (IdP groups -> Sentinel roles)
- Test connection before saving
- Toggle enforcement (block all other providers for org)

### Dynamic NextAuth Provider Loading

Providers loaded from DB at auth time instead of hardcoded env vars:

```typescript
async function getProvidersForOrg(orgId: string | null): Provider[] {
  const providers = [...getDefaultProviders()];  // Env-var based (SaaS login)

  if (!orgId) return providers;

  const ssoConfigs = await prisma.ssoConfig.findMany({
    where: { orgId, enabled: true },
  });

  for (const config of ssoConfigs) {
    // Build provider from DB config (secrets decrypted by Prisma middleware)
    providers.push(buildProvider(config));
  }

  return providers;
}
```

### SCIM 2.0 Provisioning

6 endpoints on API for automatic user lifecycle management:

| Method | Path | Action |
|---|---|---|
| GET | `/v1/scim/v2/Users` | List/filter users for org |
| POST | `/v1/scim/v2/Users` | Create user + org membership |
| GET | `/v1/scim/v2/Users/:id` | Get user details |
| PUT | `/v1/scim/v2/Users/:id` | Replace user (full update) |
| PATCH | `/v1/scim/v2/Users/:id` | Partial update (activate/deactivate) |
| GET | `/v1/scim/v2/ServiceProviderConfig` | SCIM capabilities discovery |

SCIM bearer token validated against `SsoConfig.scimToken` (encrypted at rest). Group memberships mapped to Sentinel roles via org's role mapping configuration.

### JWE Session Upgrade

Current JWT (signed, readable claims) upgraded to JWE (signed + encrypted):

```typescript
jwt: {
  async encode({ token, secret }) { return encryptJwe(token, secret); },
  async decode({ token, secret }) { return decryptJwe(token, secret); },
}
```

Claims (role, org, email) become opaque even if cookie is intercepted.

### Per-Org API Keys

Replace single `SENTINEL_SECRET` with per-org generated keys:

```
1. Generate 32 random bytes -> base64url -> prefix "sk_"
2. Show full key to user ONCE
3. Hash: PBKDF2-HMAC-SHA256(key, random_salt, 200k iterations)
4. Store: keyHash + keySalt + keyPrefix in ApiKey table
5. On request: extract key -> lookup by prefix -> PBKDF2 verify (constant-time)
```

### Auth Middleware Chain (Fastify)

```
Request --> Rate Limiter (sliding window, per-IP)
        --> Auth Resolution
            +- X-Sentinel-Signature? -> HMAC verify (existing, backward compat)
            +- Authorization: Bearer sk_...? -> API Key lookup + PBKDF2 verify
            +- Session cookie? -> JWE decrypt -> JWT verify
            +- SCIM Bearer? -> SCIM token verify against SsoConfig
        --> Tenant Resolution
            +- Extract orgId from auth context
            +- Load OrgMembership for role
            +- SET app.current_org_id (PostgreSQL)
        --> RBAC Enforcement (route + method vs role)
        --> Route Handler (Prisma auto-encrypts/decrypts)
```

**Backward compatibility:** Existing HMAC signing continues to work. API keys are additive. Orgs without SSO config use default providers.

---

## 7. Testing Strategy

### Test Pyramid

- **Unit tests (~35):** Encrypt/decrypt, key rotation, role resolution, token hashing, discovery, JWE
- **Integration tests (~18):** KMS backends, Prisma middleware, SCIM provisioning
- **E2E tests (~6):** Full SSO flow, API key auth, encrypted DB round-trip, key rotation

### Unit Tests (~35)

**Encryption core** (12 tests): Round-trip encrypt/decrypt, IV randomness, tamper detection (ciphertext, auth tag, wrong key), DEK cache (hit, TTL expiry, eviction), envelope wrap/unwrap, SIV-AES deterministic, key rotation re-wrap.

**API key hashing** (6 tests): PBKDF2 round-trip, wrong key rejection, constant-time comparison, 200k iterations enforced, unique salt per key, prefix extraction.

**Role resolution** (8 tests): OrgMembership priority, SAML group mapping, OIDC claim mapping, env-var fallback, default viewer, case-insensitive email, multi-org roles, deactivated membership rejection.

**SSO discovery** (5 tests): Known domain returns org providers, unknown domain returns defaults, enforced SSO blocks defaults, disabled provider excluded, no secret leakage.

**JWE session** (4 tests): Encode/decode round-trip, expired token rejection, tampered token rejection, wrong secret rejection.

### Integration Tests (~18)

**KMS backends** (10 tests, 2 per backend): `generateDataKey` + `unwrapDataKey` for Local, AWS (mocked), GCP (mocked), Vault (mocked), Azure (mocked).

**Prisma middleware** (5 tests): Create encrypts, read decrypts, update re-encrypts, non-sensitive untouched, deterministic lookup works.

**SCIM provisioning** (3 tests): Create user + membership, deactivate revokes sessions, group change updates role.

### E2E Tests (~6)

| Test | Flow |
|---|---|
| SSO discovery routing | Create org with SsoConfig -> discovery returns it -> no secrets leaked |
| API key auth end-to-end | Generate key -> submit scan -> findings returned |
| API key revocation | Revoke key -> subsequent request returns 401 |
| Encrypted field round-trip | Create webhook -> read back -> secret matches (transparent decryption) |
| Key rotation continuity | Write data -> rotate KEK -> read data -> still decrypts |
| SCIM user provisioning | POST SCIM user -> user authenticates -> correct role |

---

## 8. Error Handling

### Encryption Failures

| Scenario | Behavior | Why |
|---|---|---|
| KMS unreachable | 503 + `Retry-After: 30` | Never serve unencrypted data |
| DEK unwrap fails | Evict cache, retry once from KMS | Handles cache corruption |
| DEK unwrap retry fails | 500 + alert | Key deletion or KMS corruption |
| Corrupted ciphertext | Log record ID, return 500 | Don't expose garbage |
| Wrong KEK version | Try active KEK, then previous (dual-read) | Graceful during rotation window |

### SSO Failures

| Scenario | Behavior | Why |
|---|---|---|
| IdP unreachable | "IdP unavailable" error + retry | Don't fall back to weaker auth |
| SAML assertion expired | Redirect to IdP | Standard replay protection |
| OIDC validation fails | 401 (no specifics) | Don't leak validation details |
| Unknown email domain | Show default providers | Non-SSO users still authenticate |
| SSO enforced + IdP down | 503 + "Contact administrator" | NEVER bypass enforced SSO |
| SCIM token invalid | 401 + `WWW-Authenticate: Bearer` | Standard SCIM error |

### API Key Failures

| Scenario | Behavior | Why |
|---|---|---|
| Prefix not found | 401 (same as wrong key) | Don't reveal which prefixes exist |
| PBKDF2 verify fails | 401 + rate limit increment | Constant-time, no timing leak |
| Key expired | 401 + `X-Sentinel-Key-Expired: true` | Help CLI users understand |
| Key revoked | 401 (same as not found) | Don't distinguish revoked vs nonexistent |

**Critical invariant:** When `SsoConfig.enforced = true`, the system NEVER falls back to default providers. IdP down = login blocked. This is correct enterprise behavior.

### Audit Trail Coverage

| Event | Actor | Details |
|---|---|---|
| `user_login` | user | provider, email hash, orgId, IP |
| `user_login_failed` | system | provider, email hash, reason (redacted), IP |
| `sso_config_created` | user | orgId, provider type (NOT secrets) |
| `sso_config_updated` | user | orgId, changed fields (NOT values) |
| `api_key_created` | user | orgId, keyPrefix, role, expiresAt |
| `api_key_revoked` | user | orgId, keyPrefix, reason |
| `scim_user_provisioned` | system | orgId, userId, source IdP |
| `scim_user_deactivated` | system | orgId, userId |
| `encryption_key_rotated` | user/system | orgId, purpose, old -> new version |
| `crypto_shred_initiated` | user | orgId, scheduled deletion date |

PII redaction: Audit events log email hashes (SHA-256), not raw emails. IPs logged for security but subject to retention TTL.

---

## 9. Migration & Backward Compatibility

### Zero Breaking Changes

| Existing Mechanism | Behavior After Migration |
|---|---|
| `SENTINEL_SECRET` env var | Continues working. API keys are additive, not replacement. |
| `SENTINEL_ROLE_MAP` env var | Continues as fallback. OrgMembership takes priority when present. |
| `X-Sentinel-Signature` header | Continues working (HMAC auth path unchanged). |
| NextAuth env-var providers | Continue working as default providers. Org-specific SSO is additive. |
| Existing webhook secrets (plaintext) | Migration encrypts in-place during schema migration. |
| Existing certificate signatures | Migration encrypts in-place during schema migration. |

### Data Migration Steps

```
1. Deploy new schema (additive — new tables + new columns)
2. Run migration script:
   a. Generate default EncryptionKey for each org (LocalKmsProvider for dev, cloud for prod)
   b. Encrypt existing WebhookEndpoint.secret values in-place
   c. Encrypt existing Certificate.signature values in-place
   d. Encrypt existing User.email values with SIV-AES
   e. Create OrgMembership rows from SENTINEL_ROLE_MAP (if set)
3. Enable Prisma encryption middleware
4. Verify: read existing data back, confirm decryption works
5. Remove plaintext fallback code path after verification
```

### Feature Flags

| Flag | Purpose | Default |
|---|---|---|
| `ENCRYPTION_AT_REST_ENABLED` | Toggle Prisma encryption middleware | `false` (enable after migration) |
| `SSO_DB_CONFIG_ENABLED` | Toggle DB-backed SSO (vs env-var only) | `false` (enable after testing) |
| `API_KEYS_ENABLED` | Toggle per-org API key auth | `false` (enable after key generation UI) |
| `SCIM_ENABLED` | Toggle SCIM endpoints | `false` (enable per-org) |

---

## References

- **Existing auth code:** `apps/dashboard/lib/auth.ts`, `packages/auth/src/signing.ts`
- **Existing KMS code:** `packages/security/src/kms.ts`, `kms-aws.ts`, `kms-gcp.ts`
- **P5 SSO plan:** `docs/plans/2026-03-09-p5-enterprise-sso.md`
- **Reference: OpenClaw MC** — PBKDF2 token hashing (`backend/app/core/agent_tokens.py`), sliding-window rate limiting (`backend/app/core/rate_limit.py`)
- **Reference: OpenWork** — better-auth schema with session tracking (`services/den/src/db/schema.ts`)
- **Standards:** NIST SP 800-132 (PBKDF2), RFC 3394 (AES Key Wrap), RFC 7516 (JWE), SCIM 2.0 (RFC 7643/7644)
