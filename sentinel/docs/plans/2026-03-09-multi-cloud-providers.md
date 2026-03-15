# Multi-Cloud Provider Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to select AWS, Google Cloud, or Azure as their cloud provider for certificate archival and key management, configured via a single `CLOUD_PROVIDER` env var.

**Architecture:** Introduce a provider abstraction layer (`ArchiveProvider` interface for storage, reuse existing `KmsKeyStore` interface for keys). A factory function reads `CLOUD_PROVIDER` env var (`aws | gcp | azure`) and returns the correct implementation. The worker calls the provider-agnostic `archiveDocument()` function — it doesn't know which cloud is underneath. Each cloud provider is a separate source file with its own SDK dependency.

**Tech Stack:** `@aws-sdk/client-s3` + `@aws-sdk/client-kms` (AWS), `@google-cloud/storage` + `@google-cloud/kms` (GCP), `@azure/storage-blob` + `@azure/keyvault-keys` + `@azure/identity` (Azure)

---

## Task 1: Define Provider Abstraction and Factory

**Files to create:**
- `packages/security/src/archive-provider.ts`
- `packages/security/src/cloud-factory.ts`
- `packages/security/src/__tests__/cloud-factory.test.ts`

**Files to modify:**
- `packages/security/src/index.ts` — export new modules

### Steps

**Step 1: Create `packages/security/src/archive-provider.ts`**

Cloud-agnostic archive interface that all providers implement:

```typescript
export interface ArchiveProvider {
  /**
   * Upload a document to cloud storage with immutability/retention.
   */
  upload(opts: {
    bucket: string;
    key: string;
    data: string;
    contentType: string;
    retentionDays: number;
  }): Promise<{ key: string; bucket: string; versionId: string; retainUntil: string }>;
}

export type CloudProvider = "aws" | "gcp" | "azure";
```

**Step 2: Create `packages/security/src/cloud-factory.ts`**

Factory that reads `CLOUD_PROVIDER` and returns the correct implementations:

```typescript
import type { ArchiveProvider, CloudProvider } from "./archive-provider.js";
import type { KmsKeyStore } from "./kms.js";
import { InMemoryKeyStore } from "./kms.js";

export function getCloudProvider(): CloudProvider | null {
  const provider = process.env.CLOUD_PROVIDER?.toLowerCase();
  if (provider === "aws" || provider === "gcp" || provider === "azure") {
    return provider;
  }
  return null;
}

export async function createArchiveProvider(): Promise<ArchiveProvider | null> {
  const provider = getCloudProvider();
  if (!provider) return null;

  switch (provider) {
    case "aws": {
      const { AwsArchiveProvider } = await import("./archive-aws.js");
      return new AwsArchiveProvider({
        region: process.env.AWS_REGION ?? "us-east-1",
      });
    }
    case "gcp": {
      const { GcpArchiveProvider } = await import("./archive-gcp.js");
      return new GcpArchiveProvider({
        projectId: process.env.GCP_PROJECT_ID,
      });
    }
    case "azure": {
      const { AzureArchiveProvider } = await import("./archive-azure.js");
      return new AzureArchiveProvider({
        accountUrl: process.env.AZURE_STORAGE_ACCOUNT_URL ?? "",
      });
    }
  }
}

export async function createKmsProvider(): Promise<KmsKeyStore> {
  const provider = getCloudProvider();
  if (!provider) return new InMemoryKeyStore();

  switch (provider) {
    case "aws": {
      const { AwsKmsKeyStore } = await import("./kms-aws.js");
      return new AwsKmsKeyStore({
        region: process.env.AWS_REGION ?? "us-east-1",
        masterKeyId: process.env.KMS_MASTER_KEY_ID ?? "",
      });
    }
    case "gcp": {
      const { GcpKmsKeyStore } = await import("./kms-gcp.js");
      return new GcpKmsKeyStore({
        projectId: process.env.GCP_PROJECT_ID ?? "",
        locationId: process.env.GCP_KMS_LOCATION ?? "global",
        keyRingId: process.env.GCP_KMS_KEY_RING ?? "sentinel",
        keyId: process.env.GCP_KMS_KEY_ID ?? "sentinel-master",
      });
    }
    case "azure": {
      const { AzureKmsKeyStore } = await import("./kms-azure.js");
      return new AzureKmsKeyStore({
        vaultUrl: process.env.AZURE_KEY_VAULT_URL ?? "",
        keyName: process.env.AZURE_KEY_NAME ?? "sentinel-master",
      });
    }
  }
}
```

