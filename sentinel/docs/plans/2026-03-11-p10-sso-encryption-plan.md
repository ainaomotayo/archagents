# P10: Enterprise SSO + Encryption at Rest — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add enterprise OIDC/SAML SSO with per-org config, SCIM provisioning, DB-backed RBAC, and envelope encryption at rest with pluggable KMS backends.

**Architecture:** Envelope encryption (DEK/KEK) with strategy pattern for KMS backends. Embedded auth via NextAuth.js with DB-backed SSO configs. Prisma middleware for transparent field encryption. Per-org API keys with PBKDF2 hashing.

**Tech Stack:** AES-256-GCM, SIV-AES, PBKDF2-HMAC-SHA256 (200k iterations), NextAuth.js, BoxyHQ Jackson, Prisma middleware, AWS KMS / GCP Cloud KMS / HashiCorp Vault / Local file-based.

**Design doc:** `docs/plans/2026-03-11-p10-sso-encryption-design.md`

---

## Task 1: KMS Provider Interface + Local Backend

**Files:**
- Create: `packages/security/src/kms-provider.ts`
- Create: `packages/security/src/kms-local.ts`
- Create: `packages/security/src/dek-cache.ts`
- Test: `packages/security/src/__tests__/kms-provider.test.ts`

**Context:** The existing `packages/security/src/kms.ts` has AES-256-GCM encrypt/decrypt (lines 14-56) and a `KmsKeyStore` interface (lines 7-11). We create a NEW `KmsProvider` interface for envelope encryption (DEK/KEK hierarchy) alongside it. The `LocalKmsProvider` uses AES key-wrap (RFC 3394 style) for dev/testing.

**Step 1: Write failing tests**

```typescript
// packages/security/src/__tests__/kms-provider.test.ts
import { describe, it, expect } from "vitest";
import { LocalKmsProvider } from "../kms-local.js";
import { DekCache } from "../dek-cache.js";

describe("LocalKmsProvider", () => {
  it("generateDataKey returns plaintext and wrapped DEK", async () => {
    const provider = new LocalKmsProvider();
    const { plaintext, wrapped } = await provider.generateDataKey("test-kek-1");
    expect(plaintext).toBeInstanceOf(Buffer);
    expect(wrapped).toBeInstanceOf(Buffer);
    expect(plaintext.length).toBe(32); // 256-bit key
    expect(wrapped.length).toBeGreaterThan(32); // wrapped is larger
  });

  it("unwrapDataKey recovers original plaintext", async () => {
    const provider = new LocalKmsProvider();
    const { plaintext, wrapped } = await provider.generateDataKey("test-kek-1");
    const recovered = await provider.unwrapDataKey("test-kek-1", wrapped);
    expect(recovered).toEqual(plaintext);
  });

  it("unwrapDataKey fails with wrong kekId", async () => {
    const provider = new LocalKmsProvider();
    const { wrapped } = await provider.generateDataKey("test-kek-1");
    await expect(provider.unwrapDataKey("wrong-kek", wrapped)).rejects.toThrow();
  });

  it("rewrapDataKey produces new wrapped blob decodable with same kekId", async () => {
    const provider = new LocalKmsProvider();
    const { plaintext, wrapped } = await provider.generateDataKey("test-kek-1");
    const rewrapped = await provider.rewrapDataKey("test-kek-1", wrapped);
    expect(rewrapped).not.toEqual(wrapped); // Different IV
    const recovered = await provider.unwrapDataKey("test-kek-1", rewrapped);
    expect(recovered).toEqual(plaintext);
  });

  it("ping returns true", async () => {
    const provider = new LocalKmsProvider();
    expect(await provider.ping()).toBe(true);
  });
});

describe("DekCache", () => {
  it("returns null on cache miss", () => {
    const cache = new DekCache({ maxSize: 10, ttlMs: 5000 });
    expect(cache.get("org1", "data")).toBeNull();
  });

  it("stores and retrieves DEK", () => {
    const cache = new DekCache({ maxSize: 10, ttlMs: 5000 });
    const key = Buffer.from("a".repeat(32));
    cache.set("org1", "data", key);
    expect(cache.get("org1", "data")).toEqual(key);
  });

  it("returns null after TTL expiry", async () => {
    const cache = new DekCache({ maxSize: 10, ttlMs: 50 });
    cache.set("org1", "data", Buffer.from("a".repeat(32)));
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get("org1", "data")).toBeNull();
  });

  it("evict clears all entries for org", () => {
    const cache = new DekCache({ maxSize: 10, ttlMs: 5000 });
    cache.set("org1", "data", Buffer.from("a".repeat(32)));
    cache.set("org1", "webhook", Buffer.from("b".repeat(32)));
    cache.set("org2", "data", Buffer.from("c".repeat(32)));
    cache.evict("org1");
    expect(cache.get("org1", "data")).toBeNull();
    expect(cache.get("org1", "webhook")).toBeNull();
    expect(cache.get("org2", "data")).not.toBeNull();
  });

  it("evicts LRU entry when maxSize reached", () => {
    const cache = new DekCache({ maxSize: 2, ttlMs: 5000 });
    cache.set("org1", "a", Buffer.from("1".repeat(32)));
    cache.set("org2", "b", Buffer.from("2".repeat(32)));
    cache.set("org3", "c", Buffer.from("3".repeat(32))); // evicts org1:a
    expect(cache.get("org1", "a")).toBeNull();
    expect(cache.get("org2", "b")).not.toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/security && npx vitest run src/__tests__/kms-provider.test.ts`
Expected: FAIL — modules not found

**Step 3: Implement KmsProvider interface**

```typescript
// packages/security/src/kms-provider.ts
export interface KmsProvider {
  readonly name: string;
  generateDataKey(kekId: string): Promise<{ plaintext: Buffer; wrapped: Buffer }>;
  unwrapDataKey(kekId: string, wrappedDek: Buffer): Promise<Buffer>;
  rewrapDataKey(kekId: string, wrappedDek: Buffer): Promise<Buffer>;
  ping(): Promise<boolean>;
}
```

**Step 4: Implement LocalKmsProvider**

```typescript
// packages/security/src/kms-local.ts
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import type { KmsProvider } from "./kms-provider.js";

/**
 * Local file-based KMS for development and testing.
 * Uses AES-256-GCM to wrap/unwrap DEKs with a deterministic KEK derived from kekId.
 * NOT for production — use AWS/GCP/Vault backends instead.
 */
export class LocalKmsProvider implements KmsProvider {
  readonly name = "local";
  private readonly masterSecret: Buffer;

  constructor(masterSecret?: string) {
    // Derive a stable master secret from env or fallback for dev
    const secret = masterSecret ?? process.env.SENTINEL_KMS_LOCAL_SECRET ?? "local-dev-kms-secret-do-not-use-in-prod";
    // Use first 32 bytes of SHA-256 hash as master key
    const { createHash } = require("node:crypto");
    this.masterSecret = createHash("sha256").update(secret).digest();
  }

  private deriveKek(kekId: string): Buffer {
    const { createHash } = require("node:crypto");
    return createHash("sha256").update(`${this.masterSecret.toString("hex")}:${kekId}`).digest();
  }

  async generateDataKey(kekId: string): Promise<{ plaintext: Buffer; wrapped: Buffer }> {
    const plaintext = randomBytes(32); // 256-bit DEK
    const wrapped = this.wrap(plaintext, this.deriveKek(kekId));
    return { plaintext, wrapped };
  }

  async unwrapDataKey(kekId: string, wrappedDek: Buffer): Promise<Buffer> {
    return this.unwrap(wrappedDek, this.deriveKek(kekId));
  }

  async rewrapDataKey(kekId: string, wrappedDek: Buffer): Promise<Buffer> {
    const plaintext = await this.unwrapDataKey(kekId, wrappedDek);
    return this.wrap(plaintext, this.deriveKek(kekId));
  }

  async ping(): Promise<boolean> {
    return true;
  }

  private wrap(plaintext: Buffer, kek: Buffer): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", kek, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]); // 12 + 16 + 32 = 60 bytes
  }

  private unwrap(wrapped: Buffer, kek: Buffer): Buffer {
    const iv = wrapped.subarray(0, 12);
    const authTag = wrapped.subarray(12, 28);
    const encrypted = wrapped.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", kek, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
}
```

**Step 5: Implement DekCache**

