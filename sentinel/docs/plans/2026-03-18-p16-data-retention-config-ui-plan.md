# P16: Data Retention Configuration UI — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an enterprise-grade data retention settings page with severity-tiered policies, dual-admin approval, archive destinations (S3/GCS/Azure Blob/webhook/SFTP), execution pipeline, and a rich observability dashboard.

**Architecture:** Vertical slice — `packages/retention` for business logic with ports & adapters for archive destinations, API routes in `apps/api/src/routes/retention.ts`, dashboard page at `/settings/retention`. Pipeline execution via Redis Streams (Archive Worker → Delete Worker) with saga state tracking.

**Tech Stack:** Fastify 5, Prisma, Redis Streams (ioredis), Vitest, Next.js 15, React, Recharts, Tailwind CSS, AWS SDK v3, ssh2-sftp-client, AES-256-GCM

**Reference files you'll need:**
- Design doc: `docs/plans/2026-03-18-p16-data-retention-config-ui-design.md`
- Existing retention logic: `packages/security/src/data-retention.ts`
- Existing cron job: `apps/api/src/scheduler/jobs/retention.ts`
- Scheduler types: `apps/api/src/scheduler/types.ts`
- Prisma schema: `packages/db/prisma/schema.prisma`
- Package pattern: `packages/events/package.json`, `packages/events/tsconfig.json`
- API route pattern: `apps/api/src/routes/org-settings.ts`
- Route registration: `apps/api/src/server.ts` (line ~52 for imports, ~2243 for registration)
- Dashboard API client: `apps/dashboard/lib/api-client.ts` (apiGet/apiPost/apiPut/apiDelete with HMAC)
- Dashboard API layer: `apps/dashboard/lib/api.ts` (tryApi + mock fallback pattern)
- Dashboard sub-page pattern: `apps/dashboard/app/(dashboard)/settings/workflow/page.tsx`
- Client-side page pattern: `apps/dashboard/app/(dashboard)/settings/report-schedules/page.tsx`
- Settings hub: `apps/dashboard/app/(dashboard)/settings/page.tsx`

---

### Task 1: Create `packages/retention` Package Scaffold

**Files:**
- Create: `packages/retention/package.json`
- Create: `packages/retention/tsconfig.json`
- Create: `packages/retention/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@sentinel/retention",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "echo 'lint placeholder'"
  },
  "dependencies": {
    "@sentinel/shared": "workspace:*",
    "@sentinel/db": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^25.3.5",
    "typescript": "^5.7",
    "vitest": "^3.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

**Step 3: Create src/index.ts**

```typescript
export { RETENTION_PRESETS, validateTierValues, type RetentionPreset, type TierValues } from "./policy.js";
export { encryptCredential, decryptCredential } from "./credential.js";
export type { ArchivePort, ArchivePayload, ArchiveResult, ArchiveConfig } from "./ports/archive-port.js";
export { getArchiveAdapter } from "./ports/registry.js";
```

**Step 4: Install dependencies**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm install`

**Step 5: Commit**

```bash
git add packages/retention/
git commit -m "feat(retention): scaffold @sentinel/retention package"
```

---

### Task 2: Policy Types, Presets, and Validation

**Files:**
- Create: `packages/retention/src/policy.ts`
- Create: `packages/retention/src/policy.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/retention/src/policy.test.ts
import { describe, it, expect } from "vitest";
import {
  RETENTION_PRESETS,
  validateTierValues,
  getPresetByName,
  detectPreset,
  type TierValues,
} from "./policy.js";

describe("RETENTION_PRESETS", () => {
  it("has 3 named presets", () => {
    expect(RETENTION_PRESETS).toHaveLength(3);
    expect(RETENTION_PRESETS.map((p) => p.name)).toEqual(["minimal", "standard", "compliance"]);
  });

  it("all presets have monotonically decreasing tiers", () => {
    for (const p of RETENTION_PRESETS) {
      expect(p.tiers.critical).toBeGreaterThanOrEqual(p.tiers.high);
      expect(p.tiers.high).toBeGreaterThanOrEqual(p.tiers.medium);
      expect(p.tiers.medium).toBeGreaterThanOrEqual(p.tiers.low);
    }
  });
});

describe("validateTierValues", () => {
  it("accepts valid tiers", () => {
    const result = validateTierValues({ critical: 365, high: 180, medium: 90, low: 30 });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("rejects tier below minimum (7)", () => {
    const result = validateTierValues({ critical: 365, high: 180, medium: 90, low: 3 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("low must be at least 7 days");
  });

  it("rejects tier above maximum (2555)", () => {
    const result = validateTierValues({ critical: 3000, high: 180, medium: 90, low: 30 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("critical must be at most 2555 days");
  });

  it("rejects non-monotonic tiers", () => {
    const result = validateTierValues({ critical: 90, high: 180, medium: 90, low: 30 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("critical must be >= high");
  });
});

describe("getPresetByName", () => {
  it("returns standard preset", () => {
    const preset = getPresetByName("standard");
    expect(preset).toBeDefined();
    expect(preset!.tiers.critical).toBe(365);
  });

  it("returns undefined for unknown name", () => {
    expect(getPresetByName("unknown")).toBeUndefined();
  });
});

describe("detectPreset", () => {
  it("detects standard preset from tier values", () => {
    expect(detectPreset({ critical: 365, high: 180, medium: 90, low: 30 })).toBe("standard");
  });

  it("returns custom for non-preset values", () => {
    expect(detectPreset({ critical: 400, high: 200, medium: 100, low: 50 })).toBe("custom");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/retention && npx vitest run src/policy.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// packages/retention/src/policy.ts
export interface TierValues {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface RetentionPreset {
  name: string;
  label: string;
  description: string;
  tiers: TierValues;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const MIN_DAYS = 7;
const MAX_DAYS = 2555; // ~7 years

export const RETENTION_PRESETS: RetentionPreset[] = [
  {
    name: "minimal",
    label: "Minimal",
    description: "Short retention for non-regulated environments",
    tiers: { critical: 90, high: 60, medium: 30, low: 14 },
  },
  {
    name: "standard",
    label: "Standard",
    description: "Balanced retention for most organizations",
    tiers: { critical: 365, high: 180, medium: 90, low: 30 },
  },
  {
    name: "compliance",
    label: "Compliance",
    description: "Extended retention for regulated industries",
    tiers: { critical: 730, high: 365, medium: 180, low: 90 },
  },
];

export function validateTierValues(tiers: TierValues): ValidationResult {
  const errors: string[] = [];
  const keys: (keyof TierValues)[] = ["critical", "high", "medium", "low"];

  for (const key of keys) {
    const val = tiers[key];
    if (!Number.isInteger(val) || val < MIN_DAYS) {
      errors.push(`${key} must be at least ${MIN_DAYS} days`);
    }
    if (val > MAX_DAYS) {
      errors.push(`${key} must be at most ${MAX_DAYS} days`);
    }
  }

  if (tiers.critical < tiers.high) errors.push("critical must be >= high");
  if (tiers.high < tiers.medium) errors.push("high must be >= medium");
  if (tiers.medium < tiers.low) errors.push("medium must be >= low");

  return { valid: errors.length === 0, errors };
}

export function getPresetByName(name: string): RetentionPreset | undefined {
  return RETENTION_PRESETS.find((p) => p.name === name);
}

export function detectPreset(tiers: TierValues): string {
  for (const preset of RETENTION_PRESETS) {
    if (
      preset.tiers.critical === tiers.critical &&
      preset.tiers.high === tiers.high &&
      preset.tiers.medium === tiers.medium &&
      preset.tiers.low === tiers.low
    ) {
      return preset.name;
    }
  }
  return "custom";
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/retention && npx vitest run src/policy.test.ts`
Expected: 8 tests PASS

**Step 5: Commit**

```bash
git add packages/retention/src/policy.ts packages/retention/src/policy.test.ts
git commit -m "feat(retention): add policy presets and tier validation"
```

---

### Task 3: Credential Encryption (AES-256-GCM)

**Files:**
- Create: `packages/retention/src/credential.ts`
- Create: `packages/retention/src/credential.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/retention/src/credential.test.ts
import { describe, it, expect } from "vitest";
import { encryptCredential, decryptCredential } from "./credential.js";

const TEST_KEY = "0123456789abcdef0123456789abcdef"; // 32 hex chars = 16 bytes; we'll use 32-byte key

describe("credential encryption", () => {
  const key = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex"); // 32 bytes

  it("encrypts and decrypts a secret", () => {
    const secret = "aws-secret-access-key-12345";
    const encrypted = encryptCredential(secret, key);
    expect(encrypted.ciphertext).toBeInstanceOf(Buffer);
    expect(encrypted.iv).toBeInstanceOf(Buffer);
    expect(encrypted.tag).toBeInstanceOf(Buffer);
    expect(encrypted.iv).toHaveLength(12);
    expect(encrypted.tag).toHaveLength(16);

    const decrypted = decryptCredential(encrypted, key);
    expect(decrypted).toBe(secret);
  });

  it("produces different ciphertext for same plaintext (random IV)", () => {
    const secret = "same-secret";
    const a = encryptCredential(secret, key);
    const b = encryptCredential(secret, key);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
    expect(a.iv).not.toEqual(b.iv);
  });

  it("fails decryption with wrong key", () => {
    const secret = "my-secret";
    const encrypted = encryptCredential(secret, key);
    const wrongKey = Buffer.from("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", "hex");
    expect(() => decryptCredential(encrypted, wrongKey)).toThrow();
  });

  it("fails decryption with tampered ciphertext", () => {
    const secret = "my-secret";
    const encrypted = encryptCredential(secret, key);
    encrypted.ciphertext[0] ^= 0xff;
    expect(() => decryptCredential(encrypted, wrongKey)).toThrow();
  });
});
```