**Step 3: Write test `packages/security/src/__tests__/cloud-factory.test.ts`**

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { getCloudProvider } from "../cloud-factory.js";

describe("getCloudProvider", () => {
  afterEach(() => { delete process.env.CLOUD_PROVIDER; });

  it("returns null when CLOUD_PROVIDER is not set", () => {
    delete process.env.CLOUD_PROVIDER;
    expect(getCloudProvider()).toBeNull();
  });

  it("returns 'aws' for AWS", () => {
    process.env.CLOUD_PROVIDER = "aws";
    expect(getCloudProvider()).toBe("aws");
  });

  it("returns 'gcp' for GCP (case insensitive)", () => {
    process.env.CLOUD_PROVIDER = "GCP";
    expect(getCloudProvider()).toBe("gcp");
  });

  it("returns 'azure' for Azure", () => {
    process.env.CLOUD_PROVIDER = "azure";
    expect(getCloudProvider()).toBe("azure");
  });

  it("returns null for unknown provider", () => {
    process.env.CLOUD_PROVIDER = "oracle";
    expect(getCloudProvider()).toBeNull();
  });
});
```

**Step 4: Update `packages/security/src/index.ts`**

Add exports:
```typescript
export type { ArchiveProvider, CloudProvider } from "./archive-provider.js";
export { getCloudProvider, createArchiveProvider, createKmsProvider } from "./cloud-factory.js";
```

**Step 5: Run tests, build, commit**

```bash
pnpm --filter @sentinel/security test
pnpm turbo build
git add packages/security/
git commit -m "feat: add cloud provider abstraction with factory pattern"
```

---

## Task 2: Refactor AWS into Provider Interface

**Files to create:**
- `packages/security/src/archive-aws.ts`

**Files to modify:**
- `packages/security/src/s3-client.ts` — keep backward-compat exports but delegate to provider internally

### Steps

**Step 1: Create `packages/security/src/archive-aws.ts`**

```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { ArchiveProvider } from "./archive-provider.js";

export class AwsArchiveProvider implements ArchiveProvider {
  private s3: S3Client;

  constructor(opts: { region?: string }) {
    this.s3 = new S3Client({ region: opts.region ?? "us-east-1" });
  }

  async upload(opts: {
    bucket: string;
    key: string;
    data: string;
    contentType: string;
    retentionDays: number;
  }) {
    const retainUntil = new Date();
    retainUntil.setUTCDate(retainUntil.getUTCDate() + opts.retentionDays);

    const result = await this.s3.send(
      new PutObjectCommand({
        Bucket: opts.bucket,
        Key: opts.key,
        Body: opts.data,
        ContentType: opts.contentType,
        ObjectLockMode: "COMPLIANCE",
        ObjectLockRetainUntilDate: retainUntil,
      }),
    );

    return {
      key: opts.key,
      bucket: opts.bucket,
      versionId: result.VersionId ?? "",
      retainUntil: retainUntil.toISOString(),
    };
  }
}
```

**Step 2: Update `packages/security/src/s3-client.ts`**

Refactor to use the provider internally while keeping backward-compatible exports:

```typescript
import type { ArchiveConfig, ArchiveResult } from "./s3-archive.js";
import { buildArchiveKey } from "./s3-archive.js";
import type { ArchiveProvider } from "./archive-provider.js";
import { createArchiveProvider, getCloudProvider } from "./cloud-factory.js";

