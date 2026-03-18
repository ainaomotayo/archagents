# P16: Data Retention Configuration UI — Design Document

## Goal

Build an enterprise-grade data retention configuration UI that lets admins configure severity-tiered retention policies, manage archive destinations (S3/GCS/Azure Blob/webhook/SFTP), preview impact with dry-run estimates, and require dual-admin approval before policy changes take effect. Includes a full retention dashboard with volume breakdown, storage trends, projected deletions, and execution history.

## Architecture

Vertical slice architecture with a dedicated `packages/retention` package for business logic, ports & adapters for archive destinations, and a pipeline execution model (Archive Worker → Delete Worker via Redis Streams) with saga state tracking. The dashboard page at `/settings/retention` provides policy management, archive configuration, and rich observability.

## Tech Stack

- **Backend:** Fastify 5 routes, Prisma models, Redis Streams workers
- **Frontend:** Next.js 15, React, Recharts (charts), Tailwind CSS
- **Archive:** AWS SDK v3 (S3/GCS), `@azure/storage-blob`, `ssh2-sftp-client`, native `fetch` (webhook)
- **Encryption:** AES-256-GCM for stored credentials

---

## Approach Analysis

### Dimension 1: Algorithms

| Approach | Performance | Accuracy | Scalability | Efficiency |
|----------|-------------|----------|-------------|------------|
| A: Linear Scan / Exact Count | Poor at scale | Perfect | Degrades linearly | Low — 4x table scans |
| B: Approximate (EXPLAIN estimates) | Excellent — O(1) | ~95-98% | Constant time | High |
| C: Materialized Aggregation Tables | Excellent | Near-exact (stale by refresh interval) | Excellent | High reads, moderate write |

**Chosen: Hybrid B+C.** Materialized stats for dashboard volume/trend charts (read-heavy, refresh after each execution). Approximate counts for interactive dry-run preview (arbitrary tier values). Exact counts only on final approval confirmation.

### Dimension 2: Data Structures & Access Patterns

| Approach | Performance | Scalability | Extensibility | Audit |
|----------|-------------|-------------|---------------|-------|
| A: Flat JSON in Organization.settings | Good | Limited | Poor | None |
| B: Normalized Relational Tables | Good | Excellent | Excellent | Manual |
| C: Event-Sourced Policy Log | Moderate reads | Excellent | Excellent | Built-in |

**Chosen: Hybrid B+C.** Normalized Prisma models for active state (policy, approvals, destinations, executions). Immutable `AuditEvent` records for every policy change and approval action (compliance trail).

### Dimension 3: System Design

| Approach | Performance | Scalability | Reliability | Complexity |
|----------|-------------|-------------|-------------|------------|
| A: Monolithic (API + Cron) | Bottleneck | Poor | Single point of failure | Low |
| B: Pipeline (Archive → Delete Workers) | Good | Good | Good | Moderate |
| C: Event-Driven Saga | Excellent | Excellent | Excellent | High |

**Chosen: Hybrid B+C.** Pipeline architecture (Archive Worker → Delete Worker via Redis Streams) with lightweight saga state tracking in `RetentionExecution` table. Gives observability and retry without full saga framework overhead.

### Dimension 4: Software Design

| Approach | Cohesion | Testability | Maintainability | Reusability |
|----------|----------|-------------|-----------------|-------------|
| A: Feature Module (scattered) | Moderate | Moderate | Low | Low |
| B: Vertical Slice (package + routes + page) | High | Excellent | Good | Good |
| C: Domain-Driven (Ports & Adapters) | Excellent | Excellent | Excellent | Excellent |

**Chosen: Hybrid B+C.** Vertical slice as organizing principle (`packages/retention` + API routes + dashboard page). Ports & adapters specifically for archive destinations — `ArchivePort` interface with S3/GCS/AzureBlob/Webhook/SFTP adapters.

---

## Data Model

### New Prisma Models

