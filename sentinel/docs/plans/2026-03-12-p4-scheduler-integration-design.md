# P4 Self-Scan Scheduler Integration Design

**Date:** 2026-03-12
**Status:** Approved
**Goal:** Wire the existing scheduler scaffold into a production-grade enterprise system with HA, per-org scheduling, lifecycle tracking, circuit breakers, and dual-layer audit.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Deployment model | Active-passive HA (2 replicas) | Enterprise HA without multi-instance complexity |
| Per-org scheduling | Org override with global fallback | Large customers control their scan schedule |
| Scan tracking | Full lifecycle (trigger -> complete/timeout) | Leverages existing SSE + notification infra |
| Audit trail | Redis stream (real-time) + PostgreSQL (persistent) | Ops visibility + compliance-grade persistence |
| Circuit breaker | Per-dependency with degraded mode | Graceful degradation, no silent failure loops |

---

## Approach Analysis

### 1. Leader Election (Algorithm)

| Approach | Description | Verdict |
|----------|-------------|---------|
| A1: Redis SETNX Lease | `SET key NX EX ttl` - first writer wins | O(1), zero deps, but no DB-layer fencing |
| A2: Redlock (Multi-Redis) | Quorum across N Redis instances | Requires 3+ Redis, clock-skew sensitive |
| A3: PostgreSQL Advisory Lock | `pg_try_advisory_lock(bigint)` | Strongest consistency, auto-release on disconnect |

**Chosen: Hybrid A1+A3.** Redis SETNX for fast-path leader election and heartbeat. PostgreSQL advisory lock as fencing validation for DB-write jobs (compliance, retention). Redis handles the 99% case; PG prevents paused-leader stale writes.

### 2. Schedule Registry (Data Structures)

| Approach | Description | Verdict |
|----------|-------------|---------|
| B1: In-Memory Map + Polling | `Map<jobId, CronTask>`, poll DB for overrides | Simplest, stale for up to N minutes |
| B2: Redis Sorted Set | `ZADD` by next-fire-time, shared visibility | Cross-replica visibility, extra roundtrip |
| B3: Priority Queue (Min-Heap) | Process-local min-heap by next execution | Zero network overhead, lost on restart |

**Chosen: Hybrid B1+B2.** In-memory Map for sub-ms cron evaluation (node-cron). Redis sorted set for cross-replica visibility and per-org override propagation without restart.

### 3. Circuit Breaker (System Design)

| Approach | Description | Verdict |
|----------|-------------|---------|
| C1: Per-Job Exponential Backoff | Each job tracks failures independently | Simple but N jobs x N attempts = wasted connections |
| C2: Centralized Circuit Breaker | One circuit per dependency (Redis, PG) | Fast detection, over-couples all jobs |
| C3: Tiered Circuit Breaker | Per-dependency + per-job severity tiers | Fine-grained, more config surface |

**Chosen: Hybrid C2+C3.** Centralized circuit per dependency with two job tiers. Critical jobs (self-scan, compliance) get `failureThreshold=5, cooldownMs=30000`. Non-critical (trends, health) get `failureThreshold=3, cooldownMs=60000`.

### 4. Scheduler Architecture (Software Design)

| Approach | Description | Verdict |
|----------|-------------|---------|
| D1: Monolithic Scheduler | Everything inline in one file | 800+ lines, untestable jobs |
| D2: Plugin/Registry Pattern | `SchedulerJob` interface, each job a class | Clean separation, individually testable |
| D3: Event-Driven Reactor | Middleware chain (circuit -> audit -> execute) | Over-engineered for 7 jobs |

**Chosen: Pure D2.** No hybrid needed. Plugin/Registry cleanly separates every concern. Circuit breaker wraps `execute()`. Audit is registry-level. Each job is independently testable.

---

## Component Architecture

```
SchedulerService
  LeaderLease (Redis SETNX + PG advisory lock for DB jobs)
  CircuitBreakerManager (per-dependency, tiered)
  SchedulerMetrics (Prometheus /metrics)
  JobRegistry
    SelfScanJob          (critical,   deps: [redis])
    CVERescanJob         (critical,   deps: [redis])
    RetentionJob         (non-crit,   deps: [redis, postgres])
    ComplianceSnapJob    (critical,   deps: [redis, postgres])
    TrendsRefreshJob     (non-crit,   deps: [postgres])
    EvidenceCheckJob     (critical,   deps: [redis, postgres])
    HealthCheckJob       (non-crit,   deps: [redis])
  AuditLayer
    Redis Stream: sentinel.scheduler.audit (24h TTL)
    PostgreSQL: AuditLog (persistent, hash-chained)
  ScanLifecycleTracker
    Track: trigger -> started -> completed/timeout
    Subscribe: sentinel.findings for completion events
    Notify: sentinel.notifications on timeout
  OrgScheduleManager
    Poll DB every 5 min for per-org overrides
    Map<orgId, ScheduledTask> for dynamic cron tasks
```

---

## Key Interfaces