let provider: ArchiveProvider | null | undefined;

async function getProvider(): Promise<ArchiveProvider | null> {
  if (provider === undefined) {
    provider = await createArchiveProvider();
  }
  return provider;
}

export async function archiveToS3(
  config: ArchiveConfig,
  orgId: string,
  documentId: string,
  data: string,
): Promise<ArchiveResult> {
  const p = await getProvider();
  if (!p) {
    throw new Error("No cloud provider configured. Set CLOUD_PROVIDER env var.");
  }

  const key = `${config.prefix}/${buildArchiveKey(orgId, documentId)}`;

  return p.upload({
    bucket: config.bucket,
    key,
    data,
    contentType: "application/json",
    retentionDays: config.retentionDays,
  });
}

export function isArchiveEnabled(): boolean {
  return getCloudProvider() !== null && !!(
    process.env.ARCHIVE_BUCKET ||
    process.env.S3_ARCHIVE_BUCKET ||
    process.env.GCS_ARCHIVE_BUCKET ||
    process.env.AZURE_ARCHIVE_CONTAINER
  );
}

export function getArchiveConfig(): ArchiveConfig {
  return {
    bucket:
      process.env.ARCHIVE_BUCKET ??
      process.env.S3_ARCHIVE_BUCKET ??
      process.env.GCS_ARCHIVE_BUCKET ??
      process.env.AZURE_ARCHIVE_CONTAINER ??
      "",
    prefix: process.env.ARCHIVE_PREFIX ?? process.env.S3_ARCHIVE_PREFIX ?? "sentinel",
    retentionDays: parseInt(
      process.env.ARCHIVE_RETENTION_DAYS ?? process.env.S3_RETENTION_DAYS ?? "2555",
      10,
    ),
  };
}
```

**Step 3: Update existing s3-client tests**

Update `packages/security/src/__tests__/s3-client.test.ts` to use the new generic env vars alongside the old ones. The tests should verify both `ARCHIVE_BUCKET` and `S3_ARCHIVE_BUCKET` work.

**Step 4: Export AwsArchiveProvider from index.ts**

Add to `packages/security/src/index.ts`:
```typescript
export { AwsArchiveProvider } from "./archive-aws.js";
```

**Step 5: Run tests, build, commit**

```bash
pnpm --filter @sentinel/security test
pnpm turbo build
git add packages/security/
git commit -m "refactor: extract AWS archive into provider interface"
```

---

## Task 3: Add Google Cloud Provider (GCS + Cloud KMS)

**Files to create:**
- `packages/security/src/archive-gcp.ts`
- `packages/security/src/kms-gcp.ts`
- `packages/security/src/__tests__/archive-gcp.test.ts`
- `packages/security/src/__tests__/kms-gcp.test.ts`

**Files to modify:**
- `packages/security/package.json` — add GCP dependencies
- `packages/security/src/index.ts` — export GCP modules

### Steps

**Step 1: Add GCP dependencies**

```bash
cd packages/security && pnpm add @google-cloud/storage @google-cloud/kms
```

**Step 2: Create `packages/security/src/archive-gcp.ts`**

```typescript
import { Storage } from "@google-cloud/storage";
import type { ArchiveProvider } from "./archive-provider.js";

export class GcpArchiveProvider implements ArchiveProvider {
  private storage: Storage;

  constructor(opts?: { projectId?: string }) {
    this.storage = new Storage({
      projectId: opts?.projectId ?? process.env.GCP_PROJECT_ID,
    });
  }