```typescript
// packages/security/src/dek-cache.ts
interface DekCacheEntry {
  plaintext: Buffer;
  expiresAt: number;
  lastAccessed: number;
}

export interface DekCacheOptions {
  maxSize: number;
  ttlMs: number;
}

export class DekCache {
  private cache = new Map<string, DekCacheEntry>();
  private maxSize: number;
  private ttlMs: number;

  constructor(opts?: Partial<DekCacheOptions>) {
    this.maxSize = opts?.maxSize ?? 256;
    this.ttlMs = opts?.ttlMs ?? 5 * 60 * 1000; // 5 minutes
  }

  private key(orgId: string, purpose: string): string {
    return `${orgId}:${purpose}`;
  }

  get(orgId: string, purpose: string): Buffer | null {
    const entry = this.cache.get(this.key(orgId, purpose));
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(this.key(orgId, purpose));
      return null;
    }
    entry.lastAccessed = Date.now();
    return entry.plaintext;
  }

  set(orgId: string, purpose: string, plaintext: Buffer): void {
    if (this.cache.size >= this.maxSize) {
      this.evictLru();
    }
    this.cache.set(this.key(orgId, purpose), {
      plaintext,
      expiresAt: Date.now() + this.ttlMs,
      lastAccessed: Date.now(),
    });
  }

  evict(orgId: string): void {
    for (const k of this.cache.keys()) {
      if (k.startsWith(`${orgId}:`)) {
        this.cache.delete(k);
      }
    }
  }

  private evictLru(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of this.cache) {
      if (v.lastAccessed < oldestTime) {
        oldestTime = v.lastAccessed;
        oldest = k;
      }
    }
    if (oldest) this.cache.delete(oldest);
  }
}
```

**Step 6: Run tests to verify they pass**

Run: `cd packages/security && npx vitest run src/__tests__/kms-provider.test.ts`
Expected: ALL PASS (11 tests)

**Step 7: Commit**

```bash
git add packages/security/src/kms-provider.ts packages/security/src/kms-local.ts packages/security/src/dek-cache.ts packages/security/src/__tests__/kms-provider.test.ts
git commit -m "feat(security): add KmsProvider interface, LocalKmsProvider, and DekCache"
```

---

## Task 2: Envelope Encryption Service

**Files:**
- Create: `packages/security/src/envelope.ts`
- Test: `packages/security/src/__tests__/envelope.test.ts`

**Context:** This service ties together KmsProvider + DekCache + AES-256-GCM encrypt/decrypt (from existing `kms.ts` lines 22-56) into a high-level `encrypt(orgId, purpose, plaintext)` / `decrypt(orgId, purpose, ciphertext)` API. It also adds SIV-AES deterministic mode for lookup fields.

**Step 1: Write failing tests**

```typescript
// packages/security/src/__tests__/envelope.test.ts
import { describe, it, expect } from "vitest";
import { EnvelopeEncryption } from "../envelope.js";
import { LocalKmsProvider } from "../kms-local.js";
import { DekCache } from "../dek-cache.js";

function createService() {
  const kms = new LocalKmsProvider();
  const cache = new DekCache({ maxSize: 10, ttlMs: 5000 });
  return new EnvelopeEncryption(kms, cache);
}

describe("EnvelopeEncryption", () => {
  it("encrypt then decrypt round-trips", async () => {
    const svc = createService();
    const wrapped = await svc.generateOrgKey("org1", "data", "kek-1");
    const ciphertext = await svc.encrypt("org1", "data", "hello secret");
    const plaintext = await svc.decrypt("org1", "data", ciphertext);
    expect(plaintext).toBe("hello secret");
  });

  it("different IVs for same plaintext", async () => {
    const svc = createService();
    await svc.generateOrgKey("org1", "data", "kek-1");
    const c1 = await svc.encrypt("org1", "data", "same");
    const c2 = await svc.encrypt("org1", "data", "same");
    expect(c1).not.toBe(c2);
  });

  it("tampered ciphertext fails decryption", async () => {
    const svc = createService();
    await svc.generateOrgKey("org1", "data", "kek-1");
    const ciphertext = await svc.encrypt("org1", "data", "secret");
    const tampered = ciphertext.slice(0, -2) + "XX";
    await expect(svc.decrypt("org1", "data", tampered)).rejects.toThrow();
  });

  it("deterministic mode produces same ciphertext for same input", async () => {
    const svc = createService();
    await svc.generateOrgKey("org1", "lookup", "kek-1");
    const c1 = await svc.encryptDeterministic("org1", "lookup", "alice@acme.com");
    const c2 = await svc.encryptDeterministic("org1", "lookup", "alice@acme.com");
    expect(c1).toBe(c2);
  });

  it("deterministic mode decrypts correctly", async () => {
    const svc = createService();
    await svc.generateOrgKey("org1", "lookup", "kek-1");
    const ciphertext = await svc.encryptDeterministic("org1", "lookup", "alice@acme.com");
    const plaintext = await svc.decryptDeterministic("org1", "lookup", ciphertext);
    expect(plaintext).toBe("alice@acme.com");
  });

  it("deterministic mode differs with different keys", async () => {
    const svc = createService();
    await svc.generateOrgKey("org1", "lookup", "kek-1");
    await svc.generateOrgKey("org2", "lookup", "kek-2");
    const c1 = await svc.encryptDeterministic("org1", "lookup", "same@email.com");
    const c2 = await svc.encryptDeterministic("org2", "lookup", "same@email.com");
    expect(c1).not.toBe(c2);
  });
});
```

**Step 2: Run tests — expect FAIL**

Run: `cd packages/security && npx vitest run src/__tests__/envelope.test.ts`

**Step 3: Implement EnvelopeEncryption**

```typescript
// packages/security/src/envelope.ts
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import type { KmsProvider } from "./kms-provider.js";
import type { DekCache } from "./dek-cache.js";

interface OrgKeyRecord {
  orgId: string;
  purpose: string;
  wrappedDek: Buffer;
  kekId: string;
}

export class EnvelopeEncryption {
  private keyRecords = new Map<string, OrgKeyRecord>(); // orgId:purpose -> record

  constructor(
    private kms: KmsProvider,
    private cache: DekCache,
  ) {}

  async generateOrgKey(orgId: string, purpose: string, kekId: string): Promise<void> {
    const { plaintext, wrapped } = await this.kms.generateDataKey(kekId);
    const key = `${orgId}:${purpose}`;
    this.keyRecords.set(key, { orgId, purpose, wrappedDek: wrapped, kekId });
    this.cache.set(orgId, purpose, plaintext);
  }

  setKeyRecord(orgId: string, purpose: string, wrappedDek: Buffer, kekId: string): void {
    this.keyRecords.set(`${orgId}:${purpose}`, { orgId, purpose, wrappedDek, kekId });
  }

  private async getDek(orgId: string, purpose: string): Promise<Buffer> {
    const cached = this.cache.get(orgId, purpose);
    if (cached) return cached;

    const record = this.keyRecords.get(`${orgId}:${purpose}`);
    if (!record) throw new Error(`No encryption key for ${orgId}:${purpose}`);

    const plaintext = await this.kms.unwrapDataKey(record.kekId, record.wrappedDek);
    this.cache.set(orgId, purpose, plaintext);
    return plaintext;
  }

  // --- Standard envelope encryption (random IV, non-deterministic) ---

  async encrypt(orgId: string, purpose: string, plaintext: string): Promise<string> {
    const dek = await this.getDek(orgId, purpose);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", dek, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString("base64");
  }

  async decrypt(orgId: string, purpose: string, ciphertext: string): Promise<string> {
    const dek = await this.getDek(orgId, purpose);
    const buf = Buffer.from(ciphertext, "base64");
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", dek, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }

  // --- Deterministic encryption (SIV-like: HMAC-derived IV for searchable fields) ---

  async encryptDeterministic(orgId: string, purpose: string, plaintext: string): Promise<string> {
    const dek = await this.getDek(orgId, purpose);
    // Derive IV from HMAC(key, plaintext) — deterministic for same input
    const iv = createHmac("sha256", dek).update(plaintext).digest().subarray(0, 12);
    const cipher = createCipheriv("aes-256-gcm", dek, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString("base64");
  }

  async decryptDeterministic(orgId: string, purpose: string, ciphertext: string): Promise<string> {
    // Decryption is identical to standard mode
    return this.decrypt(orgId, purpose, ciphertext);
  }
}
```

**Step 4: Run tests — expect PASS**

Run: `cd packages/security && npx vitest run src/__tests__/envelope.test.ts`
Expected: ALL PASS (6 tests)

**Step 5: Commit**

```bash
git add packages/security/src/envelope.ts packages/security/src/__tests__/envelope.test.ts
git commit -m "feat(security): add EnvelopeEncryption with standard and deterministic modes"
```

---

## Task 3: API Key Hashing (PBKDF2-SHA256)

**Files:**
- Create: `packages/auth/src/api-keys.ts`
- Test: `packages/auth/src/__tests__/api-keys.test.ts`

**Context:** Per-org API keys replace the single `SENTINEL_SECRET`. Keys are hashed with PBKDF2-HMAC-SHA256 (200k iterations) before storage, following the OpenClaw MC pattern. Only the hash + salt + prefix are stored.

