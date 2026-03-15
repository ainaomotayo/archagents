# P3 Deployment Orchestration Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Production-grade deployment orchestration for the Sentinel AI Code Governance platform — Docker Compose for dev/small deployments, Helm for Kubernetes production clusters.

**Architecture:** Hybrid of Helm-first (handcrafted k8s-native templates) with a lightweight shared service catalog (`deploy/services.yaml`) for Compose generation and CI drift validation. Neither Compose nor Helm is derived from the other — each is purpose-built for its target, unified by the catalog.

**Tech Stack:** Docker, Docker Compose 3.9, Helm 3, Kubernetes 1.28+, Prometheus, Grafana, OpenTelemetry Collector, cert-manager, External Secrets Operator, KEDA (optional), GitHub Actions CI/CD.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Deployment paths | Docker Compose (dev/small) + Helm (k8s production) | Covers self-hosted and cloud-managed scenarios |
| Configuration source | Shared service catalog + independent Compose/Helm | Eliminates drift without generation complexity |
| Secrets management | Pluggable: k8s native / AWS SM / GCP SM / Azure KV / Vault | Enterprise multi-cloud requirement |
| Database migrations | Helm pre-upgrade Job (k8s), entrypoint script (Compose) | One-shot Job prevents race conditions with multi-replica API |
| Agent scaling | Tiered: critical agents get dedicated HPA, batch agents share pool | Balances isolation with resource efficiency |
| Observability | Bundled Prometheus + Grafana + optional OTel Collector | Self-sufficient default with enterprise backend integration |
| TLS/Ingress | Ingress + cert-manager by default, service mesh optional | Standard path with upgrade path for advanced users |
| Network isolation | Deny-all default + per-component allow rules | Agents locked to Redis-only egress |

## 1. Service Catalog & Project Structure

### Shared Service Manifest (`deploy/services.yaml`)

A lightweight YAML file defines the canonical service topology — name, image, ports, health checks, env vars, dependencies, scaling tier. Used for:
- Generating dev Docker Compose
- CI drift validation against Helm values
- Documentation of the full service topology

### Service Inventory

| Service | Image | Tier | Scaling | Dependencies |
|---------|-------|------|---------|-------------|
| api | sentinel-api | critical | 2-10 replicas, HPA @ 70% CPU | postgres, redis |
| dashboard | sentinel-dashboard | critical | 2-5 replicas, HPA @ 80% CPU | api |
| assessor-worker | sentinel-api | standard | 1-5 replicas, HPA @ 75% CPU | postgres, redis |
| scheduler | sentinel-api | standard | 1 (singleton, leader election) | postgres, redis |
| report-worker | sentinel-api | standard | 1-3 replicas | postgres, redis |
| notification-worker | sentinel-api | standard | 1-3 replicas | postgres, redis |
| github-bridge | sentinel-api | standard | 1-3 replicas | postgres, redis |
| agent-security | sentinel-agent-security | critical | 1-5 replicas, dedicated HPA @ 70% | redis |
| agent-dependency | sentinel-agent-dependency | critical | 1-5 replicas, dedicated HPA @ 70% | redis |
| agent-ip-license | sentinel-agent-ip-license | batch | 1-3 replicas, shared HPA @ 80% | redis |
| agent-quality | sentinel-agent-quality | batch | 1-3 replicas | redis |
| agent-ai-detector | sentinel-agent-ai-detector | batch | 1-3 replicas | redis |
| agent-policy | sentinel-agent-policy | batch | 1-3 replicas | redis |
| saml-jackson | boxyhq/jackson:1.30.2 | standard | 1 replica | postgres |
| prometheus | prom/prometheus:v2.51.0 | infrastructure | 1 replica | - |
| grafana | grafana/grafana:10.4.0 | infrastructure | 1 replica | prometheus |
| otel-collector | otel/opentelemetry-collector-contrib:0.96.0 | infrastructure | 1 replica | - |
| postgres | postgres:16-alpine | infrastructure | 1 (or external managed) | - |
| redis | redis:7-alpine | infrastructure | 1 (or external managed) | - |

### Directory Structure