Note: fix `wrongKey` reference in test 4 — use `key` instead. The test body should be:

```typescript
  it("fails decryption with tampered ciphertext", () => {
    const secret = "my-secret";
    const encrypted = encryptCredential(secret, key);
    encrypted.ciphertext[0] ^= 0xff;
    expect(() => decryptCredential(encrypted, key)).toThrow();
  });
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/retention && npx vitest run src/credential.test.ts`
Expected: FAIL

**Step 3: Implement**

```typescript
// packages/retention/src/credential.ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export interface EncryptedData {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

export function encryptCredential(plaintext: string, key: Buffer): EncryptedData {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

export function decryptCredential(data: EncryptedData, key: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, key, data.iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(data.tag);
  const decrypted = Buffer.concat([decipher.update(data.ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
```

**Step 4: Run tests**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/retention && npx vitest run src/credential.test.ts`
Expected: 4 tests PASS

**Step 5: Commit**

```bash
git add packages/retention/src/credential.ts packages/retention/src/credential.test.ts
git commit -m "feat(retention): add AES-256-GCM credential encryption"
```

---

### Task 4: Archive Port Interface and Adapter Registry

**Files:**
- Create: `packages/retention/src/ports/archive-port.ts`
- Create: `packages/retention/src/ports/registry.ts`
- Create: `packages/retention/src/ports/registry.test.ts`

**Step 1: Create the port interface**

```typescript
// packages/retention/src/ports/archive-port.ts
export interface ArchiveConfig {
  type: string;
  config: Record<string, unknown>;
  credential?: Record<string, unknown>;
}

export interface ArchivePayload {
  orgId: string;
  executionId: string;
  dataType: "findings" | "agentResults" | "scans";
  records: Record<string, unknown>[];
  metadata: { severity?: string; cutoffDate: string; exportedAt: string };
}

export interface ArchiveResult {
  success: boolean;
  recordCount: number;
  destination: string;
  error?: string;
}

export interface ArchivePort {
  readonly type: string;
  testConnection(config: ArchiveConfig): Promise<{ ok: boolean; error?: string }>;
  archive(payload: ArchivePayload, config: ArchiveConfig): Promise<ArchiveResult>;
}
```

**Step 2: Write failing registry test**

```typescript
// packages/retention/src/ports/registry.test.ts
import { describe, it, expect } from "vitest";
import { registerAdapter, getArchiveAdapter, listAdapterTypes } from "./registry.js";
import type { ArchivePort } from "./archive-port.js";

const mockAdapter: ArchivePort = {
  type: "mock",
  testConnection: async () => ({ ok: true }),
  archive: async (payload) => ({ success: true, recordCount: payload.records.length, destination: "mock://test" }),
};

describe("adapter registry", () => {
  it("registers and retrieves an adapter", () => {
    registerAdapter(mockAdapter);
    expect(getArchiveAdapter("mock")).toBe(mockAdapter);
  });

  it("throws for unknown adapter type", () => {
    expect(() => getArchiveAdapter("nonexistent")).toThrow("Unknown archive adapter: nonexistent");
  });

  it("lists registered types", () => {
    registerAdapter(mockAdapter);
    expect(listAdapterTypes()).toContain("mock");
  });
});
```

**Step 3: Implement registry**

```typescript
// packages/retention/src/ports/registry.ts
import type { ArchivePort } from "./archive-port.js";

const adapters = new Map<string, ArchivePort>();

export function registerAdapter(adapter: ArchivePort): void {
  adapters.set(adapter.type, adapter);
}

export function getArchiveAdapter(type: string): ArchivePort {
  const adapter = adapters.get(type);
  if (!adapter) throw new Error(`Unknown archive adapter: ${type}`);
  return adapter;
}

export function listAdapterTypes(): string[] {
  return Array.from(adapters.keys());
}
```

**Step 4: Run tests**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/retention && npx vitest run src/ports/registry.test.ts`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add packages/retention/src/ports/
git commit -m "feat(retention): add archive port interface and adapter registry"
```

---

### Task 5: Webhook Archive Adapter

**Files:**
- Create: `packages/retention/src/adapters/webhook.ts`
- Create: `packages/retention/src/adapters/webhook.test.ts`

**Step 1: Write failing tests**

```typescript
// packages/retention/src/adapters/webhook.test.ts
import { describe, it, expect, vi } from "vitest";
import { WebhookAdapter } from "./webhook.js";
import type { ArchivePayload, ArchiveConfig } from "../ports/archive-port.js";

const adapter = new WebhookAdapter();

const config: ArchiveConfig = {
  type: "webhook",
  config: { url: "https://example.com/archive", authHeader: "Authorization", authValue: "Bearer tok" },
};

const payload: ArchivePayload = {
  orgId: "org-1",
  executionId: "exec-1",
  dataType: "findings",
  records: [{ id: "f1", severity: "high" }, { id: "f2", severity: "low" }],
  metadata: { severity: "high", cutoffDate: "2026-01-01", exportedAt: "2026-03-18" },
};

describe("WebhookAdapter", () => {
  it("has type 'webhook'", () => {
    expect(adapter.type).toBe("webhook");
  });

  it("archives records via POST", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await adapter.archive(payload, config, mockFetch);
    expect(result.success).toBe(true);
    expect(result.recordCount).toBe(2);
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://example.com/archive");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Authorization"]).toBe("Bearer tok");
  });

  it("returns error on non-2xx response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "Internal Error" });
    const result = await adapter.archive(payload, config, mockFetch);
    expect(result.success).toBe(false);
    expect(result.error).toContain("500");
  });

  it("testConnection sends test payload", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await adapter.testConnection(config, mockFetch);
    expect(result.ok).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.type).toBe("sentinel.archive.test");
  });
});
```

**Step 2: Run tests — expected FAIL**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/retention && npx vitest run src/adapters/webhook.test.ts`

**Step 3: Implement**

```typescript
// packages/retention/src/adapters/webhook.ts
import type { ArchivePort, ArchivePayload, ArchiveConfig, ArchiveResult } from "../ports/archive-port.js";

const BATCH_SIZE = 1000;

export class WebhookAdapter implements ArchivePort {
  readonly type = "webhook";

  async testConnection(
    config: ArchiveConfig,
    fetchFn: typeof globalThis.fetch = globalThis.fetch,
  ): Promise<{ ok: boolean; error?: string }> {
    const { url, authHeader, authValue } = config.config as { url: string; authHeader?: string; authValue?: string };
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authHeader && authValue) headers[authHeader] = authValue;
      const res = await fetchFn(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ type: "sentinel.archive.test", timestamp: new Date().toISOString() }),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async archive(
    payload: ArchivePayload,
    config: ArchiveConfig,
    fetchFn: typeof globalThis.fetch = globalThis.fetch,
  ): Promise<ArchiveResult> {
    const { url, authHeader, authValue } = config.config as { url: string; authHeader?: string; authValue?: string };
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authHeader && authValue) headers[authHeader] = authValue;

    let sent = 0;
    for (let i = 0; i < payload.records.length; i += BATCH_SIZE) {
      const batch = payload.records.slice(i, i + BATCH_SIZE);
      const body = JSON.stringify({
        type: "sentinel.archive.data",
        orgId: payload.orgId,
        executionId: payload.executionId,
        dataType: payload.dataType,
        metadata: payload.metadata,
        records: batch,
      });
      const res = await fetchFn(url, { method: "POST", headers, body });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { success: false, recordCount: sent, destination: url, error: `HTTP ${res.status}: ${text}` };
      }
      sent += batch.length;
    }
    return { success: true, recordCount: sent, destination: url };
  }
}
```

**Step 4: Run tests — expected PASS**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/retention && npx vitest run src/adapters/webhook.test.ts`
Expected: 4 tests PASS

**Step 5: Commit**

```bash
git add packages/retention/src/adapters/webhook.ts packages/retention/src/adapters/webhook.test.ts
git commit -m "feat(retention): add webhook archive adapter"
```

---

### Task 6: S3 Archive Adapter

**Files:**
- Create: `packages/retention/src/adapters/s3.ts`
- Create: `packages/retention/src/adapters/s3.test.ts`

**Step 1: Add S3 dependency**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/retention && pnpm add @aws-sdk/client-s3`

**Step 2: Write failing tests**

```typescript
// packages/retention/src/adapters/s3.test.ts
import { describe, it, expect, vi } from "vitest";
import { S3Adapter } from "./s3.js";
import type { ArchivePayload, ArchiveConfig } from "../ports/archive-port.js";

// Mock the S3Client
vi.mock("@aws-sdk/client-s3", () => {
  const send = vi.fn().mockResolvedValue({});
  const S3Client = vi.fn().mockImplementation(() => ({ send, destroy: vi.fn() }));
  const PutObjectCommand = vi.fn().mockImplementation((input) => ({ input }));
  const HeadBucketCommand = vi.fn().mockImplementation((input) => ({ input }));
  return { S3Client, PutObjectCommand, HeadBucketCommand };
});

const adapter = new S3Adapter();

const config: ArchiveConfig = {
  type: "s3",
  config: { bucket: "my-bucket", region: "us-east-1", prefix: "archives" },
  credential: { accessKeyId: "AKIA...", secretAccessKey: "secret" },
};

const payload: ArchivePayload = {
  orgId: "org-1",
  executionId: "exec-1",
  dataType: "findings",
  records: [{ id: "f1", severity: "high" }],
  metadata: { severity: "high", cutoffDate: "2026-01-01", exportedAt: "2026-03-18" },
};

describe("S3Adapter", () => {
  it("has type 's3'", () => {
    expect(adapter.type).toBe("s3");
  });

  it("archives records as JSONL to S3", async () => {
    const result = await adapter.archive(payload, config);
    expect(result.success).toBe(true);
    expect(result.recordCount).toBe(1);
    expect(result.destination).toContain("s3://my-bucket/archives/org-1/findings/high/");
  });

  it("testConnection calls HeadBucket", async () => {
    const result = await adapter.testConnection(config);
    expect(result.ok).toBe(true);
  });
});
```