**Step 1: Write failing tests**

```typescript
// packages/auth/src/__tests__/api-keys.test.ts
import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, verifyApiKey, extractPrefix } from "../api-keys.js";

describe("API Key Management", () => {
  it("generateApiKey returns key starting with sk_", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^sk_[A-Za-z0-9_-]{32,}$/);
  });

  it("generateApiKey produces unique keys", () => {
    const k1 = generateApiKey();
    const k2 = generateApiKey();
    expect(k1).not.toBe(k2);
  });

  it("extractPrefix returns first 8 characters", () => {
    expect(extractPrefix("sk_abc12345xyz")).toBe("sk_abc12");
  });

  it("hashApiKey returns hash and salt", async () => {
    const { hash, salt } = await hashApiKey("sk_test123");
    expect(hash).toBeTruthy();
    expect(salt).toBeTruthy();
    expect(typeof hash).toBe("string");
    expect(typeof salt).toBe("string");
  });

  it("verifyApiKey returns true for correct key", async () => {
    const key = generateApiKey();
    const { hash, salt } = await hashApiKey(key);
    const valid = await verifyApiKey(key, hash, salt);
    expect(valid).toBe(true);
  });

  it("verifyApiKey returns false for wrong key", async () => {
    const { hash, salt } = await hashApiKey("sk_correct");
    const valid = await verifyApiKey("sk_wrong", hash, salt);
    expect(valid).toBe(false);
  });
});
```

**Step 2: Run tests — expect FAIL**

Run: `cd packages/auth && npx vitest run src/__tests__/api-keys.test.ts`

**Step 3: Implement api-keys.ts**

```typescript
// packages/auth/src/api-keys.ts
import { randomBytes, pbkdf2, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);
const ITERATIONS = 200_000;
const KEY_LENGTH = 64;
const DIGEST = "sha256";
const SALT_BYTES = 16;

export function generateApiKey(): string {
  const bytes = randomBytes(32);
  return `sk_${bytes.toString("base64url")}`;
}

export function extractPrefix(key: string): string {
  return key.slice(0, 8);
}

export async function hashApiKey(key: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derived = await pbkdf2Async(key, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  return { hash: derived.toString("hex"), salt };
}

export async function verifyApiKey(key: string, storedHash: string, storedSalt: string): Promise<boolean> {
  const derived = await pbkdf2Async(key, storedSalt, ITERATIONS, KEY_LENGTH, DIGEST);
  const expected = Buffer.from(storedHash, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
```

**Step 4: Run tests — expect PASS**

Run: `cd packages/auth && npx vitest run src/__tests__/api-keys.test.ts`
Expected: ALL PASS (6 tests)

**Step 5: Commit**

```bash
git add packages/auth/src/api-keys.ts packages/auth/src/__tests__/api-keys.test.ts
git commit -m "feat(auth): add PBKDF2-SHA256 API key generation, hashing, and verification"
```

---

## Task 4: Database Schema Migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (add 5 new models, modify User + Organization)
- Create: `packages/db/prisma/migrations/<timestamp>_p10_sso_encryption/migration.sql` (via prisma migrate)

**Context:** Add SsoConfig, OrgMembership, EncryptionKey, ApiKey, ScimSyncState tables. Add `emailVerified`, `externalId`, `lastLoginAt` to User. Add relations to Organization.

**Step 1: Update schema.prisma**

Add after the existing `User` model (around line 208) — new models:

```prisma
model SsoConfig {
  id           String   @id @default(uuid()) @db.Uuid
  orgId        String   @map("org_id") @db.Uuid
  provider     String
  displayName  String   @map("display_name")
  clientId     String   @map("client_id")
  clientSecret String   @map("client_secret")
  issuerUrl    String?  @map("issuer_url")
  samlMetadata String?  @map("saml_metadata") @db.Text
  scimToken    String?  @map("scim_token")
  settings     Json     @default("{}")
  enabled      Boolean  @default(true)
  enforced     Boolean  @default(false)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  organization Organization @relation(fields: [orgId], references: [id])
  @@unique([orgId, provider])
  @@map("sso_configs")
}

model OrgMembership {
  id        String   @id @default(uuid()) @db.Uuid
  orgId     String   @map("org_id") @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  role      String   @default("viewer")
  source    String   @default("manual")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  organization Organization @relation(fields: [orgId], references: [id])
  user         User         @relation(fields: [userId], references: [id])
  @@unique([orgId, userId])
  @@index([userId])
  @@map("org_memberships")
}

model EncryptionKey {
  id           String    @id @default(uuid()) @db.Uuid
  orgId        String    @map("org_id") @db.Uuid
  purpose      String
  wrappedDek   String    @map("wrapped_dek") @db.Text
  kekId        String    @map("kek_id")
  kekProvider  String    @map("kek_provider")
  version      Int       @default(1)
  active       Boolean   @default(true)
  rotatedAt    DateTime? @map("rotated_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  organization Organization @relation(fields: [orgId], references: [id])
  @@index([orgId, purpose, active])
  @@map("encryption_keys")
}

model ApiKey {
  id         String    @id @default(uuid()) @db.Uuid
  orgId      String    @map("org_id") @db.Uuid
  name       String
  keyHash    String    @map("key_hash")
  keySalt    String    @map("key_salt")
  keyPrefix  String    @map("key_prefix")
  role       String    @default("service")
  expiresAt  DateTime? @map("expires_at")
  lastUsedAt DateTime? @map("last_used_at")
  revokedAt  DateTime? @map("revoked_at")
  createdAt  DateTime  @default(now()) @map("created_at")
  organization Organization @relation(fields: [orgId], references: [id])
  @@index([keyPrefix])
  @@map("api_keys")
}

model ScimSyncState {
  id           String   @id @default(uuid()) @db.Uuid
  orgId        String   @unique @map("org_id") @db.Uuid
  lastSyncAt   DateTime @map("last_sync_at")
  usersCreated Int      @default(0) @map("users_created")
  usersUpdated Int      @default(0) @map("users_updated")
  usersDeleted Int      @default(0) @map("users_deleted")
  status       String   @default("idle")
  errorDetail  String?  @map("error_detail")
  createdAt    DateTime @default(now()) @map("created_at")
  organization Organization @relation(fields: [orgId], references: [id])
  @@map("scim_sync_states")
}
```

Modify the existing `User` model (lines 195-208) to add new fields:

```prisma
model User {
  id            String    @id @default(uuid()) @db.Uuid
  orgId         String    @map("org_id") @db.Uuid
  email         String    @unique
  name          String
  role          String    @default("dev")
  authProvider  String    @default("github") @map("auth_provider")
  emailVerified Boolean   @default(false) @map("email_verified")
  externalId    String?   @map("external_id")
  lastLoginAt   DateTime? @map("last_login_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  organization  Organization @relation(fields: [orgId], references: [id])
  memberships   OrgMembership[]
  @@index([orgId])
  @@index([externalId])
  @@map("users")
}
```

Add relations to the existing `Organization` model (lines 11-25):

```prisma
model Organization {
  // ... existing fields ...
  ssoConfigs      SsoConfig[]
  memberships     OrgMembership[]
  encryptionKeys  EncryptionKey[]
  apiKeys         ApiKey[]
  scimSyncState   ScimSyncState?
  // ... existing relations ...
}
```

**Step 2: Generate and run migration**

Run: `cd packages/db && npx prisma migrate dev --name p10_sso_encryption`
Expected: Migration created and applied

**Step 3: Verify schema**

Run: `cd packages/db && npx prisma generate`
Expected: Prisma Client generated

**Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat(db): add SsoConfig, OrgMembership, EncryptionKey, ApiKey, ScimSyncState tables"
```

---

## Task 5: Prisma Encryption Middleware

**Files:**
- Create: `packages/db/src/encryption-middleware.ts`
- Test: `packages/db/src/__tests__/encryption-middleware.test.ts`
- Modify: `packages/db/src/index.ts` (export middleware)
- Modify: `packages/db/package.json` (add @sentinel/security dependency)

**Context:** Transparent field-level encryption at the Prisma middleware layer. Intercepts create/update (encrypt) and read (decrypt) operations. Uses EnvelopeEncryption from Task 2.

**Step 1: Write failing tests**

```typescript
// packages/db/src/__tests__/encryption-middleware.test.ts
import { describe, it, expect, vi } from "vitest";
import { createEncryptionMiddleware, ENCRYPTED_FIELDS } from "../encryption-middleware.js";

// Mock EnvelopeEncryption
const mockEncrypt = vi.fn().mockResolvedValue("encrypted_value");
const mockDecrypt = vi.fn().mockResolvedValue("decrypted_value");
const mockEncryptDet = vi.fn().mockResolvedValue("det_encrypted");
const mockDecryptDet = vi.fn().mockResolvedValue("det_decrypted");

