# Org-Wide AI Code Metrics — Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Org-wide dashboard showing % of code that's AI-generated, breakdown by tool (Copilot, Claude, Cursor, ChatGPT, etc.), trend over time, project-level drill-down with comparison, compliance gaps, and smart anomaly alerts. This is the killer feature for CISOs.

**Architecture:** Modular monolith — metrics computation in `packages/compliance/`, cron jobs in existing scheduler, API routes in main app, post-scan incremental update via Redis consumer. Daily snapshots for trends, live aggregation for current stats.

**Tech Stack:** Prisma 6, PostgreSQL, Fastify 5, Redis Streams, Next.js 15, Recharts, existing AI detector agent (stylometric + markers + timing + compliance)

---

## Approach Analysis

### Algorithms (Aggregation & Scoring)

| # | Approach | Verdict | Rationale |
|---|----------|---------|-----------|
| A | Simple weighted average | Rejected | Loses nuance — a 0.55 file looks like a 0.95 file in aggregate; no LOC weighting |
| B | Threshold-gated classification + LOC weighting | Primary metric | Binary yes/no per file is what CISOs need for board presentations; LOC-weighted = accurate % |
| C | Probabilistic LOC attribution (fractional) | Secondary metric | Captures partial AI assistance; mathematically smooth; harder to explain to auditors |

**Decision: Hybrid B+C.** Threshold-gated AI ratio as the headline CISO number (`aiLoc / totalLoc` where file is AI if `prob ≥ threshold`). Fractional influence score as the secondary engineer-facing metric (`sum(prob * LOC) / sum(LOC)`). Per-org configurable threshold with presets: Balanced (0.50), Conservative (0.65), Strict (0.75 for regulated industries).

**Why hybrid:** CISOs need a defensible binary classification for audit evidence ("23% of our code is AI-generated"). Engineers need the nuanced fractional view for actionable analysis. Pure average (A) ignores file size. Pure fractional (C) invites audit challenge ("so is this file AI or not?").

### Data Structures (Storage & Query)

| # | Approach | Verdict | Rationale |
|---|----------|---------|-----------|
| A | Live aggregation from findings | Current stats only | O(n) per request; can't do 90-day trends at scale |
| B | Materialized snapshots (daily cron) | Trends & history | O(1) reads; unlimited time horizon; survives archival |
| C | Event-sourced rollups | Rejected | Complex replay/consistency for a feature that tolerates 24h staleness |

**Decision: Hybrid A+B.** Live aggregation for the "current" stat cards (scoped to recent scans, small query). Daily snapshots for trend charts (30d/90d/6m/1y). Post-scan hook upserts today's snapshot incrementally for near-real-time freshness.

**Why hybrid:** CISOs opening the dashboard expect today's numbers (live). Trends are naturally batched — nobody expects a 90-day chart to update in real-time. Event sourcing (C) adds complexity without proportional benefit.

### System Design (Architecture)

| # | Approach | Verdict | Rationale |
|---|----------|---------|-----------|
| A | Monolithic extension | Rejected | Aggregation queries compete with API traffic |
| B | Dedicated microservice | Rejected | Premature — single feature doesn't justify distributed system |
| C | Modular monolith + background worker | Selected | Clean separation; reuses infra; aggregation doesn't block API |

**Decision: Approach C.** Follows the exact pattern used for remediation (service in `packages/`, cron in scheduler, routes in API). Post-scan event triggers incremental update via lightweight Redis consumer.

### Software Design (Patterns)

| # | Approach | Verdict | Rationale |
|---|----------|---------|-----------|
| A | Fat service + thin routes | Rejected | Mixes computation with data access; hard to unit test math |
| B | Pipeline pattern (ETL) | Rejected | Over-engineered for this scope |
| C | Domain service + computation modules | Selected | Service orchestrates; pure functions handle math; independently testable |

**Decision: Approach C.** Pure functions for ratio computation, tool breakdown, trend analysis, anomaly detection. Service handles DB access and orchestration. Matches existing pattern (`computePriorityScore` called by `RemediationService`).

---

## Data Model

### New Models