```typescript
interface SchedulerJob {
  name: string;
  schedule: string;
  tier: "critical" | "non-critical";
  dependencies: ("redis" | "postgres")[];
  execute(ctx: JobContext): Promise<void>;
}

interface JobContext {
  eventBus: EventBus;
  db: PrismaClient;
  redis: Redis;
  metrics: SchedulerMetrics;
  audit: AuditLayer;
  logger: Logger;
}

interface LeaderLease {
  acquire(): Promise<boolean>;
  renew(): Promise<boolean>;
  release(): Promise<void>;
  isLeader(): boolean;
}

interface CircuitBreaker {
  state: "closed" | "open" | "half-open";
  canExecute(dependency: string, tier: string): boolean;
  recordSuccess(dependency: string): void;
  recordFailure(dependency: string): void;
}

interface AuditLayer {
  log(entry: SchedulerAuditEntry): Promise<void>;  // dual-write
  recent(limit?: number): Promise<SchedulerAuditEntry[]>;  // Redis read
}

interface ScanLifecycleTracker {
  recordTrigger(scanId: string, jobName: string): Promise<void>;
  recordCompletion(scanId: string): Promise<void>;
  checkTimeouts(): Promise<string[]>;  // returns timed-out scanIds
}
```

---

## Per-Org Schedule Override Flow

1. API: `PATCH /v1/orgs/:id/settings` stores `scanSchedule` cron in org settings
2. Scheduler: `OrgScheduleManager` polls DB every 5 minutes for overrides
3. SelfScanJob: base schedule `0 2 * * *`, per-org override replaces cron
4. Each org gets own node-cron task tracked in `Map<orgId, ScheduledTask>`
5. Override removal reverts to global schedule on next poll cycle

---

## Scan Lifecycle Tracking

1. **Trigger**: Publish to `sentinel.diffs`, store `{scanId, triggeredAt, status: "pending"}` in Redis hash `sentinel.scan.lifecycle:{scanId}`
2. **Started**: Assessor worker SSE `scan.progress` -> tracker updates to `"running"`
3. **Completed**: SSE `scan.completed` -> tracker updates to `"completed"`, records `completedAt`
4. **Timeout**: HealthCheckJob runs every 5 min, checks for scans pending > `SCAN_TIMEOUT_MS` (default 300000), publishes `system.scan_timeout` notification
5. **Dashboard**: `/v1/scheduler/scans` endpoint returns recent lifecycle data from Redis

---

## Circuit Breaker State Machine

```
CLOSED --[failure >= threshold]--> OPEN
OPEN   --[cooldown elapsed]-----> HALF_OPEN
HALF_OPEN --[probe succeeds]----> CLOSED
HALF_OPEN --[probe fails]-------> OPEN
```

Configuration per tier:

| Tier | failureThreshold | cooldownMs | probeInterval |
|------|-----------------|------------|---------------|
| critical | 5 | 30000 | 10000 |
| non-critical | 3 | 60000 | 15000 |

Degraded mode: When PG circuit is OPEN, Redis-only jobs continue. Health checks and Redis audit logging remain active. Metrics track circuit state.

---

## Docker Changes

Scheduler service in docker-compose needs `postgres` dependency added (for compliance/retention jobs):

```yaml
scheduler:
  depends_on:
    redis:
      condition: service_healthy
    postgres:
      condition: service_healthy
```

---

## Files to Create/Modify

**New files:**
- `apps/api/src/scheduler/index.ts` - SchedulerService entrypoint
- `apps/api/src/scheduler/leader-lease.ts` - Redis SETNX + PG advisory lock
- `apps/api/src/scheduler/circuit-breaker.ts` - Per-dependency tiered circuit breaker
- `apps/api/src/scheduler/audit-layer.ts` - Dual Redis+PG audit
- `apps/api/src/scheduler/lifecycle-tracker.ts` - Scan lifecycle tracking
- `apps/api/src/scheduler/org-schedule-manager.ts` - Per-org override polling
- `apps/api/src/scheduler/types.ts` - SchedulerJob, JobContext interfaces
- `apps/api/src/scheduler/jobs/self-scan.ts` - SelfScanJob
- `apps/api/src/scheduler/jobs/cve-rescan.ts` - CVERescanJob
- `apps/api/src/scheduler/jobs/retention.ts` - RetentionJob
- `apps/api/src/scheduler/jobs/compliance-snapshot.ts` - ComplianceSnapJob
- `apps/api/src/scheduler/jobs/trends-refresh.ts` - TrendsRefreshJob
- `apps/api/src/scheduler/jobs/evidence-check.ts` - EvidenceCheckJob
- `apps/api/src/scheduler/jobs/health-check.ts` - HealthCheckJob
- `apps/api/src/scheduler/__tests__/leader-lease.test.ts`
- `apps/api/src/scheduler/__tests__/circuit-breaker.test.ts`
- `apps/api/src/scheduler/__tests__/audit-layer.test.ts`
- `apps/api/src/scheduler/__tests__/lifecycle-tracker.test.ts`
- `apps/api/src/scheduler/__tests__/org-schedule-manager.test.ts`
- `apps/api/src/scheduler/__tests__/jobs.test.ts`
- `apps/api/src/scheduler/__tests__/integration.test.ts`

**Modified files:**
- `apps/api/src/scheduler.ts` - Replace with thin entrypoint importing from scheduler/
- `apps/api/src/__tests__/scheduler.test.ts` - Update imports
- `docker-compose.yml` - Add postgres dependency to scheduler
- `docker-compose.sentinel.yml` - Add postgres dependency + DATABASE_URL to scheduler
- `.env.example` - Add SCHEDULER_LEASE_TTL, SCAN_TIMEOUT_MS

---

## Metrics Additions

```
sentinel_scheduler_leader{instance}          gauge    1 if leader, 0 if standby
sentinel_scheduler_circuit_state{dep,tier}   gauge    0=closed, 1=open, 2=half-open
sentinel_scheduler_scan_lifecycle{status}    counter  pending/running/completed/timeout
sentinel_scheduler_org_overrides_active      gauge    count of active per-org schedules
sentinel_scheduler_audit_entries_total       counter  dual-write audit entries
```