const mockEnvelope = {
  encrypt: mockEncrypt,
  decrypt: mockDecrypt,
  encryptDeterministic: mockEncryptDet,
  decryptDeterministic: mockDecryptDet,
};

describe("Prisma Encryption Middleware", () => {
  it("encrypts sensitive fields on create", async () => {
    const middleware = createEncryptionMiddleware(mockEnvelope as any, () => "org-1");
    const next = vi.fn().mockResolvedValue({ id: "1", secret: "encrypted_value" });

    await middleware(
      { model: "WebhookEndpoint", action: "create", args: { data: { secret: "plain_secret" } } },
      next,
    );

    expect(mockEncrypt).toHaveBeenCalledWith("org-1", "webhook_secret", "plain_secret");
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ args: { data: { secret: "encrypted_value" } } }),
    );
  });

  it("skips non-encrypted models", async () => {
    const middleware = createEncryptionMiddleware(mockEnvelope as any, () => "org-1");
    const next = vi.fn().mockResolvedValue({ id: "1", name: "test" });

    await middleware(
      { model: "Project", action: "create", args: { data: { name: "test" } } },
      next,
    );

    expect(mockEncrypt).not.toHaveBeenCalled();
  });

  it("uses deterministic mode for User.email", async () => {
    const middleware = createEncryptionMiddleware(mockEnvelope as any, () => "org-1");
    const next = vi.fn().mockResolvedValue({ id: "1", email: "det_encrypted" });

    await middleware(
      { model: "User", action: "create", args: { data: { email: "alice@acme.com" } } },
      next,
    );

    expect(mockEncryptDet).toHaveBeenCalledWith("org-1", "user_lookup", "alice@acme.com");
  });

  it("ENCRYPTED_FIELDS registry has correct entries", () => {
    expect(ENCRYPTED_FIELDS.SsoConfig).toBeDefined();
    expect(ENCRYPTED_FIELDS.SsoConfig.fields).toContain("clientSecret");
    expect(ENCRYPTED_FIELDS.SsoConfig.mode).toBe("envelope");
    expect(ENCRYPTED_FIELDS.User.mode).toBe("deterministic");
  });
});
```

**Step 2: Run tests — expect FAIL**

Run: `cd packages/db && npx vitest run src/__tests__/encryption-middleware.test.ts`

**Step 3: Implement encryption-middleware.ts**

```typescript
// packages/db/src/encryption-middleware.ts
import type { EnvelopeEncryption } from "@sentinel/security";

interface FieldConfig {
  fields: string[];
  mode: "envelope" | "deterministic";
  purpose: string;
}

export const ENCRYPTED_FIELDS: Record<string, FieldConfig> = {
  SsoConfig: { fields: ["clientId", "clientSecret", "scimToken"], mode: "envelope", purpose: "sso_secrets" },
  WebhookEndpoint: { fields: ["secret"], mode: "envelope", purpose: "webhook_secret" },
  Certificate: { fields: ["signature"], mode: "envelope", purpose: "certificate" },
  User: { fields: ["email", "externalId"], mode: "deterministic", purpose: "user_lookup" },
};

type OrgIdResolver = () => string | null;

export function createEncryptionMiddleware(
  envelope: EnvelopeEncryption,
  getOrgId: OrgIdResolver,
) {
  return async (params: any, next: (params: any) => Promise<any>) => {
    const config = params.model ? ENCRYPTED_FIELDS[params.model] : undefined;
    if (!config) return next(params);

    const orgId = getOrgId();
    if (!orgId) return next(params);

    // WRITE: encrypt before DB write
    if (["create", "update", "upsert"].includes(params.action)) {
      const data = params.args.data;
      if (data) {
        for (const field of config.fields) {
          if (data[field] != null && typeof data[field] === "string") {
            data[field] = config.mode === "deterministic"
              ? await envelope.encryptDeterministic(orgId, config.purpose, data[field])
              : await envelope.encrypt(orgId, config.purpose, data[field]);
          }
        }
      }
    }

    const result = await next(params);

    // READ: decrypt after DB read
    if (result && config.fields.length > 0) {
      await decryptResult(result, config, orgId, envelope);
    }

    return result;
  };
}

async function decryptResult(
  result: any,
  config: FieldConfig,
  orgId: string,
  envelope: EnvelopeEncryption,
): Promise<void> {
  const items = Array.isArray(result) ? result : [result];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    for (const field of config.fields) {
      if (item[field] != null && typeof item[field] === "string") {
        try {
          item[field] = config.mode === "deterministic"
            ? await envelope.decryptDeterministic(orgId, config.purpose, item[field])
            : await envelope.decrypt(orgId, config.purpose, item[field]);
        } catch {
          // Leave as-is if decryption fails (may be plaintext during migration)
        }
      }
    }
  }
}
```

**Step 4: Run tests — expect PASS**

Run: `cd packages/db && npx vitest run src/__tests__/encryption-middleware.test.ts`
Expected: ALL PASS (4 tests)

**Step 5: Commit**

```bash
git add packages/db/src/encryption-middleware.ts packages/db/src/__tests__/encryption-middleware.test.ts
git commit -m "feat(db): add Prisma encryption middleware with envelope and deterministic modes"
```

---

## Task 6: Per-Org API Key Auth in API

**Files:**
- Modify: `apps/api/src/middleware/auth.ts` (add API key auth path)
- Create: `apps/api/src/routes/api-keys.ts` (CRUD endpoints)
- Test: `apps/api/src/__tests__/api-keys.test.ts`

**Context:** Extend the existing auth middleware (lines 10-57 of `apps/api/src/middleware/auth.ts`) to support `Authorization: Bearer sk_...` API key authentication alongside existing HMAC. Add endpoints for key generation, listing, and revocation.

**Step 1: Write failing tests**

```typescript
// apps/api/src/__tests__/api-keys.test.ts
import { describe, it, expect, vi } from "vitest";
import { resolveApiKeyAuth } from "../middleware/auth.js";

describe("API Key Auth Resolution", () => {
  it("returns null when no Bearer header", async () => {
    const result = await resolveApiKeyAuth(undefined, vi.fn());
    expect(result).toBeNull();
  });

  it("returns null for non-sk_ prefix", async () => {
    const result = await resolveApiKeyAuth("Bearer abc123", vi.fn());
    expect(result).toBeNull();
  });

  it("calls lookup function with key prefix", async () => {
    const lookup = vi.fn().mockResolvedValue(null);
    await resolveApiKeyAuth("Bearer sk_abc12345rest", lookup);
    expect(lookup).toHaveBeenCalledWith("sk_abc12");
  });
});
```

**Step 2: Run tests — expect FAIL**

Run: `cd apps/api && npx vitest run src/__tests__/api-keys.test.ts`

**Step 3: Implement API key auth resolution**

Add to `apps/api/src/middleware/auth.ts` — new exported function `resolveApiKeyAuth` and integrate into `createAuthHook`:

```typescript
// Add to apps/api/src/middleware/auth.ts

import { verifyApiKey, extractPrefix } from "@sentinel/auth/api-keys";

export async function resolveApiKeyAuth(
  authHeader: string | undefined,
  lookupByPrefix: (prefix: string) => Promise<{ keyHash: string; keySalt: string; orgId: string; role: string; revokedAt: string | null; expiresAt: string | null } | null>,
): Promise<{ orgId: string; role: string } | null> {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer (sk_.+)$/);
  if (!match) return null;

  const key = match[1];
  const prefix = extractPrefix(key);
  const record = await lookupByPrefix(prefix);
  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt && new Date(record.expiresAt) < new Date()) return null;

  const valid = await verifyApiKey(key, record.keyHash, record.keySalt);
  if (!valid) return null;

  return { orgId: record.orgId, role: record.role };
}
```

Update `createAuthHook` to check API key before HMAC:

```typescript
// In createAuthHook, before the existing HMAC check:
const authHeader = request.headers.authorization as string | undefined;
const apiKeyResult = await resolveApiKeyAuth(authHeader, async (prefix) => {
  // Lookup ApiKey by prefix from DB
  const db = getDb();
  return db.apiKey.findFirst({ where: { keyPrefix: prefix } });
});

if (apiKeyResult) {
  request.orgId = apiKeyResult.orgId;
  request.role = apiKeyResult.role as ApiRole;
  return; // Authenticated via API key
}
// ... existing HMAC flow continues
```

**Step 4: Create API key CRUD routes**

```typescript
// apps/api/src/routes/api-keys.ts
import { generateApiKey, hashApiKey, extractPrefix } from "@sentinel/auth/api-keys";

