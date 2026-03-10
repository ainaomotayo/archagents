# P2: GitHub Check Run Loop — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the GitHub Check Run feedback loop so scan results appear directly on PRs as Check Run annotations — the most visible developer touchpoint and strongest adoption driver.

**Architecture:** Hybrid Dual-Worker (Approach C). A single new `github-bridge` process owns all GitHub API interaction: consuming webhook-triggered scan requests (`sentinel.scan-triggers`), fetching diffs, creating "in_progress" Check Runs, and — when assessment completes — consuming results (`sentinel.results`) to post completed Check Runs with finding annotations. The existing `assessor-worker` is unchanged.

**Tech Stack:** Node.js, Octokit REST, Redis Streams (EventBus), Prisma, existing `@sentinel/github` builders.

---

## Why Hybrid Dual-Worker

| Factor | Decision |
|--------|----------|
| GitHub API rate limiting | One process = one rate limiter. Splitting across services duplicates throttling logic |
| Check Run lifecycle | Create + update + complete is one stateful interaction — keeping it in one process avoids cross-process state sharing |
| Failure isolation | github-bridge crash doesn't affect scan processing; assessor-worker runs independently |
| Operational overhead | One new service (not two). Reuses existing api.Dockerfile with different CMD |

### 3 Enterprise Approaches Evaluated

**A. Unified Worker** — Extend assessor-worker with both consumers. Low ops cost but single-process bottleneck; one crash kills everything. Suits <100 scans/day.

**B. Dedicated Microservices** — Three separate processes (trigger-processor, assessor-worker, github-publisher). Maximum isolation but duplicates GitHub rate limiting across two services; highest operational cost. Suits >1000 scans/day with dedicated SRE.

**C. Hybrid Dual-Worker (Chosen)** — Two processes: github-bridge (all GitHub API) + assessor-worker (all assessment). Domain-bounded by external dependency. Best balance of isolation, efficiency, and simplicity.

---

## Data Flow

```
GitHub Webhook
      │
      ▼
POST /webhooks/github (existing, unchanged)
      │
      ▼
sentinel.scan-triggers (Redis Stream)
      │
      ▼
┌─────────────────────────────────────────────────┐
│               github-bridge                      │
│                                                  │
│  CONSUMER 1: sentinel.scan-triggers              │
│  [1] Resolve Project by repo URL                 │
│  [2] Create "in_progress" Check Run (GitHub API) │
│  [3] Fetch diff (PR diff or commit compare)      │
│  [4] Build SentinelDiffPayload (parseDiff)       │
│  [5] Create Scan record in DB                    │
│  [6] Store correlation in Redis hash (24h TTL)   │
│  [7] Publish to sentinel.diffs                   │
│                                                  │
│  ... agents process → assessor assesses ...      │
│                                                  │
│  CONSUMER 2: sentinel.results                    │
│  [1] Load GitHub context from Redis (or DB)      │
│  [2] Load findings from DB, sort by severity     │
│  [3] Build annotations (top 50 by severity)      │
│  [4] Update Check Run to "completed" (GitHub API)│
│  [5] Cleanup Redis correlation                   │
└─────────────────────────────────────────────────┘
```

## State Management

### Redis Hash (ephemeral correlation)

```
Key:    scan:github:{scanId}
Type:   Hash
Fields: checkRunId, installationId, owner, repo, commitHash
TTL:    86400 (24 hours)
```

Ephemeral because it only needs to survive scan duration (seconds to minutes). Falls back to `scan.triggerMeta` JSON column if Redis key expired.

### Schema Addition

```prisma
model Scan {
  // ... existing fields ...
  triggerType   String?  @map("trigger_type")   // "webhook" | "cli" | "api" | "scheduler"
  triggerMeta   Json     @default("{}") @map("trigger_meta")
  // triggerMeta: { installationId, owner, repo, prNumber, checkRunId }
}
```

## GitHub API Strategy

### Diff Fetching

- **Pull Request trigger**: `octokit.rest.pulls.get({ mediaType: { format: "diff" } })` — returns raw unified diff
- **Push trigger**: `octokit.rest.repos.compareCommitsWithBasehead({ basehead: "BASE...HEAD" })` — returns compare payload with patch per file

### Rate Limiting — Token Bucket

```
Per-installation: 4,500 req/hr (buffer 500 for other integrations)
Redis key: github:ratelimit:{installationId}
Window: 3600s sliding
At limit: message stays unacked → withRetry backoff → DLQ after 3 failures
```

### Idempotency

`HSETNX scan:github:{scanId} checkRunId ""` before Check Run creation. If key exists, skip creation (another attempt already started).

### Annotation Priority

When findings > 50 (GitHub limit), sort by severity rank (critical=0, high=1, medium=2, low=3, info=4), take top 50. O(n log n) comparison sort — sufficient for typical <200 findings.

## Error Handling

| Failure | Behavior | Recovery |
|---------|----------|----------|
| GitHub 401/403 | Log + DLQ after 3 retries | Alert ops (expired key) |
| GitHub 404 (repo/PR gone) | Log warning, ACK, skip | Stale trigger |
| GitHub 422 (commit gone) | Log warning, ACK, skip | Force-push rewrote history |
| GitHub 429 (rate limit) | Exponential backoff | Auto-recovers ~60s |
| Redis down | Fall back to scan.triggerMeta | Auto-recovers |
| DB down | withRetry → DLQ after 3 | Same as assessor-worker |
| Diff > 10MB | Truncate to first 500 files | Partial scan > no scan |
| No Project for repo | Auto-create linked to org | First webhook auto-registers |

## File Structure

```
apps/api/src/
  github-bridge.ts            # Process entrypoint (~60 lines)
  github/
    trigger-consumer.ts       # Consumes scan-triggers (~120 lines)
    results-consumer.ts       # Consumes results, posts Check Runs (~90 lines)
    diff-fetcher.ts           # GitHub API diff fetching (~70 lines)
    rate-limiter.ts           # Token bucket per installation (~40 lines)

packages/shared/src/
  diff-parser.ts              # Extracted from apps/cli/src/git/diff.ts

docker-compose.yml            # Add github-bridge service
```

## Docker Compose

```yaml
github-bridge:
  build:
    context: .
    dockerfile: docker/api.Dockerfile
  depends_on:
    postgres: { condition: service_healthy }
    redis: { condition: service_healthy }
  environment:
    DATABASE_URL: postgresql://sentinel:sentinel_dev@postgres:5432/sentinel
    REDIS_URL: redis://redis:6379
    GITHUB_APP_ID: ${GITHUB_APP_ID:-}
    GITHUB_PRIVATE_KEY: ${GITHUB_PRIVATE_KEY:-}
    GITHUB_BRIDGE_PORT: "9092"
  command: ["node", "apps/api/dist/github-bridge.js"]
  healthcheck:
    test: ["CMD", "node", "-e", "fetch('http://localhost:9092/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
    interval: 15s
    timeout: 5s
    retries: 3
```

## Testing Strategy

1. **Unit tests** — parseDiff extraction, severity sorting, rate limit check, idempotency
2. **Integration tests** — Mock Octokit + mock Redis + real EventBus:
   - Trigger → check run created → diff fetched → published to sentinel.diffs
   - Result → findings loaded → check run updated
   - Duplicate trigger → only one check run
   - Rate limited → message stays pending
3. **Existing tests unaffected** — github-bridge is purely additive

Estimated: ~15-20 test cases, ~300 lines of test code.
