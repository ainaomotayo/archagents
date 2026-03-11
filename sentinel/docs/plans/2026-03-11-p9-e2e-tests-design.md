# P9 End-to-End Tests Design

**Goal:** Full pipeline E2E tests that validate submit diff → agents → findings → assessment → certificate with real Docker services.

**Architecture:** Full Docker Compose orchestration — PostgreSQL, Redis, API, assessor worker, notification worker, security agent, dependency agent all running as real containers. Tests execute from the host against containerized services via HTTP + Redis inspection.

**Tech Stack:** Vitest (sequential, 120s timeout), Docker Compose, HMAC-signed HTTP, Redis Streams inspection via ioredis.

---

## Design Decisions (3 Categories × 3 Approaches)

### Category 1: Algorithms & DSA — Pipeline Verification Strategy

**Approach A: DAG State Machine Verification**
Model the pipeline as a directed acyclic graph. Each node represents an expected event (scan.created → agent.security.completed → assessment.completed → certificate.issued). Subscribe to Redis streams and verify the complete event graph was produced in topological order.
- Performance: O(V+E) verification, ~50ms overhead
- Scalability: Add nodes for new agents
- Accuracy: Catches ordering violations, missing events, duplicates

**Approach B: Event Sourcing with Snapshot Comparison**
Record every event into an append-only log. After pipeline completes, compare materialized DB state against pre-computed expected snapshot.
- Performance: O(n) recording + O(n) replay
- Scalability: Brittle — snapshots break with schema changes, combinatorial explosion with multiple agents
- Accuracy: Very high for exact reproduction

**Approach C: Property-Based Invariant Checking**
Define invariants that must hold regardless of agent ordering: "every finding references a valid scan", "certificate score = f(findings)", "all agents ACK'd before certificate". Use fast-check to generate random diffs and verify.
- Performance: O(k×n) per generated case
- Scalability: Excellent — invariants scale independently
- Accuracy: Finds classes of bugs, not specific regressions

**Hybrid Verdict: A + C (DAG State Machine + Invariant Checking)**
DAG verification for deterministic happy-path and failure-path tests (you know what events to expect). Property-based invariant checks for stress/fuzz scenarios. Why not B: snapshot comparison is fragile — any schema change or new field breaks all snapshots.

---

### Category 2: System Design — Service Orchestration

**Approach A: Docker Compose with Health-Gate Orchestration (Chosen)**
Dedicated `docker-compose.e2e.yml` starts all services with health checks. Test orchestrator waits for all health endpoints before running. Tests execute from host.
- Performance: ~15-30s cold start, ~5s warm; each test ~2-5s
- Scalability: Add services to compose; horizontal scaling via `--scale`
- Accuracy: Highest — real binaries (Semgrep, Redis Streams, Prisma)

**Approach B: Testcontainers Programmatic Lifecycle**
Testcontainers library starts/stops containers from within test framework. Each suite gets isolated containers with random ports.
- Performance: ~20-40s per suite spin-up, perfect isolation
- Scalability: Parallelizable across CI nodes
- Accuracy: Same as A, better isolation

**Approach C: Kubernetes-in-Docker (KinD)**
Deploy full stack into KinD cluster using Helm charts. Tests run against cluster ingress.
- Performance: ~60-120s cold start
- Scalability: Tests production-identical topology
- Accuracy: Highest possible — tests deployment AND application

**Hybrid Verdict: A + B (Compose for CI, Testcontainers for dev)**
Docker Compose as primary CI strategy — fast, reproducible, mirrors production. Testcontainers alternative for developers running single suites. Why not C: KinD adds 60-120s for deployment-level testing not needed for pipeline E2E.

---

### Category 3: Software Design — Test Code Structure

**Approach A: Service Object Pattern**
Each service gets a typed client class (ScanService, FindingService, CertificateService) encapsulating HTTP calls, auth signing, response parsing. Tests compose service objects declaratively.
- Scalability: New services = new service objects; tests don't change when endpoints evolve
- Accuracy: Typed clients catch API drift at compile time