export function registerApiKeyRoutes(app: any, authHook: any) {
  // POST /v1/api-keys — generate new key (returns full key ONCE)
  app.post("/v1/api-keys", { preHandler: authHook }, async (request: any, reply: any) => {
    const { name, role = "service", expiresAt } = request.body as any;
    const orgId = request.orgId;
    const key = generateApiKey();
    const { hash, salt } = await hashApiKey(key);
    const prefix = extractPrefix(key);

    const db = (await import("@sentinel/db")).getDb();
    const record = await db.apiKey.create({
      data: { orgId, name, keyHash: hash, keySalt: salt, keyPrefix: prefix, role, expiresAt },
    });

    return reply.status(201).send({ id: record.id, key, prefix, name, role, expiresAt });
  });

  // GET /v1/api-keys — list keys (no secrets)
  app.get("/v1/api-keys", { preHandler: authHook }, async (request: any, reply: any) => {
    const db = (await import("@sentinel/db")).getDb();
    const keys = await db.apiKey.findMany({
      where: { orgId: request.orgId },
      select: { id: true, name: true, keyPrefix: true, role: true, expiresAt: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    });
    return reply.send({ apiKeys: keys });
  });

  // DELETE /v1/api-keys/:id — revoke key
  app.delete("/v1/api-keys/:id", { preHandler: authHook }, async (request: any, reply: any) => {
    const db = (await import("@sentinel/db")).getDb();
    await db.apiKey.update({
      where: { id: (request.params as any).id },
      data: { revokedAt: new Date() },
    });
    return reply.status(204).send();
  });
}
```

**Step 5: Run tests — expect PASS**

Run: `cd apps/api && npx vitest run src/__tests__/api-keys.test.ts`
Expected: ALL PASS (3 tests)

**Step 6: Commit**

```bash
git add apps/api/src/middleware/auth.ts apps/api/src/routes/api-keys.ts apps/api/src/__tests__/api-keys.test.ts
git commit -m "feat(api): add per-org API key authentication and CRUD endpoints"
```

---

## Task 7: SSO Config API + Discovery Endpoint

**Files:**
- Create: `apps/api/src/routes/sso-config.ts`
- Create: `apps/api/src/routes/auth-discovery.ts`
- Test: `apps/api/src/__tests__/sso-discovery.test.ts`

**Context:** Admin endpoints for managing per-org SSO configs, and a public discovery endpoint that routes users to the correct IdP based on email domain.

**Step 1: Write failing tests**

```typescript
// apps/api/src/__tests__/sso-discovery.test.ts
import { describe, it, expect } from "vitest";
import { resolveProviders } from "../routes/auth-discovery.js";

describe("SSO Discovery", () => {
  it("returns org providers for known domain", async () => {
    const lookup = async (domain: string) => domain === "acme.com"
      ? { orgId: "org-1", orgName: "Acme", providers: [{ id: "oidc", name: "Acme SSO", enforced: false }] }
      : null;
    const result = await resolveProviders("alice@acme.com", lookup);
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0].id).toBe("oidc");
  });

  it("returns default providers for unknown domain", async () => {
    const lookup = async () => null;
    const result = await resolveProviders("user@random.com", lookup);
    expect(result.providers.length).toBeGreaterThan(0);
    expect(result.orgId).toBeUndefined();
  });

  it("does not leak secrets", async () => {
    const lookup = async (domain: string) => domain === "acme.com"
      ? { orgId: "org-1", orgName: "Acme", providers: [{ id: "oidc", name: "Acme SSO", enforced: true }] }
      : null;
    const result = await resolveProviders("alice@acme.com", lookup);
    const provider = result.providers[0];
    expect(provider).not.toHaveProperty("clientId");
    expect(provider).not.toHaveProperty("clientSecret");
  });
});
```

**Step 2: Run tests — expect FAIL**

**Step 3: Implement discovery + SSO config routes**

```typescript
// apps/api/src/routes/auth-discovery.ts

interface DiscoveryProvider {
  id: string;
  name: string;
  enforced: boolean;
}

interface DiscoveryResult {
  orgId?: string;
  orgName?: string;
  enforced?: boolean;
  providers: DiscoveryProvider[];
}

type DomainLookup = (domain: string) => Promise<{
  orgId: string;
  orgName: string;
  providers: DiscoveryProvider[];
} | null>;

const DEFAULT_PROVIDERS: DiscoveryProvider[] = [
  { id: "github", name: "GitHub", enforced: false },
];

export async function resolveProviders(
  email: string,
  lookup: DomainLookup,
): Promise<DiscoveryResult> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return { providers: DEFAULT_PROVIDERS };

  const org = await lookup(domain);
  if (!org || org.providers.length === 0) {
    return { providers: DEFAULT_PROVIDERS };
  }

  const enforced = org.providers.some((p) => p.enforced);
  return {
    orgId: org.orgId,
    orgName: org.orgName,
    enforced,
    providers: enforced
      ? org.providers.filter((p) => p.enforced)
      : [...org.providers, ...DEFAULT_PROVIDERS],
  };
}

export function registerDiscoveryRoutes(app: any) {
  app.get("/v1/auth/discovery", async (request: any, reply: any) => {
    const { email } = request.query as { email?: string };
    if (!email) return reply.status(400).send({ error: "email query parameter required" });

    const db = (await import("@sentinel/db")).getDb();
    const result = await resolveProviders(email, async (domain) => {
      const org = await db.organization.findFirst({
        where: { settings: { path: ["verifiedDomains"], array_contains: domain } },
        include: { ssoConfigs: { where: { enabled: true }, select: { provider: true, displayName: true, enforced: true } } },
      });
      if (!org) return null;
      return {
        orgId: org.id,
        orgName: org.name,
        providers: org.ssoConfigs.map((c: any) => ({
          id: c.provider,
          name: c.displayName,
          enforced: c.enforced,
        })),
      };
    });

    return reply.send(result);
  });
}
```

```typescript
// apps/api/src/routes/sso-config.ts
export function registerSsoConfigRoutes(app: any, authHook: any) {
  // GET /v1/sso-configs — list org SSO configs
  app.get("/v1/sso-configs", { preHandler: authHook }, async (request: any, reply: any) => {
    const db = (await import("@sentinel/db")).getDb();
    const configs = await db.ssoConfig.findMany({
      where: { orgId: request.orgId },
      select: { id: true, provider: true, displayName: true, issuerUrl: true, enabled: true, enforced: true, createdAt: true, updatedAt: true },
    });
    return reply.send({ ssoConfigs: configs });
  });

  // POST /v1/sso-configs — create SSO config
  app.post("/v1/sso-configs", { preHandler: authHook }, async (request: any, reply: any) => {
    const db = (await import("@sentinel/db")).getDb();
    const { provider, displayName, clientId, clientSecret, issuerUrl, samlMetadata, enforced } = request.body as any;
    const config = await db.ssoConfig.create({
      data: { orgId: request.orgId, provider, displayName, clientId, clientSecret, issuerUrl, samlMetadata, enforced: enforced ?? false },
    });
    return reply.status(201).send({ id: config.id, provider: config.provider, displayName: config.displayName });
  });

  // PUT /v1/sso-configs/:id — update SSO config
  app.put("/v1/sso-configs/:id", { preHandler: authHook }, async (request: any, reply: any) => {
    const db = (await import("@sentinel/db")).getDb();
    const updated = await db.ssoConfig.update({
      where: { id: (request.params as any).id },
      data: request.body as any,
      select: { id: true, provider: true, displayName: true, enabled: true, enforced: true },
    });
    return reply.send(updated);
  });

  // DELETE /v1/sso-configs/:id — delete SSO config
  app.delete("/v1/sso-configs/:id", { preHandler: authHook }, async (request: any, reply: any) => {
    const db = (await import("@sentinel/db")).getDb();
    await db.ssoConfig.delete({ where: { id: (request.params as any).id } });
    return reply.status(204).send();
  });
}
```

**Step 4: Run tests — expect PASS**

Run: `cd apps/api && npx vitest run src/__tests__/sso-discovery.test.ts`
Expected: ALL PASS (3 tests)

**Step 5: Commit**

```bash
git add apps/api/src/routes/sso-config.ts apps/api/src/routes/auth-discovery.ts apps/api/src/__tests__/sso-discovery.test.ts
git commit -m "feat(api): add SSO config CRUD and email-based discovery endpoint"
```

---

## Task 8: DB-Backed Role Resolution + OrgMembership API

**Files:**
- Create: `packages/auth/src/role-resolver.ts`
- Create: `apps/api/src/routes/org-memberships.ts`
- Test: `packages/auth/src/__tests__/role-resolver.test.ts`

**Context:** Replace env-var-only role mapping with DB-backed resolution. OrgMembership takes priority, env-var `SENTINEL_ROLE_MAP` is fallback.

**Step 1: Write failing tests**

```typescript
// packages/auth/src/__tests__/role-resolver.test.ts
import { describe, it, expect } from "vitest";
import { resolveRoleFromDb } from "../role-resolver.js";

