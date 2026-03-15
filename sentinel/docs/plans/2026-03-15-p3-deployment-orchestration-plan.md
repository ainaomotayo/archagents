# P3 Deployment Orchestration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Production-grade deployment orchestration with Docker Compose (dev/production), Helm charts (k8s), monitoring/alerting, and CI/CD pipelines with drift validation.

**Architecture:** Hybrid approach — shared service catalog (`deploy/services.yaml`) as source of truth, handcrafted Helm templates for full k8s-native power, Docker Compose for dev/small production, CI drift validation for consistency.

**Tech Stack:** Docker Compose 3.9, Helm 3, Kubernetes 1.28+, Prometheus, Grafana, OpenTelemetry, cert-manager, External Secrets Operator, GitHub Actions.

**Existing code:** Docker Compose (dev + production), 3 Dockerfiles (api, dashboard, agent), basic Helm chart (api/dashboard/worker only), Prometheus scrape config (api only), scaling rules, Redis tuning, partition config. See design doc: `docs/plans/2026-03-15-p3-deployment-orchestration-design.md`.

---

## Phase 1: Foundation (Tasks 1-5)

### Task 1: Service Catalog

Create the shared service manifest that defines all services canonically.

**Files:**
- Create: `deploy/services.yaml`

**Step 1: Create the service catalog**

```yaml
# deploy/services.yaml - Single source of truth for service topology
version: "1"

services:
  # --- Core Services ---
  api:
    image: sentinel-api
    dockerfile: docker/api.Dockerfile
    ports: [8080]
    healthCheck:
      path: /health
      port: 8080
      initialDelay: 10
    env:
      - DATABASE_URL
      - REDIS_URL
      - SENTINEL_SECRET
      - GITHUB_APP_ID
      - GITHUB_PRIVATE_KEY
    dependencies: [postgres, redis]
    tier: critical
    scaling: { min: 2, max: 10, cpuTarget: 70 }

  dashboard:
    image: sentinel-dashboard
    dockerfile: docker/dashboard.Dockerfile
    ports: [3000]
    healthCheck:
      path: /api/health
      port: 3000
      initialDelay: 15
    env:
      - NEXTAUTH_URL
      - NEXTAUTH_SECRET
      - SENTINEL_API_URL
      - GITHUB_CLIENT_ID
      - GITHUB_CLIENT_SECRET
    dependencies: [api]
    tier: critical
    scaling: { min: 2, max: 5, cpuTarget: 80 }

  # --- Workers (all use sentinel-api image with different commands) ---
  assessor-worker:
    image: sentinel-api
    command: ["node", "apps/api/dist/workers/assessor.js"]
    healthCheck: { path: /health, port: 9092 }
    env: [DATABASE_URL, REDIS_URL, SENTINEL_SECRET]
    dependencies: [postgres, redis]
    tier: standard
    scaling: { min: 1, max: 5, cpuTarget: 75 }

  scheduler:
    image: sentinel-api
    command: ["node", "apps/api/dist/workers/scheduler.js"]
    healthCheck: { path: /health, port: 9091 }
    dependencies: [postgres, redis]
    tier: standard
    scaling: { replicas: 1 }

  report-worker:
    image: sentinel-api
    command: ["node", "apps/api/dist/workers/report.js"]
    healthCheck: { path: /health, port: 9094 }
    dependencies: [postgres, redis]
    tier: standard
    scaling: { min: 1, max: 3, cpuTarget: 75 }

  notification-worker:
    image: sentinel-api
    command: ["node", "apps/api/dist/workers/notification.js"]
    healthCheck: { path: /health, port: 9095 }
    dependencies: [postgres, redis]
    tier: standard
    scaling: { min: 1, max: 3, cpuTarget: 75 }

  github-bridge:
    image: sentinel-api
    command: ["node", "apps/api/dist/workers/github-bridge.js"]
    healthCheck: { path: /health, port: 9093 }
    dependencies: [postgres, redis]
    tier: standard
    scaling: { min: 1, max: 3, cpuTarget: 75 }

  # --- Critical Agents (dedicated HPA) ---
  agent-security:
    image: sentinel-agent-security
    dockerfile: docker/agent.Dockerfile
    buildArgs: { AGENT_NAME: security }
    healthCheck: { path: /health, port: 8081 }
    env: [REDIS_URL, AGENT_NAME]
    dependencies: [redis]
    tier: critical
    scaling: { min: 1, max: 5, cpuTarget: 70 }

  agent-dependency:
    image: sentinel-agent-dependency
    dockerfile: docker/agent.Dockerfile
    buildArgs: { AGENT_NAME: dependency }
    healthCheck: { path: /health, port: 8083 }
    env: [REDIS_URL, AGENT_NAME]
    dependencies: [redis]
    tier: critical
    scaling: { min: 1, max: 5, cpuTarget: 70 }

  # --- Batch Agents (shared pool) ---
  agent-ip-license:
    image: sentinel-agent-ip-license
    dockerfile: docker/agent.Dockerfile
    buildArgs: { AGENT_NAME: ip_license }
    healthCheck: { path: /health, port: 8000 }
    env: [REDIS_URL, AGENT_NAME]
    dependencies: [redis]
    tier: batch
    scaling: { min: 1, max: 3, cpuTarget: 80 }

  agent-quality:
    image: sentinel-agent-quality
    dockerfile: docker/agent.Dockerfile
    buildArgs: { AGENT_NAME: quality }
    healthCheck: { path: /health, port: 8000 }
    env: [REDIS_URL, AGENT_NAME]
    dependencies: [redis]
    tier: batch
    scaling: { min: 1, max: 3, cpuTarget: 80 }

  agent-ai-detector:
    image: sentinel-agent-ai-detector
    dockerfile: docker/agent.Dockerfile
    buildArgs: { AGENT_NAME: ai_detector }
    healthCheck: { path: /health, port: 8000 }
    env: [REDIS_URL, AGENT_NAME]
    dependencies: [redis]
    tier: batch
    scaling: { min: 1, max: 3, cpuTarget: 80 }

  agent-policy:
    image: sentinel-agent-policy
    dockerfile: docker/agent.Dockerfile
    buildArgs: { AGENT_NAME: policy }
    healthCheck: { path: /health, port: 8000 }
    env: [REDIS_URL, AGENT_NAME]
    dependencies: [redis]
    tier: batch
    scaling: { min: 1, max: 3, cpuTarget: 80 }

  # --- SSO ---
  saml-jackson:
    image: boxyhq/jackson:1.30.2
    ports: [5225]
    healthCheck: { path: /api/health, port: 5225 }
    env: [JACKSON_API_KEYS, DB_URL, DB_TYPE]
    dependencies: [postgres]
    tier: standard
    scaling: { replicas: 1 }

  # --- Observability ---
  prometheus:
    image: prom/prometheus:v2.51.0
    ports: [9090]
    tier: infrastructure
    scaling: { replicas: 1 }

  grafana:
    image: grafana/grafana:10.4.0
    ports: [3001]
    dependencies: [prometheus]
    tier: infrastructure
    scaling: { replicas: 1 }

  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.96.0
    ports: [4317, 4318, 8888]
    tier: infrastructure
    scaling: { replicas: 1 }

infrastructure:
  postgres:
    image: postgres:16-alpine
    ports: [5432]
    healthCheck: { command: "pg_isready -U sentinel" }
    volumes: [pgdata:/var/lib/postgresql/data]
    env: [POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB]

  redis:
    image: redis:7-alpine
    ports: [6379]
    healthCheck: { command: "redis-cli ping" }
    volumes: [redisdata:/data]
    command: ["redis-server", "--appendonly", "yes", "--maxmemory-policy", "noeviction"]
```