**Step 3: Implement**

```typescript
// packages/retention/src/adapters/s3.ts
import { S3Client, PutObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import type { ArchivePort, ArchivePayload, ArchiveConfig, ArchiveResult } from "../ports/archive-port.js";

export class S3Adapter implements ArchivePort {
  readonly type = "s3";

  private createClient(config: ArchiveConfig): S3Client {
    const { region, endpoint } = config.config as { region?: string; endpoint?: string };
    const cred = config.credential as { accessKeyId: string; secretAccessKey: string } | undefined;
    return new S3Client({
      region: region ?? "us-east-1",
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      ...(cred ? { credentials: { accessKeyId: cred.accessKeyId, secretAccessKey: cred.secretAccessKey } } : {}),
    });
  }

  private buildKey(payload: ArchivePayload, config: ArchiveConfig): string {
    const { prefix } = config.config as { prefix?: string };
    const date = new Date().toISOString().split("T")[0];
    const parts = [prefix, payload.orgId, payload.dataType, payload.metadata.severity, `${date}.jsonl`].filter(Boolean);
    return parts.join("/");
  }

  async testConnection(config: ArchiveConfig): Promise<{ ok: boolean; error?: string }> {
    const client = this.createClient(config);
    try {
      const { bucket } = config.config as { bucket: string };
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      client.destroy();
    }
  }

  async archive(payload: ArchivePayload, config: ArchiveConfig): Promise<ArchiveResult> {
    const client = this.createClient(config);
    try {
      const { bucket } = config.config as { bucket: string; prefix?: string };
      const key = this.buildKey(payload, config);
      const body = payload.records.map((r) => JSON.stringify(r)).join("\n");

      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "application/x-ndjson",
      }));

      return { success: true, recordCount: payload.records.length, destination: `s3://${bucket}/${key}` };
    } catch (err: unknown) {
      return { success: false, recordCount: 0, destination: "", error: err instanceof Error ? err.message : String(err) };
    } finally {
      client.destroy();
    }
  }
}
```

**Step 4: Run tests**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/retention && npx vitest run src/adapters/s3.test.ts`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add packages/retention/src/adapters/s3.ts packages/retention/src/adapters/s3.test.ts
git commit -m "feat(retention): add S3 archive adapter"
```

---

### Task 7: SFTP Archive Adapter

**Files:**
- Create: `packages/retention/src/adapters/sftp.ts`
- Create: `packages/retention/src/adapters/sftp.test.ts`

**Step 1: Add dependency**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/retention && pnpm add ssh2-sftp-client && pnpm add -D @types/ssh2-sftp-client`

**Step 2: Write failing tests**

```typescript
// packages/retention/src/adapters/sftp.test.ts
import { describe, it, expect, vi } from "vitest";
import { SFTPAdapter } from "./sftp.js";
import type { ArchivePayload, ArchiveConfig } from "../ports/archive-port.js";

vi.mock("ssh2-sftp-client", () => {
  const mockClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ isDirectory: true }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  };
  return { default: vi.fn().mockImplementation(() => mockClient) };
});

const adapter = new SFTPAdapter();

const config: ArchiveConfig = {
  type: "sftp",
  config: { host: "sftp.example.com", port: 22, remotePath: "/archives" },
  credential: { username: "user", password: "pass" },
};

const payload: ArchivePayload = {
  orgId: "org-1",
  executionId: "exec-1",
  dataType: "findings",
  records: [{ id: "f1" }],
  metadata: { severity: "high", cutoffDate: "2026-01-01", exportedAt: "2026-03-18" },
};

describe("SFTPAdapter", () => {
  it("has type 'sftp'", () => {
    expect(adapter.type).toBe("sftp");
  });

  it("testConnection connects and stats remote path", async () => {
    const result = await adapter.testConnection(config);
    expect(result.ok).toBe(true);
  });

  it("archives records as JSONL", async () => {
    const result = await adapter.archive(payload, config);
    expect(result.success).toBe(true);
    expect(result.recordCount).toBe(1);
    expect(result.destination).toContain("/archives/org-1/findings/");
  });
});
```

**Step 3: Implement**

```typescript
// packages/retention/src/adapters/sftp.ts
import SFTPClient from "ssh2-sftp-client";
import type { ArchivePort, ArchivePayload, ArchiveConfig, ArchiveResult } from "../ports/archive-port.js";

export class SFTPAdapter implements ArchivePort {
  readonly type = "sftp";

  private getConnectConfig(config: ArchiveConfig) {
    const { host, port } = config.config as { host: string; port?: number; remotePath: string };
    const cred = config.credential as { username: string; password?: string; privateKey?: string } | undefined;
    return {
      host,
      port: port ?? 22,
      username: cred?.username ?? "sentinel",
      ...(cred?.password ? { password: cred.password } : {}),
      ...(cred?.privateKey ? { privateKey: cred.privateKey } : {}),
    };
  }

  private buildRemotePath(payload: ArchivePayload, config: ArchiveConfig): string {
    const { remotePath } = config.config as { remotePath: string };
    const date = new Date().toISOString().split("T")[0];
    return `${remotePath}/${payload.orgId}/${payload.dataType}/${date}.jsonl`;
  }

  async testConnection(config: ArchiveConfig): Promise<{ ok: boolean; error?: string }> {
    const sftp = new SFTPClient();
    try {
      await sftp.connect(this.getConnectConfig(config));
      const { remotePath } = config.config as { remotePath: string };
      await sftp.stat(remotePath);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      await sftp.end().catch(() => {});
    }
  }

  async archive(payload: ArchivePayload, config: ArchiveConfig): Promise<ArchiveResult> {
    const sftp = new SFTPClient();
    const remotePath = this.buildRemotePath(payload, config);
    try {
      await sftp.connect(this.getConnectConfig(config));
      // Ensure directory exists
      const dir = remotePath.substring(0, remotePath.lastIndexOf("/"));
      try { await sftp.mkdir(dir, true); } catch { /* may already exist */ }

      const body = payload.records.map((r) => JSON.stringify(r)).join("\n");
      await sftp.put(Buffer.from(body, "utf-8"), remotePath);

      return { success: true, recordCount: payload.records.length, destination: `sftp://${(config.config as any).host}${remotePath}` };
    } catch (err: unknown) {
      return { success: false, recordCount: 0, destination: "", error: err instanceof Error ? err.message : String(err) };
    } finally {
      await sftp.end().catch(() => {});
    }
  }
}
```

**Step 4: Run tests**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/retention && npx vitest run src/adapters/sftp.test.ts`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add packages/retention/src/adapters/sftp.ts packages/retention/src/adapters/sftp.test.ts
git commit -m "feat(retention): add SFTP archive adapter"
```

---

### Task 8: Azure Blob and GCS Adapters

**Files:**
- Create: `packages/retention/src/adapters/azure-blob.ts`
- Create: `packages/retention/src/adapters/azure-blob.test.ts`
- Create: `packages/retention/src/adapters/gcs.ts`

**Step 1: Add Azure dependency**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/retention && pnpm add @azure/storage-blob`

**Step 2: Write Azure Blob tests**

```typescript
// packages/retention/src/adapters/azure-blob.test.ts
import { describe, it, expect, vi } from "vitest";
import { AzureBlobAdapter } from "./azure-blob.js";
import type { ArchivePayload, ArchiveConfig } from "../ports/archive-port.js";

vi.mock("@azure/storage-blob", () => {
  const uploadMock = vi.fn().mockResolvedValue({});
  const getPropertiesMock = vi.fn().mockResolvedValue({});
  const getBlockBlobClient = vi.fn().mockReturnValue({ upload: uploadMock });
  const getContainerClient = vi.fn().mockReturnValue({ getBlockBlobClient, getProperties: getPropertiesMock });
  const BlobServiceClient = { fromConnectionString: vi.fn().mockReturnValue({ getContainerClient }) };
  return { BlobServiceClient };
});

const adapter = new AzureBlobAdapter();
const config: ArchiveConfig = {
  type: "azure_blob",
  config: { container: "archives" },
  credential: { connectionString: "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=key;EndpointSuffix=core.windows.net" },
};
const payload: ArchivePayload = {
  orgId: "org-1", executionId: "exec-1", dataType: "findings",
  records: [{ id: "f1" }],
  metadata: { severity: "high", cutoffDate: "2026-01-01", exportedAt: "2026-03-18" },
};

describe("AzureBlobAdapter", () => {
  it("has type 'azure_blob'", () => { expect(adapter.type).toBe("azure_blob"); });
  it("archives records", async () => {
    const result = await adapter.archive(payload, config);
    expect(result.success).toBe(true);
    expect(result.recordCount).toBe(1);
  });
  it("testConnection checks container", async () => {
    const result = await adapter.testConnection(config);
    expect(result.ok).toBe(true);
  });
});
```

**Step 3: Implement Azure Blob adapter**

