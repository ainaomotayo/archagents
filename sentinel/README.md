# SENTINEL

**AI-Generated Code Governance & Compliance Platform**

SENTINEL is an event-driven analysis platform that scans AI-generated code for security vulnerabilities, license violations, quality issues, and policy compliance. It produces HMAC-signed compliance certificates suitable for regulated industries (EU AI Act, SOC 2, ISO 27001).

## Architecture

```
CLI / GitHub App
       |
       v
   API Server  ──>  Redis Streams (event bus)
                         |
         ┌───────────────┼───────────────────────────┐
         v               v               v           v
   ┌──────────┐   ┌──────────┐   ┌──────────┐  ... (7 agents)
   │ Security │   │ License  │   │ Quality  │
   │  Agent   │   │  Agent   │   │  Agent   │
   └────┬─────┘   └────┬─────┘   └────┬─────┘
        └───────────────┼───────────────┘
                        v
                  Compliance Assessor
                        |
              ┌─────────┴─────────┐
              v                   v
     Risk Assessment      HMAC Certificate
              |
              v
        Dashboard / CLI / GitHub Check Run
```

### Key Components

| Component | Language | Description |
|-----------|----------|-------------|
| **API Server** (`apps/api`) | TypeScript | Fastify REST API, scan submission, HMAC auth |
| **CLI** (`apps/cli`) | TypeScript | CI/CD integration, diff parsing, SARIF output |
| **Dashboard** (`apps/dashboard`) | TypeScript | Next.js 15, RBAC, SSE real-time updates, reporting |
| **Event Bus** (`packages/events`) | TypeScript | Redis Streams with consumer groups |
| **Assessor** (`packages/assessor`) | TypeScript | Weighted risk scoring, tiered certification |
| **Security Agent** (`agents/security`) | Python | Semgrep + custom pattern detection |
| **IP/License Agent** (`agents/ip-license`) | Python | SPDX license detection, code fingerprinting |
| **Dependency Agent** (`agents/dependency`) | Python | CVE lookup, typosquat detection |
| **AI Detector Agent** (`agents/ai-detector`) | Python | Entropy, stylometric, marker, timing analysis |
| **Quality Agent** (`agents/quality`) | Python | Complexity, duplication, naming, test coverage |
| **Policy Agent** (`agents/policy`) | Python | YAML rule engine with org/repo inheritance |
| **LLM Review Agent** (`agents/llm-review`) | Python | Optional LLM-based review with PII scrubbing |
| **GitHub App** (`packages/github`) | TypeScript | Webhooks, Check Runs, annotations, Slack alerts |
| **Enterprise Security** (`packages/security`) | TypeScript | JWT, KMS, crypto-shredding, RBAC, SBOM, S3 archive |

### Analysis Agents

All agents implement the same `BaseAgent` interface and communicate via Redis Streams:

| Agent | Findings Produced | Severity Weights |
|-------|------------------|------------------|
| Security | SQL injection, XSS, eval(), hardcoded secrets | 0.30 |
| IP/License | Copyleft risk, unknown license, attribution | 0.20 |
| Quality | Complexity, duplication, naming, test gaps | 0.15 |
| Policy | Deny-import, deny-pattern, require-pattern | 0.15 |
| Dependency | CVEs, typosquat, unmaintained, drift | 0.15 |
| AI Detection | AI probability, tool attribution | 0.05 |

### Certification Tiers

| Status | Risk Score | Exit Code | Meaning |
|--------|-----------|-----------|---------|
| `full_pass` | 0-20 | 0 | All checks clear |
| `provisional_pass` | 21-50 | 3 | Minor issues, review recommended |
| `fail` | 51+ or critical | 1 | Blocking issues found |
| `partial` | Agent timeout | 3 | Incomplete scan |

## Prerequisites

- **Node.js** 22+
- **pnpm** 10+
- **Python** 3.11+ (for analysis agents)
- **Docker** & **Docker Compose** (for on-prem deployment)
- **Redis** 7+ (event bus)
- **PostgreSQL** 16+ (data store)

## Quick Start

### 1. Install Dependencies

```bash
# TypeScript packages
pnpm install

# Python agents (framework must be installed first)
cd agents/framework && python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Then each agent (example for security)
cd ../security && python -m venv .venv && source .venv/bin/activate
pip install -e ../framework && pip install -e ".[dev]"
```

### 2. Build

```bash
pnpm build
```

### 3. Run Tests

```bash
# TypeScript (371 tests across 15 packages)
pnpm test

# Python agents (233 tests across 8 packages)
# Run from each agent directory with its venv activated:
cd agents/security && source .venv/bin/activate && pytest
cd agents/ai-detector && source .venv/bin/activate && pytest
# ... etc.
```

### 4. Deploy with Docker Compose

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with your credentials

# Start all services (without LLM agent)
docker compose -f docker-compose.sentinel.yml up -d

# Or with optional LLM review agent
docker compose -f docker-compose.sentinel.yml --profile llm up -d
```

### 5. Run a Scan

```bash
# Via CLI
git diff HEAD~1 | sentinel ci \
  --api-url http://localhost:8080 \
  --api-key YOUR_KEY \
  --secret YOUR_SECRET

# SARIF output for GitHub integration
git diff HEAD~1 | sentinel ci --sarif