**Step 2: Verify YAML parses correctly**

Run: `cd /home/ainaomotayo/archagents/.worktrees/p15-vscode-extension/sentinel && node -e "const yaml = require('yaml'); const fs = require('fs'); const doc = yaml.parse(fs.readFileSync('deploy/services.yaml','utf8')); console.log('Services:', Object.keys(doc.services).length); console.log('Infrastructure:', Object.keys(doc.infrastructure).length);"`

Expected: `Services: 17`, `Infrastructure: 2`

**Step 3: Commit**

```bash
git add deploy/services.yaml
git commit -m "feat(deploy): add shared service catalog (services.yaml)"
```

---

### Task 2: Harden API Dockerfile

Modify the existing API Dockerfile to add non-root user, read-only rootfs support, and conditional migration entrypoint.

**Files:**
- Modify: `docker/api.Dockerfile`
- Modify: `docker/entrypoint-api.sh`
- Modify: `docker/healthcheck.js`

**Step 1: Read existing files to understand current structure**

Run: `cat docker/api.Dockerfile docker/entrypoint-api.sh docker/healthcheck.js`

**Step 2: Update api.Dockerfile with security hardening**

The existing Dockerfile already has a multi-stage build. Add:
- Non-root user (`sentinel`, UID 1001)
- `USER sentinel` before CMD
- `HEALTHCHECK` instruction
- Copy entrypoint as executable

Modify `docker/api.Dockerfile` — keep existing build stages, update runner stage:

```dockerfile
# docker/api.Dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/ packages/
RUN corepack enable pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm turbo build --filter=@sentinel/api... && \
    cd packages/db && npx prisma generate

# Stage 2: Production
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 sentinel && \
    adduser --system --uid 1001 --ingroup sentinel sentinel

COPY --from=builder --chown=sentinel:sentinel /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=sentinel:sentinel /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder --chown=sentinel:sentinel /app/node_modules ./node_modules
COPY --from=builder --chown=sentinel:sentinel /app/packages/ ./packages/
COPY --from=builder --chown=sentinel:sentinel /app/package.json ./

COPY --chown=sentinel:sentinel docker/healthcheck.js ./healthcheck.js
COPY --chown=sentinel:sentinel docker/entrypoint-api.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER sentinel

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD node healthcheck.js

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "apps/api/dist/server.js"]
```

**Step 3: Update entrypoint to support conditional migrations**

Modify `docker/entrypoint-api.sh`:

```bash
#!/bin/sh
set -e

# In Compose mode (RUN_MIGRATIONS=true), run migrations before starting
# In Kubernetes, the migration Job handles this — skip here
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Running database migrations..."
  npx prisma migrate deploy --schema=./packages/db/prisma/schema.prisma
  echo "Migrations complete."
fi

exec "$@"
```

**Step 4: Update healthcheck.js to accept PORT env var**

Modify `docker/healthcheck.js`:

```javascript
const http = require("http");
const port = process.env.HEALTH_PORT || process.env.PORT || 8080;
const path = process.env.HEALTH_PATH || "/health";

const req = http.get(`http://localhost:${port}${path}`, (res) => {
  process.exit(res.statusCode === 200 ? 0 : 1);
});
req.on("error", () => process.exit(1));
req.setTimeout(3000, () => { req.destroy(); process.exit(1); });
```

**Step 5: Commit**

```bash
git add docker/api.Dockerfile docker/entrypoint-api.sh docker/healthcheck.js
git commit -m "feat(docker): harden API Dockerfile with non-root user and conditional migrations"
```

---

### Task 3: Create Migration Dockerfile

Lightweight image for Helm pre-upgrade migration Job.

**Files:**
- Create: `docker/migration.Dockerfile`

**Step 1: Create migration Dockerfile**

```dockerfile
# docker/migration.Dockerfile
# Lightweight image for database migrations only (used by Helm pre-upgrade Job)
FROM node:22-alpine
WORKDIR /app

RUN addgroup --system --gid 1001 sentinel && \
    adduser --system --uid 1001 --ingroup sentinel sentinel

# Only copy what's needed for migrations
COPY packages/db/prisma ./packages/db/prisma
COPY packages/db/package.json ./packages/db/

RUN cd packages/db && npm install prisma @prisma/client && npx prisma generate

USER sentinel