```prisma
model AIMetricsSnapshot {
  id                String    @id @default(uuid()) @db.Uuid
  orgId             String    @map("org_id") @db.Uuid
  projectId         String?   @map("project_id") @db.Uuid
  snapshotDate      DateTime  @map("snapshot_date") @db.Date
  granularity       String    @default("daily")  // "daily" | "weekly" | "monthly"

  // Core metrics
  totalFiles        Int       @map("total_files")
  aiFiles           Int       @map("ai_files")
  totalLoc          Int       @map("total_loc")
  aiLoc             Int       @map("ai_loc")
  aiRatio           Float     @map("ai_ratio")            // aiLoc / totalLoc
  aiInfluenceScore  Float     @map("ai_influence_score")  // sum(prob*LOC)/sum(LOC)

  // Probability distribution
  avgProbability    Float     @map("avg_probability")
  medianProbability Float     @map("median_probability")
  p95Probability    Float     @map("p95_probability")

  // Tool breakdown: [{ tool, confirmedFiles, estimatedFiles, loc }]
  toolBreakdown     Json      @default("[]") @map("tool_breakdown")

  // Compliance gaps: { provenance: 5, bias: 2, oversight: 8 }
  complianceGaps    Json      @default("{}") @map("compliance_gaps")

  scanCount         Int       @map("scan_count")
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz

  organization      Organization @relation(fields: [orgId], references: [id])
  project           Project?     @relation(fields: [projectId], references: [id])

  @@unique([orgId, projectId, snapshotDate, granularity])
  @@index([orgId, granularity, snapshotDate(sort: Desc)])
  @@index([projectId, granularity, snapshotDate(sort: Desc)])
  @@map("ai_metrics_snapshots")
}

model AIMetricsConfig {
  id                String   @id @default(uuid()) @db.Uuid
  orgId             String   @unique @map("org_id") @db.Uuid
  threshold         Float    @default(0.50)
  strictMode        Boolean  @default(false) @map("strict_mode")
  alertEnabled      Boolean  @default(false) @map("alert_enabled")
  alertMaxRatio     Float?   @map("alert_max_ratio")
  alertSpikeStdDev  Float    @default(2.0) @map("alert_spike_std_dev")
  alertNewTool      Boolean  @default(true) @map("alert_new_tool")
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt         DateTime @updatedAt @map("updated_at") @db.Timestamptz

  organization      Organization @relation(fields: [orgId], references: [id])
  @@map("ai_metrics_configs")
}
```

### Extended Models

- **Organization** — add relations: `aiMetricsSnapshots AIMetricsSnapshot[]`, `aiMetricsConfig AIMetricsConfig?`
- **Project** — add relation: `aiMetricsSnapshots AIMetricsSnapshot[]` (already has `aiBaseline Float`)

---

## Computation Modules (Pure Functions)

### `compute-ai-ratio.ts`

```typescript
interface FileSignal {
  file: string;
  loc: number;
  aiProbability: number;
  markerTools: string[];
  estimatedTool: string | null;
}

interface AIRatioResult {
  aiRatio: number;            // threshold-gated: aiLoc / totalLoc
  aiFiles: number;
  totalFiles: number;
  aiLoc: number;
  totalLoc: number;
  aiInfluenceScore: number;   // fractional: sum(prob*LOC) / sum(LOC)
  avgProbability: number;
  medianProbability: number;
  p95Probability: number;
}

function computeAIRatio(files: FileSignal[], threshold: number): AIRatioResult
```

### `compute-tool-breakdown.ts`

```typescript
interface ToolBreakdownEntry {
  tool: string;
  confirmedFiles: number;
  estimatedFiles: number;
  totalLoc: number;
  percentage: number;
}

function computeToolBreakdown(files: FileSignal[], threshold: number): ToolBreakdownEntry[]
```

### `compute-trends.ts`