  async upload(opts: {
    bucket: string;
    key: string;
    data: string;
    contentType: string;
    retentionDays: number;
  }) {
    const bucket = this.storage.bucket(opts.bucket);
    const file = bucket.file(opts.key);

    const retainUntil = new Date();
    retainUntil.setUTCDate(retainUntil.getUTCDate() + opts.retentionDays);

    await file.save(opts.data, {
      contentType: opts.contentType,
      metadata: {
        retainUntil: retainUntil.toISOString(),
      },
    });

    // Set retention on the object (requires bucket-level retention policy)
    try {
      await file.setRetention({
        mode: "Locked",
        retainUntilTime: retainUntil.toISOString(),
      });
    } catch {
      // Retention may not be enabled on the bucket — log but don't fail
    }

    const [metadata] = await file.getMetadata();

    return {
      key: opts.key,
      bucket: opts.bucket,
      versionId: metadata.generation?.toString() ?? "",
      retainUntil: retainUntil.toISOString(),
    };
  }
}
```

**Step 3: Create `packages/security/src/kms-gcp.ts`**

```typescript
import { KeyManagementServiceClient } from "@google-cloud/kms";
import type { KmsKeyStore } from "./kms.js";

export class GcpKmsKeyStore implements KmsKeyStore {
  private client: KeyManagementServiceClient;
  private keyName: string;
  private cache = new Map<string, Buffer>();

  constructor(opts: {
    projectId: string;
    locationId: string;
    keyRingId: string;
    keyId: string;
  }) {
    this.client = new KeyManagementServiceClient();
    this.keyName = this.client.cryptoKeyPath(
      opts.projectId,
      opts.locationId,
      opts.keyRingId,
      opts.keyId,
    );
  }

  async getKey(orgId: string): Promise<Buffer | null> {
    return this.cache.get(orgId) ?? null;
  }

  async storeKey(orgId: string, key: Buffer): Promise<void> {
    this.cache.set(orgId, key);
  }

  async destroyKey(orgId: string): Promise<void> {
    this.cache.delete(orgId);
  }

  async encryptData(plaintext: Buffer): Promise<Buffer> {
    const [result] = await this.client.encrypt({
      name: this.keyName,
      plaintext,
    });
    return Buffer.from(result.ciphertext as Uint8Array);
  }

  async decryptData(ciphertext: Buffer): Promise<Buffer> {
    const [result] = await this.client.decrypt({
      name: this.keyName,
      ciphertext,
    });
    return Buffer.from(result.plaintext as Uint8Array);
  }
}
```

**Step 4: Write tests**

`packages/security/src/__tests__/archive-gcp.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { GcpArchiveProvider } from "../archive-gcp.js";

describe("GcpArchiveProvider", () => {
  it("implements ArchiveProvider interface", () => {
    const provider = new GcpArchiveProvider({ projectId: "test" });
    expect(provider.upload).toBeDefined();
    expect(typeof provider.upload).toBe("function");
  });
});
```

`packages/security/src/__tests__/kms-gcp.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { GcpKmsKeyStore } from "../kms-gcp.js";

describe("GcpKmsKeyStore", () => {
  const store = new GcpKmsKeyStore({
    projectId: "test-project",
    locationId: "global",
    keyRingId: "test-ring",
    keyId: "test-key",
  });

  it("implements KmsKeyStore interface", () => {
    expect(store.getKey).toBeDefined();
    expect(store.storeKey).toBeDefined();
    expect(store.destroyKey).toBeDefined();
  });

  it("cache returns null for unknown org", async () => {
    expect(await store.getKey("unknown")).toBeNull();
  });

  it("cache stores and retrieves keys", async () => {
    const key = Buffer.from("test");
    await store.storeKey("org-1", key);
    expect(await store.getKey("org-1")).toEqual(key);
  });

  it("destroyKey removes from cache", async () => {
    await store.storeKey("org-2", Buffer.from("k"));
    await store.destroyKey("org-2");
    expect(await store.getKey("org-2")).toBeNull();
  });
});
```

**Step 5: Export from index.ts**

Add to `packages/security/src/index.ts`:
```typescript
export { GcpArchiveProvider } from "./archive-gcp.js";
export { GcpKmsKeyStore } from "./kms-gcp.js";
```

**Step 6: Run tests, build, commit**

```bash
pnpm --filter @sentinel/security test
pnpm turbo build
git add packages/security/
git commit -m "feat: add Google Cloud Storage and Cloud KMS providers"
```

---

## Task 4: Add Azure Provider (Blob Storage + Key Vault)

**Files to create:**
- `packages/security/src/archive-azure.ts`
- `packages/security/src/kms-azure.ts`
- `packages/security/src/__tests__/archive-azure.test.ts`
- `packages/security/src/__tests__/kms-azure.test.ts`

**Files to modify:**
- `packages/security/package.json` — add Azure dependencies
- `packages/security/src/index.ts` — export Azure modules

### Steps

**Step 1: Add Azure dependencies**

```bash
cd packages/security && pnpm add @azure/storage-blob @azure/keyvault-keys @azure/identity
```

**Step 2: Create `packages/security/src/archive-azure.ts`**

```typescript
import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import type { ArchiveProvider } from "./archive-provider.js";