CMD ["npx", "prisma", "migrate", "deploy", "--schema=./packages/db/prisma/schema.prisma"]
```

**Step 2: Commit**

```bash
git add docker/migration.Dockerfile
git commit -m "feat(docker): add lightweight migration Dockerfile for Helm Jobs"
```

---

### Task 4: Harden Dashboard Dockerfile

Add non-root user and HEALTHCHECK to existing dashboard Dockerfile.

**Files:**
- Modify: `docker/dashboard.Dockerfile`

**Step 1: Read existing dashboard Dockerfile**

Run: `cat docker/dashboard.Dockerfile`

**Step 2: Update with security hardening**

Modify `docker/dashboard.Dockerfile` — keep existing build stages, update runner stage to add non-root user and HEALTHCHECK:

```dockerfile
# docker/dashboard.Dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/ packages/
RUN corepack enable pnpm && pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo build --filter=@sentinel/dashboard

# Stage 2: Production
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 sentinel && \
    adduser --system --uid 1001 --ingroup sentinel sentinel

COPY --from=builder --chown=sentinel:sentinel /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=sentinel:sentinel /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder --chown=sentinel:sentinel /app/apps/dashboard/public ./apps/dashboard/public

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
EXPOSE 3000

USER sentinel

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "apps/dashboard/server.js"]
```

**Step 3: Commit**

```bash
git add docker/dashboard.Dockerfile
git commit -m "feat(docker): harden Dashboard Dockerfile with non-root user and healthcheck"
```

---

### Task 5: Harden Agent Dockerfile

Add non-root user to existing generic agent Dockerfile.

**Files:**
- Modify: `docker/agent.Dockerfile`

**Step 1: Read existing agent Dockerfile**

Run: `cat docker/agent.Dockerfile`

**Step 2: Update with non-root user and HEALTHCHECK**

Modify `docker/agent.Dockerfile` — keep existing build logic, add security:

```dockerfile
# docker/agent.Dockerfile
ARG PYTHON_VERSION=3.12
FROM python:${PYTHON_VERSION}-slim AS base

ARG AGENT_NAME
ENV AGENT_NAME=${AGENT_NAME}

RUN apt-get update && \
    apt-get install -y --no-install-recommends git curl && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd --gid 1001 sentinel && \
    useradd --uid 1001 --gid sentinel --create-home sentinel

WORKDIR /app

# Install shared agent framework
COPY agents/core/ agents/core/
RUN pip install --no-cache-dir agents/core/

# Install agent-specific package
COPY agents/${AGENT_NAME}/ agents/${AGENT_NAME}/
RUN pip install --no-cache-dir agents/${AGENT_NAME}/

# Security agent needs Semgrep
RUN if [ "${AGENT_NAME}" = "security" ]; then \
      pip install --no-cache-dir semgrep==1.154.0; \
    fi

# Copy rules if they exist
COPY agents/${AGENT_NAME}/sentinel_${AGENT_NAME}/rules/ /app/rules/ 2>/dev/null || true

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

USER sentinel

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${HEALTH_PORT:-8000}/health || exit 1

CMD ["python", "-m", "sentinel_agents.runner"]
```

**Step 3: Commit**

```bash
git add docker/agent.Dockerfile
git commit -m "feat(docker): harden Agent Dockerfile with non-root user and healthcheck"
```

---

## Phase 2: Helm Chart (Tasks 6-14)

### Task 6: Update Helm Chart.yaml with Subchart Dependencies

**Files:**
- Modify: `deploy/helm/Chart.yaml`

**Step 1: Read existing Chart.yaml**

Run: `cat deploy/helm/Chart.yaml`

**Step 2: Update with subchart dependencies**

Replace `deploy/helm/Chart.yaml`:

```yaml
apiVersion: v2
name: sentinel
description: Sentinel AI Code Governance Platform
type: application
version: 0.2.0
appVersion: "1.0.0"
keywords:
  - code-governance
  - security
  - compliance
  - ai-agents
dependencies:
  - name: postgresql
    version: "15.5.x"
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled
  - name: redis
    version: "19.x.x"
    repository: https://charts.bitnami.com/bitnami
    condition: redis.enabled
```

**Step 3: Commit**

```bash
git add deploy/helm/Chart.yaml
git commit -m "feat(helm): add PostgreSQL and Redis Bitnami subchart dependencies"
```

---

### Task 7: Rewrite Helm values.yaml

Complete rewrite to support all services, tiered agents, pluggable secrets, monitoring.

**Files:**
- Modify: `deploy/helm/values.yaml`
- Create: `deploy/helm/values-staging.yaml`
- Create: `deploy/helm/values-production.yaml`

**Step 1: Read existing values.yaml**

Run: `cat deploy/helm/values.yaml`

**Step 2: Rewrite values.yaml with full service topology**

Replace `deploy/helm/values.yaml` with the complete values from the design doc (Section 3). This file defines:
- `global` (imageRegistry, imagePullSecrets)
- `secrets` (provider: kubernetes|aws|gcp|azure|vault)
- `api` (2 replicas, resources, probes, topology spread)
- `dashboard` (2 replicas, resources, probes)
- `workers` (assessor, scheduler, report, notification, githubBridge — each with enabled, command, resources, scaling)
- `agents.critical` (security, dependency — dedicated HPA)
- `agents.batch` (ipLicense, quality, aiDetector, policy — shared pool, disabled by default)
- `agents.common` (shared env, health check config)
- `samlJackson` (enabled, image, resources)
- `migration` (image, command, backoffLimit, deadline)
- `ingress` (className, annotations, hosts, TLS, mesh toggle)
- `networkPolicy` (enabled)
- `pdb` (api, dashboard, agents.critical)
- `priorityClasses` (critical 1000, standard 500, batch 100)
- `keda` (optional Redis stream scaling)
- `monitoring` (prometheus, grafana, otel)
- `postgresql` (Bitnami subchart config)
- `redis` (Bitnami subchart config)

See design doc Section 3 for the complete YAML content.

**Step 3: Create staging values override**

Create `deploy/helm/values-staging.yaml`:

```yaml
# Staging: minimal resources, single replicas, bundled DB
api:
  replicaCount: 1
  resources:
    requests: { cpu: 100m, memory: 128Mi }
    limits: { cpu: 500m, memory: 256Mi }

