# Backend Completion Design

**Goal:** Complete all remaining backend work — P3 operational maturity, P4 scheduler polish, P5 SSO finalization, integration tests, and dashboard-to-API wiring.

## 1. P3: Data Retention Cron + Path Normalization

### Data Retention
- Add `runRetentionCleanup()` call to `apps/api/src/scheduler.ts` on daily cron `0 4 * * *`
- Function already exists and is exported from `@sentinel/security`
- Log results (deletion counts) via existing telemetry logger

### RBAC Path Normalization
- In `apps/api/src/middleware/auth.ts`, normalize path before RBAC lookup:
  - Strip trailing slashes
  - Lowercase the method comparison (already done)
- Closes potential RBAC bypass via `/v1/scans/` vs `/v1/scans`

## 2. P4: Scheduler Health + Metrics

### Health Endpoint
- Add minimal HTTP server in `scheduler.ts` on port `SCHEDULER_PORT` (default 9091)
- `GET /health` returns `{ status: "ok", uptime, lastTrigger, nextScheduled }`
- Use raw `http.createServer` to avoid Fastify dependency in scheduler

### Prometheus Metrics
- `sentinel_scheduler_triggers_total` (counter, labels: type=self_scan|cve_rescan|retention)
- `sentinel_scheduler_errors_total` (counter, labels: type)
- `sentinel_scheduler_last_trigger_timestamp` (gauge, labels: type)
- Expose on `GET /metrics` in text/plain Prometheus format

### Docker Compose
- Add `healthcheck` to scheduler service in both compose files:
  ```yaml
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9091/health"]
    interval: 30s
    timeout: 5s
    retries: 3
  ```

## 3. P5: SAML Jackson in Docker Compose

- Add `boxyhq/jackson:latest` service to `docker-compose.sentinel.yml`
- Connect to `sentinel-internal` network
- Env vars: `JACKSON_URL`, `DB_ENGINE=sql`, `DB_TYPE=postgres`, `DB_URL`
- Dashboard `SAML_JACKSON_URL` already points to this service

## 4. Integration Tests

### Approach
- Use `fastify.inject()` for HTTP-level testing without network
- Spin up real Fastify app from `server.ts` with mocked DB (Prisma) and Redis
- Test file: `apps/api/src/__tests__/api-integration.test.ts`

### Coverage
- All GET endpoints return 200 with correct response shape
- POST /v1/scans with valid HMAC returns 201
- Invalid HMAC signature returns 401
- Insufficient RBAC role returns 403
- Pagination params (limit, offset) work correctly
- Unknown routes return 404
- Certificate verify/revoke endpoints work

### Mocking Strategy
- Mock `@sentinel/db` Prisma client with in-memory data
- Mock `@sentinel/events` EventBus with no-op publish
- Real HMAC signing/verification (uses `@sentinel/auth`)
- Real RBAC enforcement (uses `@sentinel/security`)

## 5. Dashboard ↔ API Wiring

### API Client Changes (`apps/dashboard/lib/api-client.ts`)
- Add optional `extraHeaders` parameter to `apiGet()` and `apiPost()`
- Headers passed alongside existing HMAC signature headers

### Session Context (`apps/dashboard/lib/api.ts`)
- Import `getServerSession` from next-auth
- Extract user role and org from session in each exported function
- Pass as `X-Sentinel-Role` and `X-Sentinel-Org-Id` headers
- Graceful: if no session (e.g., during build), omit headers

### Backend Middleware (`apps/api/src/middleware/auth.ts`)
- After HMAC verification, read `X-Sentinel-Role` and `X-Sentinel-Org-Id`
- Use these for RBAC check and tenant scoping when API key is "dashboard"
- For non-dashboard clients, derive role from API key as before

### No Breaking Changes
- Mock fallback (`tryApi()`) continues to work when API unavailable
- Dashboard works in mock mode during development (no SENTINEL_API_URL)
- All existing tests unaffected
