# P7: Webhooks, Notifications & Real-Time Event Streaming — Design Document

**Goal:** Bridge SENTINEL's internal event system to the outside world — enabling enterprises to receive real-time alerts, webhook callbacks, and live dashboard updates when scans complete, critical findings appear, compliance scores change, or policies are modified.

**Architecture:** Hybrid Event Gateway (Approach C). SSE streaming in-process in the API server for low-latency dashboard updates. Async notification-worker for reliable webhook/Slack/email/PagerDuty delivery with DB-backed retry. Shared `@sentinel/notifications` package for event types, topic matching, and channel adapters.

**Tech Stack:** `@sentinel/notifications` package, native `fetch()` for HTTP/Slack/PagerDuty, `nodemailer` for SMTP email, Redis pub/sub for SSE fan-out, Redis Streams for guaranteed webhook delivery, PostgreSQL for delivery log and retry queue.

---

## Why Hybrid (Not Monolithic or Microservice)

### 3 Enterprise Approaches Evaluated

**A. Monolithic Event Router** — All delivery logic in the API server process. Simple but HTTP webhook calls (50ms-5s) block the event loop, in-memory retries lost on restart, cannot scale delivery independently.

**B. Dedicated Notification Microservice** — 2 new services (notification-service + SSE gateway) with separate DB. Maximum scalability but excessive operational overhead for current scale (7 Docker services already).

**C. Hybrid Event Gateway (Chosen)** — Two layers: in-process SSE (<1ms latency) + single async notification-worker (reliable delivery). One new service, reuses existing infrastructure, follows P6 pattern.

| Decision | Hybrid Choice | Why Not Pure A | Why Not Pure B |
|----------|--------------|----------------|----------------|
| SSE streaming | In-process (API) | — | Separate SSE service needs Redis pub/sub fan-out — over-engineered for single-instance |
| Webhook dispatch | Async worker | HTTP calls block API event loop; no retry on restart | Agreed, but 1 worker not 2 services |
| Event routing | In-process Trie | — | Routing is O(k) per event, trivial CPU — separate service wastes a container |
| Retry queue | DB-backed (PostgreSQL) | In-memory retries lost on restart | Dedicated retry DB is overkill; reuse existing PostgreSQL |
| Channel adapters | Shared package | — | Package = testable without running worker; adapters usable from scheduler too |
| Delivery log | Existing PostgreSQL | — | Separate DB adds operational overhead for marginal benefit |
| Configuration | Existing API CRUD | — | Webhook CRUD is 10 endpoints — doesn't justify a new service |

| Metric | A (Monolithic) | B (Microservice) | C (Hybrid) |
|--------|----------------|-------------------|------------|
| Performance | Poor | Excellent | Good |
| Scalability | Poor | Excellent | Good |
| Accuracy | Good | Good | Excellent |
| Efficiency | Poor | Poor | Excellent |
| Reliability | Poor | Excellent | Excellent |
| Operational cost | Good | Poor | Good |

**Reference codebase validation:**
- OpenClaw Mission Control: RQ worker with exponential backoff — same worker pattern
- Agent Orchestrator: Notifier plugin with Observer pattern — same adapter registry
- Nanobot: 9-channel message bus — same strategy pattern for channels
- Suna: Redis Streams + WAL — same stream consumption pattern
- Mission Control (Autensa): SSE with client Set — same SSE implementation

---

## Algorithms & Data Structures

### Topic Matching: Segment Trie

Events have hierarchical topics (`scan.completed`, `finding.critical`). Subscribers can use wildcards (`scan.*`, `*`). A Trie enables efficient matching.

```
Trie root
 +-- scan
 |   +-- submitted  -> [webhook_1, webhook_3]
 |   +-- completed  -> [webhook_1, webhook_2]
 |   +-- failed     -> [webhook_4]
 |   +-- *          -> [webhook_5]        (wildcard: matches all scan.*)
 +-- finding
 |   +-- critical   -> [webhook_2, webhook_4]
 |   +-- *          -> [webhook_1]
 +-- *              -> [webhook_6]        (global: matches everything)
```

- **Insert:** O(k) where k = topic segments (max 2 for SENTINEL topics)
- **Lookup:** O(k) — walk trie + collect wildcard matches at each level
- **Memory:** O(w * k) where w = total webhook subscriptions
- **Pattern source:** Same approach as MQTT brokers. Faster than linear scan when org has 50+ endpoints.

### Retry Scheduling: Exponential Backoff with Jitter

```
delay = min(base * 2^attempt + random(0, jitter), maxDelay)
base = 5s, jitter = 5s, maxDelay = 1 hour
```

| Attempt | Approximate Delay | Cumulative Wait |
|---------|------------------|-----------------|
| 1 | ~10s | 10s |
| 2 | ~25s | 35s |
| 3 | ~45s | 1m 20s |
| 4 | ~1m 25s | 2m 45s |
| 5 (max) | ~2m 45s | 5m 30s |