```typescript
// packages/retention/src/adapters/azure-blob.ts
import { BlobServiceClient } from "@azure/storage-blob";
import type { ArchivePort, ArchivePayload, ArchiveConfig, ArchiveResult } from "../ports/archive-port.js";

export class AzureBlobAdapter implements ArchivePort {
  readonly type = "azure_blob";

  async testConnection(config: ArchiveConfig): Promise<{ ok: boolean; error?: string }> {
    try {
      const { container } = config.config as { container: string };
      const connStr = (config.credential as { connectionString: string }).connectionString;
      const client = BlobServiceClient.fromConnectionString(connStr).getContainerClient(container);
      await client.getProperties();
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async archive(payload: ArchivePayload, config: ArchiveConfig): Promise<ArchiveResult> {
    try {
      const { container } = config.config as { container: string };
      const connStr = (config.credential as { connectionString: string }).connectionString;
      const containerClient = BlobServiceClient.fromConnectionString(connStr).getContainerClient(container);
      const date = new Date().toISOString().split("T")[0];
      const blobName = `${payload.orgId}/${payload.dataType}/${payload.metadata.severity ?? "all"}/${date}.jsonl`;
      const body = payload.records.map((r) => JSON.stringify(r)).join("\n");
      const blockBlob = containerClient.getBlockBlobClient(blobName);
      await blockBlob.upload(body, Buffer.byteLength(body));
      return { success: true, recordCount: payload.records.length, destination: `azure://${container}/${blobName}` };
    } catch (err: unknown) {
      return { success: false, recordCount: 0, destination: "", error: err instanceof Error ? err.message : String(err) };
    }
  }
}
```

**Step 4: Create GCS adapter (wraps S3 with GCS endpoint)**

```typescript
// packages/retention/src/adapters/gcs.ts
import { S3Adapter } from "./s3.js";
import type { ArchiveConfig, ArchivePayload, ArchiveResult, ArchivePort } from "../ports/archive-port.js";

export class GCSAdapter implements ArchivePort {
  readonly type = "gcs";
  private s3 = new S3Adapter();

  private toS3Config(config: ArchiveConfig): ArchiveConfig {
    return {
      ...config,
      config: {
        ...config.config,
        endpoint: "https://storage.googleapis.com",
        region: "auto",
      },
    };
  }

  async testConnection(config: ArchiveConfig): Promise<{ ok: boolean; error?: string }> {
    return this.s3.testConnection(this.toS3Config(config));
  }

  async archive(payload: ArchivePayload, config: ArchiveConfig): Promise<ArchiveResult> {
    const result = await this.s3.archive(payload, this.toS3Config(config));
    if (result.success) {
      result.destination = result.destination.replace("s3://", "gs://");
    }
    return result;
  }
}
```

**Step 5: Run tests**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/retention && npx vitest run src/adapters/azure-blob.test.ts`
Expected: 3 tests PASS

**Step 6: Commit**

```bash
git add packages/retention/src/adapters/
git commit -m "feat(retention): add Azure Blob and GCS archive adapters"
```

---

### Task 9: Prisma Schema — Add Retention Models

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Step 1: Add the new models to the Prisma schema**

Add after existing models at the end of the file. Also add relation fields to the `Organization` model.

Add to `Organization` model relations list:
```prisma
  retentionPolicies         RetentionPolicy[]
  retentionPolicyChanges    RetentionPolicyChange[]
  archiveDestinations       ArchiveDestination[]
  retentionExecutions       RetentionExecution[]
  retentionStats            RetentionStats[]
  encryptedCredentials      EncryptedCredential[]
```

Add new models at end of schema:
```prisma
model RetentionPolicy {
  id           String       @id @default(uuid()) @db.Uuid
  orgId        String       @db.Uuid @map("org_id")
  org          Organization @relation(fields: [orgId], references: [id])
  preset       String
  tierCritical Int          @map("tier_critical")
  tierHigh     Int          @map("tier_high")
  tierMedium   Int          @map("tier_medium")
  tierLow      Int          @map("tier_low")
  createdAt    DateTime     @default(now()) @map("created_at")
  updatedAt    DateTime     @updatedAt @map("updated_at")

  @@unique([orgId])
  @@map("retention_policies")
}

model RetentionPolicyChange {
  id             String    @id @default(uuid()) @db.Uuid
  orgId          String    @db.Uuid @map("org_id")
  org            Organization @relation(fields: [orgId], references: [id])
  requestedBy    String    @db.Uuid @map("requested_by")
  reviewedBy     String?   @db.Uuid @map("reviewed_by")
  status         String    @default("pending")
  preset         String
  tierCritical   Int       @map("tier_critical")
  tierHigh       Int       @map("tier_high")
  tierMedium     Int       @map("tier_medium")
  tierLow        Int       @map("tier_low")
  dryRunEstimate Json?     @map("dry_run_estimate")
  reviewNote     String?   @map("review_note")
  createdAt      DateTime  @default(now()) @map("created_at")
  reviewedAt     DateTime? @map("reviewed_at")
  appliedAt      DateTime? @map("applied_at")

  @@map("retention_policy_changes")
}

model ArchiveDestination {
  id            String   @id @default(uuid()) @db.Uuid
  orgId         String   @db.Uuid @map("org_id")
  org           Organization @relation(fields: [orgId], references: [id])
  type          String
  name          String
  config        Json
  credentialRef String?  @db.Uuid @map("credential_ref")
  enabled       Boolean  @default(true)
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  @@map("archive_destinations")
}

model RetentionExecution {
  id              String    @id @default(uuid()) @db.Uuid
  orgId           String    @db.Uuid @map("org_id")
  org             Organization @relation(fields: [orgId], references: [id])
  status          String    @default("pending")
  policySnapshot  Json      @map("policy_snapshot")
  archivedCount   Json?     @map("archived_count")
  deletedCount    Json?     @map("deleted_count")
  error           String?
  startedAt       DateTime  @default(now()) @map("started_at")
  completedAt     DateTime? @map("completed_at")

  @@map("retention_executions")
}

model RetentionStats {
  id          String   @id @default(uuid()) @db.Uuid
  orgId       String   @db.Uuid @map("org_id")
  org         Organization @relation(fields: [orgId], references: [id])
  severity    String
  ageBucket   String   @map("age_bucket")
  recordCount Int      @map("record_count")
  snapshotAt  DateTime @default(now()) @map("snapshot_at")

  @@unique([orgId, severity, ageBucket, snapshotAt])
  @@map("retention_stats")
}

model EncryptedCredential {
  id         String   @id @default(uuid()) @db.Uuid
  orgId      String   @db.Uuid @map("org_id")
  org        Organization @relation(fields: [orgId], references: [id])
  ciphertext Bytes
  iv         Bytes
  tag        Bytes
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@map("encrypted_credentials")
}
```

**Step 2: Generate Prisma client**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo db:generate --filter=@sentinel/db`

If the turbo script doesn't exist, use: `cd packages/db && npx prisma generate`

**Step 3: Create migration**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/db && npx prisma migrate dev --name add_retention_models`

**Step 4: Commit**

```bash
git add packages/db/prisma/
git commit -m "feat(db): add retention policy, archive, execution, and stats models"
```

---

### Task 10: API Routes — Policy & Presets

**Files:**
- Create: `apps/api/src/routes/retention.ts`
- Modify: `apps/api/src/server.ts` (add import + registration)

**Step 1: Create the route file with policy endpoints**

```typescript
// apps/api/src/routes/retention.ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { validateTierValues, RETENTION_PRESETS, detectPreset } from "@sentinel/retention";

export function registerRetentionRoutes(app: FastifyInstance, authHook: any) {
  // GET /v1/retention/presets
  app.get("/v1/retention/presets", { preHandler: authHook }, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ presets: RETENTION_PRESETS });
  });

  // GET /v1/retention/policy
  app.get("/v1/retention/policy", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;

    const policy = await db.retentionPolicy.findUnique({ where: { orgId } });
    if (policy) {
      return reply.send(policy);
    }

    // Fallback: read legacy retentionDays from org settings
    const org = await db.organization.findFirst({ where: { id: orgId } });
    const legacyDays = (org?.settings as any)?.retentionDays ?? 90;
    return reply.send({
      id: null,
      orgId,
      preset: "standard",
      tierCritical: legacyDays,
      tierHigh: legacyDays,
      tierMedium: legacyDays,
      tierLow: legacyDays,
    });
  });
}
```

**Step 2: Register in server.ts**

Add import near line 52:
```typescript
import { registerRetentionRoutes } from "./routes/retention.js";
```

Add registration near line 2243 (after `registerOrgSettingsRoutes`):
```typescript
registerRetentionRoutes(app, authHook);
```

**Step 3: Commit**

```bash
git add apps/api/src/routes/retention.ts apps/api/src/server.ts
git commit -m "feat(api): add retention policy and presets routes"
```

---

### Task 11: API Routes — Approval Workflow

**Files:**
- Modify: `apps/api/src/routes/retention.ts`

**Step 1: Add approval workflow endpoints to retention.ts**

Add inside the `registerRetentionRoutes` function:

```typescript
  // POST /v1/retention/policy/changes — create pending change
  app.post("/v1/retention/policy/changes", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const userId = (request as any).userId;
    const role = (request as any).userRole;

    if (!["admin", "manager"].includes(role)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }

    const body = request.body as { preset: string; tierCritical: number; tierHigh: number; tierMedium: number; tierLow: number };
    const validation = validateTierValues({
      critical: body.tierCritical,
      high: body.tierHigh,
      medium: body.tierMedium,
      low: body.tierLow,
    });
    if (!validation.valid) {
      return reply.status(400).send({ error: "Invalid tier values", details: validation.errors });
    }

    // Check no pending change exists
    const existing = await db.retentionPolicyChange.findFirst({
      where: { orgId, status: "pending" },
    });
    if (existing) {
      return reply.status(409).send({ error: "A pending change already exists", changeId: existing.id });
    }

    const change = await db.retentionPolicyChange.create({
      data: {
        orgId,
        requestedBy: userId,
        preset: body.preset,
        tierCritical: body.tierCritical,
        tierHigh: body.tierHigh,
        tierMedium: body.tierMedium,
        tierLow: body.tierLow,
        status: "pending",
      },
    });

    return reply.status(201).send(change);
  });

  // GET /v1/retention/policy/changes
  app.get("/v1/retention/policy/changes", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const query = request.query as { limit?: string; offset?: string };
    const limit = Math.min(parseInt(query.limit ?? "20", 10), 100);
    const offset = parseInt(query.offset ?? "0", 10);

    const [changes, total] = await Promise.all([
      db.retentionPolicyChange.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
      db.retentionPolicyChange.count({ where: { orgId } }),
    ]);

    return reply.send({ changes, total });
  });

  // GET /v1/retention/policy/changes/:id
  app.get("/v1/retention/policy/changes/:id", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const { id } = request.params as { id: string };

    const change = await db.retentionPolicyChange.findFirst({ where: { id, orgId } });
    if (!change) return reply.status(404).send({ error: "Change not found" });
    return reply.send(change);
  });

  // POST /v1/retention/policy/changes/:id/approve
  app.post("/v1/retention/policy/changes/:id/approve", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const userId = (request as any).userId;
    const role = (request as any).userRole;
    const { id } = request.params as { id: string };

    if (!["admin", "manager"].includes(role)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }

    const change = await db.retentionPolicyChange.findFirst({ where: { id, orgId, status: "pending" } });
    if (!change) return reply.status(404).send({ error: "Pending change not found" });
    if (change.requestedBy === userId) {
      return reply.status(403).send({ error: "Cannot approve your own change" });
    }

    // Capture before state
    const beforePolicy = await db.retentionPolicy.findUnique({ where: { orgId } });

    // Apply the policy
    await db.retentionPolicy.upsert({
      where: { orgId },
      create: {
        orgId,
        preset: change.preset,
        tierCritical: change.tierCritical,
        tierHigh: change.tierHigh,
        tierMedium: change.tierMedium,
        tierLow: change.tierLow,
      },
      update: {
        preset: change.preset,
        tierCritical: change.tierCritical,
        tierHigh: change.tierHigh,
        tierMedium: change.tierMedium,
        tierLow: change.tierLow,
      },
    });

    const updated = await db.retentionPolicyChange.update({
      where: { id },
      data: { status: "applied", reviewedBy: userId, reviewedAt: new Date(), appliedAt: new Date() },
    });

    return reply.send(updated);
  });

  // POST /v1/retention/policy/changes/:id/reject
  app.post("/v1/retention/policy/changes/:id/reject", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const userId = (request as any).userId;
    const { id } = request.params as { id: string };
    const body = request.body as { reviewNote?: string } | undefined;

    const change = await db.retentionPolicyChange.findFirst({ where: { id, orgId, status: "pending" } });
    if (!change) return reply.status(404).send({ error: "Pending change not found" });

    const updated = await db.retentionPolicyChange.update({
      where: { id },
      data: { status: "rejected", reviewedBy: userId, reviewedAt: new Date(), reviewNote: body?.reviewNote ?? null },
    });

    return reply.send(updated);
  });
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/retention.ts
git commit -m "feat(api): add retention policy approval workflow routes"
```

---

### Task 12: API Routes — Archive Destinations CRUD

**Files:**
- Modify: `apps/api/src/routes/retention.ts`

**Step 1: Add archive destination endpoints**

Add inside `registerRetentionRoutes`:

```typescript
  // GET /v1/retention/archives
  app.get("/v1/retention/archives", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const destinations = await db.archiveDestination.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } });
    // Mask credentials — only return "configured" status
    const masked = destinations.map((d: any) => ({
      ...d,
      hasCredential: !!d.credentialRef,
      credentialRef: undefined,
    }));
    return reply.send({ destinations: masked });
  });

  // POST /v1/retention/archives
  app.post("/v1/retention/archives", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const role = (request as any).userRole;
    if (role !== "admin") return reply.status(403).send({ error: "Admin only" });

    const body = request.body as { type: string; name: string; config: Record<string, unknown>; credential?: Record<string, unknown> };
    const validTypes = ["s3", "gcs", "azure_blob", "webhook", "sftp"];
    if (!validTypes.includes(body.type)) {
      return reply.status(400).send({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` });
    }

    let credentialRef: string | null = null;
    if (body.credential) {
      const { encryptCredential } = await import("@sentinel/retention");
      const encKey = Buffer.from(process.env.SENTINEL_ENCRYPTION_KEY ?? "", "hex");
      if (encKey.length !== 32) {
        return reply.status(500).send({ error: "SENTINEL_ENCRYPTION_KEY not configured" });
      }
      const encrypted = encryptCredential(JSON.stringify(body.credential), encKey);
      const cred = await db.encryptedCredential.create({
        data: { orgId, ciphertext: encrypted.ciphertext, iv: encrypted.iv, tag: encrypted.tag },
      });
      credentialRef = cred.id;
    }

    const dest = await db.archiveDestination.create({
      data: { orgId, type: body.type, name: body.name, config: body.config, credentialRef },
    });

    return reply.status(201).send({ ...dest, hasCredential: !!credentialRef, credentialRef: undefined });
  });

  // PUT /v1/retention/archives/:id
  app.put("/v1/retention/archives/:id", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const role = (request as any).userRole;
    const { id } = request.params as { id: string };
    if (role !== "admin") return reply.status(403).send({ error: "Admin only" });

    const existing = await db.archiveDestination.findFirst({ where: { id, orgId } });
    if (!existing) return reply.status(404).send({ error: "Destination not found" });

    const body = request.body as { name?: string; config?: Record<string, unknown>; enabled?: boolean };
    const updated = await db.archiveDestination.update({
      where: { id },
      data: { ...(body.name !== undefined && { name: body.name }), ...(body.config !== undefined && { config: body.config }), ...(body.enabled !== undefined && { enabled: body.enabled }) },
    });

    return reply.send({ ...updated, hasCredential: !!updated.credentialRef, credentialRef: undefined });
  });

  // DELETE /v1/retention/archives/:id
  app.delete("/v1/retention/archives/:id", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const role = (request as any).userRole;
    const { id } = request.params as { id: string };
    if (role !== "admin") return reply.status(403).send({ error: "Admin only" });

    const existing = await db.archiveDestination.findFirst({ where: { id, orgId } });
    if (!existing) return reply.status(404).send({ error: "Destination not found" });

    if (existing.credentialRef) {
      await db.encryptedCredential.delete({ where: { id: existing.credentialRef } }).catch(() => {});
    }
    await db.archiveDestination.delete({ where: { id } });
    return reply.status(204).send();
  });

  // POST /v1/retention/archives/:id/test
  app.post("/v1/retention/archives/:id/test", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const { id } = request.params as { id: string };

    const dest = await db.archiveDestination.findFirst({ where: { id, orgId } });
    if (!dest) return reply.status(404).send({ error: "Destination not found" });

    let credential: Record<string, unknown> | undefined;
    if (dest.credentialRef) {
      const { decryptCredential } = await import("@sentinel/retention");
      const encKey = Buffer.from(process.env.SENTINEL_ENCRYPTION_KEY ?? "", "hex");
      const cred = await db.encryptedCredential.findUnique({ where: { id: dest.credentialRef } });
      if (cred) {
        credential = JSON.parse(decryptCredential({ ciphertext: cred.ciphertext, iv: cred.iv, tag: cred.tag }, encKey));
      }
    }

    const { getArchiveAdapter } = await import("@sentinel/retention");
    const adapter = getArchiveAdapter(dest.type);
    const result = await adapter.testConnection({ type: dest.type, config: dest.config as Record<string, unknown>, credential });
    return reply.send(result);
  });
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/retention.ts
git commit -m "feat(api): add archive destination CRUD and test routes"
```

---

### Task 13: API Routes — Stats, Preview, Executions

**Files:**
- Modify: `apps/api/src/routes/retention.ts`

**Step 1: Add dashboard data endpoints**

Add inside `registerRetentionRoutes`:

```typescript
  // GET /v1/retention/stats — volume breakdown
  app.get("/v1/retention/stats", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;

    // Get latest snapshot per severity+ageBucket
    const stats = await db.retentionStats.findMany({
      where: { orgId },
      orderBy: { snapshotAt: "desc" },
      distinct: ["severity", "ageBucket"],
    });

    return reply.send({ stats });
  });

  // GET /v1/retention/stats/trend — 30-day trend
  app.get("/v1/retention/stats/trend", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const stats = await db.retentionStats.findMany({
      where: { orgId, snapshotAt: { gte: thirtyDaysAgo } },
      orderBy: { snapshotAt: "asc" },
    });

    return reply.send({ stats });
  });

  // GET /v1/retention/preview — approximate deletion counts
  app.get("/v1/retention/preview", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const query = request.query as { critical?: string; high?: string; medium?: string; low?: string };

    const tiers = {
      critical: parseInt(query.critical ?? "365", 10),
      high: parseInt(query.high ?? "180", 10),
      medium: parseInt(query.medium ?? "90", 10),
      low: parseInt(query.low ?? "30", 10),
    };

    const now = new Date();
    const estimates: Record<string, number> = {};
    for (const [severity, days] of Object.entries(tiers)) {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - days);
      const count = await db.finding.count({
        where: { severity, createdAt: { lt: cutoff }, scan: { project: { orgId } } },
      });
      estimates[severity] = count;
    }

    return reply.send({ estimates, tiers });
  });

  // GET /v1/retention/executions
  app.get("/v1/retention/executions", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const query = request.query as { limit?: string; offset?: string };
    const limit = Math.min(parseInt(query.limit ?? "10", 10), 50);
    const offset = parseInt(query.offset ?? "0", 10);

    const [executions, total] = await Promise.all([
      db.retentionExecution.findMany({ where: { orgId }, orderBy: { startedAt: "desc" }, take: limit, skip: offset }),
      db.retentionExecution.count({ where: { orgId } }),
    ]);

    return reply.send({ executions, total });
  });

  // GET /v1/retention/executions/:id
  app.get("/v1/retention/executions/:id", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const { id } = request.params as { id: string };

    const execution = await db.retentionExecution.findFirst({ where: { id, orgId } });
    if (!execution) return reply.status(404).send({ error: "Execution not found" });
    return reply.send(execution);
  });
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/retention.ts
git commit -m "feat(api): add retention stats, preview, and execution history routes"
```

---

### Task 14: Update Retention Cron Job for Severity Tiers

**Files:**
- Modify: `apps/api/src/scheduler/jobs/retention.ts`
- Modify: `packages/security/src/data-retention.ts`

**Step 1: Update data-retention.ts to support severity-tiered deletion**

Add a new exported function alongside the existing one (don't break existing callers):

```typescript
// Add to packages/security/src/data-retention.ts

