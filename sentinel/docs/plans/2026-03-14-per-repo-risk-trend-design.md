# Per-Repo Risk Trend Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add sparkline charts showing risk score over the last N scans on the Projects page, giving teams instant visibility into risk trajectory per repository.

**Architecture:** Time-bucketed aggregation from existing scan data with carry-forward gap filling, served via a batch API endpoint, rendered as compact area charts with trend badges.

**Tech Stack:** PostgreSQL `date_trunc`, Fastify route, Recharts `AreaChart`, pure computation functions + service layer.

---

## User Decisions

| Question | Choice | Rationale |
|----------|--------|-----------|
| Data granularity | Time-bucketed (daily) | Smooths irregular scan frequency, consistent X-axis |
| Gap filling | Carry-forward | Risk doesn't drop to zero between scans |
| Default time range | 90 days | Balances meaningful trend with performance |
| Click interaction | None (display only) | YAGNI - sparklines are glanceable, drill-down not needed |

## Approach Analysis

### Algorithm: Time-Bucketed Aggregation with Carry-Forward

**Selected:** Server-side `date_trunc('day', started_at)` with `MAX(risk_score)` per bucket, then carry-forward in a pure function.

**Why hybrid (SQL bucketing + JS carry-forward):**
- SQL handles aggregation efficiently at the database level (no large result sets)
- Carry-forward is a sequential operation best expressed as a simple loop in application code
- Pure function for carry-forward is trivially testable without DB

**Rejected alternatives:**
- Per-scan points: irregular X-axis, cluttered display when scan frequency varies
- Interpolation: implies data that doesn't exist; carry-forward is semantically correct (risk persists until next measurement)

### Data Structure: Query Existing Scans Table

**Selected:** Query the existing `scan` table directly. No new database models.

**Why:**
- Scans already store `riskScore`, `startedAt`, `projectId`, `orgId`
- Adding a materialized view or separate table would duplicate data
- 90-day window with daily buckets = max 90 rows per project, trivially small

**Rejected alternatives:**
- Pre-computed snapshots table: adds write complexity, staleness risk, migration overhead for minimal gain
- Redis cache layer: scans table query is fast enough with proper indexing

### System Design: Batch Endpoint

**Selected:** Single `GET /v1/risk-trends?days=90` returns all project trends for the org in one call.

**Why:**
- Projects page loads all projects at once; batch avoids N+1 API calls
- Single query with `GROUP BY project_id, date_trunc(...)` is more efficient than N separate queries
- Response shape: `{ [projectId]: { points: [{date, score}], direction: "up"|"down"|"flat", changePercent: number } }`

**Rejected alternatives:**
- Per-project endpoint: N+1 problem on Projects page
- GraphQL: over-engineered for a single data shape
- WebSocket streaming: unnecessary for historical data that changes at most once per scan

### Software Design: Service + Pure Computation

**Selected:** `RiskTrendService` for data access + `risk-trend-compute.ts` for pure functions.

**Pattern mirrors AI metrics:**
- Service handles DB queries and orchestration
- Pure functions handle: carry-forward filling, direction calculation, change percentage
- Pure functions are independently testable without mocks

## API Contract

```
GET /v1/risk-trends?days=90

Response:
{
  "trends": {
    "<projectId>": {
      "points": [
        { "date": "2026-01-15", "score": 72 },
        { "date": "2026-01-16", "score": 72 },  // carry-forward
        { "date": "2026-01-17", "score": 68 }
      ],
      "direction": "down",
      "changePercent": -5.6
    }
  },
  "meta": {
    "days": 90,
    "generatedAt": "2026-03-14T12:00:00Z"
  }
}
```

## Components

### Backend

1. **`packages/compliance/src/risk-trend/compute.ts`** - Pure functions:
   - `fillGaps(points, startDate, endDate)` - carry-forward gap filling
   - `computeDirection(points)` - "up" | "down" | "flat" based on first vs last third averages
   - `computeChangePercent(points)` - percentage change over window

2. **`packages/compliance/src/risk-trend/service.ts`** - `RiskTrendService`:
   - `getTrends(orgId, { days })` - batch query + computation
   - Single SQL query with `date_trunc` and `GROUP BY`

3. **`apps/api/src/routes/risk-trends.ts`** - Fastify route:
   - `GET /v1/risk-trends` with `days` query param (default 90, max 365)
   - Auth middleware, org scoping

### Frontend

4. **`apps/dashboard/src/components/risk-sparkline.tsx`** - Compact area chart:
   - Recharts `AreaChart` with gradient fill
   - Color: green (improving), red (worsening), gray (flat)
   - Fixed height ~40px, responsive width

5. **`apps/dashboard/src/components/risk-trend-badge.tsx`** - Direction indicator:
   - Arrow icon (up/down/flat) + percentage change
   - Color-coded to match sparkline

## Testing Plan (~36 tests)

| Layer | Tests | Focus |
|-------|-------|-------|
| Pure compute functions | 12 | Gap filling edge cases, direction calc, change % |
| Service (unit) | 8 | Query construction, empty data, single project, multi-project |
| Route (integration) | 6 | Auth, validation, default params, response shape |
| Sparkline component | 5 | Render states (data, empty, loading, error, color) |
| Badge component | 3 | Direction arrow, percentage display, flat case |
| E2E smoke | 2 | Full round-trip with mock data |

## Edge Cases

- **No scans for a project:** Return empty points array, direction "flat", changePercent 0
- **Single scan:** One point, direction "flat", changePercent 0
- **All same score:** Direction "flat", changePercent 0
- **Project created mid-window:** Points start from first scan date, no carry-forward before first data point
- **Score is null/undefined:** Skip that scan, don't carry forward null