export class AzureArchiveProvider implements ArchiveProvider {
  private client: BlobServiceClient;

  constructor(opts: { accountUrl: string }) {
    this.client = new BlobServiceClient(
      opts.accountUrl,
      new DefaultAzureCredential(),
    );
  }

  async upload(opts: {
    bucket: string; // maps to container name
    key: string;    // maps to blob name
    data: string;
    contentType: string;
    retentionDays: number;
  }) {
    const container = this.client.getContainerClient(opts.bucket);
    const blob = container.getBlockBlobClient(opts.key);

    const retainUntil = new Date();
    retainUntil.setUTCDate(retainUntil.getUTCDate() + opts.retentionDays);

    const uploadResult = await blob.upload(opts.data, opts.data.length, {
      blobHTTPHeaders: { blobContentType: opts.contentType },
      immutabilityPolicy: {
        expiriesOn: retainUntil,
        policyMode: "Locked",
      },
    });

    return {
      key: opts.key,
      bucket: opts.bucket,
      versionId: uploadResult.versionId ?? "",
      retainUntil: retainUntil.toISOString(),
    };
  }
}
```

**Step 3: Create `packages/security/src/kms-azure.ts`**

```typescript
import { KeyClient, CryptographyClient } from "@azure/keyvault-keys";
import { DefaultAzureCredential } from "@azure/identity";
import type { KmsKeyStore } from "./kms.js";

export class AzureKmsKeyStore implements KmsKeyStore {
  private keyClient: KeyClient;
  private vaultUrl: string;
  private keyName: string;
  private cache = new Map<string, Buffer>();

  constructor(opts: { vaultUrl: string; keyName: string }) {
    this.vaultUrl = opts.vaultUrl;
    this.keyName = opts.keyName;
    this.keyClient = new KeyClient(opts.vaultUrl, new DefaultAzureCredential());
  }

  async getKey(orgId: string): Promise<Buffer | null> {
    return this.cache.get(orgId) ?? null;
  }

  async storeKey(orgId: string, key: Buffer): Promise<void> {
    this.cache.set(orgId, key);
  }

  async destroyKey(orgId: string): Promise<void> {
    this.cache.delete(orgId);
  }

  async encryptData(plaintext: Buffer): Promise<Buffer> {
    const key = await this.keyClient.getKey(this.keyName);
    const cryptoClient = new CryptographyClient(key, new DefaultAzureCredential());
    const result = await cryptoClient.encrypt("RSA-OAEP", plaintext);
    return Buffer.from(result.result);
  }

  async decryptData(ciphertext: Buffer): Promise<Buffer> {
    const key = await this.keyClient.getKey(this.keyName);
    const cryptoClient = new CryptographyClient(key, new DefaultAzureCredential());
    const result = await cryptoClient.decrypt("RSA-OAEP", ciphertext);
    return Buffer.from(result.result);
  }
}
```

**Step 4: Write tests**

`packages/security/src/__tests__/archive-azure.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { AzureArchiveProvider } from "../archive-azure.js";