```
deploy/
  services.yaml                    # Shared service catalog
  docker-compose.yml               # Dev compose
  docker-compose.production.yml    # Production compose override
  helm/
    Chart.yaml                     # Helm chart with Bitnami subcharts
    values.yaml                    # Default values
    values-staging.yaml            # Staging overrides
    values-production.yaml         # Production overrides
    templates/
      _helpers.tpl                 # Labels, image, security context helpers
      api-deployment.yaml
      api-service.yaml
      dashboard-deployment.yaml
      dashboard-service.yaml
      worker-deployment.yaml       # Parameterized loop for all 5 workers
      agent-deployment.yaml        # Parameterized by tier (critical/batch)
      saml-jackson.yaml
      migration-job.yaml           # Pre-upgrade hook
      ingress.yaml
      hpa.yaml                     # All HPAs, conditional
      pdb.yaml                     # PodDisruptionBudgets
      networkpolicy.yaml           # Deny-all + per-component allow
      configmap.yaml
      secret.yaml                  # Native k8s secrets
      secret-external.yaml         # ExternalSecret CRD (conditional)
      servicemonitor.yaml          # Prometheus ServiceMonitor
      otel-collector.yaml          # OTel collector DaemonSet
    tests/
      test-api.yaml                # Helm test pod
      test-pipeline.yaml           # Pipeline connectivity test
  monitoring/
    prometheus.yml                 # Scrape config
    rules/
      sentinel-alerts.yml          # 12 alert rules
    alertmanager.yml               # Routing to Slack channels
    grafana/
      datasources.yaml
      dashboards/
        sentinel-overview.json
        agent-performance.json
        security-sso.json
  scripts/
    generate-compose.ts            # Generates compose from services.yaml
    validate-drift.ts              # CI drift validation
    smoke-test.sh                  # Post-deploy smoke tests
docker/
  api.Dockerfile                   # Multi-stage, non-root, read-only rootfs
  dashboard.Dockerfile             # Next.js standalone output
  agent.Dockerfile                 # Generic Python agent, ARG AGENT_NAME
  migration.Dockerfile             # Lightweight prisma-only image
  scripts/
    api-entrypoint.sh              # Conditional migration (Compose only)
    healthcheck.js                 # Node.js health check script
.github/workflows/
  docker-build.yml                 # Change detection + parallel builds + GHCR push
  helm-deploy.yml                  # Manual dispatch + diff + upgrade + verify
```

## 2. Docker Compose

### Dev Compose (`deploy/docker-compose.yml`)

- **Profiles**: Batch agents (`all-agents`), SSO (`sso`), monitoring (`monitoring`) are opt-in. Default `docker compose up` starts 13 core services.
- **YAML anchors**: `x-common-env`, `x-api-image`, `x-agent-base` eliminate duplication.
- **Health checks on everything**: Enables `depends_on: condition: service_healthy` ordering.
- **Host ports**: Only infrastructure (5432, 6379) and entry points (8080, 3000) exposed.
- **Migrations**: API entrypoint runs `prisma migrate deploy` when `RUN_MIGRATIONS=true`.

### Production Compose Override (`deploy/docker-compose.production.yml`)

Used with `docker compose -f docker-compose.yml -f docker-compose.production.yml up`.

| Concern | Dev | Production |
|---------|-----|------------|
| Ports | Exposed to host | Internal only (behind nginx) |
| TLS | None | nginx reverse proxy with certs |
| Secrets | Hardcoded | `.env` file / Docker secrets |
| Replicas | 1 each | 2 for API/dashboard/critical agents |
| Resource limits | None | CPU + memory limits on everything |
| Logging | Default | json-file with rotation (50MB x 5) |
| Restart policy | `unless-stopped` | `always` |
| Networks | Single default | Internal + external separation |

## 3. Helm Chart Architecture

### Bitnami Subcharts

PostgreSQL and Redis are Bitnami subchart dependencies, toggleable via `postgresql.enabled` and `redis.enabled`. Production deployments set these to `false` and use external managed databases (RDS, CloudSQL, etc.).

### Parameterized Templates

- **Workers**: Single `worker-deployment.yaml` iterates over `$.Values.workers` map. Each worker is independently enabled/disabled with its own command, resources, and HPA settings.
- **Agents**: Single `agent-deployment.yaml` iterates over `$.Values.agents.critical` and `$.Values.agents.batch`. Tier label (`sentinel.io/tier`) drives PriorityClass assignment.
- **HPAs**: Single `hpa.yaml` generates HPAs for API, enabled workers, and enabled agents. Scale-down stabilization at 300s prevents flapping.

### Security Hardening

- Non-root user (UID 1000)
- Read-only root filesystem (tmpfs at /tmp)
- No privilege escalation
- Seccomp RuntimeDefault profile
- Capabilities: drop ALL
- NetworkPolicy: deny-all default, per-component allow rules

