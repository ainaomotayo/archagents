# P9 E2E Tests — Broader Pipeline Coverage Design

## Goal

Expand SENTINEL's E2E test suite from ~30 TypeScript tests (8 files) to ~55-60 tests covering scheduler integration, RBAC enforcement, concurrent scan isolation, data retention, report generation, circuit breaker resilience, and SSE reconnect semantics.

## Current State

### Existing Infrastructure
- **8 test files** in `tests/e2e/__tests__/`: happy-path, security-agent, dependency-agent, multi-agent, failure-modes, certificate, compliance, notifications
- **6 service objects** in `tests/e2e/services/`: api-client (HMAC signing), scan-service, finding-service, certificate-service, health-service, event-stream (SSE)
- **4 helpers**: dag-verifier (DAG topological ordering), invariant-checker (6 property-based invariants), redis-inspector (stream introspection), wait-for (exponential backoff polling)
- **Factory + fixtures**: `createE2EContext()` returns typed context; 4 diff fixtures (security, dependency, combined, clean)
- **Docker Compose**: Non-standard ports (postgres:5433, redis:6380, api:8081), Vitest with singleFork sequential execution, 120s timeout

### Coverage Gaps (Prioritized)
| Priority | Gap | Risk |
|----------|-----|------|
| P0 | Scheduler integration (cron trigger → pipeline completion) | Core component, zero E2E coverage |
| P0 | RBAC enforcement (role-based access to scans/findings) | Security-critical |
| P1 | Concurrent scan isolation (parallel scans don't leak data) | Race conditions in production |
| P1 | Data retention (old scans/findings purged correctly) | Compliance requirement |
| P1 | Report generation (compliance reports render correctly) | Customer-facing |
| P2 | SSE reconnect (Last-Event-ID resume semantics) | Reliability |
| P2 | Circuit breaker (agent failure → graceful degradation) | Resilience |
| P2 | Agent timeout/recovery (stuck agents don't block pipeline) | Operational stability |

## Architecture Decisions

### 1. Pipeline Verification: Hybrid FSM + DAG with Invariants

Extend the existing `dag-verifier.ts` and `invariant-checker.ts`:

- **FSM** for the sequential backbone (submit → assess → certify) — enforces mandatory ordering
- **DAG** for the parallel middle (agents running concurrently) — already implemented
- **Invariants** for cross-cutting properties — already has 6, adding 4 more

New invariants:
- `scan_isolation`: findings from scan A never appear in scan B's results
- `rbac_enforced`: viewer role cannot mutate scans/findings
- `retention_respected`: scans older than retention window are not queryable
- `certificate_immutable`: certificate content doesn't change after issuance

### 2. Test Organization: Hierarchical with Scoped Contexts

```
tests/e2e/__tests__/
├── happy-path.test.ts          (existing)
├── security-agent.test.ts      (existing)
├── dependency-agent.test.ts    (existing)
├── multi-agent.test.ts         (existing)
├── failure-modes.test.ts       (existing)
├── certificate.test.ts         (existing)
├── compliance.test.ts          (existing)
├── notifications.test.ts       (existing)
├── scheduler.test.ts           (NEW — P0)
├── rbac.test.ts                (NEW — P0)
├── concurrent-scans.test.ts    (NEW — P1)
├── data-retention.test.ts      (NEW — P1)
├── reports.test.ts             (NEW — P1)
├── sse-reconnect.test.ts       (NEW — P2)
├── circuit-breaker.test.ts     (NEW — P2)
└── agent-timeout.test.ts       (NEW — P2)
```

Each new file gets its own `createE2EContext()` — no shared state between test files.

### 3. Software Design: Service Objects + Scenario Composers + Assertion Helpers

**Layer 1 — Service Objects (existing, extend)**
- Add `SchedulerService` for scheduler health/metrics endpoints
- Add `ReportService` for compliance report generation/retrieval
- Extend `E2EApiClient.request()` to accept role parameter (already supports `x-sentinel-role`)

**Layer 2 — Scenario Composers (new)**
`tests/e2e/scenarios/` directory:
- `submitAndComplete(ctx, diff)` — submit diff, poll to completion, return {scan, findings, certificate}
- `submitConcurrent(ctx, diffs[])` — submit multiple diffs in parallel, poll all to completion
- `triggerSchedulerScan(ctx)` — hit scheduler health endpoint to verify trigger, wait for scan

**Layer 3 — Assertion Helpers (new)**
`tests/e2e/helpers/assertions.ts`:
- `expectValidCertificate(cert)` — non-null, valid risk score, valid status
- `expectFindingsFromAgent(findings, agentName)` — at least one finding from specified agent
- `expectRBACDenied(fn)` — wraps API call, expects 403
- `expectPipelineComplete(state)` — scan completed + certificate issued + invariants hold

### 4. System Design: Keep Full Docker Compose (Layer 3 only)

All new tests are **full E2E** (Layer 3 of the test pyramid) running against the existing Docker Compose stack. No new infrastructure layers — the existing `docker-compose.e2e.yml` + `global-setup.ts` + `global-teardown.ts` handles everything.

Scheduler tests require the scheduler service to be in Docker Compose — add if not present.

## New Test Specifications

### scheduler.test.ts (P0, ~5 tests)
1. Scheduler health endpoint returns valid status and metrics
2. Scheduler Prometheus endpoint exports expected metric names
3. Scheduler leader lease is acquired (single instance)
4. Self-scan job produces a scan via pipeline (trigger → findings → certificate)
5. Health-check job detects and reports timed-out scans

### rbac.test.ts (P0, ~4 tests)
1. Admin role can submit scans, read findings, read certificates
2. Viewer role can read scans/findings/certificates but cannot submit
3. Invalid/missing role header returns 401/403
4. Org isolation: org-A's scans are invisible to org-B's credentials

### concurrent-scans.test.ts (P1, ~4 tests)
1. Two scans submitted simultaneously both complete independently
2. Findings from scan-A do not appear in scan-B's results
3. Certificates are issued independently with correct risk scores
4. Pipeline invariants hold for both scans simultaneously

### data-retention.test.ts (P1, ~3 tests)
1. Retention job runs and marks old scans for deletion
2. Scans within retention window remain accessible
3. API returns 404 for purged scan IDs

### reports.test.ts (P1, ~3 tests)
1. Compliance report generates for org with findings
2. Report includes expected sections (summary, findings, risk score)
3. Report for clean org shows passing status

### sse-reconnect.test.ts (P2, ~3 tests)
1. SSE stream delivers scan lifecycle events in order
2. Reconnect with Last-Event-ID resumes from correct position
3. Multiple concurrent SSE clients receive independent event streams

### circuit-breaker.test.ts (P2, ~3 tests)
1. Pipeline completes normally when all agents healthy
2. Pipeline degrades gracefully when one agent is unhealthy (circuit opens)
3. Circuit breaker recovers (half-open → closed) when agent returns

### agent-timeout.test.ts (P2, ~3 tests)
1. Scan completes with partial results when one agent times out
2. Timed-out scan is flagged in lifecycle tracker
3. Subsequent scans are not affected by previous timeout

## Files to Create

| File | Purpose |
|------|---------|
| `tests/e2e/__tests__/scheduler.test.ts` | Scheduler integration tests |
| `tests/e2e/__tests__/rbac.test.ts` | RBAC enforcement tests |
| `tests/e2e/__tests__/concurrent-scans.test.ts` | Concurrent scan isolation |
| `tests/e2e/__tests__/data-retention.test.ts` | Data retention verification |
| `tests/e2e/__tests__/reports.test.ts` | Report generation tests |
| `tests/e2e/__tests__/sse-reconnect.test.ts` | SSE reconnect semantics |
| `tests/e2e/__tests__/circuit-breaker.test.ts` | Circuit breaker resilience |
| `tests/e2e/__tests__/agent-timeout.test.ts` | Agent timeout recovery |
| `tests/e2e/services/scheduler-service.ts` | Scheduler API client |
| `tests/e2e/services/report-service.ts` | Report API client |
| `tests/e2e/scenarios/pipeline.ts` | Pipeline scenario composers |
| `tests/e2e/helpers/assertions.ts` | Domain-specific assertion helpers |

## Files to Modify

| File | Change |
|------|--------|
| `tests/e2e/fixtures/factory.ts` | Add schedulerService and reportService to E2EContext |
| `tests/e2e/helpers/invariant-checker.ts` | Add 4 new invariants (scan_isolation, rbac_enforced, retention_respected, certificate_immutable) |
| `tests/e2e/helpers/dag-verifier.ts` | Add SCHEDULER_DAG and TIMEOUT_RECOVERY_DAG definitions |
| `tests/e2e/docker-compose.e2e.yml` | Ensure scheduler service is included |

## What We're NOT Doing

- No new Docker Compose setup or infrastructure layers
- No contract tests or integration test layers (existing full E2E is sufficient at current scale)
- No test parallelization changes (singleFork sequential remains correct for shared Docker state)
- No changes to Vitest config beyond what's needed
- No changes to existing test files (only additions)
- No agent implementation changes (E2E tests verify existing behavior)