dashboard:
  replicaCount: 1

workers:
  assessor: { replicaCount: 1, scaling: { enabled: false } }
  scheduler: { replicaCount: 1 }
  report: { replicaCount: 1, scaling: { enabled: false } }
  notification: { replicaCount: 1, scaling: { enabled: false } }
  githubBridge: { replicaCount: 1, scaling: { enabled: false } }

agents:
  critical:
    security: { scaling: { minReplicas: 1, maxReplicas: 2, targetCPU: 80 } }
    dependency: { scaling: { minReplicas: 1, maxReplicas: 2, targetCPU: 80 } }

pdb:
  api: null
  dashboard: null

ingress:
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-staging
  hosts:
    - host: sentinel-staging.example.com
      paths:
        - path: /v1
          pathType: Prefix
          service: api
          port: 8080
        - path: /
          pathType: Prefix
          service: dashboard
          port: 3000
  tls:
    - secretName: sentinel-staging-tls
      hosts: [sentinel-staging.example.com]

monitoring:
  grafana: { enabled: true }
  prometheus: { enabled: true }
  otel: { enabled: false }
```

**Step 4: Create production values override**

Create `deploy/helm/values-production.yaml`:

```yaml
# Production: HA, external DB, external secrets, full monitoring
api:
  replicaCount: 2
  resources:
    requests: { cpu: 500m, memory: 512Mi }
    limits: { cpu: "2", memory: 1Gi }

dashboard:
  replicaCount: 2

workers:
  assessor: { scaling: { enabled: true, minReplicas: 2, maxReplicas: 8, targetCPU: 70 } }
  report: { scaling: { enabled: true, minReplicas: 1, maxReplicas: 5, targetCPU: 70 } }
  notification: { scaling: { enabled: true, minReplicas: 1, maxReplicas: 5, targetCPU: 70 } }
  githubBridge: { scaling: { enabled: true, minReplicas: 1, maxReplicas: 5, targetCPU: 70 } }

agents:
  critical:
    security:
      scaling: { minReplicas: 2, maxReplicas: 10, targetCPU: 65 }
      resources:
        requests: { cpu: "1", memory: 1Gi }
        limits: { cpu: "4", memory: 2Gi }
    dependency:
      scaling: { minReplicas: 2, maxReplicas: 8, targetCPU: 70 }
      resources:
        requests: { cpu: 500m, memory: 512Mi }
        limits: { cpu: "2", memory: 1Gi }

secrets:
  provider: aws
  aws:
    region: us-east-1
    secretName: sentinel/production

networkPolicy:
  enabled: true

ingress:
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "200"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
  hosts:
    - host: sentinel.example.com
      paths:
        - path: /v1
          pathType: Prefix
          service: api
          port: 8080
        - path: /
          pathType: Prefix
          service: dashboard
          port: 3000
  tls:
    - secretName: sentinel-tls
      hosts: [sentinel.example.com]

postgresql:
  enabled: false

redis:
  enabled: false

monitoring:
  prometheus: { enabled: true, serviceMonitor: { interval: 15s } }
  grafana: { enabled: true }
  otel:
    enabled: true
    exporters:
      otlp:
        endpoint: ""
```

**Step 5: Commit**

```bash
git add deploy/helm/values.yaml deploy/helm/values-staging.yaml deploy/helm/values-production.yaml
git commit -m "feat(helm): rewrite values.yaml with full service topology, staging and production overrides"
```

---

### Task 8: Rewrite Helm Template Helpers

**Files:**
- Modify: `deploy/helm/templates/_helpers.tpl`

**Step 1: Read existing helpers**

Run: `cat deploy/helm/templates/_helpers.tpl`

**Step 2: Rewrite with image helper, security contexts, common env**

Replace `deploy/helm/templates/_helpers.tpl` with the complete helpers from the design doc Section 3 — includes:
- `sentinel.fullname` — release name, truncated to 63 chars
- `sentinel.labels` — standard k8s labels
- `sentinel.selectorLabels` — selector subset
- `sentinel.image` — image with global registry override
- `sentinel.commonEnv` — DATABASE_URL, REDIS_URL, SENTINEL_SECRET from secret
- `sentinel.podSecurityContext` — runAsNonRoot, UID/GID 1000, seccomp
- `sentinel.containerSecurityContext` — no privilege escalation, read-only rootfs, drop ALL caps

**Step 3: Verify template renders**

Run: `cd deploy/helm && helm template sentinel . --debug 2>&1 | head -20`

If helm is not installed, skip this step.

**Step 4: Commit**

```bash
git add deploy/helm/templates/_helpers.tpl
git commit -m "feat(helm): rewrite template helpers with image, security context, and env helpers"
```

---

### Task 9: Migration Job Template

**Files:**
- Create: `deploy/helm/templates/migration-job.yaml`

**Step 1: Create migration Job as Helm pre-upgrade hook**

Create `deploy/helm/templates/migration-job.yaml`:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "sentinel.fullname" . }}-migration
  labels:
    {{- include "sentinel.labels" . | nindent 4 }}
    app.kubernetes.io/component: migration
  annotations:
    "helm.sh/hook": pre-upgrade,pre-install
    "helm.sh/hook-weight": "-5"
    "helm.sh/hook-delete-policy": before-hook-creation,hook-succeeded
spec:
  backoffLimit: {{ .Values.migration.backoffLimit }}
  activeDeadlineSeconds: {{ .Values.migration.activeDeadlineSeconds }}
  template:
    metadata:
      labels:
        app.kubernetes.io/component: migration
    spec:
      restartPolicy: Never
      securityContext:
        {{- include "sentinel.podSecurityContext" . | nindent 8 }}
      containers:
        - name: migrate
          image: {{ include "sentinel.image" (dict "global" .Values.global "repository" .Values.migration.image.repository "tag" (.Values.migration.image.tag | default .Chart.AppVersion) "Chart" .Chart) }}
          command:
            {{- toYaml .Values.migration.command | nindent 12 }}
          env:
            {{- include "sentinel.commonEnv" . | nindent 12 }}
          resources:
            {{- toYaml .Values.migration.resources | nindent 12 }}
          securityContext:
            {{- include "sentinel.containerSecurityContext" . | nindent 12 }}
          volumeMounts:
            - name: tmp
              mountPath: /tmp
      volumes:
        - name: tmp
          emptyDir: {}
```