**Approach B: Behavior-Driven Specification (Given-When-Then DSL)**
Fluent test DSL: `given.diff(payload).when.submitted().then.certificateIssued()`. Each step is a composable builder.
- Scalability: Easy to add steps; readable as documentation
- Accuracy: Obscures actual HTTP calls — hard to debug at 3 AM

**Approach C: Fixture-Factory Pattern with Test Phases**
Four explicit phases: SETUP → EXECUTE → VERIFY → CLEANUP. Factory functions for test data. Phase markers for logging.
- Scalability: Factories compose; phases consistent across all tests
- Accuracy: Explicit cleanup prevents pollution; phase logging aids debugging

**Hybrid Verdict: A + C (Service Objects + Fixture-Factory Phases)**
Service objects give typed, reusable API clients. Fixture-factory phases give clear structure and cleanup. Why not B: fluent DSL obscures debugging when E2E tests fail.

---

## Architecture

```
tests/e2e/
├── docker-compose.e2e.yml          # Full stack on non-standard ports
├── vitest.config.e2e.ts            # Sequential, 120s timeout
├── setup/
│   ├── global-setup.ts             # docker compose up, health-gate, migrate, seed
│   └── global-teardown.ts          # docker compose down -v
├── services/                       # Service Object Pattern
│   ├── api-client.ts               # Base: HMAC signing, HTTP
│   ├── scan-service.ts             # POST/GET /v1/scans, poll status
│   ├── finding-service.ts          # GET /v1/findings, suppress
│   ├── certificate-service.ts      # GET /v1/certificates, verify signature
│   ├── event-stream.ts             # SSE /v1/events/stream
│   └── health-service.ts           # /health polling for all services
├── fixtures/
│   ├── diffs.ts                    # Test diff payloads
│   ├── factory.ts                  # createTestOrg(), createTestProject()
│   └── expected-events.ts          # DAG definitions
├── helpers/
│   ├── wait-for.ts                 # Poll with exponential backoff
│   ├── dag-verifier.ts             # DAG state machine verification
│   ├── invariant-checker.ts        # Property-based invariant assertions
│   └── redis-inspector.ts          # Direct Redis stream inspection
├── __tests__/
│   ├── happy-path.test.ts          # Full pipeline end-to-end
│   ├── security-agent.test.ts      # Security-specific patterns
│   ├── dependency-agent.test.ts    # Dependency-specific manifests
│   ├── multi-agent.test.ts         # Parallel agents, finding merge
│   ├── failure-modes.test.ts       # Timeouts, bad payloads, auth errors
│   ├── certificate.test.ts         # Signature verification, risk scoring
│   ├── notifications.test.ts       # Webhooks, SSE events, DLQ
│   └── compliance.test.ts          # Evidence chain, compliance snapshots
└── README.md
```

## Docker Compose Stack

Non-standard ports to avoid conflicts with dev environment:

| Service | Container Port | Host Port | Health Check |
|---------|---------------|-----------|-------------|
| postgres | 5432 | 5433 | pg_isready |
| redis | 6379 | 6380 | redis-cli ping |
| api | 8080 | 8081 | GET /health |
| assessor-worker | 9092 | — | GET :9092/health |
| notification-worker | 9095 | — | GET :9095/health |
| agent-security | 8081 | — | GET :8081/health |
| agent-dependency | 8083 | — | GET :8083/health |

Environment: `SENTINEL_SECRET=e2e-test-secret`, `NODE_ENV=production`, shared DB/Redis URLs.

## Global Setup Flow

1. `docker compose -f docker-compose.e2e.yml up -d`
2. Poll all 7 health endpoints (timeout 90s, fail fast on crash)
3. Run `prisma migrate deploy` against postgres:5433
4. Seed: create test org, project, API key via direct DB insert
5. Export `E2E_API_URL`, `E2E_REDIS_URL`, `E2E_ORG_ID`, `E2E_PROJECT_ID`