# JSON output
git diff HEAD~1 | sentinel ci --json
```

## Project Structure

```
sentinel/
  apps/
    api/              # Fastify REST API server
    cli/              # CLI tool for CI/CD integration
    dashboard/        # Next.js 15 compliance dashboard
  agents/
    framework/        # Python base agent + shared types
    security/         # Security vulnerability scanner
    ip-license/       # License & IP compliance checker
    dependency/       # Dependency risk analyzer
    ai-detector/      # AI-generated code detector
    quality/          # Code quality analyzer
    policy/           # Policy rule engine
    llm-review/       # Optional LLM-based review agent
  packages/
    shared/           # Shared TypeScript types
    events/           # Redis Streams event bus
    assessor/         # Risk scoring & certificate generation
    auth/             # HMAC request signing/verification
    audit/            # Immutable hash-chained audit log
    db/               # Database schema & tenant isolation
    github/           # GitHub App (webhooks, check runs, Slack)
    security/         # Enterprise security (JWT, KMS, RBAC, SBOM)
  deploy/             # Auto-scaling, partitioning, Redis tuning
  docker/             # Dockerfiles for API, dashboard, agents
  docs/
    api/openapi.yaml  # OpenAPI 3.1 specification
    onboarding.md     # Quick-start guide
    security-whitepaper.md
    soc2-audit-initiation.md
  test/
    e2e/              # End-to-end pipeline tests
    docker/           # Docker Compose validation
    load/             # k6 load tests
  templates/          # CI/CD templates (GitHub Actions, GitLab CI)
  .sentinel/          # Self-scanning dogfood policies
  .github/workflows/  # SBOM generation & self-scan workflows
```

## Configuration

### Environment Variables

See [`.env.example`](.env.example) for all configuration options:

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_DB` | Database name | `sentinel` |
| `POSTGRES_USER` | Database user | `sentinel` |
| `POSTGRES_PASSWORD` | Database password | (required) |
| `REDIS_URL` | Redis connection URL | `redis://redis:6379` |
| `API_PORT` | API server port | `8080` |
| `SENTINEL_SECRET` | HMAC signing secret | (required) |
| `DATABASE_URL` | Full Postgres connection string | (required) |
| `DASHBOARD_PORT` | Dashboard port | `3000` |
| `NEXTAUTH_URL` | Dashboard public URL | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | NextAuth session secret | (required) |
| `GITHUB_CLIENT_ID` | GitHub OAuth app ID | (optional) |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth secret | (optional) |
| `ANTHROPIC_API_KEY` | Anthropic API key for LLM agent | (optional) |
| `LLM_TOKEN_BUDGET` | Max tokens per LLM review | `50000` |

### Scan Policies

Policies are defined in YAML and support org/repo inheritance:

```yaml
# .sentinel/policies.yaml
version: "1"
rules:
  - name: no-eval
    type: deny-pattern
    pattern: "\\beval\\("
    severity: critical
    message: "eval() is forbidden"

  - name: require-license-header
    type: require-pattern
    pattern: "^// SPDX-License-Identifier:"
    glob: "src/**/*.ts"
    severity: medium
    message: "All source files must have SPDX license header"
```

## Security

- **HMAC-SHA256** request signing on all API calls
- **JWT session tokens** with 15-minute TTL (manual implementation, no external library)
- **AES-256-GCM** encryption for sensitive data at rest
- **Crypto-shredding** for GDPR data purge (destroy KMS keys)
- **PII scrubber** gateway before any data reaches the LLM agent
- **Hash-chained audit log** for tamper-evident compliance records
- **S3 Object Lock** (COMPLIANCE mode) for immutable certificate archival
- **RBAC** with 5 roles: `viewer`, `developer`, `reviewer`, `admin`, `auditor`

See the [Security Whitepaper](docs/security-whitepaper.md) for full details.

## Compliance

SENTINEL is designed for regulated environments:

- **EU AI Act** — Risk categorization, documentation requirements (Articles 9-15)
- **SOC 2 Type I** — Trust Service Criteria mapping, audit trail
- **ISO 27001** — Information security controls mapping

See the [SOC 2 Audit Initiation](docs/soc2-audit-initiation.md) guide.

## API Reference

The full API is documented in [OpenAPI 3.1 format](docs/api/openapi.yaml) with 9 endpoint paths and 14 schemas.

Key endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/scans` | Submit a new scan |
| `GET` | `/v1/scans/:id/poll` | Poll scan status |
| `GET` | `/v1/scans/:id` | Get scan result |
| `GET` | `/v1/certificates/:id` | Get certificate |
| `POST` | `/v1/certificates/:id/verify` | Verify certificate signature |
| `GET` | `/v1/projects` | List projects |
| `GET` | `/v1/findings` | List findings |
| `GET` | `/v1/audit` | Query audit log |
| `GET` | `/health` | Health check |

## Docker Services

The `docker-compose.sentinel.yml` runs 11 services across two networks:

| Service | Image | Network |
|---------|-------|---------|
| postgres | postgres:16-alpine | internal |
| redis | redis:7-alpine | internal |
| api | sentinel/api | internal + external |
| dashboard | sentinel/dashboard | internal + external |
| agent-security | sentinel/agent | internal |
| agent-license | sentinel/agent | internal |
| agent-dependency | sentinel/agent | internal |
| agent-ai-detector | sentinel/agent | internal |
| agent-quality | sentinel/agent | internal |
| agent-policy | sentinel/agent | internal |
| agent-llm-review | sentinel/agent | internal (profile: llm) |

## Load Testing

k6 load tests are in `test/load/`:

```bash
k6 run test/load/k6-scan-load.js
```

Targets: 100 virtual users submitting scans + 50 polling, 5-minute duration.

## License

Apache License 2.0. See [LICENSE](LICENSE).