**Step 2: Commit**

```bash
git add deploy/helm/templates/migration-job.yaml
git commit -m "feat(helm): add database migration Job as pre-upgrade hook"
```

---

### Task 10: Parameterized Worker Deployment Template

Replace the existing single-worker template with a parameterized loop over all 5 workers.

**Files:**
- Modify: `deploy/helm/templates/worker-deployment.yaml`

**Step 1: Read existing worker deployment**

Run: `cat deploy/helm/templates/worker-deployment.yaml`

**Step 2: Rewrite as parameterized loop**

Replace `deploy/helm/templates/worker-deployment.yaml` with the parameterized template from design doc Section 3 that iterates over `$.Values.workers`, generating a Deployment per enabled worker with:
- Worker-specific command from values
- Shared API image
- Pod and container security contexts
- Resource limits from values
- tmpfs volume for read-only rootfs

**Step 3: Commit**

```bash
git add deploy/helm/templates/worker-deployment.yaml
git commit -m "feat(helm): parameterized worker deployment template for all 5 workers"
```

---

### Task 11: Agent Deployment Template

**Files:**
- Create: `deploy/helm/templates/agent-deployment.yaml`

**Step 1: Create agent deployment template**

Create `deploy/helm/templates/agent-deployment.yaml` from design doc Section 3. Iterates over both `$.Values.agents.critical` and `$.Values.agents.batch`, generating a Deployment per enabled agent with:
- Agent-specific image from values
- PriorityClassName based on tier
- Health check probes from `agents.common`
- REDIS_URL from secret, AGENT_NAME as plain env
- Pod/container security contexts

**Step 2: Commit**

```bash
git add deploy/helm/templates/agent-deployment.yaml
git commit -m "feat(helm): add parameterized agent deployment template with tier support"
```

---

### Task 12: HPA, PDB, and Priority Classes

**Files:**
- Modify: `deploy/helm/templates/hpa.yaml`
- Create: `deploy/helm/templates/pdb.yaml`
- Create: `deploy/helm/templates/priority-classes.yaml`

**Step 1: Read existing HPA**

Run: `cat deploy/helm/templates/hpa.yaml`

**Step 2: Rewrite HPA with worker and agent HPAs**

Replace `deploy/helm/templates/hpa.yaml` with the complete HPA template from design doc Section 3. Generates HPAs for:
- API (always)
- Dashboard (always)
- Workers (conditional per `worker.scaling.enabled`)
- Critical agents (conditional per `agent.enabled`)
- Batch agents (conditional per `agent.enabled`)

All HPAs include scale-down stabilization (300s) to prevent flapping.

**Step 3: Create PDB template**

Create `deploy/helm/templates/pdb.yaml` from design doc Section 3. PodDisruptionBudgets for:
- API (if `pdb.api` set)
- Dashboard (if `pdb.dashboard` set)
- Critical agents (if `pdb.agents.critical` set)

**Step 4: Create Priority Classes**

Create `deploy/helm/templates/priority-classes.yaml`:

```yaml
{{- range $name, $pc := .Values.priorityClasses }}
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: sentinel-{{ $name }}
globalDefault: false
value: {{ $pc.value }}
description: {{ $pc.description | quote }}
{{- end }}
```

**Step 5: Commit**

```bash
git add deploy/helm/templates/hpa.yaml deploy/helm/templates/pdb.yaml deploy/helm/templates/priority-classes.yaml
git commit -m "feat(helm): add comprehensive HPA, PDB, and PriorityClass templates"
```

---

### Task 13: Network Policy Template

**Files:**
- Create: `deploy/helm/templates/networkpolicy.yaml`

**Step 1: Create NetworkPolicy template**

Create `deploy/helm/templates/networkpolicy.yaml` from design doc Section 3. Policies:
- Deny-all default for all sentinel pods
- API: ingress from ingress controller + dashboard; egress to postgres + redis + DNS
- Workers: egress to postgres + redis + external HTTPS (GitHub, SMTP) + DNS
- Agents: egress to redis + DNS only (no postgres, no internet)

All conditional on `networkPolicy.enabled`.

**Step 2: Commit**

```bash
git add deploy/helm/templates/networkpolicy.yaml
git commit -m "feat(helm): add NetworkPolicy templates with deny-all default and per-component rules"
```

---

### Task 14: External Secrets and Ingress Updates

**Files:**
- Create: `deploy/helm/templates/secret-external.yaml`
- Modify: `deploy/helm/templates/secrets.yaml`
- Modify: `deploy/helm/templates/ingress.yaml`

**Step 1: Read existing secrets and ingress**

Run: `cat deploy/helm/templates/secrets.yaml deploy/helm/templates/ingress.yaml`

**Step 2: Create ExternalSecret template**

Create `deploy/helm/templates/secret-external.yaml` from design doc Section 3. Conditional on `secrets.provider != "kubernetes"`. Supports AWS, GCP, Azure, Vault backends via External Secrets Operator CRD.

**Step 3: Update existing secrets.yaml**

Modify `deploy/helm/templates/secrets.yaml` — wrap in `{{- if eq .Values.secrets.provider "kubernetes" }}` so it only renders when using native k8s secrets. Update to include DATABASE_URL, REDIS_URL, SENTINEL_SECRET keys matching what `sentinel.commonEnv` helper expects.

**Step 4: Update ingress.yaml**

Modify `deploy/helm/templates/ingress.yaml` — update to use new values structure (`.Values.ingress.hosts[].paths[]` with service/port mapping). Add mesh toggle section.

**Step 5: Commit**

```bash
git add deploy/helm/templates/secret-external.yaml deploy/helm/templates/secrets.yaml deploy/helm/templates/ingress.yaml
git commit -m "feat(helm): add pluggable secrets (ESO) and update ingress with mesh toggle"
```