Between tests: truncate `scan`, `finding`, `agent_result`, `certificate` tables.

## Service Objects

```typescript
class E2EApiClient {
  constructor(baseUrl, secret, orgId)
  signedFetch(method, path, body?, role?): Promise<Response>
}

class ScanService extends E2EApiClient {
  submitDiff(payload): Promise<{ scanId }>
  getScan(scanId): Promise<Scan>
  pollUntilStatus(scanId, status, timeoutMs): Promise<Scan>
}

class FindingService extends E2EApiClient {
  getFindings(scanId): Promise<Finding[]>
  suppressFinding(findingId): Promise<void>
}

class CertificateService extends E2EApiClient {
  getCertificate(scanId): Promise<Certificate>
  verifyCertificateSignature(cert, secret): boolean
}

class EventStreamClient {
  subscribe(topics): AsyncIterable<SentinelEvent>
  collectUntil(predicate, timeoutMs): Promise<SentinelEvent[]>
}
```

## DAG Verifier

```typescript
const HAPPY_PATH_DAG = {
  nodes: ["scan.created", "agent.security.completed", "agent.dependency.completed",
          "assessment.completed", "certificate.issued"],
  edges: [
    ["scan.created", "agent.security.completed"],
    ["scan.created", "agent.dependency.completed"],
    ["agent.security.completed", "assessment.completed"],
    ["agent.dependency.completed", "assessment.completed"],
    ["assessment.completed", "certificate.issued"],
  ],
};
```

Handles non-deterministic agent ordering — only requires both complete before assessment.

## Pipeline Invariants

1. Every finding references a valid scan
2. Certificate risk score = f(findings) — deterministic
3. Agent result count matches EXPECTED_AGENTS
4. No findings without a corresponding agent result
5. Certificate issued only after all agents completed
6. Certificate HMAC signature is valid

## Test Scenarios (~29 tests, ~125s + 30s startup)

| Suite | Tests | Time | Coverage |
|-------|-------|------|----------|
| happy-path | 3 | ~15s | Full pipeline, DAG verification, all invariants |
| security-agent | 4 | ~20s | SQL injection, XSS, hardcoded secret, clean code |
| dependency-agent | 3 | ~15s | Known CVE, typosquat, clean manifest |
| multi-agent | 3 | ~15s | Parallel agents, merge, asymmetric findings |
| failure-modes | 5 | ~25s | Timeout, malformed diff, bad auth, empty, duplicate |
| certificate | 4 | ~10s | Signature, risk score, categories, API retrieval |
| notifications | 4 | ~15s | SSE events, webhook delivery, DLQ, critical alerts |
| compliance | 3 | ~10s | Evidence chain, compliance snapshot, framework scoring |

## CI Integration

- GitHub Actions: required check on PRs to `main`
- Path filter: `apps/**`, `packages/**`, `agents/**` (skip docs-only)
- Docker logs uploaded as artifact on failure
- Zero retries — flaky tests must be fixed, not retried
- `E2E_SKIP_DOCKER=1` for developers with stack already running

## Test Output Format

```
[SETUP]    happy-path: created org org-e2e-abc123, project proj-e2e-def456
[EXECUTE]  happy-path: submitted diff → scanId=scan-789
[WAIT]     happy-path: polling scan status... pending → completed (2.3s)
[VERIFY]   happy-path: 4 findings (2 security, 2 dependency)
[VERIFY]   happy-path: certificate issued, verdict=fail, riskScore=78
[VERIFY]   happy-path: DAG verification passed (5/5 events)
[VERIFY]   happy-path: 6/6 invariants hold
[CLEANUP]  happy-path: truncated 1 scan, 4 findings, 1 certificate
```