### Secrets Provider

Pluggable via `secrets.provider` value:

| Provider | CRD | Backend |
|----------|-----|---------|
| `kubernetes` | Native Secret | etcd (encrypted at rest) |
| `aws` | ExternalSecret | AWS Secrets Manager |
| `gcp` | ExternalSecret | GCP Secret Manager |
| `azure` | ExternalSecret | Azure Key Vault |
| `vault` | ExternalSecret | HashiCorp Vault |

### Migration Job

- Helm hook: `pre-upgrade,pre-install` with weight `-5` (runs before everything)
- Delete policy: `before-hook-creation,hook-succeeded`
- Backoff limit: 3, deadline: 300s
- Uses lightweight `migration.Dockerfile` image

### Ingress

- Default: nginx Ingress Controller + cert-manager for automatic TLS
- Mesh toggle: `ingress.mesh.enabled` + `ingress.mesh.provider` for Istio/Linkerd
- Rate limiting via nginx annotations (100 req/min default)
- Path routing: `/api` -> API service, `/` -> Dashboard service

### Tiered Scaling

| Tier | PriorityClass | HPA | Examples |
|------|--------------|-----|---------|
| Critical (1000) | `sentinel-critical` | Dedicated per service | API, dashboard, security agent, dependency agent |
| Standard (500) | `sentinel-standard` | Per worker, optional | assessor, scheduler, report, notification, github-bridge |
| Batch (100) | `sentinel-batch` | Per agent, shared characteristics | ip-license, quality, ai-detector, policy agents |

### Pod Disruption Budgets

- API: minAvailable 1
- Dashboard: minAvailable 1
- Critical agents: minAvailable 1 each
- Workers/batch agents: no PDB (can tolerate brief downtime)

## 4. Dockerfiles

### Multi-Stage Builds

| Image | Stages | Base | Target Size |
|-------|--------|------|-------------|
| sentinel-api | deps -> builder -> runner | node:22-alpine | ~180MB |
| sentinel-dashboard | deps -> builder -> runner | node:22-alpine | ~120MB |
| sentinel-agent-* | base -> deps -> runner | python:3.12-slim | ~130-350MB |
| sentinel-migration | single stage | node:22-alpine | ~90MB |

### Security

- All images run as non-root user (UID 1001, group `sentinel`)
- HEALTHCHECK instructions on every image
- No dev dependencies in production stage
- `.dockerignore` excludes node_modules, .git, tests

### Entrypoint

API entrypoint script supports two modes:
- **Compose mode** (`RUN_MIGRATIONS=true`): runs `prisma migrate deploy` before starting
- **K8s mode** (default): skips migrations (handled by Job), starts server directly

## 5. CI/CD Pipeline

### Build Pipeline (`docker-build.yml`)

1. **Change detection** (dorny/paths-filter): Only rebuild images whose source files changed
2. **Parallel builds**: API, dashboard, agents build concurrently with BuildKit cache (GHA)
3. **Image validation**: Start containers, verify health checks, check image sizes
4. **Helm validation**: lint + kubeconform + template render with default and production values
5. **Drift check**: `validate-drift.ts` ensures Compose/Helm consistency with service catalog

### Deploy Pipeline (`helm-deploy.yml`)

1. Manual dispatch with environment (staging/production) and image tag (commit SHA)
2. `helm diff` shows what will change before applying
3. `helm upgrade --install --wait --timeout 10m`
4. Rollout status verification for API and dashboard
5. Smoke test: curl healthz on ingress URL

### Drift Validation

`deploy/scripts/validate-drift.ts` checks:
- Every service in catalog exists in Compose (or is profile-gated)
- Health check ports match between catalog and Compose
- Every enabled Helm worker/agent maps to a catalog service
- Resource limits are sane (requests <= limits)

Errors block merge. Warnings are informational.

## 6. Monitoring & Observability

### Metrics

Every service exposes `/metrics` in Prometheus exposition format.

**API metrics**: HTTP request duration/count (by route/method/status), active connections, DB query duration, Redis stream depth, certificates issued, SSO auth attempts, audit events.

**Agent metrics**: Diffs processed (by status), processing duration histogram, findings produced (by severity), stream lag, active processing gauge.

**Worker metrics**: Events processed, processing duration, consumer lag, batch size.

### Prometheus

- Scrape configs for all services (API, dashboard, 5 workers, 6 agents)
- In k8s: ServiceMonitor CRDs for Prometheus Operator
- Infrastructure exporters: postgres-exporter, redis-exporter