```prisma
model RetentionPolicy {
  id              String   @id @default(uuid()) @db.Uuid
  orgId           String   @db.Uuid
  org             Organization @relation(fields: [orgId], references: [id])
  preset          String   // "minimal" | "standard" | "compliance" | "custom"
  tierCritical    Int      @default(365)
  tierHigh        Int      @default(180)
  tierMedium      Int      @default(90)
  tierLow         Int      @default(30)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@unique([orgId])
}

model RetentionPolicyChange {
  id              String   @id @default(uuid()) @db.Uuid
  orgId           String   @db.Uuid
  org             Organization @relation(fields: [orgId], references: [id])
  requestedBy     String   @db.Uuid
  reviewedBy      String?  @db.Uuid
  status          String   @default("pending") // pending | approved | rejected | applied
  preset          String
  tierCritical    Int
  tierHigh        Int
  tierMedium      Int
  tierLow         Int
  dryRunEstimate  Json?    // { findings: { critical: N, high: N, ... }, scans: N, agentResults: N }
  reviewNote      String?
  createdAt       DateTime @default(now())
  reviewedAt      DateTime?
  appliedAt       DateTime?
}

model ArchiveDestination {
  id              String   @id @default(uuid()) @db.Uuid
  orgId           String   @db.Uuid
  org             Organization @relation(fields: [orgId], references: [id])
  type            String   // "s3" | "gcs" | "azure_blob" | "webhook" | "sftp"
  name            String
  config          Json     // type-specific connection details (no secrets)
  credentialRef   String?  // reference to EncryptedCredential
  enabled         Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model RetentionExecution {
  id              String   @id @default(uuid()) @db.Uuid
  orgId           String   @db.Uuid
  org             Organization @relation(fields: [orgId], references: [id])
  status          String   @default("pending") // pending | archiving | archived | deleting | completed | failed
  policySnapshot  Json     // copy of tiers at execution time
  archivedCount   Json?    // { findings: N, agentResults: N, scans: N }
  deletedCount    Json?    // { findings: N, agentResults: N, scans: N }
  error           String?
  startedAt       DateTime @default(now())
  completedAt     DateTime?
}

model RetentionStats {
  id              String   @id @default(uuid()) @db.Uuid
  orgId           String   @db.Uuid
  org             Organization @relation(fields: [orgId], references: [id])
  severity        String   // "critical" | "high" | "medium" | "low"
  ageBucket       String   // "0-30d" | "30-90d" | "90-180d" | "180-365d" | "365d+"
  recordCount     Int
  snapshotAt      DateTime @default(now())
  @@unique([orgId, severity, ageBucket, snapshotAt])
}

model EncryptedCredential {
  id              String   @id @default(uuid()) @db.Uuid
  orgId           String   @db.Uuid
  org             Organization @relation(fields: [orgId], references: [id])
  ciphertext      Bytes
  iv              Bytes
  tag             Bytes
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

### Migration from Legacy

The existing `Organization.settings.retentionDays` flat field is read as fallback: if no `RetentionPolicy` exists for an org, the cron job reads `retentionDays` from settings and applies it uniformly across all severity tiers. Once an admin saves a policy via the new UI, the `RetentionPolicy` record takes precedence.

---

## API Routes

All routes registered in `apps/api/src/routes/retention.ts` with `authHook` and role checks.

### Policy

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/v1/retention/policy` | viewer+ | Active policy (or defaults) |
| GET | `/v1/retention/presets` | viewer+ | Named presets with tier values |

### Approval Workflow

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/v1/retention/policy/changes` | admin, manager | Create pending change with dry-run estimate |
| GET | `/v1/retention/policy/changes` | admin, manager | List changes (paginated) |
| GET | `/v1/retention/policy/changes/:id` | admin, manager | Single change detail |
| POST | `/v1/retention/policy/changes/:id/approve` | admin, manager | Approve (different user than requester) |
| POST | `/v1/retention/policy/changes/:id/reject` | admin, manager | Reject with optional note |

**Validation:**
- `requestedBy !== reviewedBy` (cannot self-approve)
- Tier values: min 7, max 2555 (7 years)
- `tierCritical >= tierHigh >= tierMedium >= tierLow`
- Only one pending change per org

### Archive Destinations

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/v1/retention/archives` | admin, manager | List destinations |
| POST | `/v1/retention/archives` | admin | Create destination |
| PUT | `/v1/retention/archives/:id` | admin | Update config |
| DELETE | `/v1/retention/archives/:id` | admin | Disable or delete |
| POST | `/v1/retention/archives/:id/test` | admin | Test connectivity |