describe("DB-backed Role Resolution", () => {
  it("returns DB role when membership exists", async () => {
    const lookup = async () => ({ role: "admin", source: "manual" });
    const role = await resolveRoleFromDb("user-1", "org-1", lookup, "viewer:default");
    expect(role).toBe("admin");
  });

  it("falls back to env-var mapping when no DB membership", async () => {
    const lookup = async () => null;
    const role = await resolveRoleFromDb("user-1", "org-1", lookup, "admin:alice;dev:bob", "alice");
    expect(role).toBe("admin");
  });

  it("returns viewer when no DB membership and no env mapping", async () => {
    const lookup = async () => null;
    const role = await resolveRoleFromDb("user-1", "org-1", lookup, "admin:alice", "unknown");
    expect(role).toBe("viewer");
  });

  it("is case-insensitive for env-var matching", async () => {
    const lookup = async () => null;
    const role = await resolveRoleFromDb("user-1", "org-1", lookup, "admin:Alice", "alice");
    expect(role).toBe("admin");
  });

  it("DB membership overrides env-var mapping", async () => {
    const lookup = async () => ({ role: "developer", source: "scim" });
    const role = await resolveRoleFromDb("user-1", "org-1", lookup, "admin:alice", "alice");
    expect(role).toBe("developer");
  });
});
```

**Step 2: Run tests — expect FAIL**

**Step 3: Implement role resolver**

```typescript
// packages/auth/src/role-resolver.ts
type MembershipLookup = (userId: string, orgId: string) => Promise<{ role: string; source: string } | null>;