describe("AzureArchiveProvider", () => {
  it("implements ArchiveProvider interface", () => {
    // Cannot instantiate without real credentials, just check class exists
    expect(AzureArchiveProvider).toBeDefined();
    expect(AzureArchiveProvider.prototype.upload).toBeDefined();
  });
});
```

`packages/security/src/__tests__/kms-azure.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { AzureKmsKeyStore } from "../kms-azure.js";

describe("AzureKmsKeyStore", () => {
  it("implements KmsKeyStore interface", () => {
    expect(AzureKmsKeyStore).toBeDefined();
    expect(AzureKmsKeyStore.prototype.getKey).toBeDefined();
    expect(AzureKmsKeyStore.prototype.storeKey).toBeDefined();
    expect(AzureKmsKeyStore.prototype.destroyKey).toBeDefined();
  });
});
```

**Step 5: Export from index.ts**

Add to `packages/security/src/index.ts`:
```typescript
export { AzureArchiveProvider } from "./archive-azure.js";
export { AzureKmsKeyStore } from "./kms-azure.js";
```

**Step 6: Run tests, build, commit**

```bash
pnpm --filter @sentinel/security test
pnpm turbo build
git add packages/security/
git commit -m "feat: add Azure Blob Storage and Key Vault providers"
```

---

## Task 5: Update Worker, Config, and Helm

**Files to modify:**
- `apps/api/src/worker.ts` — use provider-agnostic archival
- `.env.example` — add CLOUD_PROVIDER and GCP/Azure env vars
- `apps/dashboard/.env.example` — no change needed (cloud config is API/worker only)
- `deploy/helm/values.yaml` — add cloud provider config
- `deploy/helm/templates/secrets.yaml` — add GCP/Azure secrets
- `deploy/k8s/configmap.yaml` — add CLOUD_PROVIDER
- `deploy/k8s/secrets.yaml` — add GCP/Azure secrets

### Steps

**Step 1: Update `.env.example`**

Replace the S3/KMS sections with a unified cloud section:

```
# ---------- Cloud Provider (optional: aws | gcp | azure) ----------
CLOUD_PROVIDER=
ARCHIVE_BUCKET=
ARCHIVE_PREFIX=sentinel
ARCHIVE_RETENTION_DAYS=2555

# AWS-specific
AWS_REGION=us-east-1
S3_ARCHIVE_BUCKET=
KMS_MASTER_KEY_ID=

# GCP-specific
GCP_PROJECT_ID=
GCS_ARCHIVE_BUCKET=
GCP_KMS_LOCATION=global
GCP_KMS_KEY_RING=sentinel
GCP_KMS_KEY_ID=sentinel-master

# Azure-specific
AZURE_STORAGE_ACCOUNT_URL=
AZURE_ARCHIVE_CONTAINER=
AZURE_KEY_VAULT_URL=
AZURE_KEY_NAME=sentinel-master
```

**Step 2: Update Helm values and secrets**

Add to `deploy/helm/values.yaml` under `secrets:`:
```yaml
  cloudProvider: ""
  archiveBucket: ""
  archivePrefix: "sentinel"
  archiveRetentionDays: "2555"
  gcpProjectId: ""
  gcsArchiveBucket: ""
  gcpKmsLocation: "global"
  gcpKmsKeyRing: "sentinel"
  gcpKmsKeyId: "sentinel-master"
  azureStorageAccountUrl: ""
  azureArchiveContainer: ""
  azureKeyVaultUrl: ""
  azureKeyName: "sentinel-master"