```typescript
interface TrendPoint {
  date: string;
  aiRatio: number;
  aiInfluenceScore: number;
  scanCount: number;
}

interface TrendResult {
  points: TrendPoint[];
  momChange: number;
  movingAvg7d: number;
  movingAvg30d: number;
}

interface AnomalyAlert {
  type: "threshold_exceeded" | "spike_detected" | "new_tool";
  projectId?: string;
  projectName?: string;
  detail: string;
  severity: "warning" | "critical";
  detectedAt: string;
}

function computeTrends(snapshots: Snapshot[], days: number): TrendResult
function detectAnomalies(snapshots: Snapshot[], config: AIMetricsConfig): AnomalyAlert[]
```

### `compute-granularity.ts`

```typescript
function selectGranularity(days: number): "daily" | "weekly" | "monthly"
// ≤90 → daily, 91-365 → weekly, >365 → monthly
```

---

## Service Layer

### AIMetricsService

```typescript
class AIMetricsService {
  getCurrentStats(orgId: string): Promise<AIRatioResult>
  getTrend(orgId: string, opts: { days?: number; projectId?: string }): Promise<TrendResult>
  getToolBreakdown(orgId: string, opts: { days?: number; projectId?: string }): Promise<ToolBreakdownEntry[]>
  getProjectLeaderboard(orgId: string, opts: { limit?: number; sortBy?: string }): Promise<ProjectAIMetric[]>
  getComplianceGaps(orgId: string): Promise<ComplianceGapSummary>
  compareProjects(orgId: string, projectIds: string[]): Promise<ProjectComparison>
  getActiveAlerts(orgId: string): Promise<AnomalyAlert[]>
  getConfig(orgId: string): Promise<AIMetricsConfig>
  updateConfig(orgId: string, data: Partial<AIMetricsConfig>): Promise<AIMetricsConfig>
  generateDailySnapshot(orgId: string, date: Date): Promise<void>
  generateProjectSnapshot(orgId: string, projectId: string, date: Date): Promise<void>
  rollUpWeeklySnapshots(orgId: string): Promise<void>
  rollUpMonthlySnapshots(orgId: string): Promise<void>
}
```

---

## API Endpoints

| Method | Path | Purpose | RBAC |
|--------|------|---------|------|
| GET | `/v1/ai-metrics/stats` | Live current stats | admin, manager, developer, viewer |
| GET | `/v1/ai-metrics/trend` | Time-series trend | admin, manager, developer, viewer |
| GET | `/v1/ai-metrics/tools` | Tool breakdown | admin, manager, developer, viewer |
| GET | `/v1/ai-metrics/projects` | Project leaderboard | admin, manager, developer, viewer |
| GET | `/v1/ai-metrics/projects/compare` | Multi-project comparison | admin, manager, developer, viewer |
| GET | `/v1/ai-metrics/compliance` | Compliance gap summary | admin, manager, developer |
| GET | `/v1/ai-metrics/alerts` | Active anomaly alerts | admin, manager |
| GET | `/v1/ai-metrics/config` | Get org config | admin, manager |
| PUT | `/v1/ai-metrics/config` | Update org config | admin |

---

## Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| `ai-metrics-daily-snapshot` | `0 3 * * *` | Generate org-wide + per-project daily snapshots |
| `ai-metrics-weekly-rollup` | `0 4 * * 1` | Roll up daily → weekly for data >90 days |
| `ai-metrics-monthly-rollup` | `0 5 1 * *` | Roll up weekly → monthly for data >1 year |
| `ai-metrics-anomaly-check` | `0 * * * *` | Run anomaly detection, publish alerts |

### Post-Scan Hook

On `scan.completed` event → AIMetricsWorker:
1. Query scan's AI findings
2. Upsert today's daily snapshot (incremental)
3. Run anomaly check for project
4. If anomaly → publish alert event

### Event Topics

```
ai-metrics.snapshot.generated  → daily snapshot completed
ai-metrics.alert.threshold     → org ratio exceeded limit
ai-metrics.alert.spike         → project spike (>N stddev above org mean)
ai-metrics.alert.new-tool      → previously unseen AI tool detected
```

---

## Dashboard Components

### Overview Page Addition (`/`)

3 headline stat cards after existing stats row:
- **AI Code Ratio** — threshold-gated %, MoM trend arrow, links to `/ai-metrics`
- **AI Influence Score** — fractional %, MoM trend
- **AI Tools Detected** — count, top tool name