---

## Phase 3: Docker Compose Updates (Tasks 15-17)

### Task 15: Rewrite Dev Docker Compose

**Files:**
- Modify: `docker-compose.yml`

**Step 1: Read existing docker-compose.yml**

Run: `cat docker-compose.yml`

**Step 2: Rewrite with YAML anchors, profiles, and health checks**

Replace `docker-compose.yml` with the dev Compose from design doc Section 2. Key changes from existing:
- Add YAML anchors (`x-common-env`, `x-api-image`, `x-agent-base`) to reduce duplication
- Add `profiles: [all-agents]` to batch agents (ip-license, quality, ai-detector, policy)
- Add `profiles: [sso]` to saml-jackson
- Add `profiles: [monitoring]` to prometheus and grafana (NEW)
- Add `RUN_MIGRATIONS=true` to API env (triggers entrypoint migration)
- Ensure ALL services have `healthcheck` and `depends_on: condition: service_healthy`
- Add grafana service (port 3001)

**Step 3: Verify compose config parses**

Run: `docker compose -f docker-compose.yml config --quiet`

Expected: exits 0 with no errors

**Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(compose): rewrite dev compose with YAML anchors, profiles, and health checks"
```

---

### Task 16: Rewrite Production Docker Compose

**Files:**
- Modify: `docker-compose.sentinel.yml` (rename concept to `docker-compose.production.yml`)

**Step 1: Read existing production compose**

Run: `cat docker-compose.sentinel.yml`

**Step 2: Create production override file**

Create `deploy/docker-compose.production.yml` (new location under deploy/) with the production overrides from design doc Section 2:
- No host port exposure (behind nginx)
- nginx reverse proxy for TLS termination
- Resource limits on all services
- `restart: always`
- Log rotation (json-file, 50MB x 5)
- Replicas: 2 for API, dashboard, critical agents
- Network isolation (internal + external)

**Step 3: Create .env.example**

Create `deploy/.env.example`:

```bash
# Sentinel Production Environment Variables
# Copy to .env and fill in values

# Database
DATABASE_URL=postgresql://sentinel:CHANGE_ME@postgres:5432/sentinel
POSTGRES_USER=sentinel
POSTGRES_PASSWORD=CHANGE_ME
POSTGRES_DB=sentinel

# Redis
REDIS_URL=redis://redis:6379

# API
SENTINEL_SECRET=CHANGE_ME_TO_RANDOM_SECRET
NODE_ENV=production

# Dashboard
NEXTAUTH_URL=https://sentinel.example.com
NEXTAUTH_SECRET=CHANGE_ME_TO_RANDOM_SECRET

# GitHub OAuth
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_APP_ID=
GITHUB_PRIVATE_KEY=

# SSO (optional)
JACKSON_API_KEYS=

# Cloud Storage (choose one)
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# AWS_S3_BUCKET=
# GCP_PROJECT_ID=
# GCP_GCS_BUCKET=
```

**Step 4: Verify compose config parses**

Run: `cd deploy && docker compose -f ../docker-compose.yml -f docker-compose.production.yml config --quiet 2>&1 || echo "Expected: may fail without .env, that's OK"`

**Step 5: Commit**

```bash
git add deploy/docker-compose.production.yml deploy/.env.example
git commit -m "feat(compose): add production compose override with nginx TLS and resource limits"
```

---

### Task 17: Update Docker Compose Validation Tests

**Files:**
- Modify: `test/docker/validate-compose.test.ts`

**Step 1: Read existing test**

Run: `cat test/docker/validate-compose.test.ts`

**Step 2: Update tests to cover new compose structure**

Update `test/docker/validate-compose.test.ts` to validate:
- All services from `services.yaml` exist in either compose file (or are profile-gated)
- Health checks on all services
- YAML anchors resolve correctly
- Profile assignments are correct (batch agents in `all-agents`, saml-jackson in `sso`)
- Production override merges correctly

**Step 3: Run tests**

Run: `cd test/docker && npx vitest run`

Expected: all tests pass

**Step 4: Commit**

```bash
git add test/docker/validate-compose.test.ts
git commit -m "test(compose): update validation tests for new compose structure"
```

---

## Phase 4: Monitoring & Observability (Tasks 18-23)

### Task 18: API Prometheus Metrics

Add `/metrics` endpoint to the Fastify API server.

**Files:**
- Create: `apps/api/src/metrics.ts`
- Modify: `apps/api/src/server.ts` (register metrics route)

**Step 1: Check if prom-client is already a dependency**

Run: `cd apps/api && cat package.json | grep prom-client || echo "NOT FOUND"`

If NOT FOUND: `pnpm add prom-client`

**Step 2: Create metrics module**

Create `apps/api/src/metrics.ts` from design doc Section 5. Registers:
- Default Node.js metrics (prefix `sentinel_api_`)
- `sentinel_api_http_request_duration_seconds` (Histogram)
- `sentinel_api_http_requests_total` (Counter)
- `sentinel_api_active_connections` (Gauge)
- `sentinel_api_db_query_duration_seconds` (Histogram)
- `sentinel_api_redis_stream_depth` (Gauge)
- `sentinel_api_certificates_issued_total` (Counter)
- `sentinel_api_sso_auth_attempts_total` (Counter)
- `sentinel_api_audit_events_total` (Counter)
- `registerMetricsRoute(app)` function

**Step 3: Wire into server.ts**

Modify `apps/api/src/server.ts` — add `import { registerMetricsRoute } from "./metrics"` and call `registerMetricsRoute(app)` after other route registrations.

**Step 4: Write test**

Create `apps/api/src/__tests__/metrics.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { registerMetricsRoute } from "../metrics";