export interface TieredRetentionConfig {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export async function runTieredRetentionCleanup(
  db: {
    finding: ChunkableModel;
    agentResult: ChunkableModel;
    scan: ChunkableModel;
  },
  tiers: TieredRetentionConfig,
  orgId?: string,
): Promise<{ deletedFindings: number; deletedAgentResults: number; deletedScans: number }> {
  const now = new Date();
  let totalFindings = 0;

  // Delete findings per severity tier
  for (const [severity, days] of Object.entries(tiers)) {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - days);
    const orgFilter = orgId ? { scan: { project: { orgId } } } : {};
    totalFindings += await chunkedDelete(
      db.finding,
      { severity, createdAt: { lt: cutoff }, ...orgFilter },
    );
  }

  // For agent results and scans, use the minimum tier (most aggressive)
  const minDays = Math.min(tiers.critical, tiers.high, tiers.medium, tiers.low);
  const minCutoff = new Date(now);
  minCutoff.setDate(minCutoff.getDate() - minDays);

  const scanOrgFilter = orgId ? { project: { orgId } } : {};
  const deletedAgentResults = await chunkedDelete(
    db.agentResult,
    { scan: { startedAt: { lt: minCutoff }, ...scanOrgFilter } },
  );
  const deletedScans = await chunkedDelete(
    db.scan,
    { startedAt: { lt: minCutoff }, certificate: null, ...scanOrgFilter },
  );

  return { deletedFindings: totalFindings, deletedAgentResults, deletedScans };
}
```

Note: You'll need to export `chunkedDelete` or make it available to the new function. The simplest approach: move it above both functions (it's already module-scoped, so it's accessible).

**Step 2: Update the cron job to use tiered retention**

```typescript
// apps/api/src/scheduler/jobs/retention.ts
import { runRetentionCleanup, runTieredRetentionCleanup, DEFAULT_RETENTION_DAYS } from "@sentinel/security";
import type { SchedulerJob, JobContext } from "../types.js";

export class RetentionJob implements SchedulerJob {
  name = "retention" as const;
  schedule = "0 4 * * *";
  tier = "non-critical" as const;
  dependencies = ["redis", "postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const orgs = await ctx.db.organization.findMany({
      select: { id: true, settings: true },
    });

    for (const org of orgs) {
      // Check for dedicated RetentionPolicy first
      const policy = await ctx.db.retentionPolicy.findUnique({ where: { orgId: org.id } });

      let result;
      if (policy) {
        result = await runTieredRetentionCleanup(ctx.db, {
          critical: policy.tierCritical,
          high: policy.tierHigh,
          medium: policy.tierMedium,
          low: policy.tierLow,
        }, org.id);
      } else {
        // Legacy fallback
        const retentionDays = (org.settings as any)?.retentionDays ?? DEFAULT_RETENTION_DAYS;
        result = await runRetentionCleanup(ctx.db, retentionDays, org.id);
      }

      if (result.deletedFindings + result.deletedAgentResults + result.deletedScans > 0) {
        ctx.logger.info({ orgId: org.id, ...result }, "Org retention cleanup completed");
      }
    }
    ctx.logger.info("Data retention cleanup completed for all orgs");
  }
}
```

**Step 3: Commit**

```bash
git add packages/security/src/data-retention.ts apps/api/src/scheduler/jobs/retention.ts
git commit -m "feat(retention): support severity-tiered deletion in cron job"
```

---

### Task 15: Settings Hub — Add Data Retention Link

**Files:**
- Modify: `apps/dashboard/app/(dashboard)/settings/page.tsx`

**Step 1: Add IconDatabase icon import and LinkSectionCard**

Add `IconDatabase` to the icon imports (or reuse `IconActivity`). Add a new `LinkSectionCard` between "Report Schedules" and "Audit & Compliance":

```tsx
<LinkSectionCard
  title="Data Retention"
  description="Configure retention policies, archive destinations, and review cleanup history."
  href="/settings/retention"
  Icon={IconActivity}
  animationDelay="0.32s"
/>
```

**Step 2: Commit**

```bash
git add apps/dashboard/app/\(dashboard\)/settings/page.tsx
git commit -m "feat(dashboard): add Data Retention link to settings hub"
```

---

### Task 16: Dashboard — Retention Page Shell & Current Policy Card

**Files:**
- Create: `apps/dashboard/app/(dashboard)/settings/retention/page.tsx`

**Step 1: Create the page**

```tsx
// apps/dashboard/app/(dashboard)/settings/retention/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { IconChevronLeft, IconShield } from "@/components/icons";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/* ─── Types ─── */
interface RetentionPolicy {
  id: string | null;
  orgId: string;
  preset: string;
  tierCritical: number;
  tierHigh: number;
  tierMedium: number;
  tierLow: number;
}

interface PolicyChange {
  id: string;
  status: string;
  preset: string;
  tierCritical: number;
  tierHigh: number;
  tierMedium: number;
  tierLow: number;
  requestedBy: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  createdAt: string;
}

/* ─── Severity Colors ─── */
const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-status-fail",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-text-secondary",
};