### Dedicated Page (`/ai-metrics`)

Layout: 5 stat cards → trend chart + tool donut (2-col) → project leaderboard (full-width) → compliance gaps + alerts (2-col)

### Component Tree

```
components/ai-metrics/
├── ai-metrics-stat-cards.tsx       # 5 headline stat cards
├── ai-metrics-trend-chart.tsx      # Recharts dual-line area chart (ratio + influence)
├── ai-tool-breakdown-chart.tsx     # Donut with confirmed vs estimated toggle
├── ai-project-leaderboard.tsx      # Sortable table with sparklines + checkboxes
├── ai-project-compare.tsx          # Multi-project overlay line chart (2-5 projects)
├── ai-compliance-gaps.tsx          # Horizontal bar chart by gap category
├── ai-alerts-panel.tsx             # Alert list with severity badges
└── ai-metrics-config-modal.tsx     # Threshold slider, alert toggles, presets
```

### Pages

```
app/(dashboard)/
├── page.tsx                        # Add AI metrics stat row
├── ai-metrics/
│   ├── page.tsx                    # Server component
│   ├── ai-metrics-client.tsx       # Client wrapper with state
│   └── actions.ts                  # Server actions
```

### Key Behaviors

- **Trend chart:** Dual-line (solid=ratio, dashed=influence). Presets: 30d/90d/6m/1y/All. Auto-granularity.
- **Tool breakdown:** Toggle confirmed-only vs confirmed+estimated. Donut chart + legend. Dynamic categories from data with curated icon/color for known tools (Copilot=blue, Claude=orange, Cursor=purple, ChatGPT=green), generic style for unknown.
- **Project leaderboard:** Sortable by ratio/influence/files/MoM. 30-day sparkline per row. Checkbox → "Compare" button.
- **Compare view:** Overlay 2-5 project trend lines on single chart.
- **Compliance gaps:** Horizontal bars (provenance, bias, oversight). Click → filtered findings.
- **Alerts:** Cards with severity badge, project, detail, timestamp. Dismissible.
- **Config modal:** Threshold slider (0.0–1.0), presets (Balanced/Conservative/Strict), alert toggles.

---

## Error Handling

| Condition | HTTP | Response |
|-----------|------|----------|
| No AI findings (never scanned) | 200 | Zero-value stats with `hasData: false` |
| Project not found / wrong org | 404 | "Project not found" |
| Compare with >5 or <2 projects | 400 | "Select 2-5 projects to compare" |
| Invalid threshold | 400 | "Threshold must be between 0.0 and 1.0" |
| Snapshot cron failure | — | Log, skip org, continue; retry next cycle |
| No snapshots for range | 200 | Empty points; dashboard shows "Not enough data" |

---

## Security

- Multi-tenancy: all queries scoped by `orgId` via `withTenant()`
- Config updates: admin-only RBAC
- Alert thresholds: server-validated
- Tool names: React auto-escaping (no raw HTML)
- No PII in metrics — file paths only, no code content
- Audit: config changes logged via `auditLog.append()`

---

## Testing

| Layer | Tests | Count |
|-------|-------|-------|
| `compute-ai-ratio` | threshold gating, LOC weighting, edge cases (0 files, all AI, no AI), percentiles | ~10 |
| `compute-tool-breakdown` | confirmed vs estimated, percentages, unknown bucket, empty | ~8 |
| `compute-trends` | MoM, moving averages, granularity selection, single point | ~8 |
| `detect-anomalies` | threshold breach, spike (stddev), new tool, disabled alerts | ~8 |
| `AIMetricsService` | getCurrentStats, getTrend, generateSnapshot, rollup, compare | ~12 |
| API routes | stats, trend, tools, projects, compare, config, validation | ~10 |
| Dashboard components | stat cards, trend chart, tool donut, leaderboard, compare, config modal | ~16 |
| Cron jobs | daily snapshot, weekly/monthly rollup, anomaly check | ~6 |
| **Total** | | **~78** |