describe("API metrics endpoint", () => {
  it("exposes Prometheus metrics at /metrics", async () => {
    const app = Fastify();
    registerMetricsRoute(app);
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).toContain("sentinel_api_http_requests_total");
  });
});
```

**Step 5: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/metrics.test.ts`

Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/src/metrics.ts apps/api/src/server.ts apps/api/src/__tests__/metrics.test.ts
git commit -m "feat(api): add Prometheus metrics endpoint with custom counters and histograms"
```

---

### Task 19: Prometheus Scrape Configuration

Expand existing prometheus.yml to scrape all services.

**Files:**
- Modify: `docker/prometheus.yml`

**Step 1: Read existing prometheus config**

Run: `cat docker/prometheus.yml`

**Step 2: Expand with all service targets**

Replace `docker/prometheus.yml` with the comprehensive scrape config from design doc Section 5. Jobs for:
- sentinel-api (port 8080)
- sentinel-workers (assessor 9092, scheduler 9091, report 9094, notification 9095, github-bridge 9093)
- sentinel-agents (security 8081, dependency 8083, + batch agents on 8000)

**Step 3: Commit**

```bash
git add docker/prometheus.yml
git commit -m "feat(monitoring): expand Prometheus scrape config to all services"
```

---

### Task 20: Alert Rules

**Files:**
- Create: `deploy/monitoring/rules/sentinel-alerts.yml`

**Step 1: Create alert rules directory and file**

Run: `mkdir -p deploy/monitoring/rules`

Create `deploy/monitoring/rules/sentinel-alerts.yml` from design doc Section 5. Contains 5 alert groups with 12 rules:
- sentinel.availability (4 rules)
- sentinel.performance (3 rules)
- sentinel.pipeline (3 rules)
- sentinel.resources (2 rules)
- sentinel.security (2 rules — SSO brute force, failure rate)

**Step 2: Commit**

```bash
git add deploy/monitoring/rules/sentinel-alerts.yml
git commit -m "feat(monitoring): add Prometheus alert rules for availability, performance, pipeline, resources, security"
```

---

### Task 21: AlertManager Configuration

**Files:**
- Create: `deploy/monitoring/alertmanager.yml`

**Step 1: Create AlertManager config**

Create `deploy/monitoring/alertmanager.yml` from design doc Section 5. Routes:
- Critical -> `#sentinel-critical`
- Security -> `#sentinel-security`
- Default -> `#sentinel-alerts`
- Inhibition: agent-down suppresses agent-slow-processing

**Step 2: Commit**

```bash
git add deploy/monitoring/alertmanager.yml
git commit -m "feat(monitoring): add AlertManager config with Slack routing and inhibition rules"
```

---

### Task 22: Grafana Provisioning

**Files:**
- Create: `deploy/monitoring/grafana/datasources.yaml`
- Create: `deploy/monitoring/grafana/dashboards/sentinel-overview.json`
- Create: `deploy/monitoring/grafana/dashboards/agent-performance.json`
- Create: `deploy/monitoring/grafana/dashboards/security-sso.json`

**Step 1: Create directory structure**

Run: `mkdir -p deploy/monitoring/grafana/dashboards`

**Step 2: Create datasource provisioning**

Create `deploy/monitoring/grafana/datasources.yaml`:

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

**Step 3: Create dashboard JSON files**

Create the 3 Grafana dashboard JSON files as described in design doc Section 5:
- `sentinel-overview.json` — health status, request traffic, pipeline throughput, infrastructure
- `agent-performance.json` — per-agent health, processing heatmap, throughput comparison, HPA
- `security-sso.json` — auth attempts, failure reasons, audit trail

Each dashboard should be valid Grafana JSON with panels referencing the Prometheus metrics defined in Task 18.

**Step 4: Commit**

```bash
git add deploy/monitoring/grafana/
git commit -m "feat(monitoring): add Grafana datasource provisioning and 3 dashboards"
```

---

### Task 23: Helm Monitoring Templates

**Files:**
- Create: `deploy/helm/templates/servicemonitor.yaml`
- Create: `deploy/helm/templates/otel-collector.yaml`

**Step 1: Create ServiceMonitor template**

Create `deploy/helm/templates/servicemonitor.yaml` from design doc Section 5. Conditional on `monitoring.prometheus.serviceMonitor.enabled`. Creates ServiceMonitor CRDs for API, workers, and agents.

**Step 2: Create OTel Collector template**

Create `deploy/helm/templates/otel-collector.yaml` from design doc Section 5. Conditional on `monitoring.otel.enabled`. Creates:
- ConfigMap with OTel collector pipeline config (receivers, processors, exporters)
- DaemonSet running the collector

**Step 3: Commit**

```bash
git add deploy/helm/templates/servicemonitor.yaml deploy/helm/templates/otel-collector.yaml
git commit -m "feat(helm): add ServiceMonitor and OpenTelemetry Collector templates"
```

---

## Phase 5: CI/CD & Validation (Tasks 24-28)

### Task 24: Drift Validation Script

**Files:**
- Create: `deploy/scripts/validate-drift.ts`

**Step 1: Create scripts directory**

Run: `mkdir -p deploy/scripts`

**Step 2: Create drift validation script**

Create `deploy/scripts/validate-drift.ts` from design doc Section 4. Validates:
1. Every service in `services.yaml` exists in Compose (or is profile-gated)
2. Health check ports match between catalog and Compose
3. Every enabled Helm worker/agent maps to a catalog service
4. Resource limits are sane (requests <= limits)

Exits 1 on errors, 0 on warnings-only or clean.

**Step 3: Test drift validation**

Run: `cd deploy && node -e "require('./scripts/validate-drift.ts')" 2>&1 || npx tsx scripts/validate-drift.ts`

Expected: validation passes (or shows only expected warnings)

**Step 4: Commit**

```bash
git add deploy/scripts/validate-drift.ts
git commit -m "feat(deploy): add drift validation script for Compose/Helm/catalog consistency"
```

---

### Task 25: Smoke Test Script

**Files:**
- Create: `deploy/scripts/smoke-test.sh`

**Step 1: Create smoke test script**

Create `deploy/scripts/smoke-test.sh` from design doc Section 6. Checks:
1. API health
2. API metrics
3. Dashboard reachable
4. SSO providers
5. Agent health (graceful WARN if starting)
6. Prometheus targets

```bash
chmod +x deploy/scripts/smoke-test.sh
```