/* ─── Current Policy Card ─── */
function CurrentPolicyCard({ policy, pendingChange, onRefresh }: {
  policy: RetentionPolicy | null;
  pendingChange: PolicyChange | null;
  onRefresh: () => void;
}) {
  const { data: session } = useSession();
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [preset, setPreset] = useState("standard");
  const [tiers, setTiers] = useState({ critical: 365, high: 180, medium: 90, low: 30 });
  const [submitting, setSubmitting] = useState(false);

  const PRESETS: Record<string, { critical: number; high: number; medium: number; low: number }> = {
    minimal: { critical: 90, high: 60, medium: 30, low: 14 },
    standard: { critical: 365, high: 180, medium: 90, low: 30 },
    compliance: { critical: 730, high: 365, medium: 180, low: 90 },
  };

  function handlePresetChange(name: string) {
    setPreset(name);
    if (PRESETS[name]) setTiers(PRESETS[name]);
  }

  async function handleSubmitChange() {
    setSubmitting(true);
    try {
      await fetch(`${API_BASE}/v1/retention/policy/changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset, tierCritical: tiers.critical, tierHigh: tiers.high, tierMedium: tiers.medium, tierLow: tiers.low }),
      });
      setShowChangeForm(false);
      onRefresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(changeId: string) {
    await fetch(`${API_BASE}/v1/retention/policy/changes/${changeId}/approve`, { method: "POST" });
    onRefresh();
  }

  async function handleReject(changeId: string) {
    await fetch(`${API_BASE}/v1/retention/policy/changes/${changeId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    onRefresh();
  }

  const tierEntries = policy ? [
    { label: "Critical", value: policy.tierCritical, color: SEVERITY_COLORS.critical },
    { label: "High", value: policy.tierHigh, color: SEVERITY_COLORS.high },
    { label: "Medium", value: policy.tierMedium, color: SEVERITY_COLORS.medium },
    { label: "Low", value: policy.tierLow, color: SEVERITY_COLORS.low },
  ] : [];

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconShield className="h-5 w-5 text-accent" />
          <h2 className="text-[15px] font-semibold text-text-primary">Retention Policy</h2>
          {policy && (
            <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-accent">
              {policy.preset}
            </span>
          )}
        </div>
        {!pendingChange && (
          <button
            onClick={() => setShowChangeForm(!showChangeForm)}
            className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-text-inverse transition-colors hover:bg-accent/90"
          >
            Request Change
          </button>
        )}
      </div>

      {/* Tier display */}
      {policy && (
        <div className="mt-4 grid grid-cols-4 gap-3">
          {tierEntries.map((t) => (
            <div key={t.label} className="rounded-lg border border-border bg-surface-0/50 p-3 text-center">
              <p className={`text-[11px] font-medium uppercase tracking-wider ${t.color}`}>{t.label}</p>
              <p className="mt-1 text-lg font-bold text-text-primary">{t.value}</p>
              <p className="text-[10px] text-text-tertiary">days</p>
            </div>
          ))}
        </div>
      )}

      {/* Pending change banner */}
      {pendingChange && (
        <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
          <p className="text-[13px] font-medium text-yellow-300">Pending policy change</p>
          <p className="mt-1 text-[12px] text-text-secondary">
            {pendingChange.preset} — Critical: {pendingChange.tierCritical}d, High: {pendingChange.tierHigh}d, Medium: {pendingChange.tierMedium}d, Low: {pendingChange.tierLow}d
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => handleApprove(pendingChange.id)} className="rounded-lg bg-status-pass px-3 py-1.5 text-[12px] font-medium text-white">
              Approve
            </button>
            <button onClick={() => handleReject(pendingChange.id)} className="rounded-lg border border-border px-3 py-1.5 text-[12px] text-text-secondary hover:bg-surface-2">
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Change request form */}
      {showChangeForm && (
        <div className="mt-4 space-y-4 rounded-lg border border-border bg-surface-0/50 p-4">
          <div className="flex gap-2">
            {["minimal", "standard", "compliance", "custom"].map((p) => (
              <button
                key={p}
                onClick={() => handlePresetChange(p)}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  preset === p ? "bg-accent text-text-inverse" : "border border-border text-text-secondary hover:bg-surface-2"
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="grid grid-cols-4 gap-3">
              {(["critical", "high", "medium", "low"] as const).map((sev) => (
                <div key={sev}>
                  <label className="text-[11px] font-medium uppercase text-text-tertiary">{sev}</label>
                  <input
                    type="number"
                    min={7}
                    max={2555}
                    value={tiers[sev]}
                    onChange={(e) => setTiers({ ...tiers, [sev]: parseInt(e.target.value, 10) || 7 })}
                    className="mt-1 w-full rounded-lg border border-border bg-surface-0/50 px-3 py-2 text-[13px] text-text-primary outline-none focus:border-border-accent"
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={handleSubmitChange} disabled={submitting} className="rounded-lg bg-accent px-4 py-2 text-[12px] font-medium text-text-inverse disabled:opacity-50">
              {submitting ? "Submitting…" : "Submit for Approval"}
            </button>
            <button onClick={() => setShowChangeForm(false)} className="rounded-lg border border-border px-4 py-2 text-[12px] text-text-secondary hover:bg-surface-2">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─── */
export default function RetentionPage() {
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null);
  const [pendingChange, setPendingChange] = useState<PolicyChange | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [policyRes, changesRes] = await Promise.all([
        fetch(`${API_BASE}/v1/retention/policy`),
        fetch(`${API_BASE}/v1/retention/policy/changes?limit=1`),
      ]);
      if (policyRes.ok) setPolicy(await policyRes.json());
      if (changesRes.ok) {
        const data = await changesRes.json();
        const pending = data.changes?.find((c: PolicyChange) => c.status === "pending");
        setPendingChange(pending ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-text-tertiary">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[13px] text-text-tertiary hover:text-accent transition-colors focus-ring rounded">
          <IconChevronLeft className="h-3.5 w-3.5" />
          Settings
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-text-primary">Data Retention</h1>
        <p className="mt-1 text-[13px] text-text-secondary">
          Configure retention policies, archive destinations, and review cleanup history.
        </p>
      </div>

      <div className="animate-fade-up space-y-4" style={{ animationDelay: "0.05s" }}>
        <CurrentPolicyCard policy={policy} pendingChange={pendingChange} onRefresh={fetchData} />
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/dashboard/app/\(dashboard\)/settings/retention/
git commit -m "feat(dashboard): add retention page with policy card and approval workflow"
```

---

### Task 17: Dashboard — Archive Destinations Card

**Files:**
- Modify: `apps/dashboard/app/(dashboard)/settings/retention/page.tsx`

**Step 1: Add ArchiveDestinationsCard component**

Add before the `RetentionPage` export in the same file:

```tsx
/* ─── Types ─── */
interface ArchiveDestination {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  hasCredential: boolean;
  createdAt: string;
}

const DEST_TYPE_LABELS: Record<string, string> = {
  s3: "Amazon S3",
  gcs: "Google Cloud Storage",
  azure_blob: "Azure Blob",
  webhook: "Webhook",
  sftp: "SFTP",
};

function ArchiveDestinationsCard() {
  const [destinations, setDestinations] = useState<ArchiveDestination[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState("s3");
  const [newName, setNewName] = useState("");
  const [newConfig, setNewConfig] = useState("{}");
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; error?: string }>>({});

  useEffect(() => {
    fetch(`${API_BASE}/v1/retention/archives`)
      .then((r) => r.json())
      .then((d) => setDestinations(d.destinations ?? []))
      .catch(() => {});
  }, []);

  async function handleAdd() {
    let config: Record<string, unknown>;
    try { config = JSON.parse(newConfig); } catch { return; }
    const res = await fetch(`${API_BASE}/v1/retention/archives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: newType, name: newName, config }),
    });
    if (res.ok) {
      const dest = await res.json();
      setDestinations([dest, ...destinations]);
      setShowAdd(false);
      setNewName("");
      setNewConfig("{}");
    }
  }

  async function handleTest(id: string) {
    setTesting(id);
    try {
      const res = await fetch(`${API_BASE}/v1/retention/archives/${id}/test`, { method: "POST" });
      const result = await res.json();
      setTestResult({ ...testResult, [id]: result });
    } finally {
      setTesting(null);
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    await fetch(`${API_BASE}/v1/retention/archives/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setDestinations(destinations.map((d) => d.id === id ? { ...d, enabled: !d.enabled } : d));
  }

  async function handleDelete(id: string) {
    await fetch(`${API_BASE}/v1/retention/archives/${id}`, { method: "DELETE" });
    setDestinations(destinations.filter((d) => d.id !== id));
  }

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-text-primary">Archive Destinations</h2>
        <button onClick={() => setShowAdd(!showAdd)} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-text-inverse hover:bg-accent/90">
          Add Destination
        </button>
      </div>

      {destinations.length > 0 && (
        <div className="mt-4 space-y-2">
          {destinations.map((dest) => (
            <div key={dest.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-0/50 px-4 py-3">
              <div>
                <p className="text-[13px] font-medium text-text-primary">{dest.name}</p>
                <p className="text-[11px] text-text-tertiary">{DEST_TYPE_LABELS[dest.type] ?? dest.type}</p>
              </div>
              <div className="flex items-center gap-2">
                {testResult[dest.id] && (
                  <span className={`text-[11px] ${testResult[dest.id].ok ? "text-status-pass" : "text-status-fail"}`}>
                    {testResult[dest.id].ok ? "Connected" : testResult[dest.id].error}
                  </span>
                )}
                <button onClick={() => handleTest(dest.id)} disabled={testing === dest.id} className="rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-2 disabled:opacity-50">
                  {testing === dest.id ? "Testing…" : "Test"}
                </button>
                <button onClick={() => handleToggle(dest.id, dest.enabled)} className={`rounded px-2 py-1 text-[11px] ${dest.enabled ? "bg-status-pass/15 text-status-pass" : "bg-surface-3 text-text-tertiary"}`}>
                  {dest.enabled ? "Enabled" : "Disabled"}
                </button>
                <button onClick={() => handleDelete(dest.id)} className="text-[11px] text-status-fail/70 hover:text-status-fail">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="mt-4 space-y-3 rounded-lg border border-border bg-surface-0/50 p-4">
          <div className="flex gap-2">
            {["s3", "gcs", "azure_blob", "webhook", "sftp"].map((t) => (
              <button key={t} onClick={() => setNewType(t)} className={`rounded-lg px-2 py-1 text-[11px] ${newType === t ? "bg-accent text-text-inverse" : "border border-border text-text-secondary"}`}>
                {DEST_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Destination name" className="w-full rounded-lg border border-border bg-surface-0/50 px-3 py-2 text-[12px] text-text-primary outline-none focus:border-border-accent" />
          <textarea value={newConfig} onChange={(e) => setNewConfig(e.target.value)} placeholder='{"bucket": "my-bucket", "region": "us-east-1"}' rows={3} className="w-full rounded-lg border border-border bg-surface-0/50 px-3 py-2 font-mono text-[11px] text-text-primary outline-none focus:border-border-accent" />
          <div className="flex gap-2">
            <button onClick={handleAdd} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-text-inverse">Save</button>
            <button onClick={() => setShowAdd(false)} className="rounded-lg border border-border px-3 py-1.5 text-[12px] text-text-secondary hover:bg-surface-2">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add the card to the page layout**

In `RetentionPage`, add after `CurrentPolicyCard`:
```tsx
<ArchiveDestinationsCard />
```

**Step 3: Commit**

```bash
git add apps/dashboard/app/\(dashboard\)/settings/retention/page.tsx
git commit -m "feat(dashboard): add archive destinations card to retention page"
```

---

### Task 18: Dashboard — Retention Dashboard Charts

**Files:**
- Modify: `apps/dashboard/app/(dashboard)/settings/retention/page.tsx`

**Step 1: Install recharts**

Run: `cd /home/ainaomotayo/archagents/sentinel/apps/dashboard && pnpm add recharts`

**Step 2: Add chart components**

Add before `RetentionPage`:

```tsx
import dynamic from "next/dynamic";

// Lazy-load recharts to avoid SSR issues
const BarChart = dynamic(() => import("recharts").then((m) => m.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const Legend = dynamic(() => import("recharts").then((m) => m.Legend), { ssr: false });

interface RetentionStat {
  severity: string;
  ageBucket: string;
  recordCount: number;
  snapshotAt: string;
}

const SEVERITY_CHART_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#6b7280",
};

const AGE_BUCKETS = ["0-30d", "30-90d", "90-180d", "180-365d", "365d+"];

function RetentionDashboardCard() {
  const [stats, setStats] = useState<RetentionStat[]>([]);
  const [trend, setTrend] = useState<RetentionStat[]>([]);
  const [preview, setPreview] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/v1/retention/stats`).then((r) => r.json()),
      fetch(`${API_BASE}/v1/retention/stats/trend`).then((r) => r.json()),
      fetch(`${API_BASE}/v1/retention/preview`).then((r) => r.json()),
    ]).then(([s, t, p]) => {
      setStats(s.stats ?? []);
      setTrend(t.stats ?? []);
      setPreview(p.estimates ?? {});
    }).catch(() => {});
  }, []);

  // Transform stats for stacked bar chart
  const barData = AGE_BUCKETS.map((bucket) => {
    const row: Record<string, unknown> = { bucket };
    for (const sev of ["critical", "high", "medium", "low"]) {
      const stat = stats.find((s) => s.ageBucket === bucket && s.severity === sev);
      row[sev] = stat?.recordCount ?? 0;
    }
    return row;
  });

  // Transform trend for line chart
  const trendDates = [...new Set(trend.map((s) => s.snapshotAt.split("T")[0]))].sort();
  const lineData = trendDates.map((date) => {
    const row: Record<string, unknown> = { date };
    for (const sev of ["critical", "high", "medium", "low"]) {
      const stat = trend.find((s) => s.snapshotAt.startsWith(date) && s.severity === sev);
      row[sev] = stat?.recordCount ?? 0;
    }
    return row;
  });

  const totalProjected = Object.values(preview).reduce((a, b) => a + b, 0);

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-6">
      <h2 className="text-[15px] font-semibold text-text-primary">Retention Dashboard</h2>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Volume Breakdown */}
        <div className="rounded-lg border border-border bg-surface-0/50 p-4">
          <h3 className="text-[13px] font-medium text-text-secondary">Volume by Age & Severity</h3>
          <div className="mt-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#888" }} />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} />
                <Tooltip />
                {["critical", "high", "medium", "low"].map((sev) => (
                  <Bar key={sev} dataKey={sev} stackId="a" fill={SEVERITY_CHART_COLORS[sev]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Storage Trend */}
        <div className="rounded-lg border border-border bg-surface-0/50 p-4">
          <h3 className="text-[13px] font-medium text-text-secondary">30-Day Trend</h3>
          <div className="mt-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} />
                <Tooltip />
                {["critical", "high", "medium", "low"].map((sev) => (
                  <Line key={sev} type="monotone" dataKey={sev} stroke={SEVERITY_CHART_COLORS[sev]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Projected Deletions */}
      <div className="mt-4 rounded-lg border border-border bg-surface-0/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-medium text-text-secondary">Projected Deletions (Next Run)</h3>
            <p className="text-[11px] text-text-tertiary">Scheduled: 4:00 AM UTC daily</p>
          </div>
          <p className="text-lg font-bold text-text-primary">{totalProjected.toLocaleString()} records</p>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {Object.entries(preview).map(([sev, count]) => (
            <div key={sev} className="text-center">
              <p className={`text-[11px] font-medium uppercase ${SEVERITY_COLORS[sev] ?? "text-text-tertiary"}`}>{sev}</p>
              <p className="text-[13px] font-semibold text-text-primary">{count.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Add to page layout**

In `RetentionPage`, add after `ArchiveDestinationsCard`:
```tsx
<RetentionDashboardCard />
```

**Step 4: Commit**

```bash
git add apps/dashboard/app/\(dashboard\)/settings/retention/page.tsx apps/dashboard/package.json
git commit -m "feat(dashboard): add retention dashboard with volume and trend charts"
```

---

### Task 19: Dashboard — Execution History Table

**Files:**
- Modify: `apps/dashboard/app/(dashboard)/settings/retention/page.tsx`

**Step 1: Add ExecutionHistoryCard component**

```tsx
interface RetentionExecution {
  id: string;
  status: string;
  policySnapshot: Record<string, number>;
  archivedCount: Record<string, number> | null;
  deletedCount: Record<string, number> | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-status-pass/15 text-status-pass",
  failed: "bg-status-fail/15 text-status-fail",
  pending: "bg-surface-3 text-text-tertiary",
  archiving: "bg-blue-500/15 text-blue-400",
  deleting: "bg-blue-500/15 text-blue-400",
  archived: "bg-blue-500/15 text-blue-400",
};

function ExecutionHistoryCard() {
  const [executions, setExecutions] = useState<RetentionExecution[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/v1/retention/executions?limit=10`)
      .then((r) => r.json())
      .then((d) => setExecutions(d.executions ?? []))
      .catch(() => {});
  }, []);

  function duration(exec: RetentionExecution): string {
    if (!exec.completedAt) return "—";
    const ms = new Date(exec.completedAt).getTime() - new Date(exec.startedAt).getTime();
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function sumCounts(counts: Record<string, number> | null): number {
    if (!counts) return 0;
    return Object.values(counts).reduce((a, b) => a + b, 0);
  }

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-6">
      <h2 className="text-[15px] font-semibold text-text-primary">Execution History</h2>
      {executions.length === 0 ? (
        <p className="mt-4 text-[12px] text-text-tertiary">No executions yet.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {executions.map((exec) => (
            <div key={exec.id}>
              <button
                onClick={() => setExpandedId(expandedId === exec.id ? null : exec.id)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-surface-0/50 px-4 py-3 text-left transition-colors hover:bg-surface-2"
              >
                <div className="flex items-center gap-3">
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLORS[exec.status] ?? STATUS_COLORS.pending}`}>
                    {exec.status}
                  </span>
                  <span className="text-[12px] text-text-secondary">
                    {new Date(exec.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-text-tertiary">
                  <span>Duration: {duration(exec)}</span>
                  <span>Archived: {sumCounts(exec.archivedCount).toLocaleString()}</span>
                  <span>Deleted: {sumCounts(exec.deletedCount).toLocaleString()}</span>
                </div>
              </button>
              {expandedId === exec.id && (
                <div className="ml-4 mt-1 rounded-lg border border-border bg-surface-0/30 p-3 text-[11px]">
                  {exec.error && <p className="text-status-fail">Error: {exec.error}</p>}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <p className="font-medium text-text-secondary">Archived</p>
                      {exec.archivedCount ? Object.entries(exec.archivedCount).map(([k, v]) => (
                        <p key={k} className="text-text-tertiary">{k}: {v.toLocaleString()}</p>
                      )) : <p className="text-text-tertiary">—</p>}
                    </div>
                    <div>
                      <p className="font-medium text-text-secondary">Deleted</p>
                      {exec.deletedCount ? Object.entries(exec.deletedCount).map(([k, v]) => (
                        <p key={k} className="text-text-tertiary">{k}: {v.toLocaleString()}</p>
                      )) : <p className="text-text-tertiary">—</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add to page layout**

In `RetentionPage`, add after `RetentionDashboardCard`:
```tsx
<ExecutionHistoryCard />
```

**Step 3: Commit**

```bash
git add apps/dashboard/app/\(dashboard\)/settings/retention/page.tsx
git commit -m "feat(dashboard): add execution history table to retention page"
```

---

### Task 20: Register All Adapters and Update Exports

**Files:**
- Modify: `packages/retention/src/index.ts`
- Create: `packages/retention/src/register-adapters.ts`

**Step 1: Create adapter registration**

```typescript
// packages/retention/src/register-adapters.ts
import { registerAdapter } from "./ports/registry.js";
import { S3Adapter } from "./adapters/s3.js";
import { GCSAdapter } from "./adapters/gcs.js";
import { AzureBlobAdapter } from "./adapters/azure-blob.js";
import { WebhookAdapter } from "./adapters/webhook.js";
import { SFTPAdapter } from "./adapters/sftp.js";

let registered = false;

export function registerAllAdapters(): void {
  if (registered) return;
  registerAdapter(new S3Adapter());
  registerAdapter(new GCSAdapter());
  registerAdapter(new AzureBlobAdapter());
  registerAdapter(new WebhookAdapter());
  registerAdapter(new SFTPAdapter());
  registered = true;
}
```

**Step 2: Update index.ts exports**

```typescript
// packages/retention/src/index.ts
export { RETENTION_PRESETS, validateTierValues, getPresetByName, detectPreset, type RetentionPreset, type TierValues, type ValidationResult } from "./policy.js";
export { encryptCredential, decryptCredential, type EncryptedData } from "./credential.js";
export type { ArchivePort, ArchivePayload, ArchiveResult, ArchiveConfig } from "./ports/archive-port.js";
export { registerAdapter, getArchiveAdapter, listAdapterTypes } from "./ports/registry.js";
export { registerAllAdapters } from "./register-adapters.js";
```

**Step 3: Call `registerAllAdapters()` in API route file**

At the top of `apps/api/src/routes/retention.ts`, add:
```typescript
import { registerAllAdapters } from "@sentinel/retention";
registerAllAdapters();
```

**Step 4: Commit**

```bash
git add packages/retention/src/ apps/api/src/routes/retention.ts
git commit -m "feat(retention): register all archive adapters and update exports"
```

---

### Task 21: Build Verification and Integration Test

**Files:**
- Verify: all packages build
- Create: `packages/retention/src/integration.test.ts` (optional smoke test)

**Step 1: Build all packages**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm install && npx turbo build`

Fix any build errors.

**Step 2: Run all retention package tests**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/retention && npx vitest run`

Expected: All tests pass (~18+ tests across policy, credential, adapters, registry)

**Step 3: Verify dashboard builds**

Run: `cd /home/ainaomotayo/archagents/sentinel/apps/dashboard && pnpm build`

Fix any Next.js build errors.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix build issues for retention feature"
```

---

## Task Summary

| # | Component | Files | Tests |
|---|-----------|-------|-------|
| 1 | Package scaffold | 3 create | 0 |
| 2 | Policy types & validation | 2 create | 8 |
| 3 | Credential encryption | 2 create | 4 |
| 4 | Archive port & registry | 3 create | 3 |
| 5 | Webhook adapter | 2 create | 4 |
| 6 | S3 adapter | 2 create | 3 |
| 7 | SFTP adapter | 2 create | 3 |
| 8 | Azure Blob + GCS adapters | 3 create | 3 |
| 9 | Prisma schema models | 1 modify | 0 |
| 10 | API: policy & presets | 2 create/modify | 0 |
| 11 | API: approval workflow | 1 modify | 0 |
| 12 | API: archive destinations | 1 modify | 0 |
| 13 | API: stats, preview, executions | 1 modify | 0 |
| 14 | Cron job: tiered retention | 2 modify | 0 |
| 15 | Settings hub link | 1 modify | 0 |
| 16 | Dashboard: page + policy card | 1 create | 0 |
| 17 | Dashboard: archive card | 1 modify | 0 |
| 18 | Dashboard: charts | 1 modify | 0 |
| 19 | Dashboard: execution history | 1 modify | 0 |
| 20 | Register adapters + exports | 3 create/modify | 0 |
| 21 | Build verification | 0 | smoke |

**Total: ~21 tasks, ~28 unit tests in packages/retention**
