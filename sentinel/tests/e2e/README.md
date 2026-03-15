# Sentinel E2E Tests

Full pipeline tests: submit diff → agents → findings → assessment → certificate.

## Prerequisites

- Docker & Docker Compose
- Node.js 20+
- pnpm

## Run

```bash
# Full suite (starts Docker, runs tests, tears down)
pnpm run test:e2e

# With stack already running
E2E_SKIP_DOCKER=1 pnpm run test:e2e

# Single suite
pnpm run test:e2e -- --testPathPattern=happy-path
```

## Manage Stack

```bash
# Start stack for development/debugging
pnpm run e2e:stack:up

# Stop and clean up
pnpm run e2e:stack:down
```

## Architecture

- **Docker Compose** — postgres:5433, redis:6380, api:8081, agents, workers
- **Service Objects** — typed API clients with HMAC signing
- **DAG Verifier** — validates pipeline event ordering
- **Invariant Checker** — property-based assertions on pipeline state
- **Redis Inspector** — direct stream inspection for event verification

## Test Suites

| Suite | What it tests |
|-------|--------------|
| happy-path | Full pipeline, clean + vuln diffs |
| security-agent | SQL injection, hardcoded secrets, clean code |
| dependency-agent | Known CVEs, clean manifests |
| multi-agent | Parallel agents, finding merge |
| failure-modes | Bad auth, malformed input, empty diffs |
| certificate | Signature, risk score, structure |
| notifications | Redis stream events, consumer groups |
| compliance | Evidence trail, risk categories |