**Step 2: Commit**

```bash
git add deploy/scripts/smoke-test.sh
git commit -m "feat(deploy): add post-deploy smoke test script"
```

---

### Task 26: Helm Test Pods

**Files:**
- Create: `deploy/helm/tests/test-api.yaml`
- Create: `deploy/helm/tests/test-pipeline.yaml`

**Step 1: Create tests directory**

Run: `mkdir -p deploy/helm/tests`

**Step 2: Create Helm test pods**

Create `deploy/helm/tests/test-api.yaml` and `deploy/helm/tests/test-pipeline.yaml` from design doc Section 6. These are in-cluster test pods that run via `helm test sentinel`.

**Step 3: Commit**

```bash
git add deploy/helm/tests/
git commit -m "feat(helm): add in-cluster test pods for helm test"
```

---

### Task 27: Docker Build CI Workflow

**Files:**
- Create: `.github/workflows/docker-build.yml`

**Step 1: Create Docker build workflow**

Create `.github/workflows/docker-build.yml` from design doc Section 4. Jobs:
1. `changes` — dorny/paths-filter for selective builds
2. `build-api` — build + push API image to GHCR
3. `build-dashboard` — build + push Dashboard image
4. `build-agents` — matrix build for security + dependency agents
5. `helm-validate` — lint, kubeconform, template render
6. `drift-check` — run validate-drift.ts

Triggers: push to main, PRs to main (paths: apps/, packages/, agents/, docker/, deploy/).

**Step 2: Commit**

```bash
git add .github/workflows/docker-build.yml
git commit -m "feat(ci): add Docker build workflow with change detection and Helm validation"
```

---

### Task 28: Helm Deploy CI Workflow

**Files:**
- Create: `.github/workflows/helm-deploy.yml`

**Step 1: Create Helm deploy workflow**

Create `.github/workflows/helm-deploy.yml` from design doc Section 4. Manual dispatch with:
- Environment selection (staging/production)
- Image tag input (commit SHA)
- Steps: configure k8s, helm diff, helm upgrade --install --wait, rollout status, smoke test

**Step 2: Commit**

```bash
git add .github/workflows/helm-deploy.yml
git commit -m "feat(ci): add Helm deploy workflow with diff, upgrade, and smoke test"
```

---

## Final: Integration Test (Task 29)

### Task 29: Integration Test Suite

**Files:**
- Create: `deploy/tests/integration.test.ts`

**Step 1: Create integration test**

Create `deploy/tests/integration.test.ts` from design doc Section 6. Tests:
- API responds to health check
- API exposes Prometheus metrics
- Database migrations ran successfully
- Redis streams are accessible
- Security agent registers and becomes healthy
- Dependency agent registers and becomes healthy
- End-to-end: diff -> finding -> certificate (graceful if auth blocks)

Uses Docker Compose to start services, waits for health, runs assertions.

**Step 2: Commit**

```bash
git add deploy/tests/integration.test.ts
git commit -m "feat(deploy): add Docker Compose integration test suite"
```

---

## Task Summary

| Task | Phase | Description | Key Files |
|------|-------|-------------|-----------|
| 1 | Foundation | Service catalog | `deploy/services.yaml` |
| 2 | Foundation | Harden API Dockerfile | `docker/api.Dockerfile`, `entrypoint-api.sh`, `healthcheck.js` |
| 3 | Foundation | Migration Dockerfile | `docker/migration.Dockerfile` |
| 4 | Foundation | Harden Dashboard Dockerfile | `docker/dashboard.Dockerfile` |
| 5 | Foundation | Harden Agent Dockerfile | `docker/agent.Dockerfile` |
| 6 | Helm | Chart.yaml subcharts | `deploy/helm/Chart.yaml` |
| 7 | Helm | values.yaml + staging/prod | `deploy/helm/values*.yaml` |
| 8 | Helm | Template helpers | `deploy/helm/templates/_helpers.tpl` |
| 9 | Helm | Migration Job | `deploy/helm/templates/migration-job.yaml` |
| 10 | Helm | Worker deployments | `deploy/helm/templates/worker-deployment.yaml` |
| 11 | Helm | Agent deployments | `deploy/helm/templates/agent-deployment.yaml` |
| 12 | Helm | HPA + PDB + PriorityClass | `deploy/helm/templates/hpa.yaml`, `pdb.yaml`, `priority-classes.yaml` |
| 13 | Helm | Network policies | `deploy/helm/templates/networkpolicy.yaml` |
| 14 | Helm | External secrets + ingress | `deploy/helm/templates/secret-external.yaml`, `secrets.yaml`, `ingress.yaml` |
| 15 | Compose | Rewrite dev compose | `docker-compose.yml` |
| 16 | Compose | Production compose + env | `deploy/docker-compose.production.yml`, `.env.example` |
| 17 | Compose | Update compose tests | `test/docker/validate-compose.test.ts` |
| 18 | Monitoring | API Prometheus metrics | `apps/api/src/metrics.ts` |
| 19 | Monitoring | Prometheus scrape config | `docker/prometheus.yml` |
| 20 | Monitoring | Alert rules | `deploy/monitoring/rules/sentinel-alerts.yml` |
| 21 | Monitoring | AlertManager config | `deploy/monitoring/alertmanager.yml` |
| 22 | Monitoring | Grafana dashboards | `deploy/monitoring/grafana/` |
| 23 | Monitoring | Helm ServiceMonitor + OTel | `deploy/helm/templates/servicemonitor.yaml`, `otel-collector.yaml` |
| 24 | CI/CD | Drift validation | `deploy/scripts/validate-drift.ts` |
| 25 | CI/CD | Smoke test | `deploy/scripts/smoke-test.sh` |
| 26 | CI/CD | Helm test pods | `deploy/helm/tests/` |
| 27 | CI/CD | Docker build workflow | `.github/workflows/docker-build.yml` |
| 28 | CI/CD | Helm deploy workflow | `.github/workflows/helm-deploy.yml` |
| 29 | Final | Integration tests | `deploy/tests/integration.test.ts` |