After 5 failed attempts: status changes to `"dlq"`. No further retries. Admin can view and manually retry via dashboard. Jitter prevents thundering herd when multiple deliveries fail simultaneously. Agent Orchestrator uses this exact pattern for reaction throttling.

### SSE Client Registry: HashMap + TopicTrie

```
Map<orgId, { clients: Set<SseClient>, trie: TopicTrie<SseClient> }>
```

- **Register:** O(k) — insert into org's trie
- **Broadcast:** O(k + m) where m = matching clients
- **Disconnect cleanup:** O(1) — remove from Set, lazy cleanup from trie
- **Heartbeat:** 30s interval, write `: heartbeat\n\n` comment to detect stale connections

### Webhook Signing: HMAC-SHA256

```
signature = HMAC-SHA256(endpointSecret, JSON.stringify(payload))
Header: X-Sentinel-Signature: sha256=<hex>
```

Reuses existing `@sentinel/auth` signing primitives. Industry standard (GitHub, Stripe, Slack).

### Channel Adapter Selection: Strategy Pattern + Registry Map

```
Map<ChannelType, ChannelAdapter>
  "http"      -> HttpWebhookAdapter
  "slack"     -> SlackAdapter
  "email"     -> EmailAdapter
  "pagerduty" -> PagerDutyAdapter
```

O(1) dispatch. Same pattern as Nanobot's 9-channel registry.

### Delivery Deduplication: Idempotency Key

```
key = SHA-256(eventId + endpointId)
```

Stored as unique constraint on WebhookDelivery. Prevents duplicate delivery on worker restart. Same pattern as Suna's ownership-based idempotency keys.

---

## Event Taxonomy (17 Events, 6 Domains)

| Domain | Topic | Trigger | Payload |
|--------|-------|---------|---------|
| Scan | `scan.submitted` | POST /v1/scans | scanId, projectId, commitHash, branch |
| | `scan.completed` | Worker finishes assessment | scanId, riskScore, verdict, findingCount |
| | `scan.failed` | Worker timeout/error | scanId, error |
| Finding | `finding.created` | Agent reports finding | findingId, severity, category, agentName, file |
| | `finding.critical` | Finding with severity=critical | Same as above (filtered) |
| | `finding.suppressed` | PATCH /v1/findings/:id | findingId, suppressedBy, severity |
| Certificate | `certificate.issued` | Worker issues cert | certificateId, scanId, verdict, riskScore |
| | `certificate.revoked` | POST /certificates/:id/revoke | certificateId, reason |
| Compliance | `compliance.assessed` | Scheduler daily snapshot | frameworkSlug, score, verdict, delta |
| | `compliance.degraded` | Score drops below threshold | frameworkSlug, previousScore, newScore |
| | `compliance.report_ready` | Report worker completes | reportId, type, fileUrl |
| Policy | `policy.created` | POST /v1/policies | policyId, name, version |
| | `policy.updated` | PUT /v1/policies/:id | policyId, name, version, changedBy |
| | `policy.deleted` | DELETE /v1/policies/:id | policyId, name |
| Evidence | `evidence.chain_broken` | Scheduler integrity check fails | orgId, brokenAtIndex |
| System | `system.dlq_threshold` | DLQ depth exceeds limit | stream, depth, threshold |
| | `system.health_degraded` | Service health check fails | service, status |

---

## Data Model (3 New Prisma Models)

### WebhookEndpoint

Stores registered webhook/notification endpoints per org. Admin-managed configuration.

Fields: id, orgId, name, url, channelType ("http"|"slack"|"email"|"pagerduty"), secret (auto-generated HMAC key), topics (string[]), headers (Json), enabled, createdBy, createdAt, updatedAt.

Index: `(orgId, enabled)` for matching endpoints when event arrives.

### WebhookDelivery

High-write delivery log and retry queue. One row per delivery attempt.

Fields: id, endpointId, orgId, topic, payload (Json), status ("pending"|"delivered"|"failed"|"dlq"), httpStatus, attempt, maxAttempts (default 5), nextRetryAt, lastError, deliveredAt, createdAt.

Indexes:
- `(status, nextRetryAt)` — worker polls: WHERE status='pending' AND nextRetryAt <= NOW()
- `(orgId, createdAt DESC)` — dashboard: recent deliveries per org
- `(endpointId, createdAt DESC)` — per-endpoint delivery log

### NotificationRule

Configurable routing rules for built-in channel adapters. Manager-managed.

Fields: id, orgId, name, topics (string[]), condition (Json, optional filter), channelType, channelConfig (Json), enabled, createdBy, createdAt.

Index: `(orgId, enabled)`.

---

## API Surface (10 New Routes + 1 SSE)