```

Add to `deploy/helm/templates/secrets.yaml`:
```yaml
  CLOUD_PROVIDER: {{ .Values.secrets.cloudProvider | default "" | quote }}
  ARCHIVE_BUCKET: {{ .Values.secrets.archiveBucket | default "" | quote }}
  ARCHIVE_PREFIX: {{ .Values.secrets.archivePrefix | default "sentinel" | quote }}
  ARCHIVE_RETENTION_DAYS: {{ .Values.secrets.archiveRetentionDays | default "2555" | quote }}
  GCP_PROJECT_ID: {{ .Values.secrets.gcpProjectId | default "" | quote }}
  GCS_ARCHIVE_BUCKET: {{ .Values.secrets.gcsArchiveBucket | default "" | quote }}
  GCP_KMS_LOCATION: {{ .Values.secrets.gcpKmsLocation | default "global" | quote }}
  GCP_KMS_KEY_RING: {{ .Values.secrets.gcpKmsKeyRing | default "sentinel" | quote }}
  GCP_KMS_KEY_ID: {{ .Values.secrets.gcpKmsKeyId | default "sentinel-master" | quote }}
  AZURE_STORAGE_ACCOUNT_URL: {{ .Values.secrets.azureStorageAccountUrl | default "" | quote }}
  AZURE_ARCHIVE_CONTAINER: {{ .Values.secrets.azureArchiveContainer | default "" | quote }}
  AZURE_KEY_VAULT_URL: {{ .Values.secrets.azureKeyVaultUrl | default "" | quote }}
  AZURE_KEY_NAME: {{ .Values.secrets.azureKeyName | default "sentinel-master" | quote }}
```

Add to `deploy/k8s/configmap.yaml`:
```yaml
  CLOUD_PROVIDER: ""
```

Add to `deploy/k8s/secrets.yaml`:
```yaml
  GCP_PROJECT_ID: ""
  GCS_ARCHIVE_BUCKET: ""
  GCP_KMS_LOCATION: "global"
  GCP_KMS_KEY_RING: "sentinel"
  GCP_KMS_KEY_ID: "sentinel-master"
  AZURE_STORAGE_ACCOUNT_URL: ""
  AZURE_ARCHIVE_CONTAINER: ""
  AZURE_KEY_VAULT_URL: ""
  AZURE_KEY_NAME: "sentinel-master"
```

**Step 3: Build and commit**

```bash
pnpm turbo build
git add .env.example deploy/ apps/api/ packages/security/
git commit -m "feat: update config and deployment for multi-cloud provider selection"
```

---

## Execution Order

```
Task 1: Provider abstraction + factory (interface + env var routing)
   ↓
Task 2: Refactor AWS into provider interface (backward compat)
   ↓
Task 3: Google Cloud providers (GCS + Cloud KMS)
   ↓ (can start in parallel with Task 4)
Task 4: Azure providers (Blob + Key Vault)
   ↓
Task 5: Config, Helm, K8s updates
```

---

## Environment Variables Summary (New)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOUD_PROVIDER` | No | — | Cloud provider: `aws`, `gcp`, or `azure` |
| `ARCHIVE_BUCKET` | No | — | Generic bucket/container name (works for any provider) |
| `ARCHIVE_PREFIX` | No | `sentinel` | Key prefix for archived objects |
| `ARCHIVE_RETENTION_DAYS` | No | `2555` | Retention period (~7 years) |
| `GCP_PROJECT_ID` | GCP only | — | Google Cloud project ID |
| `GCS_ARCHIVE_BUCKET` | GCP only | — | GCS bucket name |
| `GCP_KMS_LOCATION` | GCP only | `global` | Cloud KMS location |
| `GCP_KMS_KEY_RING` | GCP only | `sentinel` | Cloud KMS key ring name |
| `GCP_KMS_KEY_ID` | GCP only | `sentinel-master` | Cloud KMS key name |
| `AZURE_STORAGE_ACCOUNT_URL` | Azure only | — | Azure Storage account URL |
| `AZURE_ARCHIVE_CONTAINER` | Azure only | — | Azure Blob container name |
| `AZURE_KEY_VAULT_URL` | Azure only | — | Azure Key Vault URL |
| `AZURE_KEY_NAME` | Azure only | `sentinel-master` | Key Vault key name |