### Alert Rules (12 rules, 5 groups)

| Group | Alerts |
|-------|--------|
| Availability | API down (2m), Dashboard down (2m), Critical agent down (5m), Batch agent down (15m) |
| Performance | API p99 > 2s (5m), API 5xx > 5% (5m), Agent slow processing (10m) |
| Pipeline | Stream backlog > 100 (10m), Pipeline stalled 30m, Worker consumer lag > 50 |
| Resources | Pod memory > 90% limit (5m), PVC > 85% full (10m) |
| Security | SSO brute force > 10 blocks/5min (1m), SSO failure rate > 30% (10m) |

### AlertManager Routing

- Critical -> `#sentinel-critical` (Slack) + PagerDuty (optional)
- Security -> `#sentinel-security` (Slack)
- Default -> `#sentinel-alerts` (Slack)
- Inhibition: agent-down suppresses agent-slow-processing

### Grafana Dashboards

1. **Sentinel Overview**: Health status, request traffic, pipeline throughput, infrastructure
2. **Agent Performance**: Per-agent health, processing heatmap, throughput comparison, HPA scaling, resources
3. **Security & SSO**: Auth attempts by provider, failure reasons, audit trail

### OpenTelemetry Collector

Optional (`monitoring.otel.enabled`). DaemonSet that:
- Receives OTLP (gRPC :4317, HTTP :4318)
- Processes: batch (1024/5s), memory limiter (512MiB), attribute enrichment
- Exports to: local Prometheus + configured external backend (OTLP, Datadog, New Relic)

## 7. Testing Strategy

### 4-Layer Testing

| Layer | Where | What |
|-------|-------|------|
| Image build tests | CI | All images build, health checks respond, image sizes within limits |
| Helm validation | CI | lint, kubeconform, template render (default + production values), drift check |
| Integration tests | CI | Docker Compose up -> API reachable -> agents process diff -> finding -> certificate |
| Smoke tests | Post-deploy | curl healthz, verify ingress, Prometheus targets, agent registration |

### Helm Tests

In-cluster test pods (`helm test sentinel`):
- `test-api.yaml`: Verify API health + metrics, dashboard health
- `test-pipeline.yaml`: Redis connectivity, agent registration, Prometheus scrape targets

## 8. Rollout Plan

### Phase 1: Foundation (Week 1)
- Service catalog (`deploy/services.yaml`)
- Dockerfiles (harden existing + migration.Dockerfile)
- Dev Compose (rewrite from catalog)
- Entrypoint scripts, health check script
- **Gate**: `docker compose up` starts all core services, health checks green

### Phase 2: Helm Chart (Week 2)
- Shared helpers, migration Job
- Worker deployment (parameterized loop)
- Agent deployment (parameterized by tier)
- HPA, PDB, NetworkPolicy, Secrets, Ingress
- **Gate**: `helm template` renders valid manifests, kubeconform passes

### Phase 3: Production Compose (Week 2-3)
- Production override file, nginx config
- Resource limits, log rotation, `.env.example`
- **Gate**: Merged config valid with no undefined variables

### Phase 4: Monitoring (Week 3)
- Metrics endpoints (API, worker, agent)
- Prometheus config, alert rules, AlertManager
- Grafana dashboards, OTel collector, ServiceMonitors
- **Gate**: Prometheus scrapes all services, dashboards show data, test alert routes correctly

### Phase 5: CI/CD & Validation (Week 3-4)
- Docker build workflow, drift validation, Helm validation
- Integration tests, Helm deploy workflow, smoke tests
- Image size gates, Helm tests
- **Gate**: Full CI green, staging deploy succeeds, smoke tests pass

## Approach Analysis

### Why Hybrid (Approach 2 + 3) over alternatives

**vs. Compose-First (Approach 1)**: Compose-to-Helm translation is lossy. Can't express HPA, PDB, NetworkPolicy, RBAC, PriorityClass. Sentinel's 15+ services with tiered scaling exceed Compose-first capabilities.

**vs. Pure Helm-First (Approach 2)**: Accepts Compose/Helm drift. With 15+ services, env var mismatches and port conflicts are inevitable without a shared reference.

**vs. Pure Generated (Approach 3)**: Generator adds abstraction that can't express k8s-native concepts without significant complexity. Diminishing returns for <50 services. Adds friction to developer workflow.

**Hybrid**: Handcrafted Helm for full k8s power + lightweight catalog for consistency + CI drift validation for safety. Best balance of correctness, power, and velocity.