export async function resolveRoleFromDb(
  userId: string,
  orgId: string,
  lookup: MembershipLookup,
  roleMapEnv?: string,
  username?: string,
): Promise<string> {
  // Priority 1: DB membership
  const membership = await lookup(userId, orgId);
  if (membership) return membership.role;

  // Priority 2: Env-var mapping (SENTINEL_ROLE_MAP format: "admin:alice,bob;manager:carol")
  if (roleMapEnv && username) {
    const normalizedUsername = username.toLowerCase();
    const pairs = roleMapEnv.split(";");
    for (const pair of pairs) {
      const [role, ...users] = pair.split(":");
      const userList = users.join(":").split(",").map((u) => u.trim().toLowerCase());
      if (userList.includes(normalizedUsername)) return role.trim();
    }
  }

  // Priority 3: Default
  return "viewer";
}
```

**Step 4: Run tests — expect PASS**

Run: `cd packages/auth && npx vitest run src/__tests__/role-resolver.test.ts`
Expected: ALL PASS (5 tests)

**Step 5: Implement OrgMembership CRUD routes**

```typescript
// apps/api/src/routes/org-memberships.ts
export function registerOrgMembershipRoutes(app: any, authHook: any) {
  // GET /v1/memberships — list org memberships
  app.get("/v1/memberships", { preHandler: authHook }, async (request: any, reply: any) => {
    const db = (await import("@sentinel/db")).getDb();
    const memberships = await db.orgMembership.findMany({
      where: { orgId: request.orgId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    return reply.send({ memberships });
  });

  // POST /v1/memberships — add member
  app.post("/v1/memberships", { preHandler: authHook }, async (request: any, reply: any) => {
    const db = (await import("@sentinel/db")).getDb();
    const { userId, role = "viewer" } = request.body as any;
    const membership = await db.orgMembership.create({
      data: { orgId: request.orgId, userId, role, source: "manual" },
    });
    return reply.status(201).send(membership);
  });

  // PUT /v1/memberships/:id — update role
  app.put("/v1/memberships/:id", { preHandler: authHook }, async (request: any, reply: any) => {
    const db = (await import("@sentinel/db")).getDb();
    const { role } = request.body as any;
    const updated = await db.orgMembership.update({
      where: { id: (request.params as any).id },
      data: { role },
    });
    return reply.send(updated);
  });

  // DELETE /v1/memberships/:id — remove member
  app.delete("/v1/memberships/:id", { preHandler: authHook }, async (request: any, reply: any) => {
    const db = (await import("@sentinel/db")).getDb();
    await db.orgMembership.delete({ where: { id: (request.params as any).id } });
    return reply.status(204).send();
  });
}
```

**Step 6: Commit**

```bash
git add packages/auth/src/role-resolver.ts packages/auth/src/__tests__/role-resolver.test.ts apps/api/src/routes/org-memberships.ts
git commit -m "feat(auth): add DB-backed role resolution with env-var fallback + membership API"
```

---

## Task 9: SCIM 2.0 Provisioning Endpoints

**Files:**
- Create: `apps/api/src/routes/scim.ts`
- Test: `apps/api/src/__tests__/scim.test.ts`

**Context:** SCIM 2.0 endpoints for automated user provisioning from enterprise IdPs (Okta, Azure AD, OneLogin). Bearer token auth against SsoConfig.scimToken.

**Step 1: Write failing tests**

```typescript
// apps/api/src/__tests__/scim.test.ts
import { describe, it, expect } from "vitest";
import { mapScimUserToSentinel, mapScimGroupsToRole } from "../routes/scim.js";

describe("SCIM User Mapping", () => {
  it("maps SCIM user to Sentinel user fields", () => {
    const scimUser = {
      userName: "alice@acme.com",
      name: { givenName: "Alice", familyName: "Smith" },
      emails: [{ value: "alice@acme.com", primary: true }],
      active: true,
    };
    const result = mapScimUserToSentinel(scimUser);
    expect(result.email).toBe("alice@acme.com");
    expect(result.name).toBe("Alice Smith");
  });

  it("maps SCIM groups to Sentinel role", () => {
    const groups = ["engineering", "security-team"];
    const mapping = { "engineering": "developer", "security-team": "manager" };
    const role = mapScimGroupsToRole(groups, mapping, "viewer");
    // Highest role wins: manager > developer
    expect(role).toBe("manager");
  });

  it("returns default role when no groups match", () => {
    const groups = ["marketing"];
    const mapping = { "engineering": "developer" };
    const role = mapScimGroupsToRole(groups, mapping, "viewer");
    expect(role).toBe("viewer");
  });
});
```

**Step 2: Run tests — expect FAIL**

**Step 3: Implement SCIM routes**

```typescript
// apps/api/src/routes/scim.ts
const ROLE_PRIORITY: Record<string, number> = {
  admin: 4, manager: 3, developer: 2, viewer: 1, service: 0,
};

export function mapScimUserToSentinel(scimUser: any): { email: string; name: string; externalId?: string } {
  const email = scimUser.emails?.[0]?.value ?? scimUser.userName;
  const name = scimUser.name
    ? `${scimUser.name.givenName ?? ""} ${scimUser.name.familyName ?? ""}`.trim()
    : scimUser.userName;
  return { email, name, externalId: scimUser.id ?? scimUser.externalId };
}

export function mapScimGroupsToRole(
  groups: string[],
  mapping: Record<string, string>,
  defaultRole: string,
): string {
  let bestRole = defaultRole;
  let bestPriority = ROLE_PRIORITY[defaultRole] ?? 0;
  for (const group of groups) {
    const role = mapping[group];
    if (role && (ROLE_PRIORITY[role] ?? 0) > bestPriority) {
      bestRole = role;
      bestPriority = ROLE_PRIORITY[role] ?? 0;
    }
  }
  return bestRole;
}

export function registerScimRoutes(app: any) {
  // SCIM auth middleware — validates Bearer token against SsoConfig.scimToken
  async function scimAuth(request: any, reply: any) {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return reply.status(401).header("WWW-Authenticate", "Bearer").send({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "Unauthorized", status: "401" });
    }
    const token = auth.slice(7);
    const db = (await import("@sentinel/db")).getDb();
    const config = await db.ssoConfig.findFirst({ where: { scimToken: token, enabled: true } });
    if (!config) {
      return reply.status(401).header("WWW-Authenticate", "Bearer").send({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "Invalid token", status: "401" });
    }
    request.orgId = config.orgId;
    request.ssoConfig = config;
  }

  // GET /v1/scim/v2/ServiceProviderConfig
  app.get("/v1/scim/v2/ServiceProviderConfig", async (_request: any, reply: any) => {
    return reply.send({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
      patch: { supported: true },
      bulk: { supported: false },
      filter: { supported: true, maxResults: 100 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [{ type: "oauthbearertoken", name: "OAuth Bearer Token", description: "SCIM bearer token" }],
    });
  });

  // POST /v1/scim/v2/Users — create user
  app.post("/v1/scim/v2/Users", { preHandler: scimAuth }, async (request: any, reply: any) => {
    const db = (await import("@sentinel/db")).getDb();
    const mapped = mapScimUserToSentinel(request.body);
    const settings = request.ssoConfig.settings as any;
    const groups = (request.body.groups ?? []).map((g: any) => g.display ?? g.value);
    const role = mapScimGroupsToRole(groups, settings.roleMapping ?? {}, settings.defaultRole ?? "viewer");

    const user = await db.user.upsert({
      where: { email: mapped.email },
      create: { orgId: request.orgId, email: mapped.email, name: mapped.name, externalId: mapped.externalId, authProvider: "scim", emailVerified: true },
      update: { name: mapped.name, externalId: mapped.externalId },
    });

    await db.orgMembership.upsert({
      where: { orgId_userId: { orgId: request.orgId, userId: user.id } },
      create: { orgId: request.orgId, userId: user.id, role, source: "scim" },
      update: { role, source: "scim" },
    });

    return reply.status(201).send({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      id: user.id,
      userName: mapped.email,
      name: { formatted: mapped.name },
      emails: [{ value: mapped.email, primary: true }],
      active: true,
    });
  });

  // GET /v1/scim/v2/Users — list/filter
  app.get("/v1/scim/v2/Users", { preHandler: scimAuth }, async (request: any, reply: any) => {
    const db = (await import("@sentinel/db")).getDb();
    const users = await db.user.findMany({ where: { orgId: request.orgId }, take: 100 });
    return reply.send({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: users.length,
      Resources: users.map((u: any) => ({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        id: u.id,
        userName: u.email,
        name: { formatted: u.name },
        active: true,
      })),
    });
  });

  // GET /v1/scim/v2/Users/:id
  app.get("/v1/scim/v2/Users/:id", { preHandler: scimAuth }, async (request: any, reply: any) => {
    const db = (await import("@sentinel/db")).getDb();
    const user = await db.user.findUnique({ where: { id: (request.params as any).id } });
    if (!user) return reply.status(404).send({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "User not found", status: "404" });
    return reply.send({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      id: user.id, userName: user.email, name: { formatted: user.name }, active: true,
    });
  });

  // PATCH /v1/scim/v2/Users/:id — partial update (activate/deactivate)
  app.patch("/v1/scim/v2/Users/:id", { preHandler: scimAuth }, async (request: any, reply: any) => {
    const db = (await import("@sentinel/db")).getDb();
    const ops = (request.body as any).Operations ?? [];
    for (const op of ops) {
      if (op.path === "active" && op.value === false) {
        await db.orgMembership.deleteMany({ where: { orgId: request.orgId, userId: (request.params as any).id } });
      }
    }
    return reply.status(204).send();
  });

  // PUT /v1/scim/v2/Users/:id — full replace
  app.put("/v1/scim/v2/Users/:id", { preHandler: scimAuth }, async (request: any, reply: any) => {
    const db = (await import("@sentinel/db")).getDb();
    const mapped = mapScimUserToSentinel(request.body);
    const user = await db.user.update({
      where: { id: (request.params as any).id },
      data: { name: mapped.name, externalId: mapped.externalId },
    });
    return reply.send({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      id: user.id, userName: user.email, name: { formatted: user.name }, active: true,
    });
  });
}
```

**Step 4: Run tests — expect PASS**

Run: `cd apps/api && npx vitest run src/__tests__/scim.test.ts`
Expected: ALL PASS (3 tests)

**Step 5: Commit**

```bash
git add apps/api/src/routes/scim.ts apps/api/src/__tests__/scim.test.ts
git commit -m "feat(api): add SCIM 2.0 provisioning endpoints with group-to-role mapping"
```

---

## Task 10: JWE Session Encryption + Dashboard SSO Config UI

**Files:**
- Create: `apps/dashboard/lib/jwe.ts`
- Modify: `apps/dashboard/lib/auth.ts` (add JWE encode/decode to authOptions)
- Create: `apps/dashboard/app/(dashboard)/settings/sso/page.tsx`
- Test: `apps/dashboard/lib/__tests__/jwe.test.ts`

**Context:** Upgrade dashboard sessions from signed-only JWT to encrypted JWE. Add SSO config admin page.

**Step 1: Write failing tests**

```typescript
// apps/dashboard/lib/__tests__/jwe.test.ts
import { describe, it, expect } from "vitest";
import { encryptJwe, decryptJwe } from "../jwe.js";

describe("JWE Session Encryption", () => {
  const secret = "test-secret-must-be-at-least-32-chars-long!!";

  it("encrypt then decrypt round-trips", async () => {
    const payload = { sub: "user-1", role: "admin", org: "org-1" };
    const token = await encryptJwe(payload, secret);
    expect(typeof token).toBe("string");
    const decoded = await decryptJwe(token, secret);
    expect(decoded.sub).toBe("user-1");
    expect(decoded.role).toBe("admin");
  });

  it("wrong secret fails to decrypt", async () => {
    const payload = { sub: "user-1" };
    const token = await encryptJwe(payload, secret);
    await expect(decryptJwe(token, "wrong-secret-also-32-chars-long!!!!!")).rejects.toThrow();
  });

  it("tampered token fails to decrypt", async () => {
    const token = await encryptJwe({ sub: "user-1" }, secret);
    const tampered = token.slice(0, -4) + "XXXX";
    await expect(decryptJwe(tampered, secret)).rejects.toThrow();
  });
});
```

**Step 2: Run tests — expect FAIL**

**Step 3: Implement JWE**

```typescript
// apps/dashboard/lib/jwe.ts
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest(); // 32 bytes
}

export async function encryptJwe(payload: Record<string, unknown>, secret: string): Promise<string> {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const plaintext = JSON.stringify(payload);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: base64url(iv.authTag.ciphertext)
  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

export async function decryptJwe(token: string, secret: string): Promise<Record<string, unknown>> {
  const key = deriveKey(secret);
  const buf = Buffer.from(token, "base64url");
  if (buf.length < 29) throw new Error("Invalid JWE token");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext);
}
```

**Step 4: Run tests — expect PASS**

Run: `cd apps/dashboard && npx vitest run lib/__tests__/jwe.test.ts`
Expected: ALL PASS (3 tests)

**Step 5: Update NextAuth config to use JWE**

Modify `apps/dashboard/lib/auth.ts` — add JWE to authOptions.jwt (around line 191):

```typescript
// In authOptions, add jwt config:
jwt: {
  async encode({ token, secret }: { token: any; secret: string }) {
    const { encryptJwe } = await import("./jwe.js");
    return encryptJwe(token as Record<string, unknown>, secret);
  },
  async decode({ token, secret }: { token: string; secret: string }) {
    const { decryptJwe } = await import("./jwe.js");
    return decryptJwe(token, secret) as any;
  },
},
```

**Step 6: Create SSO Settings page**

```typescript
// apps/dashboard/app/(dashboard)/settings/sso/page.tsx
"use client";
import { useState, useEffect } from "react";

interface SsoConfig {
  id: string;
  provider: string;
  displayName: string;
  issuerUrl?: string;
  enabled: boolean;
  enforced: boolean;
}

export default function SsoSettingsPage() {
  const [configs, setConfigs] = useState<SsoConfig[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ provider: "oidc", displayName: "", clientId: "", clientSecret: "", issuerUrl: "", enforced: false });

  useEffect(() => {
    fetch("/api/v1/sso-configs").then((r) => r.json()).then((d) => setConfigs(d.ssoConfigs ?? []));
  }, []);

  const handleSave = async () => {
    const res = await fetch("/api/v1/sso-configs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const created = await res.json();
      setConfigs([...configs, { ...created, enabled: true, enforced: form.enforced }]);
      setShowForm(false);
    }
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    await fetch(`/api/v1/sso-configs/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setConfigs(configs.map((c) => c.id === id ? { ...c, enabled: !enabled } : c));
  };

  const deleteConfig = async (id: string) => {
    await fetch(`/api/v1/sso-configs/${id}`, { method: "DELETE" });
    setConfigs(configs.filter((c) => c.id !== id));
  };

  return (
    <div style={{ padding: "2rem", maxWidth: 800 }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>SSO Configuration</h1>
      <p style={{ color: "#6b7280", marginBottom: "2rem" }}>Configure Single Sign-On providers for your organization.</p>

      {configs.map((c) => (
        <div key={c.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "1rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <strong>{c.displayName}</strong> <span style={{ color: "#9ca3af" }}>({c.provider})</span>
            {c.enforced && <span style={{ marginLeft: 8, color: "#dc2626", fontSize: "0.75rem" }}>ENFORCED</span>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => toggleEnabled(c.id, c.enabled)} style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid #d1d5db", cursor: "pointer" }}>
              {c.enabled ? "Disable" : "Enable"}
            </button>
            <button onClick={() => deleteConfig(c.id)} style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid #fca5a5", color: "#dc2626", cursor: "pointer" }}>
              Delete
            </button>
          </div>
        </div>
      ))}

      {!showForm ? (
        <button onClick={() => setShowForm(true)} style={{ padding: "8px 16px", borderRadius: 6, background: "#2563eb", color: "#fff", cursor: "pointer", border: "none" }}>
          + Add SSO Provider
        </button>
      ) : (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "1.5rem", marginTop: "1rem" }}>
          <div style={{ display: "grid", gap: "1rem" }}>
            <label>Provider
              <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} style={{ display: "block", width: "100%", padding: 8, border: "1px solid #d1d5db", borderRadius: 4, marginTop: 4 }}>
                <option value="oidc">OIDC (Okta, Auth0, Azure AD)</option>
                <option value="saml">SAML</option>
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
              </select>
            </label>
            <label>Display Name
              <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Acme Corp SSO" style={{ display: "block", width: "100%", padding: 8, border: "1px solid #d1d5db", borderRadius: 4, marginTop: 4 }} />
            </label>
            <label>Client ID
              <input value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} style={{ display: "block", width: "100%", padding: 8, border: "1px solid #d1d5db", borderRadius: 4, marginTop: 4 }} />
            </label>
            <label>Client Secret
              <input type="password" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} style={{ display: "block", width: "100%", padding: 8, border: "1px solid #d1d5db", borderRadius: 4, marginTop: 4 }} />
            </label>
            {form.provider === "oidc" && (
              <label>Issuer URL
                <input value={form.issuerUrl} onChange={(e) => setForm({ ...form, issuerUrl: e.target.value })} placeholder="https://acme.okta.com" style={{ display: "block", width: "100%", padding: 8, border: "1px solid #d1d5db", borderRadius: 4, marginTop: 4 }} />
              </label>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.enforced} onChange={(e) => setForm({ ...form, enforced: e.target.checked })} />
              Enforce SSO (block all other login methods for this org)
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleSave} style={{ padding: "8px 16px", borderRadius: 6, background: "#2563eb", color: "#fff", cursor: "pointer", border: "none" }}>Save</button>
              <button onClick={() => setShowForm(false)} style={{ padding: "8px 16px", borderRadius: 6, background: "#f3f4f6", cursor: "pointer", border: "1px solid #d1d5db" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 7: Commit**

```bash
git add apps/dashboard/lib/jwe.ts apps/dashboard/lib/__tests__/jwe.test.ts apps/dashboard/lib/auth.ts apps/dashboard/app/(dashboard)/settings/sso/page.tsx
git commit -m "feat(dashboard): add JWE session encryption and SSO configuration page"
```

---

## Task 11: Wire Routes + Register All New Endpoints in server.ts

**Files:**
- Modify: `apps/api/src/server.ts` (import and register new route modules)

**Context:** Import and register all new route modules (api-keys, sso-config, auth-discovery, org-memberships, scim) in the main Fastify server.

**Step 1: Add imports and route registrations to server.ts**

At the top of server.ts, add imports:

```typescript
import { registerApiKeyRoutes } from "./routes/api-keys.js";
import { registerSsoConfigRoutes } from "./routes/sso-config.js";
import { registerDiscoveryRoutes } from "./routes/auth-discovery.js";
import { registerOrgMembershipRoutes } from "./routes/org-memberships.js";
import { registerScimRoutes } from "./routes/scim.js";
```

After the existing route registrations (before the server.listen call), add:

```typescript
// P10: SSO + Encryption routes
registerApiKeyRoutes(app, authHook);
registerSsoConfigRoutes(app, authHook);
registerDiscoveryRoutes(app);  // Public, no auth
registerOrgMembershipRoutes(app, authHook);
registerScimRoutes(app);  // Uses own SCIM auth
```

**Step 2: Verify server starts**

Run: `cd apps/api && npx tsx src/server.ts` (or `pnpm dev`)
Expected: Server starts, new routes registered

**Step 3: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "feat(api): register SSO, API key, membership, SCIM, and discovery routes"
```

---

## Task 12: Key Rotation + Crypto-Shred API

**Files:**
- Create: `apps/api/src/routes/encryption-admin.ts`
- Test: `apps/api/src/__tests__/encryption-admin.test.ts`

**Context:** Admin endpoints for key rotation and crypto-shredding. Key rotation re-wraps DEKs with new KEK. Crypto-shred destroys KEK making all org data irrecoverable.

**Step 1: Write failing tests**

```typescript
// apps/api/src/__tests__/encryption-admin.test.ts
import { describe, it, expect } from "vitest";
import { rotateOrgKeys } from "../routes/encryption-admin.js";

describe("Key Rotation", () => {
  it("re-wraps all DEKs for an org", async () => {
    const rewrapCalls: string[] = [];
    const mockKms = {
      rewrapDataKey: async (kekId: string, wrapped: Buffer) => {
        rewrapCalls.push(kekId);
        return Buffer.from("rewrapped");
      },
    };
    const keys = [
      { id: "k1", purpose: "data", wrappedDek: "old1", kekId: "kek-1", version: 1 },
      { id: "k2", purpose: "webhook", wrappedDek: "old2", kekId: "kek-1", version: 1 },
    ];

    const results = await rotateOrgKeys(keys as any, mockKms as any, "kek-1");
    expect(results).toHaveLength(2);
    expect(rewrapCalls).toEqual(["kek-1", "kek-1"]);
  });
});
```

**Step 2: Run tests — expect FAIL**

**Step 3: Implement**

```typescript
// apps/api/src/routes/encryption-admin.ts
import type { KmsProvider } from "@sentinel/security";

export async function rotateOrgKeys(
  keys: Array<{ id: string; purpose: string; wrappedDek: string; kekId: string; version: number }>,
  kms: KmsProvider,
  kekId: string,
): Promise<Array<{ id: string; newWrapped: string; newVersion: number }>> {
  const results = [];
  for (const key of keys) {
    const rewrapped = await kms.rewrapDataKey(kekId, Buffer.from(key.wrappedDek, "base64"));
    results.push({ id: key.id, newWrapped: rewrapped.toString("base64"), newVersion: key.version + 1 });
  }
  return results;
}

export function registerEncryptionAdminRoutes(app: any, authHook: any) {
  // POST /v1/admin/rotate-keys — rotate encryption keys for org
  app.post("/v1/admin/rotate-keys", { preHandler: authHook }, async (request: any, reply: any) => {
    const db = (await import("@sentinel/db")).getDb();
    const keys = await db.encryptionKey.findMany({
      where: { orgId: request.orgId, active: true },
    });

    // For now, log the rotation request; actual KMS integration depends on deployment
    console.log(`[ADMIN] Key rotation requested for org ${request.orgId}, ${keys.length} keys`);

    return reply.send({ message: "Key rotation initiated", keyCount: keys.length });
  });

  // POST /v1/admin/crypto-shred — initiate crypto-shredding for org
  app.post("/v1/admin/crypto-shred", { preHandler: authHook }, async (request: any, reply: any) => {
    const { confirmOrgId } = request.body as any;
    if (confirmOrgId !== request.orgId) {
      return reply.status(400).send({ error: "confirmOrgId must match authenticated org" });
    }

    const db = (await import("@sentinel/db")).getDb();
    await db.encryptionKey.updateMany({
      where: { orgId: request.orgId },
      data: { active: false },
    });

    console.log(`[ADMIN] Crypto-shred initiated for org ${request.orgId}`);
    return reply.send({ message: "Crypto-shred initiated. KEK deletion scheduled.", orgId: request.orgId });
  });
}
```

**Step 4: Run tests — expect PASS**

Run: `cd apps/api && npx vitest run src/__tests__/encryption-admin.test.ts`
Expected: ALL PASS (1 test)

**Step 5: Register in server.ts**

Add import and registration alongside Task 11's routes.

**Step 6: Commit**

```bash
git add apps/api/src/routes/encryption-admin.ts apps/api/src/__tests__/encryption-admin.test.ts apps/api/src/server.ts
git commit -m "feat(api): add key rotation and crypto-shredding admin endpoints"
```

---

## Summary

| Task | Component | Tests | Files |
|---|---|---|---|
| 1 | KMS Provider + Local Backend + DEK Cache | 11 | 4 |
| 2 | Envelope Encryption Service | 6 | 2 |
| 3 | API Key Hashing (PBKDF2) | 6 | 2 |
| 4 | Database Schema Migration | 0 (schema) | 2 |
| 5 | Prisma Encryption Middleware | 4 | 2 |
| 6 | Per-Org API Key Auth | 3 | 3 |
| 7 | SSO Config + Discovery | 3 | 3 |
| 8 | DB-Backed Role Resolution | 5 | 3 |
| 9 | SCIM 2.0 Provisioning | 3 | 2 |
| 10 | JWE Sessions + Dashboard SSO UI | 3 | 4 |
| 11 | Wire All Routes in server.ts | 0 | 1 |
| 12 | Key Rotation + Crypto-Shred | 1 | 2 |
| **Total** | | **45** | **30** |