### Webhook Endpoints CRUD

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | /v1/webhooks | admin | Create endpoint (auto-generates signing secret) |
| GET | /v1/webhooks | admin, manager | List endpoints for org |
| GET | /v1/webhooks/:id | admin, manager | Get endpoint details |
| PUT | /v1/webhooks/:id | admin | Update endpoint |
| DELETE | /v1/webhooks/:id | admin | Delete endpoint + cascade deliveries |
| POST | /v1/webhooks/:id/test | admin | Send test event, return result synchronously |
| GET | /v1/webhooks/:id/deliveries | admin, manager | Delivery log with pagination |

### Notification Rules

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | /v1/notifications/rules | admin, manager | Create notification rule |
| GET | /v1/notifications/rules | admin, manager | List rules for org |
| DELETE | /v1/notifications/rules/:id | admin, manager | Delete rule |

### SSE Streaming

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET | /v1/events/stream?topics=scan.*,finding.critical | all authenticated | Live event stream |

SSE wire format:
```
event: scan.completed
id: evt_a1b2c3d4
data: {"id":"evt_a1b2c3d4","orgId":"org_xyz","topic":"scan.completed",...}

: heartbeat
```

---

## System Design

### Event Flow (Dual Path)

```
Internal event happens (scan completed, finding created, etc.)
  |
  +-- 1. Redis pub/sub "sentinel.events.fanout"
  |     -> API server SSE Manager -> broadcast to matching browser clients
  |     (fire-and-forget, <1ms latency)
  |
  +-- 2. Redis Stream "sentinel.notifications"
        -> notification-worker consumer group
        -> match endpoints + rules via TopicTrie
        -> create WebhookDelivery rows
        -> dispatch via channel adapters
        -> retry on failure (DB-backed, exponential backoff)
```

### Notification Worker

New process at `apps/api/src/notification-worker.ts`. Two loops:

1. **Stream consumer** — reads from `sentinel.notifications`, creates delivery rows, attempts first delivery
2. **Retry poller** — polls DB every 5s for `WHERE status='pending' AND nextRetryAt <= NOW()`, re-attempts failed deliveries

Health server on port 9095. Prometheus metrics for delivery success/failure/latency.

### Channel Adapters

| Adapter | Protocol | Auth | Format | Timeout |
|---------|----------|------|--------|---------|
| http-webhook | POST HTTPS | HMAC-SHA256 (X-Sentinel-Signature) | Raw JSON envelope | 10s |
| slack | POST Incoming Webhook | URL secret | Block Kit (severity color, fields, action button) | 5s |
| email | SMTP / SendGrid API | SMTP auth or API key | HTML template | 30s |
| pagerduty | POST Events API v2 | Routing key | PD-CEF with severity mapping | 10s |

### Prometheus Metrics (4 new)

- `sentinel_notification_deliveries_total{channel, status}` — Counter
- `sentinel_notification_delivery_duration_seconds{channel, success}` — Histogram
- `sentinel_sse_connections{org_id}` — Gauge
- `sentinel_notification_retry_queue_depth` — Gauge

---

## Testing Strategy (~58 Tests)

| File | Package | Count | Focus |
|------|---------|-------|-------|
| trie.test.ts | notifications | 8 | Topic matching: exact, wildcard, multi-level, global, dedup |
| http-webhook.test.ts | notifications | 7 | HMAC signing, success, timeout, non-2xx, custom headers |
| slack.test.ts | notifications | 5 | Block Kit formatting, severity colors, error handling |
| email.test.ts | notifications | 4 | HTML template, multiple recipients, SMTP failure |
| pagerduty.test.ts | notifications | 4 | Severity mapping, routing key, dedup key |
| sse-manager.test.ts | notifications | 6 | Register, broadcast, heartbeat, org isolation, cleanup |
| notification-api.test.ts | api | 12 | Webhook CRUD, rules CRUD, test endpoint, delivery log, SSE |
| notification-worker.test.ts | api | 8 | Event consumption, retry, DLQ, adapter dispatch, idempotency |
| rbac-enforcement.test.ts | security | 4 | Webhook role enforcement |

---

## Scope Boundary

**Excluded from P7:**
- Webhook IP allowlisting (YAGNI)
- Per-endpoint rate limiting (delivery is sequential)
- Payload transformation (customers consume standard format)
- Bi-directional WebSocket (SSE sufficient for push)
- Batched/digest notifications (future P8+)
- SMS / Microsoft Teams channels (future P8+)

---

## File Change Summary

| Action | Count |
|--------|-------|
| New files | ~25 (package + worker + tests + migration) |
| Modified files | ~8 (server.ts, worker.ts, scheduler.ts, report-worker.ts, rbac.ts, schema.prisma, docker-compose files, api package.json) |
| New lines | ~1,700 |
| New tests | ~58 |
| New Prisma models | 3 |
| New API routes | 10 + 1 SSE |
| New Docker service | 1 (notification-worker) |
| New Prometheus metrics | 4 |
