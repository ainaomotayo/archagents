# SENTINEL

**AI-Generated Code Governance & Compliance Platform**

SENTINEL is an enterprise-grade, event-driven platform that scans AI-generated code for security vulnerabilities, license violations, quality issues, dependency risks, and policy compliance. Every scan produces a cryptographically signed compliance certificate suitable for regulated industries (EU AI Act, SOC 2, ISO 27001).

---

## Table of Contents

- [What SENTINEL Does](#what-sentinel-does)
- [Architecture](#architecture)
- [System Requirements](#system-requirements)
- [Quick Start (Local Development)](#quick-start-local-development)
- [On-Premises Deployment (Docker Compose)](#on-premises-deployment-docker-compose)
- [Kubernetes Deployment](#kubernetes-deployment)
  - [AWS (EKS)](#aws-eks)
  - [Google Cloud (GKE)](#google-cloud-gke)
  - [Azure (AKS)](#azure-aks)
  - [Helm Reference](#helm-reference)
- [Cloud Storage & KMS Setup](#cloud-storage--kms-setup)
  - [AWS S3 + KMS](#aws-s3--kms)
  - [Google Cloud Storage + KMS](#google-cloud-storage--kms)
  - [Azure Blob Storage + Key Vault](#azure-blob-storage--key-vault)
- [Enterprise SSO Setup](#enterprise-sso-setup)
  - [GitHub OAuth](#github-oauth)
  - [GitLab OAuth](#gitlab-oauth)
  - [Generic OIDC (Okta, Auth0, Azure AD, Keycloak)](#generic-oidc-okta-auth0-azure-ad-keycloak)
  - [SAML 2.0](#saml-20)
- [Data Retention Configuration](#data-retention-configuration)
- [CI/CD Integration](#cicd-integration)
  - [GitHub Actions](#github-actions)
  - [GitLab CI](#gitlab-ci)
  - [Azure Pipelines](#azure-pipelines)
  - [Jenkins](#jenkins)
  - [Bitbucket Pipelines](#bitbucket-pipelines)
- [GitHub App Integration](#github-app-integration)
- [Notification Integrations](#notification-integrations)
  - [Slack](#slack)
  - [Microsoft Teams](#microsoft-teams)
  - [PagerDuty](#pagerduty)
  - [Email (SMTP)](#email-smtp)
- [Scan Policies](#scan-policies)
- [API Reference](#api-reference)
- [CLI Reference](#cli-reference)
- [Dashboard](#dashboard)
- [Project Structure](#project-structure)
- [Configuration Reference](#configuration-reference)
- [Security](#security)
- [Compliance](#compliance)
- [Monitoring & Observability](#monitoring--observability)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## What SENTINEL Does

SENTINEL sits between your code repository and production, checking every code change (especially AI-generated code) against seven specialized analysis engines:

| Agent | What It Checks | Risk Weight |
|-------|---------------|-------------|
| **Security** | SQL injection, XSS, eval(), hardcoded secrets, OWASP Top 10 | 30% |
| **IP / License** | Copyleft licenses, code fingerprinting, attribution requirements | 20% |
| **Quality** | Cyclomatic complexity, duplication, naming conventions, test coverage | 15% |
| **Policy** | Custom org/repo YAML rules (deny-pattern, require-pattern, deny-import) | 15% |
| **Dependency** | CVEs, typosquatting, unmaintained packages, manifest drift | 15% |
| **AI Detection** | AI generation probability, tool attribution, timing entropy analysis | 5% |
| **LLM Review** | Contextual code review via Claude (optional, requires Anthropic API key) | — |

Every scan produces:

- **Risk Score** (0–100) from a weighted aggregation of all agents
- **Compliance Certificate** — HMAC-SHA256 signed, verifiable offline
- **SARIF report** — uploadable to GitHub Code Scanning, GitLab SAST, Azure DevOps
- **Audit trail** — hash-chained, tamper-evident log of every event

### Certificate Status Levels

| Status | Risk Score | CLI Exit Code | Meaning |
|--------|-----------|---------------|---------|
| `full_pass` | 0–20 | 0 | All checks clear |
| `provisional_pass` | 21–50 | 3 | Minor issues, review recommended |
| `fail` | 51+ or any critical finding | 1 | Blocking issues found |
| `partial` | Agent timeout | 3 | Incomplete scan, re-run advised |

---

## Architecture

```
Developer Workstation / CI Pipeline / GitHub App
              |
              v
        ┌─────────────┐      HMAC-SHA256 auth
        │  API Server  │ ─────────────────────────> Audit Log (hash-chained)
        │  (Fastify 5) │
        └──────┬───────┘
               │  publishes to
               v
       Redis Streams (sentinel.diffs)
               │
    ┌──────────┴──────────────────────────────────┐
    v          v          v          v             v
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Security│ │License │ │Quality │ │ Policy │ │  Dep.  │ ... 7 agents
│ Agent  │ │ Agent  │ │ Agent  │ │ Agent  │ │ Agent  │
└───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘
    └──────────┴──────────┴──────────┴──────────┘
                           │  publishes to
               Redis Streams (sentinel.findings)
                           │
                           v
                  ┌─────────────────┐
                  │   Compliance    │
                  │    Assessor     │
                  └────────┬────────┘
                           │
              ┌────────────┴────────────┐
              v                         v
     Risk Score (0–100)      HMAC Certificate
              │                         │
              v                         v
     Dashboard / CLI /        S3 / GCS / Azure Blob
     GitHub Check Run         (immutable archive)
```

**Key design principles:**

- **Stateless API** — horizontally scalable, no shared mutable state
- **Event-driven agents** — each agent is independent; failures don't block others
- **Multi-tenant isolation** — PostgreSQL row-level security + session variables
- **Immutable audit log** — SHA-256 hash chaining, append-only
- **Crypto-shredding** — GDPR purge via KMS key destruction (not data deletion)

---

## System Requirements

### Minimum (Development / Small Team)

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 4 cores | 8 cores |
| RAM | 8 GB | 16 GB |
| Disk | 20 GB SSD | 50 GB SSD |
| OS | Linux / macOS / WSL2 | Ubuntu 22.04 LTS |

### Production (Enterprise)

| Component | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-----------|-------------|-----------|----------------|--------------|
| API Server (×2) | 250m | 1 core | 256 MB | 512 MB |
| Dashboard (×2) | 100m | 500m | 128 MB | 256 MB |
| Security Agent (×1–10) | 500m | 2 cores | 512 MB | 1 GB |
| Dependency Agent (×1–5) | 250m | 1 core | 256 MB | 512 MB |
| Other Agents (×1–3 each) | 200m | 1 core | 256 MB | 512 MB |
| Assessor Worker (×1–5) | 250m | 1 core | 256 MB | 512 MB |
| PostgreSQL | 500m | 2 cores | 1 GB | 2 GB |
| Redis | 250m | 1 core | 512 MB | 1 GB |

**Typical production cluster (50 developers, ~200 scans/day):**
- 3 nodes × 8 vCPU / 32 GB RAM (EKS/GKE/AKS)
- 50 GB PostgreSQL storage (gp3 SSD)
- 10 GB Redis storage

### Software Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 22+ | TypeScript packages (API, CLI, dashboard) |
| **pnpm** | 10+ | Monorepo package management |
| **Python** | 3.11+ | Analysis agents |
| **Docker** | 24+ | Containerized deployment |
| **Docker Compose** | v2+ | Multi-service orchestration |
| **Redis** | 7+ | Event bus |
| **PostgreSQL** | 16+ | Data store |
| **kubectl** | 1.28+ | Kubernetes deployment (optional) |
| **Helm** | 3.12+ | Kubernetes chart deployment (optional) |

---

## Quick Start (Local Development)

### Step 1: Clone and Install

```bash
git clone https://github.com/your-org/sentinel.git
cd sentinel

# Enable pnpm via corepack (bundled with Node.js 22)
corepack enable

# Install all TypeScript dependencies and build packages
pnpm install && pnpm build
```

### Step 2: Configure Environment

```bash
cp .env.example .env
```

Open `.env` and update these required values:

```env
POSTGRES_PASSWORD=your-secure-password
SENTINEL_SECRET=<output of: openssl rand -hex 32>
DATABASE_URL=postgresql://sentinel:your-secure-password@postgres:5432/sentinel
NEXTAUTH_SECRET=<output of: openssl rand -hex 32>
NEXTAUTH_URL=http://localhost:3000
```

Generate secure secrets:

```bash
openssl rand -hex 32   # for SENTINEL_SECRET
openssl rand -hex 32   # for NEXTAUTH_SECRET
```

### Step 3: Start Infrastructure

```bash
# Start PostgreSQL + Redis
docker compose up -d

# Apply database migrations
cd packages/db && npx prisma migrate deploy
```

### Step 4: Start Services

Open four terminal windows:

```bash
# Terminal 1 — API server (http://localhost:8080)
cd apps/api && pnpm dev

# Terminal 2 — Dashboard (http://localhost:3000)
cd apps/dashboard && pnpm dev

# Terminal 3 — Security agent
cd agents/security
python -m venv .venv && source .venv/bin/activate
pip install -e ../framework -e ".[dev]"
python -m sentinel_security

# Terminal 4 — Dependency agent (optional for local dev)
cd agents/dependency
python -m venv .venv && source .venv/bin/activate
pip install -e ../framework -e ".[dev]"
python -m sentinel_dependency
```

### Step 5: Run Your First Scan

```bash
# Install the CLI
npm install -g @sentinel/cli

# Scan the last commit's changes
cd /your/project
git diff HEAD~1 | sentinel ci \
  --api-url http://localhost:8080 \
  --api-key YOUR_API_KEY \
  --secret YOUR_SENTINEL_SECRET
```

The CLI will print a result like:

```
SENTINEL Scan Complete
Status: full_pass
Risk Score: 8/100
Findings: 0 critical, 0 high, 1 medium, 2 low
Certificate: cert-abc123 (valid until 2027-03-18)
```

---

## On-Premises Deployment (Docker Compose)

Deploy the complete SENTINEL stack on any Linux server with Docker installed.

### Requirements

- Linux server with Docker Engine 24+ and Docker Compose v2
- Minimum 8 cores / 16 GB RAM / 50 GB SSD for production
- Outbound internet access (for OSV.dev CVE API, optional LLM)
- Port 80/443 open for TLS (or port 3000/8080 for plain HTTP)

### Step 1: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with production values:

```env
# Required — change all of these
POSTGRES_PASSWORD=<strong-password>
SENTINEL_SECRET=<openssl rand -hex 32>
DATABASE_URL=postgresql://sentinel:<password>@postgres:5432/sentinel
NEXTAUTH_SECRET=<openssl rand -hex 32>
NEXTAUTH_URL=https://sentinel.your-domain.com

# Authentication — configure at least one provider
GITHUB_CLIENT_ID=<your-github-oauth-app-id>
GITHUB_CLIENT_SECRET=<your-github-oauth-app-secret>
```

### Step 2: Deploy All Services

```bash
# Deploy all services (API, dashboard, 6 agents, workers, PostgreSQL, Redis)
docker compose -f docker-compose.sentinel.yml --env-file .env up -d --build

# To include the optional LLM review agent (requires Anthropic API key)
ANTHROPIC_API_KEY=sk-ant-... \
docker compose -f docker-compose.sentinel.yml --profile llm --env-file .env up -d --build
```

### Step 3: Apply Database Migrations

```bash
docker compose -f docker-compose.sentinel.yml exec api \
  npx prisma migrate deploy --schema=./packages/db/prisma/schema.prisma
```

### Step 4: Verify Deployment

```bash
# Check all services are healthy
docker compose -f docker-compose.sentinel.yml ps

# API health
curl http://localhost:8080/health

# Dashboard should be accessible at http://localhost:3000
```

### Services Started

| Service | Port | Description |
|---------|------|-------------|
| `postgres` | 5432 (internal) | PostgreSQL 16 database |
| `redis` | 6379 (internal) | Redis 7 event bus |
| `api` | 8080 | Fastify REST API |
| `dashboard` | 3000 | Next.js compliance dashboard |
| `assessor-worker` | 9092 (internal) | Compliance assessment worker |
| `scheduler` | 9091 (internal) | Cron job scheduler (retention, self-scan) |
| `report-worker` | 9094 (internal) | Report generation worker |
| `approval-worker` | 9095 (internal) | Dual-admin approval workflow |
| `github-bridge` | 9093 (internal) | GitHub App webhook bridge |
| `saml-jackson` | 5225 (internal) | SAML SSO service (BoxyHQ) |
| `security-agent` | — | Security vulnerability scanner |
| `license-agent` | — | IP / License compliance checker |
| `dependency-agent` | — | Dependency risk analyzer |
| `ai-detector-agent` | — | AI-generated code detector |
| `quality-agent` | — | Code quality analyzer |
| `policy-agent` | — | Policy rule engine |
| `llm-review-agent` | — | LLM-based review (optional, `--profile llm`) |

### Nginx Reverse Proxy (recommended)

Place Nginx in front with TLS termination:

```nginx
# /etc/nginx/sites-available/sentinel
server {
    listen 443 ssl http2;
    server_name sentinel.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/sentinel.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sentinel.your-domain.com/privkey.pem;

    # Dashboard
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # API
    location /v1 {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /webhooks {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
    }

    location /health {
        proxy_pass http://localhost:8080;
    }
}

server {
    listen 80;
    server_name sentinel.your-domain.com;
    return 301 https://$host$request_uri;
}
```

```bash
# Get a free TLS certificate
certbot --nginx -d sentinel.your-domain.com
```

---

## Kubernetes Deployment

SENTINEL ships with Helm charts and raw Kubernetes manifests for production cluster deployments.

### AWS (EKS)

**Prerequisites:**
- AWS CLI configured with appropriate IAM permissions
- `eksctl` installed
- Helm 3.12+

#### Step 1: Create EKS Cluster

```bash
eksctl create cluster \
  --name sentinel-prod \
  --region us-east-1 \
  --nodegroup-name standard-workers \
  --node-type m5.2xlarge \
  --nodes 3 \
  --nodes-min 2 \
  --nodes-max 10 \
  --managed
```

#### Step 2: Set Up AWS Dependencies

```bash
# Create RDS PostgreSQL (recommended over in-cluster Postgres for production)
aws rds create-db-instance \
  --db-instance-identifier sentinel-db \
  --db-instance-class db.r6g.large \
  --engine postgres \
  --engine-version 16 \
  --master-username sentinel \
  --master-user-password <strong-password> \
  --allocated-storage 100 \
  --storage-type gp3 \
  --backup-retention-period 7 \
  --multi-az \
  --no-publicly-accessible

# Create ElastiCache Redis cluster
aws elasticache create-replication-group \
  --replication-group-id sentinel-redis \
  --replication-group-description "SENTINEL event bus" \
  --node-group-configuration '[{"ReplicaCount":1,"Slots":"0-16383"}]' \
  --cache-node-type cache.r6g.large \
  --engine redis \
  --engine-version 7.0 \
  --at-rest-encryption-enabled \
  --transit-encryption-enabled

# Create S3 bucket for archive storage
aws s3api create-bucket \
  --bucket sentinel-archive-prod \
  --region us-east-1

# Enable object lock (immutable certificate archive)
aws s3api put-object-lock-configuration \
  --bucket sentinel-archive-prod \
  --object-lock-configuration '{"ObjectLockEnabled":"Enabled"}'

# Create KMS key for envelope encryption
aws kms create-key \
  --description "SENTINEL master encryption key" \
  --key-usage ENCRYPT_DECRYPT \
  --query 'KeyMetadata.KeyId' --output text
  # Save the key ID as KMS_MASTER_KEY_ID
```

#### Step 3: Create Kubernetes Secrets

```bash
kubectl create namespace sentinel

kubectl create secret generic sentinel-secrets \
  --namespace sentinel \
  --from-literal=DATABASE_URL="postgresql://sentinel:<password>@<rds-endpoint>:5432/sentinel" \
  --from-literal=REDIS_URL="rediss://<elasticache-endpoint>:6379" \
  --from-literal=SENTINEL_SECRET="$(openssl rand -hex 32)" \
  --from-literal=NEXTAUTH_SECRET="$(openssl rand -hex 32)" \
  --from-literal=NEXTAUTH_URL="https://sentinel.your-domain.com" \
  --from-literal=GITHUB_CLIENT_ID="<your-github-oauth-id>" \
  --from-literal=GITHUB_CLIENT_SECRET="<your-github-oauth-secret>" \
  --from-literal=AWS_REGION="us-east-1" \
  --from-literal=S3_ARCHIVE_BUCKET="sentinel-archive-prod" \
  --from-literal=KMS_MASTER_KEY_ID="<your-kms-key-id>"
```

#### Step 4: Deploy with Helm

```bash
# Add SENTINEL Helm repository (or use local charts)
helm install sentinel ./deploy/helm \
  --namespace sentinel \
  --values deploy/helm/values-production.yaml \
  --set global.imageRegistry=<your-ecr-registry>.dkr.ecr.us-east-1.amazonaws.com \
  --set secrets.provider=aws \
  --set secrets.aws.secretName=sentinel/production \
  --set postgresql.enabled=false \
  --set redis.enabled=false \
  --set ingress.hosts[0].host=sentinel.your-domain.com
```

#### Step 5: Configure IAM for Service Accounts (IRSA)

```bash
# Attach policies to allow the API pod to access S3, KMS, and Secrets Manager
eksctl create iamserviceaccount \
  --name sentinel-api \
  --namespace sentinel \
  --cluster sentinel-prod \
  --attach-policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess \
  --attach-policy-arn arn:aws:iam::aws:policy/AWSKeyManagementServicePowerUser \
  --approve
```

---

### Google Cloud (GKE)

**Prerequisites:**
- `gcloud` CLI configured
- `kubectl` connected to your GKE cluster

#### Step 1: Create GKE Cluster

```bash
gcloud container clusters create sentinel-prod \
  --region us-central1 \
  --num-nodes 3 \
  --machine-type n2-standard-4 \
  --enable-autoscaling \
  --min-nodes 2 \
  --max-nodes 10 \
  --enable-network-policy \
  --workload-pool=$(gcloud config get-value project).svc.id.goog
```

#### Step 2: Set Up GCP Dependencies

```bash
PROJECT_ID=$(gcloud config get-value project)

# Create Cloud SQL PostgreSQL instance
gcloud sql instances create sentinel-db \
  --database-version=POSTGRES_16 \
  --tier=db-custom-4-16384 \
  --region=us-central1 \
  --backup-start-time=02:00 \
  --retained-backups-count=7

gcloud sql databases create sentinel --instance=sentinel-db
gcloud sql users create sentinel --instance=sentinel-db --password=<strong-password>

# Create Memorystore Redis instance
gcloud redis instances create sentinel-redis \
  --size=5 \
  --region=us-central1 \
  --redis-version=redis_7_0 \
  --transit-encryption-mode=SERVER_AUTHENTICATION

# Create GCS bucket for archive storage
gsutil mb -l us-central1 gs://sentinel-archive-${PROJECT_ID}
gsutil retention set 2555d gs://sentinel-archive-${PROJECT_ID}

# Create Cloud KMS key ring and key
gcloud kms keyrings create sentinel --location=global
gcloud kms keys create sentinel-master \
  --location=global \
  --keyring=sentinel \
  --purpose=encryption
```

#### Step 3: Configure Workload Identity

```bash
# Create Google service account
gcloud iam service-accounts create sentinel-sa \
  --display-name="SENTINEL Service Account"

# Grant permissions
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:sentinel-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:sentinel-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/cloudkms.cryptoKeyEncrypterDecrypter"

# Bind Kubernetes service account
gcloud iam service-accounts add-iam-policy-binding \
  sentinel-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="serviceAccount:${PROJECT_ID}.svc.id.goog[sentinel/sentinel-api]"
```

#### Step 4: Deploy

```bash
kubectl create namespace sentinel

kubectl create secret generic sentinel-secrets \
  --namespace sentinel \
  --from-literal=DATABASE_URL="postgresql://sentinel:<password>@/sentinel?host=/cloudsql/${PROJECT_ID}:us-central1:sentinel-db" \
  --from-literal=REDIS_URL="redis://<memorystore-ip>:6379" \
  --from-literal=SENTINEL_SECRET="$(openssl rand -hex 32)" \
  --from-literal=NEXTAUTH_SECRET="$(openssl rand -hex 32)" \
  --from-literal=NEXTAUTH_URL="https://sentinel.your-domain.com" \
  --from-literal=CLOUD_PROVIDER="gcp" \
  --from-literal=GCP_PROJECT_ID="${PROJECT_ID}" \
  --from-literal=GCS_ARCHIVE_BUCKET="sentinel-archive-${PROJECT_ID}" \
  --from-literal=GCP_KMS_LOCATION="global" \
  --from-literal=GCP_KMS_KEY_RING="sentinel" \
  --from-literal=GCP_KMS_KEY_ID="sentinel-master"

helm install sentinel ./deploy/helm \
  --namespace sentinel \
  --values deploy/helm/values-production.yaml \
  --set secrets.provider=gcp \
  --set secrets.gcp.project="${PROJECT_ID}" \
  --set postgresql.enabled=false \
  --set redis.enabled=false
```

---

### Azure (AKS)

**Prerequisites:**
- Azure CLI (`az`) configured
- `kubectl` and `helm` installed

#### Step 1: Create AKS Cluster

```bash
RESOURCE_GROUP=sentinel-prod
CLUSTER_NAME=sentinel-aks
LOCATION=eastus

az group create --name $RESOURCE_GROUP --location $LOCATION

az aks create \
  --resource-group $RESOURCE_GROUP \
  --name $CLUSTER_NAME \
  --node-count 3 \
  --node-vm-size Standard_D4s_v3 \
  --enable-cluster-autoscaler \
  --min-count 2 \
  --max-count 10 \
  --network-plugin azure \
  --enable-managed-identity

az aks get-credentials --resource-group $RESOURCE_GROUP --name $CLUSTER_NAME
```

#### Step 2: Set Up Azure Dependencies

```bash
# Azure Database for PostgreSQL Flexible Server
az postgres flexible-server create \
  --resource-group $RESOURCE_GROUP \
  --name sentinel-db \
  --location $LOCATION \
  --sku-name Standard_D4s_v3 \
  --tier GeneralPurpose \
  --storage-size 128 \
  --version 16 \
  --admin-user sentinel \
  --admin-password <strong-password>

# Azure Cache for Redis
az redis create \
  --resource-group $RESOURCE_GROUP \
  --name sentinel-redis \
  --location $LOCATION \
  --sku Premium \
  --vm-size P1

# Azure Blob Storage for archive
az storage account create \
  --resource-group $RESOURCE_GROUP \
  --name sentinelarchiveprod \
  --location $LOCATION \
  --sku Standard_GRS \
  --kind StorageV2 \
  --allow-blob-public-access false

az storage container create \
  --account-name sentinelarchiveprod \
  --name sentinel-archive

# Azure Key Vault for KMS
az keyvault create \
  --resource-group $RESOURCE_GROUP \
  --name sentinel-kv \
  --location $LOCATION \
  --enable-soft-delete true \
  --retention-days 90

az keyvault key create \
  --vault-name sentinel-kv \
  --name sentinel-master \
  --kty RSA \
  --size 2048
```

#### Step 3: Deploy

```bash
kubectl create namespace sentinel

# Get Azure Blob connection string
STORAGE_CONN_STR=$(az storage account show-connection-string \
  --name sentinelarchiveprod --query connectionString -o tsv)

kubectl create secret generic sentinel-secrets \
  --namespace sentinel \
  --from-literal=DATABASE_URL="postgresql://sentinel:<password>@sentinel-db.postgres.database.azure.com:5432/sentinel?sslmode=require" \
  --from-literal=REDIS_URL="rediss://:$(az redis list-keys --name sentinel-redis --resource-group $RESOURCE_GROUP --query primaryKey -o tsv)@sentinel-redis.redis.cache.windows.net:6380" \
  --from-literal=SENTINEL_SECRET="$(openssl rand -hex 32)" \
  --from-literal=NEXTAUTH_SECRET="$(openssl rand -hex 32)" \
  --from-literal=NEXTAUTH_URL="https://sentinel.your-domain.com" \
  --from-literal=CLOUD_PROVIDER="azure" \
  --from-literal=AZURE_STORAGE_ACCOUNT_URL="https://sentinelarchiveprod.blob.core.windows.net" \
  --from-literal=AZURE_ARCHIVE_CONTAINER="sentinel-archive" \
  --from-literal=AZURE_KEY_VAULT_URL="https://sentinel-kv.vault.azure.net/" \
  --from-literal=AZURE_KEY_NAME="sentinel-master"

helm install sentinel ./deploy/helm \
  --namespace sentinel \
  --values deploy/helm/values-production.yaml \
  --set secrets.provider=azure \
  --set postgresql.enabled=false \
  --set redis.enabled=false
```

---

### Helm Reference

All Helm configuration options are in `deploy/helm/values.yaml`. Key sections:

```yaml
# Scaling
api:
  replicaCount: 2                    # Increase for high traffic

agents:
  critical:
    security:
      scaling: { minReplicas: 1, maxReplicas: 10, targetCPU: 70 }
    dependency:
      scaling: { minReplicas: 1, maxReplicas: 5, targetCPU: 70 }

# Secrets provider
secrets:
  provider: kubernetes               # kubernetes | aws | gcp | azure | vault

# Monitoring
monitoring:
  prometheus:
    enabled: true
  grafana:
    enabled: true

# KEDA event-driven autoscaling (scales agents based on Redis queue depth)
keda:
  enabled: true
  redis:
    pendingThreshold: "50"           # Scale up when >50 items in queue
```

---

## Cloud Storage & KMS Setup

SENTINEL uses cloud storage for compliance certificate archiving and KMS for envelope encryption of credentials at rest.

### AWS S3 + KMS

Set these environment variables on the API server:

```env
CLOUD_PROVIDER=aws
AWS_REGION=us-east-1
S3_ARCHIVE_BUCKET=sentinel-archive-prod
KMS_MASTER_KEY_ID=arn:aws:kms:us-east-1:123456789012:key/mrk-xxxx
ARCHIVE_PREFIX=sentinel
ARCHIVE_RETENTION_DAYS=2555          # 7 years for compliance
```

The API server needs an IAM role (or IAM user) with:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::sentinel-archive-prod/*"]
    },
    {
      "Effect": "Allow",
      "Action": ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"],
      "Resource": ["arn:aws:kms:us-east-1:123456789012:key/mrk-xxxx"]
    }
  ]
}
```

### Google Cloud Storage + KMS

```env
CLOUD_PROVIDER=gcp
GCP_PROJECT_ID=your-project-id
GCS_ARCHIVE_BUCKET=sentinel-archive-your-project
GCP_KMS_LOCATION=global
GCP_KMS_KEY_RING=sentinel
GCP_KMS_KEY_ID=sentinel-master
```

### Azure Blob Storage + Key Vault

```env
CLOUD_PROVIDER=azure
AZURE_STORAGE_ACCOUNT_URL=https://sentinelarchiveprod.blob.core.windows.net
AZURE_ARCHIVE_CONTAINER=sentinel-archive
AZURE_KEY_VAULT_URL=https://sentinel-kv.vault.azure.net/
AZURE_KEY_NAME=sentinel-master
```

---

## Enterprise SSO Setup

Configure SSO from **Settings → SSO** in the dashboard (admin only).

### GitHub OAuth

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
2. Set **Authorization callback URL** to `https://sentinel.your-domain.com/api/auth/callback/github`
3. Set environment variables:

```env
GITHUB_CLIENT_ID=Iv1.your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
```

### GitLab OAuth

Supports both `gitlab.com` and self-managed GitLab instances.

1. Go to **GitLab → Preferences → Applications → Add new application**
2. Set **Redirect URI** to `https://sentinel.your-domain.com/api/auth/callback/gitlab`
3. Grant scopes: `read_user`, `openid`, `profile`, `email`
4. Set environment variables:

```env
GITLAB_CLIENT_ID=your-application-id
GITLAB_CLIENT_SECRET=your-secret
GITLAB_URL=https://gitlab.com                  # or your self-managed URL
```

### Generic OIDC (Okta, Auth0, Azure AD, Keycloak)

Works with any OIDC 1.0 compliant identity provider.

1. Create an OIDC application in your IdP
2. Set the **Redirect URI** to `https://sentinel.your-domain.com/api/auth/callback/oidc`
3. Grant scopes: `openid profile email`
4. Set environment variables:

```env
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_ISSUER=https://your-idp.example.com      # e.g. https://dev-xxx.okta.com
OIDC_PROVIDER_NAME=Okta                        # displayed on login page
```

**Okta example:**
```env
OIDC_ISSUER=https://dev-12345678.okta.com
OIDC_PROVIDER_NAME=Okta
```

**Auth0 example:**
```env
OIDC_ISSUER=https://your-tenant.us.auth0.com
OIDC_PROVIDER_NAME=Auth0
```

**Azure Active Directory example:**
```env
OIDC_ISSUER=https://login.microsoftonline.com/your-tenant-id/v2.0
OIDC_PROVIDER_NAME=Microsoft
```

**Keycloak example:**
```env
OIDC_ISSUER=https://keycloak.your-domain.com/realms/your-realm
OIDC_PROVIDER_NAME=Keycloak
```

### SAML 2.0

SENTINEL uses [BoxyHQ SAML Jackson](https://github.com/boxyhq/jackson) for SAML 2.0. It runs as a sidecar service (`saml-jackson`).

1. Start the `saml-jackson` service (included in `docker-compose.sentinel.yml`)
2. Configure your IdP (Okta, Azure AD, OneLogin, etc.) with:
   - **Entity ID / Audience URI**: `https://sentinel.your-domain.com`
   - **ACS URL**: `https://sentinel.your-domain.com/api/auth/callback/saml-jackson`
   - **NameID format**: `emailAddress`
3. Set environment variables:

```env
SAML_JACKSON_URL=http://saml-jackson:5225
SAML_JACKSON_PRODUCT=sentinel
SAML_CLIENT_ID=dummy                 # overridden by Jackson
SAML_CLIENT_SECRET=dummy             # overridden by Jackson
```

4. Upload your IdP metadata XML via the Settings → SSO page in the dashboard.

### Role Mapping

Map IdP groups or email domains to SENTINEL roles:

```env
# Map GitHub usernames or email addresses to roles
SENTINEL_ROLE_MAP="admin:alice@company.com,manager:bob@company.com"
```

For SCIM provisioning (automatic user sync), use the SCIM API endpoint:
```
POST /v1/scim/v2/Users
PATCH /v1/scim/v2/Users/:id
DELETE /v1/scim/v2/Users/:id
```

---

## Data Retention Configuration

SENTINEL includes a full data retention management system with severity-tiered policies, dual-admin approval workflow, and automatic archiving before deletion.

### Preset Profiles

| Preset | Critical | High | Medium | Low | Use Case |
|--------|----------|------|--------|-----|----------|
| **Minimal** | 90 days | 60 days | 30 days | 14 days | Dev/Test environments |
| **Standard** | 365 days | 180 days | 90 days | 30 days | Most organizations |
| **Compliance** | 730 days | 365 days | 180 days | 90 days | Regulated industries |
| **Custom** | User-defined | User-defined | User-defined | User-defined | Enterprise needs |

### Configuring Retention

1. Navigate to **Settings → Data Retention** in the dashboard
2. Select a preset profile or configure custom per-severity days
3. Submit the change for dual-admin approval (no self-approval)
4. A second admin approves the change
5. The new policy takes effect on the next nightly cron run (4:00 AM)

### Archive Destinations

Before deletion, SENTINEL can archive findings to external storage. Configure from **Settings → Data Retention → Archive Destinations**:

- **Amazon S3** — JSONL files at `{prefix}/{orgId}/{dataType}/{severity}/{date}.jsonl`
- **Google Cloud Storage** — Same format as S3
- **Azure Blob Storage** — Same JSONL format, to a named container
- **Webhook** — POST batches of 1000 records to your endpoint
- **SFTP** — Encrypted transfer to any SFTP server

Archive credentials are encrypted at rest with AES-256-GCM.

### Execution History

View retention job history at **Settings → Data Retention → Execution History**. Each run shows:
- Start/end time
- Records deleted (by type: findings, agent results, scans)
- Policy snapshot at time of execution
- Error details if failed

---

## CI/CD Integration

### GitHub Actions

Add to `.github/workflows/sentinel.yml`:

```yaml
name: SENTINEL Scan
on: [push, pull_request]

permissions:
  contents: read
  checks: write
  pull-requests: write

jobs:
  sentinel:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0           # Required: fetch full history for diff

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Install SENTINEL CLI
        run: npm install -g @sentinel/cli

      - name: Run SENTINEL Scan
        run: sentinel ci --api-url ${{ secrets.SENTINEL_API_URL }} --sarif > sentinel.sarif
        env:
          SENTINEL_API_KEY: ${{ secrets.SENTINEL_API_KEY }}
          SENTINEL_SECRET: ${{ secrets.SENTINEL_SECRET }}

      - name: Upload SARIF to GitHub Code Scanning
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: sentinel.sarif
```

**Required repository secrets:**

| Secret | Description |
|--------|-------------|
| `SENTINEL_API_URL` | Your SENTINEL API endpoint (e.g. `https://api.sentinel.example.com`) |
| `SENTINEL_API_KEY` | Your API key (generated in Settings → API Keys) |
| `SENTINEL_SECRET` | Your HMAC shared secret (matches `SENTINEL_SECRET` on the server) |

### GitLab CI

Add to `.gitlab-ci.yml`:

```yaml
include:
  # Option A: Use the GitLab CI Component (if using GitLab.com Component Catalog)
  - component: gitlab.com/your-org/sentinel/scan@~latest

  # Option B: Use the template directly
  - local: sentinel/templates/gitlab-ci.yml
```

Or copy the template directly:

```yaml
variables:
  SENTINEL_FAIL_ON: "critical,high"   # Fail the pipeline on these severities
  SENTINEL_TIMEOUT: "10m"

sentinel-scan:
  stage: test
  image: node:22-alpine
  before_script:
    - npm install -g @sentinel/cli
  script:
    - |
      sentinel ci \
        --api-url "${SENTINEL_API_URL}" \
        --fail-on "${SENTINEL_FAIL_ON}" \
        --timeout "${SENTINEL_TIMEOUT}" \
        --format sarif \
        --output gl-sast-report.json
  variables:
    GIT_DEPTH: 0
  artifacts:
    reports:
      sast: gl-sast-report.json
    paths: [gl-sast-report.json]
    expire_in: 30 days
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
```

**Required CI/CD variables** (Settings → CI/CD → Variables, mark as masked):

| Variable | Description |
|----------|-------------|
| `SENTINEL_API_URL` | Your API endpoint |
| `SENTINEL_API_KEY` | Your API key |
| `SENTINEL_SECRET` | Your HMAC shared secret |

### Azure Pipelines

Copy `templates/azure-pipelines.yml` to your repository root, or extend it:

```yaml
trigger:
  branches:
    include: ['*']

pool:
  vmImage: ubuntu-latest

steps:
  - checkout: self
    fetchDepth: 0

  - task: NodeTool@0
    inputs:
      versionSpec: '22.x'

  - script: npm install -g @sentinel/cli
    displayName: Install SENTINEL CLI

  - script: sentinel ci --api-url "$(SENTINEL_API_URL)"
    displayName: Run SENTINEL Scan
    env:
      SENTINEL_API_KEY: $(SENTINEL_API_KEY)
      SENTINEL_SECRET: $(SENTINEL_SECRET)
    timeoutInMinutes: 10
```

**Required pipeline variables** (Pipelines → Library → Variable Group):

| Variable | Secret? |
|----------|---------|
| `SENTINEL_API_URL` | No |
| `SENTINEL_API_KEY` | Yes |
| `SENTINEL_SECRET` | Yes |

For Azure DevOps webhook integration (automatic scans on push/PR), see [docs/azure-devops-setup.md](docs/azure-devops-setup.md).

### Jenkins

```groovy
pipeline {
  agent any
  environment {
    SENTINEL_API_URL = credentials('sentinel-api-url')
    SENTINEL_API_KEY = credentials('sentinel-api-key')
    SENTINEL_SECRET  = credentials('sentinel-secret')
  }
  stages {
    stage('SENTINEL Scan') {
      steps {
        sh 'npm install -g @sentinel/cli'
        sh '''
          git diff HEAD~1 | sentinel ci \
            --api-url "$SENTINEL_API_URL" \
            --fail-on critical,high
        '''
      }
    }
  }
}
```

Store credentials in **Jenkins → Manage Jenkins → Credentials → System → Global credentials**.

### Bitbucket Pipelines

```yaml
# bitbucket-pipelines.yml
pipelines:
  default:
    - step:
        name: SENTINEL Scan
        image: node:22-alpine
        script:
          - npm install -g @sentinel/cli
          - git diff HEAD~1 | sentinel ci --api-url $SENTINEL_API_URL
        after-script:
          - echo "Scan complete"

definitions:
  services:
    sentinel:
      image: node:22-alpine
```

Store `SENTINEL_API_URL`, `SENTINEL_API_KEY`, `SENTINEL_SECRET` in **Repository settings → Pipelines → Repository variables**.

---

## GitHub App Integration

The GitHub App provides:
- **Automatic scans** on every push and pull request
- **GitHub Check Runs** with inline annotations for findings
- **PR comments** with compliance certificate status
- **Slack alerts** for critical findings

### Installation

1. Create a GitHub App at `https://github.com/organizations/YOUR_ORG/settings/apps/new`
2. Configure:
   - **Homepage URL**: `https://sentinel.your-domain.com`
   - **Webhook URL**: `https://sentinel.your-domain.com/webhooks/github`
   - **Webhook secret**: A random value (save as `GITHUB_WEBHOOK_SECRET`)
   - **Permissions**: Contents (read), Checks (write), Pull requests (write), Metadata (read)
   - **Subscribe to events**: Push, Pull request
3. Generate and download the private key
4. Set environment variables:

```env
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY=<contents of .pem file, with \n for newlines>
GITHUB_WEBHOOK_SECRET=your-webhook-secret
```

---

## Notification Integrations

Configure from **Settings → Notifications** in the dashboard.

### Slack

1. Create a Slack App at `https://api.slack.com/apps`
2. Add **Incoming Webhooks** and create a webhook for your channel
3. In SENTINEL: **Settings → Notifications → Add Endpoint**
   - Type: `slack`
   - URL: Your Slack webhook URL
   - Configure notification rules (e.g., "notify on critical findings")

### Microsoft Teams

1. In Teams: **Channel → Connectors → Incoming Webhook → Configure**
2. Copy the webhook URL
3. In SENTINEL: **Settings → Notifications → Add Endpoint**
   - Type: `teams`
   - URL: Your Teams webhook URL

### PagerDuty

1. In PagerDuty: **Services → Add Integration → Events API v2**
2. Copy the integration key
3. In SENTINEL: **Settings → Notifications → Add Endpoint**
   - Type: `pagerduty`
   - URL: `https://events.pagerduty.com/v2/enqueue`
   - Headers: `{ "X-Routing-Key": "<your-integration-key>" }`
   - Configure to trigger on `critical` severity findings

### Email (SMTP)

Configure notification rules with a webhook pointing to your email gateway, or use the built-in SMTP support:

```env
SMTP_HOST=smtp.your-domain.com
SMTP_PORT=587
SMTP_USER=sentinel@your-domain.com
SMTP_PASS=your-smtp-password
SMTP_FROM=sentinel@your-domain.com
```

---

## Scan Policies

Policies are defined in YAML and support org-level and repo-level inheritance.

### Policy File Location

Create `.sentinel/policies.yaml` in your repository:

```yaml
version: "1"
rules:
  # Block dangerous patterns
  - name: no-eval
    type: deny-pattern
    pattern: "\\beval\\("
    severity: critical
    message: "eval() is forbidden — use safer alternatives"

  # Require license headers
  - name: require-license-header
    type: require-pattern
    pattern: "^// SPDX-License-Identifier:"
    glob: "src/**/*.ts"
    severity: medium
    message: "All source files must include an SPDX license header"

  # Block dangerous imports
  - name: no-shell-exec
    type: deny-import
    module: "child_process"
    severity: high
    message: "Direct shell execution is not permitted"

  # Enforce naming conventions
  - name: no-any-type
    type: deny-pattern
    pattern: ": any"
    glob: "**/*.ts"
    severity: low
    message: "Avoid TypeScript 'any' type"
```

### Policy Types

| Type | Description |
|------|-------------|
| `deny-pattern` | Reject code matching a regex pattern |
| `require-pattern` | Require code to match a regex pattern |
| `deny-import` | Block imports of specific modules |

### Managing Policies via Dashboard

Navigate to **Settings → Policies** to create, edit, and version policies through the UI. Policy changes are versioned and recorded in the audit log.

---

## API Reference

The full OpenAPI 3.1 specification is at [`docs/api/openapi.yaml`](docs/api/openapi.yaml).

### Authentication

All API requests (except `/health` and `/metrics`) require HMAC-SHA256 authentication:

```
X-Sentinel-Signature: t=<unix-timestamp>,sig=<hmac-sha256-hex>
```

Computing the signature:

```bash
TIMESTAMP=$(date +%s)
BODY='{"projectId":"my-project","diff":"...","commitHash":"abc123"}'
SIGNATURE=$(echo -n "t=${TIMESTAMP}.${BODY}" | openssl dgst -sha256 -hmac "${SENTINEL_SECRET}" | cut -d' ' -f2)
HEADER="t=${TIMESTAMP},sig=${SIGNATURE}"
```

Signatures expire after 5 minutes. Keep your system clock synchronized.

---

### Scans

#### Submit a Scan

```http
POST /v1/scans
Content-Type: application/json
X-Sentinel-Signature: t=1710000000,sig=abc123...
```

```json
{
  "projectId": "proj_abc123",
  "diff": "<unified diff content>",
  "commitHash": "abc123def456",
  "branch": "main",
  "author": "alice@example.com",
  "scanConfig": {
    "securityLevel": "standard"
  }
}
```

**Response:**
```json
{
  "scanId": "scan_xyz789",
  "status": "pending",
  "pollUrl": "/v1/scans/scan_xyz789/poll"
}
```

#### Poll Scan Status (SSE)

```http
GET /v1/scans/:id/poll
Accept: text/event-stream
```

Streams Server-Sent Events until the scan completes:
```
event: scan.complete
data: {"status":"completed","riskScore":12,"certificate":{"id":"cert_abc"}}
```

#### Get Scan Result

```http
GET /v1/scans/:id
```

#### List Scans

```http
GET /v1/scans?status=completed&projectId=proj_abc&limit=50&offset=0
```

---

### Findings

#### List Findings

```http
GET /v1/findings?severity=critical&projectId=proj_abc&limit=50
```

Query parameters: `severity`, `projectId`, `scanId`, `status`, `limit`, `offset`

#### Get Finding

```http
GET /v1/findings/:id
```

#### Update Finding Status

```http
PATCH /v1/findings/:id
Content-Type: application/json

{ "status": "acknowledged", "note": "False positive — reviewed by security team" }
```

---

### Certificates

#### Get Certificate

```http
GET /v1/certificates/:id
```

#### Verify Certificate Signature

```http
POST /v1/certificates/:id/verify
```

Returns `{ "valid": true, "verifiedAt": "2026-03-18T12:00:00Z" }` or `{ "valid": false, "reason": "signature mismatch" }`.

---

### Projects

#### List Projects

```http
GET /v1/projects
```

#### Create Project

```http
POST /v1/projects
Content-Type: application/json

{ "name": "my-service", "repositoryUrl": "https://github.com/org/repo" }
```

---

### Data Retention

#### Get Retention Presets

```http
GET /v1/retention/presets
```

Returns available preset profiles with their tier values.

#### Get Current Policy

```http
GET /v1/retention/policy
```

#### Propose Policy Change

```http
POST /v1/retention/policy/changes
Content-Type: application/json

{
  "preset": "compliance",
  "tierCritical": 730,
  "tierHigh": 365,
  "tierMedium": 180,
  "tierLow": 90,
  "reason": "Regulatory requirement for 2-year critical finding retention"
}
```

#### List Pending Changes

```http
GET /v1/retention/policy/changes
```

#### Approve a Change (second admin)

```http
POST /v1/retention/policy/changes/:id/approve
```

#### Reject a Change

```http
POST /v1/retention/policy/changes/:id/reject
Content-Type: application/json

{ "reason": "Policy not yet approved by legal" }
```

#### List Archive Destinations

```http
GET /v1/retention/archives
```

#### Add Archive Destination

```http
POST /v1/retention/archives
Content-Type: application/json

{
  "name": "Compliance S3 Bucket",
  "type": "s3",
  "config": {
    "bucket": "my-compliance-archive",
    "region": "us-east-1",
    "prefix": "sentinel"
  },
  "credentials": {
    "accessKeyId": "AKIA...",
    "secretAccessKey": "..."
  }
}
```

Supported types: `s3`, `gcs`, `azure-blob`, `webhook`, `sftp`

#### Get Retention Stats

```http
GET /v1/retention/stats
```

Returns finding counts grouped by severity × age bucket.

#### Get Retention Executions

```http
GET /v1/retention/executions
```

---

### Audit Log

```http
GET /v1/audit?action=scan.started&limit=100&cursor=<next-cursor>
```

---

### API Keys

#### List API Keys

```http
GET /v1/api-keys
```

#### Create API Key

```http
POST /v1/api-keys
Content-Type: application/json

{ "name": "GitHub Actions CI", "expiresIn": "90d" }
```

#### Revoke API Key

```http
DELETE /v1/api-keys/:id
```

---

### Webhooks

#### List Webhook Endpoints

```http
GET /v1/webhooks
```

#### Create Webhook Endpoint

```http
POST /v1/webhooks
Content-Type: application/json

{
  "url": "https://your-service.com/sentinel-events",
  "secret": "your-webhook-secret",
  "events": ["scan.completed", "certificate.issued", "finding.critical"]
}
```

#### Get Webhook Delivery History

```http
GET /v1/webhooks/:id/deliveries
```

---

### SCIM 2.0

Standard SCIM 2.0 endpoints for automated user provisioning from your IdP:

```http
GET    /v1/scim/v2/Users
POST   /v1/scim/v2/Users
GET    /v1/scim/v2/Users/:id
PATCH  /v1/scim/v2/Users/:id
DELETE /v1/scim/v2/Users/:id
GET    /v1/scim/v2/Groups
POST   /v1/scim/v2/Groups
PATCH  /v1/scim/v2/Groups/:id
DELETE /v1/scim/v2/Groups/:id
```

---

### System

#### Health Check

```http
GET /health
```

Returns `200 OK` when all critical dependencies are healthy.

#### Prometheus Metrics

```http
GET /metrics
```

Returns Prometheus-format metrics for scraping.

---

## CLI Reference

### Installation

```bash
npm install -g @sentinel/cli

# Verify
sentinel --version
```

### Commands

#### `sentinel ci` — Run a scan in CI/CD

```bash
sentinel ci [options]

Options:
  --api-url <url>        SENTINEL API endpoint (or SENTINEL_API_URL env var)
  --api-key <key>        API key (or SENTINEL_API_KEY env var)
  --secret <secret>      HMAC shared secret (or SENTINEL_SECRET env var)
  --fail-on <severities> Comma-separated severities that fail the build (default: critical)
  --sarif                Output results as SARIF to stdout
  --json                 Output results as JSON to stdout
  --output <file>        Write output to a file instead of stdout
  --timeout <duration>   Scan timeout (default: 10m)
  --format <format>      Output format: text|json|sarif (default: text)
  --project <id>         Override project ID
  --branch <name>        Override branch name
  --commit <hash>        Override commit hash
```

**Examples:**

```bash
# Basic scan
git diff HEAD~1 | sentinel ci --api-url https://api.sentinel.example.com

# Fail on critical and high severity
sentinel ci --api-url $SENTINEL_API_URL --fail-on critical,high

# Output SARIF for GitHub Code Scanning
sentinel ci --api-url $SENTINEL_API_URL --sarif > results.sarif

# Write JSON report to file
sentinel ci --api-url $SENTINEL_API_URL --json --output sentinel-report.json

# 15-minute timeout for large repos
sentinel ci --api-url $SENTINEL_API_URL --timeout 15m
```

**Exit codes:**

| Code | Meaning |
|------|---------|
| 0 | Pass (full_pass or provisional_pass) |
| 1 | Fail (blocking findings at fail-on severity) |
| 2 | Error (network error, auth failure, etc.) |
| 3 | Provisional pass or partial result |

#### `sentinel hook` — Git hooks

```bash
# Install pre-push hook (scans before pushing)
sentinel hook install --type pre-push

# Remove hook
sentinel hook uninstall --type pre-push
```

#### `sentinel verify` — Verify a certificate

```bash
sentinel verify <certificate-id> --api-url https://api.sentinel.example.com
```

---

## Dashboard

The SENTINEL dashboard is available at `http://localhost:3000` (dev) or your configured `NEXTAUTH_URL`.

### Pages

| Page | Path | Description | Min Role |
|------|------|-------------|----------|
| **Overview** | `/` | Key metrics, recent scans, risk trend chart | viewer |
| **Projects** | `/projects` | All monitored repositories | viewer |
| **Findings** | `/findings` | Filterable findings list with remediation guidance | viewer |
| **Certificates** | `/certificates` | Compliance certificates, verification status | viewer |
| **Gap Analysis** | `/gap-analysis` | Compliance gap heatmap vs frameworks | viewer |
| **Reports** | `/reports` | Compliance report generation and scheduling | developer |
| **Drift** | `/drift` | Configuration drift detection | developer |
| **Audit Log** | `/audit` | Immutable activity log | manager |
| **Settings** | `/settings` | Platform configuration | admin |
| **→ API Keys** | `/settings/api-keys` | Create and revoke API keys | admin |
| **→ Notifications** | `/settings/notifications` | Webhook/Slack/Teams alerts | admin |
| **→ Data Retention** | `/settings/retention` | Retention policies, archive destinations, execution history | admin |
| **→ SSO** | `/settings/sso` | SAML/OIDC identity provider configuration | admin |
| **→ Members** | `/settings/members` | Team members and role management | admin |
| **→ Encryption** | `/settings/encryption` | KMS and encryption key management | admin |

### Role-Based Access Control

| Role | Capabilities |
|------|-------------|
| **viewer** | Read-only access to scans, findings, certificates |
| **developer** | Viewer + submit scans, generate reports |
| **manager** | Developer + manage policies, approve changes |
| **admin** | Full access including settings, SSO, encryption, retention |
| **service** | API-only access for CI/CD integrations |

Assign roles via:
```env
SENTINEL_ROLE_MAP="admin:alice@company.com,manager:bob@company.com,developer:ci-user"
```

Or manage roles in Settings → Members.

---

## Project Structure

```
sentinel/
├── apps/
│   ├── api/                      # Fastify 5 REST API server (port 8080)
│   │   ├── src/
│   │   │   ├── routes/           # 30+ route handlers
│   │   │   ├── scheduler/        # Cron jobs (retention, self-scan, cleanup)
│   │   │   ├── server.ts         # App bootstrap
│   │   │   └── worker.ts         # Assessor worker entry point
│   │   └── ...
│   ├── cli/                      # @sentinel/cli — CI/CD integration tool
│   └── dashboard/                # Next.js 15 compliance dashboard (port 3000)
│       └── app/
│           ├── (dashboard)/      # Authenticated pages
│           └── (public)/         # Landing, pricing, login
├── agents/
│   ├── framework/                # Python base agent + shared types
│   ├── security/                 # Semgrep + custom YAML rules (30 tests)
│   ├── ip-license/               # SPDX license detection, code fingerprinting
│   ├── dependency/               # OSV.dev CVE lookup, typosquat detection (52 tests)
│   ├── ai-detector/              # Entropy, stylometric, marker analysis
│   ├── quality/                  # Complexity, duplication, naming, test coverage
│   ├── policy/                   # YAML rule engine with org/repo inheritance
│   └── llm-review/               # Optional Claude-based review (requires API key)
├── packages/
│   ├── shared/                   # Shared TypeScript types and constants
│   ├── events/                   # Redis Streams event bus
│   ├── assessor/                 # Weighted risk scoring + certificate generation
│   ├── auth/                     # HMAC request signing/verification
│   ├── audit/                    # Hash-chained immutable audit log
│   ├── db/                       # Prisma schema, migrations, multi-tenant isolation
│   ├── github/                   # GitHub App webhooks, Check Runs, Slack alerts
│   ├── retention/                # Retention policy engine + archive adapters
│   └── security/                 # JWT, KMS, RBAC, data retention, SBOM, S3 archive
├── deploy/
│   ├── helm/                     # Helm chart for Kubernetes deployment
│   ├── k8s/                      # Raw Kubernetes manifests
│   ├── monitoring/               # Prometheus + Grafana configuration
│   └── nginx.conf                # Production Nginx configuration
├── docker/
│   ├── api.Dockerfile            # API + worker image
│   ├── dashboard.Dockerfile      # Next.js standalone image
│   └── agent.Dockerfile          # Multi-stage Python agent image
├── templates/
│   ├── github-actions.yml        # GitHub Actions template
│   ├── gitlab-ci.yml             # GitLab CI template
│   ├── azure-pipelines.yml       # Azure Pipelines template
│   └── gitlab-component/         # GitLab CI/CD Component catalog template
├── test/
│   ├── e2e/                      # End-to-end pipeline tests
│   ├── docker/                   # Docker Compose validation
│   └── load/                     # k6 load tests (100 VUs, 5 minutes)
├── docs/
│   ├── api/openapi.yaml          # OpenAPI 3.1 specification
│   ├── onboarding.md             # Quick-start guide
│   ├── azure-devops-setup.md     # Azure DevOps integration guide
│   ├── security-whitepaper.md    # Security architecture whitepaper
│   └── soc2-audit-initiation.md  # SOC 2 audit initiation guide
├── docker-compose.yml            # Dev infrastructure (Postgres + Redis only)
├── docker-compose.sentinel.yml   # Production: all services
├── .env.example                  # Environment variable template
├── turbo.json                    # Turborepo build pipeline
└── pnpm-workspace.yaml           # pnpm workspace definition
```

---

## Configuration Reference

### Required Variables

| Variable | Description |
|----------|-------------|
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `DATABASE_URL` | Full Postgres connection string |
| `SENTINEL_SECRET` | HMAC signing secret (generate: `openssl rand -hex 32`) |
| `NEXTAUTH_URL` | Dashboard public URL (e.g. `https://sentinel.example.com`) |
| `NEXTAUTH_SECRET` | NextAuth session secret (generate: `openssl rand -hex 32`) |

### Authentication Variables

| Variable | Description |
|----------|-------------|
| `GITHUB_CLIENT_ID` | GitHub OAuth app ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app secret |
| `GITLAB_CLIENT_ID` | GitLab OAuth app ID |
| `GITLAB_CLIENT_SECRET` | GitLab OAuth app secret |
| `GITLAB_URL` | GitLab URL (default: `https://gitlab.com`) |
| `OIDC_CLIENT_ID` | Generic OIDC client ID |
| `OIDC_CLIENT_SECRET` | Generic OIDC client secret |
| `OIDC_ISSUER` | OIDC discovery URL |
| `OIDC_PROVIDER_NAME` | Display name on login page |
| `SAML_JACKSON_URL` | BoxyHQ Jackson SAML service URL |
| `SENTINEL_ROLE_MAP` | Comma-separated `role:user` assignments |

### GitHub App Variables

| Variable | Description |
|----------|-------------|
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_PRIVATE_KEY` | GitHub App private key (PEM format, newlines as `\n`) |
| `GITHUB_WEBHOOK_SECRET` | Webhook signature validation secret |

### Cloud Provider Variables

| Variable | Provider | Description |
|----------|----------|-------------|
| `CLOUD_PROVIDER` | All | `aws`, `gcp`, or `azure` |
| `AWS_REGION` | AWS | AWS region (default: `us-east-1`) |
| `S3_ARCHIVE_BUCKET` | AWS | S3 bucket for certificate archive |
| `KMS_MASTER_KEY_ID` | AWS | AWS KMS key ARN or ID |
| `GCP_PROJECT_ID` | GCP | Google Cloud project ID |
| `GCS_ARCHIVE_BUCKET` | GCP | GCS bucket name |
| `GCP_KMS_LOCATION` | GCP | KMS key ring location (default: `global`) |
| `GCP_KMS_KEY_RING` | GCP | KMS key ring name |
| `GCP_KMS_KEY_ID` | GCP | KMS key name |
| `AZURE_STORAGE_ACCOUNT_URL` | Azure | Storage account URL |
| `AZURE_ARCHIVE_CONTAINER` | Azure | Blob container name |
| `AZURE_KEY_VAULT_URL` | Azure | Key Vault URL |
| `AZURE_KEY_NAME` | Azure | Key name in Key Vault |

### Operational Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://redis:6379` | Redis connection URL |
| `API_PORT` | `8080` | API server port |
| `DASHBOARD_PORT` | `3000` | Dashboard port |
| `CORS_ORIGIN` | `*` | CORS allowed origins |
| `RATE_LIMIT_MAX` | `100` | Max requests per minute |
| `LOG_LEVEL` | `info` | Logging level (`debug`, `info`, `warn`, `error`) |
| `AGENT_TIMEOUT_MS` | `30000` | Agent timeout per scan (30 seconds) |
| `SCAN_TIMEOUT_MS` | `300000` | Overall scan timeout (5 minutes) |
| `SELF_SCAN_ENABLED` | `true` | Enable SENTINEL self-scanning |
| `SCHEDULER_LEASE_TTL` | `15000` | Scheduler leader election TTL (ms) |

### LLM Review Agent

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Anthropic API key (required for LLM agent) |
| `LLM_TOKEN_BUDGET` | `50000` | Max tokens per LLM review session |

### Data Retention

| Variable | Default | Description |
|----------|---------|-------------|
| `ARCHIVE_BUCKET` | — | Default archive bucket (used by retention jobs) |
| `ARCHIVE_PREFIX` | `sentinel` | Path prefix in archive bucket |
| `ARCHIVE_RETENTION_DAYS` | `2555` | Archived file retention (7 years) |
| `SENTINEL_ENCRYPTION_KEY` | — | AES-256 key for credential encryption (base64, 32 bytes) |

---

## Security

### Request Authentication

All API requests require HMAC-SHA256 signatures:

```
X-Sentinel-Signature: t=<unix-timestamp>,sig=<hmac-sha256(t.<body>)>
```

- **Constant-time comparison** prevents timing attacks
- **5-minute replay window** protects against replay attacks
- **Body integrity** — signature covers the full request body

### Transport Security

- TLS 1.3 enforced for all external connections
- Internal services communicate over private Docker/Kubernetes networks
- No direct internet access from analysis agents

### Data Encryption

- **In transit**: TLS 1.3
- **At rest**: AES-256-GCM via cloud KMS (AWS KMS, Google Cloud KMS, Azure Key Vault)
- **Credentials**: AES-256-GCM with 12-byte IV and 16-byte auth tag
- **Archive credentials**: Envelope encryption (DEK encrypted with KMS CMK)

### Crypto-Shredding (GDPR)

To permanently purge a tenant's data without deletion:

```http
POST /v1/admin/crypto-shred
Content-Type: application/json

{ "orgId": "org_abc123", "reason": "Customer data deletion request (GDPR Art. 17)" }
```

This destroys the KMS encryption key, rendering all stored data unrecoverable without a trace in the audit log.

### Audit Log

Every action is recorded in an immutable, hash-chained audit log:

- Each event includes `SHA-256(previous event)`
- Append-only — no updates or deletes
- 7-year default retention
- Queryable via `/v1/audit`

### Supply Chain Security

SENTINEL scans itself on every commit:

- SBOM generation for all Docker images (`.github/workflows/`)
- Dependency CVE scanning via the dependency agent
- Policy enforcement via `.sentinel/policies.yaml`

See [docs/security-whitepaper.md](docs/security-whitepaper.md) for full details.

---

## Compliance

### EU AI Act

SENTINEL produces documentation required under Articles 9–15:

- **AI generation probability** tracked per finding
- **Tool attribution** (which AI tool generated the code)
- **Human oversight** verification field in certificates
- **Risk categorization** aligned with EU AI Act risk levels

### SOC 2 Type I

Mapped to Trust Services Criteria:

| Criteria | Control |
|----------|---------|
| CC6.1 | RBAC, HMAC authentication |
| CC6.6 | TLS 1.3, AES-256 at rest |
| CC7.1 | Audit log, health monitoring |
| CC7.2 | Anomaly detection, Prometheus alerts |
| CC8.1 | Policy versioning, change audit trail |

See [docs/soc2-audit-initiation.md](docs/soc2-audit-initiation.md) for the audit readiness guide.

### ISO 27001

Controls addressed:

| Control | Implementation |
|---------|---------------|
| A.9 | RBAC, OIDC/SAML SSO, SCIM provisioning |
| A.10 | TLS 1.3, AES-256-GCM, HMAC-SHA256 |
| A.12 | Hash-chained audit log, Prometheus monitoring |
| A.14 | Automated scanning pipeline, SBOM |

---

## Monitoring & Observability

### Prometheus Metrics

SENTINEL exposes Prometheus metrics at `/metrics`:

- `sentinel_scans_total` — Total scans by status
- `sentinel_scan_duration_seconds` — Scan duration histogram
- `sentinel_findings_total` — Findings by severity and agent
- `sentinel_agent_queue_depth` — Redis stream pending item count
- `sentinel_certificates_issued_total` — Certificates by status

### Grafana Dashboards

Pre-built Grafana dashboards are in `deploy/monitoring/grafana/`:

- **SENTINEL Overview** — Scan throughput, certificate pass rate, finding trends
- **Agent Performance** — Per-agent latency, error rate, queue depth
- **Infrastructure** — PostgreSQL, Redis, container resource usage

### Alerting Rules

Prometheus alerting rules in `deploy/monitoring/rules/`:

- `SentinelAgentDown` — Agent not processing events
- `SentinelHighErrorRate` — API error rate >1%
- `SentinelQueueBacklog` — Redis queue depth >1000

### Structured Logging

All services output JSON logs compatible with any log aggregation system:

```json
{
  "level": "info",
  "time": "2026-03-18T04:00:00.000Z",
  "msg": "Tiered retention cleanup completed",
  "orgId": "org_abc123",
  "deletedFindings": 1523,
  "deletedScans": 12
}
```

Ship logs to:
- **AWS**: CloudWatch Logs (use the `awslogs` Docker log driver)
- **GCP**: Cloud Logging (automatic when running on GKE)
- **Azure**: Azure Monitor (use the Azure Monitor log driver)
- **Self-hosted**: Elasticsearch, Loki, Splunk

---

## Running Tests

### TypeScript Tests

```bash
# Run all tests across the monorepo
pnpm test

# Run tests for a specific package
pnpm --filter @sentinel/api test
pnpm --filter @sentinel/assessor test
pnpm --filter @sentinel/retention test
```

### Python Agent Tests

```bash
cd agents/security  && source .venv/bin/activate && pytest -v    # 30 tests
cd agents/dependency && source .venv/bin/activate && pytest -v   # 52 tests
cd agents/ip-license && source .venv/bin/activate && pytest -v
cd agents/ai-detector && source .venv/bin/activate && pytest -v
cd agents/quality && source .venv/bin/activate && pytest -v
cd agents/policy && source .venv/bin/activate && pytest -v
```

### End-to-End Tests

```bash
# Docker Compose validation
cd test/docker && ./validate.sh

# E2E pipeline tests (requires running infrastructure)
cd test/e2e && pnpm test
```

### Load Tests

```bash
# k6 load test: 100 virtual users, 5-minute duration
k6 run test/load/k6-scan-load.js
```

---

## Troubleshooting

### "401 Unauthorized" — API requests failing

- Verify `SENTINEL_API_KEY` and `SENTINEL_SECRET` are set correctly
- Check that the signature is computed over the exact request body (no extra spaces)
- Ensure system clock is synchronized (`timedatectl status`)
- Signatures expire after 5 minutes

### "No diff detected" — CLI finds nothing to scan

- Ensure `fetch-depth: 0` in your checkout step (GitHub Actions)
- Verify you have commits to compare: `git log --oneline -5`
- Try explicitly: `git diff HEAD~1 HEAD | sentinel ci --api-url ...`

### Dashboard shows unstyled content

- Requires Tailwind CSS v4 with PostCSS. Verify `postcss.config.mjs` exists in `apps/dashboard/`
- Run `pnpm build` and check for build errors

### Agents not processing scans

```bash
# Check Redis connectivity
docker compose -f docker-compose.sentinel.yml exec redis redis-cli ping

# Check Redis stream consumer groups
docker compose -f docker-compose.sentinel.yml exec redis \
  redis-cli xinfo groups sentinel.diffs

# Check agent logs
docker compose -f docker-compose.sentinel.yml logs -f security-agent
```

### Database migration errors

```bash
# Check current migration status
docker compose -f docker-compose.sentinel.yml exec api \
  npx prisma migrate status --schema=./packages/db/prisma/schema.prisma

# Apply pending migrations
docker compose -f docker-compose.sentinel.yml exec api \
  npx prisma migrate deploy --schema=./packages/db/prisma/schema.prisma
```

### Port already in use

```bash
# Find what's using the port
lsof -i :8080   # API
lsof -i :3000   # Dashboard

# Use different ports
API_PORT=8081 DASHBOARD_PORT=3001 \
  docker compose -f docker-compose.sentinel.yml up -d
```

### Docker build fails with "Ignored build scripts"

pnpm v10+ requires explicit script approval:

```bash
pnpm config set enable-pre-post-scripts true
pnpm install
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

**Quick contribution workflow:**

```bash
# Fork and clone
git clone https://github.com/your-fork/sentinel.git

# Create a feature branch
git checkout -b feat/my-feature

# Install dependencies
corepack enable && pnpm install && pnpm build

# Make changes, then run tests
pnpm test

# Submit a pull request
```

---

## License

Apache License 2.0. See [LICENSE](LICENSE).
