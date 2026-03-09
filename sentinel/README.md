# SENTINEL

**AI-Generated Code Governance & Compliance Platform**

SENTINEL is an event-driven analysis platform that scans AI-generated code for security vulnerabilities, license violations, quality issues, and policy compliance. It produces HMAC-signed compliance certificates suitable for regulated industries (EU AI Act, SOC 2, ISO 27001).

---

## Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Install TypeScript Dependencies](#2-install-typescript-dependencies)
  - [3. Install Python Agent Dependencies](#3-install-python-agent-dependencies)
  - [4. Configure Environment Variables](#4-configure-environment-variables)
- [Running the Platform](#running-the-platform)
  - [Local Development](#local-development)
  - [Docker Compose (Production)](#docker-compose-production)
  - [Dashboard Only (Docker)](#dashboard-only-docker)
- [Running Tests](#running-tests)
- [Running a Scan](#running-a-scan)
- [Dashboard](#dashboard)
- [Project Structure](#project-structure)
- [Architecture Deep Dive](#architecture-deep-dive)
- [Configuration Reference](#configuration-reference)
- [Scan Policies](#scan-policies)
- [API Reference](#api-reference)
- [Security](#security)
- [Compliance](#compliance)
- [CI/CD Integration](#cicd-integration)
- [Load Testing](#load-testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

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

A scan flows through three stages:

1. **Submission** — Code diffs are submitted via the CLI, API, or GitHub App webhook.
2. **Analysis** — Seven specialized agents consume events from Redis Streams, each producing findings in parallel.
3. **Assessment** — The Compliance Assessor aggregates findings into a weighted risk score and generates an HMAC-signed certificate.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 22+ | TypeScript packages (API, CLI, dashboard) |
| **pnpm** | 10+ | Monorepo package management |
| **Python** | 3.11+ | Analysis agents |
| **Docker** | 24+ | Containerized deployment |
| **Docker Compose** | v2+ | Multi-service orchestration |
| **Redis** | 7+ | Event bus (provided via Docker in dev) |
| **PostgreSQL** | 16+ | Data store (provided via Docker in dev) |

> **Note:** Redis and PostgreSQL are included in the Docker Compose files. You only need them installed locally if running without Docker.

---

## Setup

### 1. Clone the Repository

```bash
git clone https://github.com/ainaomotayo/archagents.git
cd archagents/sentinel
```

### 2. Install TypeScript Dependencies

SENTINEL uses a pnpm monorepo with Turborepo for build orchestration.

```bash
# Enable pnpm via corepack (ships with Node.js 22+)
corepack enable

# Install all TypeScript dependencies
pnpm install

# Build all packages
pnpm build
```

This installs and builds all workspace packages:
- `apps/api` — Fastify REST API server
- `apps/cli` — CLI tool for CI/CD integration
- `apps/dashboard` — Next.js 15 compliance dashboard
- `packages/*` — Shared libraries (events, auth, assessor, audit, etc.)

### 3. Install Python Agent Dependencies

Each analysis agent is an independent Python package. They share a common framework.

```bash
# Install the shared framework first
cd agents/framework
python -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

# Then install each agent you need (example: security agent)
cd ../security
python -m venv .venv
source .venv/bin/activate
pip install -e ../framework -e ".[dev]"
```

Repeat for any agents you want to run locally:
- `agents/security` — Semgrep + custom pattern detection
- `agents/ip-license` — SPDX license detection, code fingerprinting
- `agents/dependency` — CVE lookup, typosquat detection
- `agents/ai-detector` — Entropy, stylometric, marker analysis
- `agents/quality` — Complexity, duplication, naming, test coverage
- `agents/policy` — YAML rule engine with org/repo inheritance
- `agents/llm-review` — Optional LLM-based review (requires Anthropic API key)

### 4. Configure Environment Variables

```bash
# Copy the example environment file
cp .env.example .env
```

Edit `.env` and update the following required values:

```env
POSTGRES_PASSWORD=<your-secure-password>
SENTINEL_SECRET=<random-64-char-hex-string>
DATABASE_URL=postgresql://sentinel:<your-password>@postgres:5432/sentinel
NEXTAUTH_SECRET=<random-64-char-hex-string>
```

Generate secure random secrets:

```bash
openssl rand -hex 32   # Use output for SENTINEL_SECRET
openssl rand -hex 32   # Use output for NEXTAUTH_SECRET
```

Optional — for GitHub OAuth login on the dashboard:

```env
GITHUB_CLIENT_ID=<your-github-oauth-app-id>
GITHUB_CLIENT_SECRET=<your-github-oauth-app-secret>
```

Optional — for the LLM review agent:

```env
ANTHROPIC_API_KEY=<your-anthropic-api-key>
LLM_TOKEN_BUDGET=50000
```

---

## Running the Platform

### Local Development

Start the infrastructure services (Postgres + Redis) first:

```bash
# Start Postgres and Redis
docker compose up -d

# In separate terminals:

# Terminal 1 — API server (port 8080)
cd apps/api
pnpm dev

# Terminal 2 — Dashboard (port 3000)
cd apps/dashboard
pnpm dev

# Terminal 3 — Start an agent (example: security)
cd agents/security
source .venv/bin/activate
python -m sentinel_security
```

The dashboard will be available at **http://localhost:3000**.

### Docker Compose (Production)

Deploy the entire platform — API, dashboard, all agents, Postgres, and Redis — with a single command:

```bash
# Build and start all 10 services
docker compose -f docker-compose.sentinel.yml --env-file .env up -d --build

# Include the optional LLM review agent
docker compose -f docker-compose.sentinel.yml --profile llm --env-file .env up -d --build
```

This starts:

| Service | Port | Description |
|---------|------|-------------|
| **postgres** | 5432 (internal) | PostgreSQL 16 database |
| **redis** | 6379 (internal) | Redis 7 event bus |
| **api** | 8080 | Fastify REST API |
| **dashboard** | 3000 | Next.js compliance dashboard |
| **security-agent** | — | Security vulnerability scanner |
| **license-agent** | — | License & IP compliance checker |
| **dependency-agent** | — | Dependency risk analyzer |
| **ai-detector-agent** | — | AI-generated code detector |
| **quality-agent** | — | Code quality analyzer |
| **policy-agent** | — | Policy rule engine |
| **llm-review-agent** | — | LLM-based review (optional, `--profile llm`) |

Check service health:

```bash
# View all service statuses
docker compose -f docker-compose.sentinel.yml ps

# Check API health
curl http://localhost:8080/health

# View logs for a specific service
docker compose -f docker-compose.sentinel.yml logs -f api
docker compose -f docker-compose.sentinel.yml logs -f dashboard
```

To stop all services:

```bash
docker compose -f docker-compose.sentinel.yml down

# To also remove persistent data volumes
docker compose -f docker-compose.sentinel.yml down -v
```

### Dashboard Only (Docker)

If you only need the dashboard for development or demo purposes:

```bash
# Build the dashboard image
docker build -f docker/dashboard.Dockerfile -t sentinel-dashboard .

# Run it
docker run -p 3000:3000 \
  -e NEXTAUTH_URL=http://localhost:3000 \
  -e NEXTAUTH_SECRET=$(openssl rand -hex 32) \
  sentinel-dashboard
```

The dashboard will be available at **http://localhost:3000**.

---

## Running Tests

### TypeScript Tests

```bash
# Run all TypeScript tests across the monorepo
pnpm test

# Run tests for a specific package
pnpm --filter @sentinel/dashboard test
pnpm --filter @sentinel/api test
pnpm --filter @sentinel/cli test
pnpm --filter @sentinel/assessor test
```

### Python Agent Tests

```bash
# Run from each agent directory with its venv activated
cd agents/security && source .venv/bin/activate && pytest
cd agents/ip-license && source .venv/bin/activate && pytest
cd agents/ai-detector && source .venv/bin/activate && pytest
cd agents/quality && source .venv/bin/activate && pytest
cd agents/dependency && source .venv/bin/activate && pytest
cd agents/policy && source .venv/bin/activate && pytest
cd agents/llm-review && source .venv/bin/activate && pytest
```

### End-to-End Tests

```bash
# Docker Compose validation
cd test/docker && ./validate.sh

# E2E pipeline tests (requires running infrastructure)
cd test/e2e && pnpm test
```

---

## Running a Scan

### Via CLI

```bash
# Scan the last commit's diff
git diff HEAD~1 | sentinel ci \
  --api-url http://localhost:8080 \
  --api-key YOUR_KEY \
  --secret YOUR_SECRET

# Output in SARIF format (for GitHub Code Scanning)
git diff HEAD~1 | sentinel ci --sarif

# Output as JSON
git diff HEAD~1 | sentinel ci --json
```

### Via API

```bash
# Submit a scan
curl -X POST http://localhost:8080/v1/scans \
  -H "Content-Type: application/json" \
  -H "X-Sentinel-Signature: <hmac-signature>" \
  -d '{"project_id": "my-project", "diff": "<unified-diff>"}'

# Poll scan status
curl http://localhost:8080/v1/scans/<scan-id>/poll

# Get scan results
curl http://localhost:8080/v1/scans/<scan-id>

# Get compliance certificate
curl http://localhost:8080/v1/certificates/<cert-id>

# Verify certificate signature
curl -X POST http://localhost:8080/v1/certificates/<cert-id>/verify
```

### What to Expect

After submitting a scan, the platform will:

1. **Parse the diff** and distribute it to all analysis agents via Redis Streams.
2. **Agents run in parallel** — each produces findings (vulnerabilities, license issues, quality problems, policy violations, etc.).
3. **The Compliance Assessor** aggregates all findings into a weighted risk score.
4. **A compliance certificate** is generated with one of these statuses:

| Status | Risk Score | CLI Exit Code | Meaning |
|--------|-----------|---------------|---------|
| `full_pass` | 0–20 | 0 | All checks clear |
| `provisional_pass` | 21–50 | 3 | Minor issues, review recommended |
| `fail` | 51+ or critical | 1 | Blocking issues found |
| `partial` | Agent timeout | 3 | Incomplete scan |

---

## Dashboard

The SENTINEL dashboard is a Next.js 15 application providing a real-time compliance overview.

### Pages

| Page | Path | Description |
|------|------|-------------|
| **Overview** | `/` | Key metrics, recent scans, risk trend |
| **Projects** | `/projects` | All monitored repositories |
| **Findings** | `/findings` | Security and compliance findings |
| **Certificates** | `/certificates` | Compliance certificates |
| **Policies** | `/policies` | Policy rules and configuration |
| **Reports** | `/reports` | Compliance reports and exports |
| **Drift** | `/drift` | Configuration drift detection |
| **Audit Log** | `/audit` | Immutable activity log |
| **Settings** | `/settings` | Platform configuration (admin only) |

### Public Pages

| Page | Path | Description |
|------|------|-------------|
| **Landing** | `/welcome` | Marketing landing page |
| **Pricing** | `/welcome/pricing` | Plan tiers and feature comparison |
| **Login** | `/login` | Authentication (GitHub OAuth) |

### Role-Based Access Control (RBAC)

The dashboard enforces role-based access:

| Role | Access |
|------|--------|
| **admin** | All pages including Settings |
| **manager** | All pages except Settings |
| **dev** | Overview, Projects, Findings, Certificates |
| **viewer** | Overview, Certificates |

---

## Project Structure

```
sentinel/
├── apps/
│   ├── api/                # Fastify REST API server
│   ├── cli/                # CLI tool for CI/CD integration
│   └── dashboard/          # Next.js 15 compliance dashboard
├── agents/
│   ├── framework/          # Python base agent + shared types
│   ├── security/           # Security vulnerability scanner
│   ├── ip-license/         # License & IP compliance checker
│   ├── dependency/         # Dependency risk analyzer
│   ├── ai-detector/        # AI-generated code detector
│   ├── quality/            # Code quality analyzer
│   ├── policy/             # Policy rule engine
│   └── llm-review/         # Optional LLM-based review agent
├── packages/
│   ├── shared/             # Shared TypeScript types
│   ├── events/             # Redis Streams event bus
│   ├── assessor/           # Risk scoring & certificate generation
│   ├── auth/               # HMAC request signing/verification
│   ├── audit/              # Immutable hash-chained audit log
│   ├── db/                 # Database schema & tenant isolation
│   ├── github/             # GitHub App (webhooks, check runs, Slack)
│   └── security/           # Enterprise security (JWT, KMS, RBAC, SBOM)
├── docker/
│   ├── api.Dockerfile      # API server image
│   ├── dashboard.Dockerfile# Dashboard image (Next.js standalone)
│   └── agent.Dockerfile    # Python agent image (multi-agent)
├── deploy/                 # Auto-scaling, partitioning, Redis tuning
├── templates/              # CI/CD templates (GitHub Actions, GitLab CI)
├── test/
│   ├── e2e/                # End-to-end pipeline tests
│   ├── docker/             # Docker Compose validation
│   └── load/               # k6 load tests
├── docs/
│   ├── api/openapi.yaml    # OpenAPI 3.1 specification
│   ├── onboarding.md       # Quick-start guide
│   ├── security-whitepaper.md
│   └── soc2-audit-initiation.md
├── .sentinel/              # Self-scanning dogfood policies
├── .github/workflows/      # SBOM generation & self-scan workflows
├── docker-compose.yml      # Dev infrastructure (Postgres + Redis)
├── docker-compose.sentinel.yml  # Production deployment (all services)
├── turbo.json              # Turborepo build configuration
├── pnpm-workspace.yaml     # pnpm workspace definition
├── .env.example            # Environment variable template
└── package.json            # Root package.json
```

---

## Architecture Deep Dive

### Key Components

| Component | Language | Description |
|-----------|----------|-------------|
| **API Server** (`apps/api`) | TypeScript | Fastify REST API, scan submission, HMAC auth |
| **CLI** (`apps/cli`) | TypeScript | CI/CD integration, diff parsing, SARIF output |
| **Dashboard** (`apps/dashboard`) | TypeScript | Next.js 15, RBAC, SSE real-time updates |
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

### Analysis Agent Weights

All agents implement the same `BaseAgent` interface and communicate via Redis Streams:

| Agent | Findings Produced | Weight |
|-------|------------------|--------|
| Security | SQL injection, XSS, eval(), hardcoded secrets | 0.30 |
| IP/License | Copyleft risk, unknown license, attribution | 0.20 |
| Quality | Complexity, duplication, naming, test gaps | 0.15 |
| Policy | Deny-import, deny-pattern, require-pattern | 0.15 |
| Dependency | CVEs, typosquat, unmaintained, drift | 0.15 |
| AI Detection | AI probability, tool attribution | 0.05 |

---

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_DB` | No | `sentinel` | Database name |
| `POSTGRES_USER` | No | `sentinel` | Database user |
| `POSTGRES_PASSWORD` | **Yes** | — | Database password |
| `REDIS_URL` | No | `redis://redis:6379` | Redis connection URL |
| `API_PORT` | No | `8080` | API server port |
| `SENTINEL_SECRET` | **Yes** | — | HMAC signing secret (64 hex chars) |
| `DATABASE_URL` | **Yes** | — | Full Postgres connection string |
| `DASHBOARD_PORT` | No | `3000` | Dashboard port |
| `NEXTAUTH_URL` | **Yes** | — | Dashboard public URL |
| `NEXTAUTH_SECRET` | **Yes** | — | NextAuth session secret (64 hex chars) |
| `GITHUB_CLIENT_ID` | No | — | GitHub OAuth app ID |
| `GITHUB_CLIENT_SECRET` | No | — | GitHub OAuth app secret |
| `ANTHROPIC_API_KEY` | No | — | Anthropic API key (LLM agent only) |
| `LLM_TOKEN_BUDGET` | No | `50000` | Max tokens per LLM review |

---

## Scan Policies

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

---

## API Reference

The full API is documented in [OpenAPI 3.1 format](docs/api/openapi.yaml).

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/scans` | Submit a new scan |
| `GET` | `/v1/scans/:id/poll` | Poll scan status (SSE) |
| `GET` | `/v1/scans/:id` | Get scan result |
| `GET` | `/v1/certificates/:id` | Get compliance certificate |
| `POST` | `/v1/certificates/:id/verify` | Verify certificate HMAC signature |
| `GET` | `/v1/projects` | List projects |
| `GET` | `/v1/findings` | List findings (filterable) |
| `GET` | `/v1/audit` | Query audit log |
| `GET` | `/health` | Health check |

---

## Security

- **HMAC-SHA256** request signing on all API calls
- **JWT session tokens** with 15-minute TTL
- **AES-256-GCM** encryption for sensitive data at rest
- **Crypto-shredding** for GDPR data purge (destroy KMS keys)
- **PII scrubber** gateway before any data reaches the LLM agent
- **Hash-chained audit log** for tamper-evident compliance records
- **S3 Object Lock** (COMPLIANCE mode) for immutable certificate archival
- **RBAC** with 4 dashboard roles: `admin`, `manager`, `dev`, `viewer`

See the [Security Whitepaper](docs/security-whitepaper.md) for full details.

---

## Compliance

SENTINEL is designed for regulated environments:

- **EU AI Act** — Risk categorization, documentation requirements (Articles 9-15)
- **SOC 2 Type I** — Trust Service Criteria mapping, audit trail
- **ISO 27001** — Information security controls mapping

See the [SOC 2 Audit Initiation](docs/soc2-audit-initiation.md) guide.

---

## CI/CD Integration

SENTINEL provides ready-to-use templates for CI/CD pipelines:

### GitHub Actions

```yaml
# .github/workflows/sentinel-scan.yml
# See templates/github-actions.yml for the full template
- name: SENTINEL Scan
  run: |
    git diff ${{ github.event.before }}..${{ github.sha }} | \
      sentinel ci --api-url ${{ secrets.SENTINEL_API_URL }} \
                  --api-key ${{ secrets.SENTINEL_API_KEY }} \
                  --secret ${{ secrets.SENTINEL_SECRET }} \
                  --sarif > results.sarif
- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

### GitLab CI

```yaml
# See templates/gitlab-ci.yml for the full template
sentinel-scan:
  script:
    - git diff HEAD~1 | sentinel ci --api-url $SENTINEL_API_URL --secret $SENTINEL_SECRET
```

---

## Load Testing

k6 load tests are in `test/load/`:

```bash
k6 run test/load/k6-scan-load.js
```

Default configuration: 100 virtual users submitting scans + 50 polling, 5-minute duration.

---

## Troubleshooting

### Docker build fails with "Ignored build scripts" warning

pnpm v10+ requires explicit approval for package build scripts. The dashboard Dockerfile already handles this, but if you encounter issues locally:

```bash
pnpm config set enable-pre-post-scripts true
pnpm install
```

### Dashboard shows unstyled content

The dashboard uses Tailwind CSS v4 with PostCSS. Ensure `postcss.config.mjs` (not `.ts`) exists in `apps/dashboard/`. The `.mjs` format is required for Next.js 15 to load the PostCSS plugin correctly.

### Port already in use

```bash
# Check what's using the port
lsof -i :3000  # dashboard
lsof -i :8080  # api

# Or use different ports via environment variables
DASHBOARD_PORT=3001 API_PORT=8081 docker compose -f docker-compose.sentinel.yml up -d
```

### Agent health check failing

Check Redis connectivity:

```bash
docker compose -f docker-compose.sentinel.yml logs redis
docker compose -f docker-compose.sentinel.yml exec redis redis-cli ping
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

Apache License 2.0. See [LICENSE](LICENSE).