### Dashboard Data

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/v1/retention/stats` | viewer+ | Volume breakdown (severity × age bucket) |
| GET | `/v1/retention/stats/trend` | viewer+ | 30-day trend snapshots |
| GET | `/v1/retention/preview` | admin, manager | Approximate deletion counts for given tier values |
| GET | `/v1/retention/executions` | viewer+ | Execution history (paginated) |
| GET | `/v1/retention/executions/:id` | viewer+ | Single execution detail |

---

## Archive Adapters

### Port Interface

```typescript
export interface ArchivePort {
  readonly type: string;
  testConnection(config: ArchiveConfig): Promise<{ ok: boolean; error?: string }>;
  archive(records: ArchivePayload, config: ArchiveConfig): Promise<ArchiveResult>;
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
```

### Adapters

| Adapter | Format | Path Convention | Test Method |
|---------|--------|-----------------|-------------|
| S3Adapter | JSONL | `{prefix}/{orgId}/{dataType}/{severity}/{YYYY-MM-DD}.jsonl` | HeadBucket |
| GCSAdapter | JSONL (wraps S3 with GCS endpoint) | Same as S3 | HeadBucket |
| AzureBlobAdapter | JSONL | `{container}/{orgId}/{dataType}/{severity}/{YYYY-MM-DD}.jsonl` | GetContainerProperties |
| WebhookAdapter | JSON batches (max 1000/request) | N/A | POST test payload, expect 2xx |
| SFTPAdapter | JSONL | `{remotePath}/{orgId}/{dataType}/{YYYY-MM-DD}.jsonl` | connect + stat(remotePath) |

### Credential Handling

- Connection details (bucket, host, path) stored in `ArchiveDestination.config` (plain JSON)
- Secrets (AWS keys, passwords, auth tokens) stored in `EncryptedCredential` (AES-256-GCM, key from `SENTINEL_ENCRYPTION_KEY`)
- API never returns raw credentials — only `"configured"` / `"not configured"` status
- Decrypted only at archive execution time inside the worker

---

## Execution Pipeline

### Flow

```
Cron (4am daily)
  ├─ For each org with RetentionPolicy:
  │    ├─ Create RetentionExecution (status: "pending")
  │    └─ Publish to Redis Stream: sentinel.retention.execute
  │
Archive Worker (consumer)
  ├─ Set execution status: "archiving"
  ├─ For each severity tier:
  │    ├─ Query records older than tier's cutoff
  │    └─ For each enabled ArchiveDestination: adapter.archive()
  ├─ Set execution status: "archived"
  └─ Publish to Redis Stream: sentinel.retention.delete
  │
Delete Worker (consumer)
  ├─ Set execution status: "deleting"
  ├─ Chunked delete in FK order: findings → agentResults → scans
  ├─ Set execution status: "completed"
  ├─ Refresh RetentionStats for org
  └─ Write AuditEvent: "retention.completed"
```

### Failure Handling

| Failure | Behavior |
|---------|----------|
| Archive fails for one destination | Mark errored, continue others. Proceed if ≥1 succeeds or no destinations configured. |
| Archive fails ALL destinations | Status: "failed". Deletion does NOT proceed. Next cron retries. |
| Delete fails mid-chunk | Status stays "deleting". Next cron run skips already-deleted records. |
| Worker crash | Sweeper in cron detects stuck executions (>1 hour), marks "failed", re-publishes. |

### Approval Application

1. Second admin approves → API upserts `RetentionPolicy` with new tier values
2. Change status → "applied", `appliedAt` set
3. `AuditEvent` written with before/after policy snapshot
4. New policy takes effect at next 4am cron run (no immediate deletion)

---

## Dashboard UI

### Route

`/settings/retention` — new `LinkSectionCard` on settings hub, positioned after "Report Schedules".

### Page Layout

```
RetentionPage
├── PageHeader ("Data Retention")
├── CurrentPolicyCard
│   ├── PolicyTierDisplay (4 columns: Critical/High/Medium/Low with days)
│   ├── PendingChangeBanner (conditional: yellow, approve/reject for other admins)
│   └── RequestChangeModal
│       ├── PresetSelector (radio: Minimal/Standard/Compliance/Custom)
│       ├── TierInputs (4 number inputs, visible when Custom)
│       └── DryRunPreview (approximate counts, debounced 500ms)
├── ArchiveDestinationsCard (collapsible)
│   ├── DestinationRow[] (type icon, name, status, test button, edit, toggle)
│   └── AddDestinationModal
│       ├── TypeSelector (S3/GCS/Azure Blob/Webhook/SFTP)
│       ├── Type-specific config form
│       └── TestConnectionButton
├── RetentionDashboardCard
│   ├── VolumeBreakdownChart (Recharts BarChart: severity × age bucket)
│   ├── StorageTrendChart (Recharts LineChart: 30-day per-severity)
│   └── ProjectedDeletionsCard (next run time + estimated counts)
└── ExecutionHistoryCard
    ├── ExecutionTable (date, status badge, duration, archived/deleted counts)
    └── ExecutionDetailRow (expandable: per-severity breakdown)
```

### Preset Definitions

| Preset | Critical | High | Medium | Low |
|--------|----------|------|--------|-----|
| Minimal | 90 | 60 | 30 | 14 |
| Standard | 365 | 180 | 90 | 30 |
| Compliance | 730 | 365 | 180 | 90 |
| Custom | user-defined | user-defined | user-defined | user-defined |

### Charts

Using `recharts` (React charting library, SSR-safe).

- **Volume Breakdown:** Stacked bar chart. X-axis: age buckets. Segments: severity colors. Shaded overlay on segments beyond current tier cutoff (what would be deleted).
- **Storage Trend:** Multi-line chart. X-axis: last 30 days. Lines: one per severity. Shows cleanup impact over time.

### State Management

- `fetch()` + `useEffect` + `useState` (matches existing dashboard patterns)
- Optimistic UI for approve/reject
- Dry-run preview debounced at 500ms on custom tier input changes

---

## Package Structure

```
packages/retention/
├── src/
│   ├── index.ts               (public exports)
│   ├── policy.ts              (presets, validation, types)
│   ├── stats.ts               (aggregation queries, age bucket SQL)
│   ├── preview.ts             (approximate count via EXPLAIN)
│   ├── execution.ts           (pipeline orchestration, saga state)
│   ├── credential.ts          (AES-256-GCM encrypt/decrypt)
│   ├── ports/
│   │   ├── archive-port.ts    (ArchivePort interface)
│   │   └── registry.ts        (adapter lookup)
│   └── adapters/
│       ├── s3.ts
│       ├── gcs.ts
│       ├── azure-blob.ts
│       ├── webhook.ts
│       └── sftp.ts
├── tests/
│   ├── policy.test.ts
│   ├── stats.test.ts
│   ├── preview.test.ts
│   ├── execution.test.ts
│   ├── credential.test.ts
│   └── adapters/
│       ├── s3.test.ts
│       ├── webhook.test.ts
│       └── sftp.test.ts
├── package.json
└── tsconfig.json

apps/api/src/routes/retention.ts          (all retention API routes)
apps/api/src/routes/retention.test.ts     (API route tests)

apps/dashboard/app/(dashboard)/settings/retention/
├── page.tsx                               (main page)
├── components/
│   ├── current-policy-card.tsx
│   ├── pending-change-banner.tsx
│   ├── request-change-modal.tsx
│   ├── preset-selector.tsx
│   ├── tier-inputs.tsx
│   ├── dry-run-preview.tsx
│   ├── archive-destinations-card.tsx
│   ├── add-destination-modal.tsx
│   ├── destination-row.tsx
│   ├── retention-dashboard-card.tsx
│   ├── volume-breakdown-chart.tsx
│   ├── storage-trend-chart.tsx
│   ├── projected-deletions-card.tsx
│   ├── execution-history-card.tsx
│   └── execution-detail-row.tsx
└── hooks/
    ├── use-retention-policy.ts
    ├── use-retention-stats.ts
    ├── use-archive-destinations.ts
    └── use-execution-history.ts
```

---

## Testing Strategy

| Layer | Approach | Count Estimate |
|-------|----------|----------------|
| `packages/retention` unit tests | Policy validation, presets, credential encrypt/decrypt, adapter mocks | ~30 tests |
| `packages/retention` adapter tests | S3/webhook/SFTP with mocked SDKs | ~15 tests |
| API route tests | CRUD, approval workflow, validation, role checks | ~25 tests |
| Dashboard component tests | Render, interactions, form validation (Vitest + Testing Library) | ~20 tests |
| Integration tests | Full pipeline: policy change → approval → execution → archive → delete | ~5 tests |

Total: ~95 tests

---

## Security Considerations

- Credentials encrypted at rest (AES-256-GCM), decrypted only in worker process
- API never exposes raw credentials
- Dual-admin approval prevents unilateral policy changes
- Audit trail for every policy change and execution
- Archive destinations validated via test connection before first use
- Tier value constraints enforced server-side (min 7, max 2555, monotonic decreasing by severity)
- Role checks: only admin/manager can modify policies and destinations
