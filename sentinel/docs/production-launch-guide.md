# SENTINEL: Production Launch Guide

From local build to enterprise SaaS — every step, decision, and activity required to make SENTINEL available to real users and organizations.

---

## Table of Contents

1. [Where We Are Now (Honest Assessment)](#1-where-we-are-now)
2. [Choose Your Go-To-Market Model](#2-choose-your-go-to-market-model)
3. [Phase 1 — Production Infrastructure](#3-phase-1--production-infrastructure)
4. [Phase 2 — Remove & Replace Mock Data](#4-phase-2--remove--replace-mock-data)
5. [Phase 3 — Publish Packages & Extensions](#5-phase-3--publish-packages--extensions)
6. [Phase 4 — Auth, Billing & Onboarding](#6-phase-4--auth-billing--onboarding)
7. [Phase 5 — Legal & Compliance Foundations](#7-phase-5--legal--compliance-foundations)
8. [Phase 6 — Security Hardening](#8-phase-6--security-hardening)
9. [Phase 7 — Observability & Operations](#9-phase-7--observability--operations)
10. [Phase 8 — Backup, DR & Business Continuity](#10-phase-8--backup-dr--business-continuity)
11. [Phase 9 — Deploy Pipeline for SENTINEL Itself](#11-phase-9--deploy-pipeline-for-sentinel-itself)
12. [Phase 10 — Beta Program & Waitlist](#12-phase-10--beta-program--waitlist)
13. [Phase 11 — Launch Channels & Distribution](#13-phase-11--launch-channels--distribution)
14. [Phase 12 — Support Infrastructure](#14-phase-12--support-infrastructure)
15. [Phase 13 — Enterprise Sales Motion](#15-phase-13--enterprise-sales-motion)
16. [Phase 14 — SOC 2 Type I Certification](#16-phase-14--soc-2-type-i-certification)
17. [Launch Readiness Checklist](#17-launch-readiness-checklist)
18. [Cost Estimates](#18-cost-estimates)
19. [Recommended Timeline](#19-recommended-timeline)

---

## 1. Where We Are Now

### What is real and production-ready

| Component | State | Notes |
|-----------|-------|-------|
| API (Fastify 5) | Production-capable | All routes implemented, tested, HMAC auth, RBAC |
| Dashboard (Next.js 15) | Production-capable | All pages built, SSO/SCIM/OAuth wired |
| CLI (`@sentinel/cli`) | Production-capable | `init`, `scan`, `ci` commands, all CI providers |
| Security Agent | Production-capable | Semgrep + 13 custom rules, 30 tests passing |
| Dependency Agent | Production-capable | OSV.dev API, 6 manifest formats, 52 tests |
| Data Retention | Production-capable | Tiered policy, dual-admin approval, archive adapters |
| Azure DevOps Extension | Production-capable | `SentinelScan@1` task, SARIF output |
| GitLab CI Component | Production-capable | Component catalog entry |
| GitHub Actions integration | Production-capable | SARIF upload documented |
| Docker Compose (dev) | Production-capable | Full stack in `docker-compose.yml` |
| Prisma schema + migrations | Production-capable | All models migrated |
| OpenAPI spec | Complete | 73 paths, 41 schemas |

### What needs work before launch

| Gap | Severity | Effort |
|-----|----------|--------|
| Mock/placeholder data in dashboard pages | High | Medium |
| No billing/payment system | High | High |
| No public signup / org creation flow | High | Medium |
| No transactional email (verification, invites) | High | Low |
| No CDN / global edge deployment | Medium | Low |
| CLI not published to npm registry | High | Low |
| VS Code / JetBrains extensions not published | Medium | Medium |
| No production Dockerfile with hardened images | Medium | Low |
| No Helm chart published to public chart repo | Medium | Low |
| Agents 3–7 not implemented (License, Quality, AI Detector, Policy, LLM Review) | High | High |
| No SMTP/email service configured | High | Low |
| No domain / SSL cert automation | High | Low |
| No public documentation site | Medium | Medium |
| Legal docs (ToS, Privacy, DPA) not written | High | Low |
| No Stripe or billing integration | High | High |

---

## 2. Choose Your Go-To-Market Model

Before touching infrastructure, decide on the deployment model. This affects every technical decision below.

### Option A — Cloud SaaS (Recommended for fastest traction)

You host SENTINEL. Users sign up at `app.sentinel.dev` (or your domain) and use it immediately — no installation required.

**Pros:** Fastest time to first user, easiest to iterate, no customer ops burden for common users.
**Cons:** You bear infrastructure cost, data residency complexity for EU/regulated customers.
**Best for:** Self-serve developers, startups, SMBs, initial traction.

**How users access it:**
- Browser: `https://app.sentinel.dev`
- CLI: `npm install -g @sentinel/cli` (published to npm)
- Extensions: Install from VS Code / JetBrains marketplace

### Option B — Cloud SaaS + Enterprise Self-Hosted (Recommended long-term)

Offer both. SaaS for self-serve. Provide a self-hosted Helm chart / Docker Compose for enterprises with data residency or air-gap requirements.

**Pros:** Covers 100% of the market. Enterprise customers will pay premium for self-hosted.
**Cons:** Two tracks to maintain and support.
**Best for:** Enterprise-focused SaaS.

### Option C — Self-Hosted Only (Open Core)

Release SENTINEL open-source (MIT or Apache 2.0). Charge for an enterprise license that unlocks SSO, SCIM, audit logs, advanced retention, and SLA support.

**Pros:** Viral developer adoption, no cloud cost, GitHub stars as distribution.
**Cons:** Harder to monetize, must maintain OSS community.
**Best for:** Developer-led growth into enterprises.

**Recommendation: Start with Option A (Cloud SaaS), add Option B for enterprise, consider Option C once community is established.**

---

## 3. Phase 1 — Production Infrastructure

### 3.1 Domain & DNS

**Register your domain** (if not done):
- `sentinel.dev` — developer-friendly TLD (Google Registry)
- `getsentinel.io` — alternative
- Register via Cloudflare Registrar (free DNS management + DDoS protection)

**DNS records needed:**
```
app.sentinel.dev      A → your cloud load balancer IP
api.sentinel.dev      A → your API load balancer IP (or CNAME to app)
docs.sentinel.dev     CNAME → your docs hosting (GitBook/Mintlify/Docusaurus)
status.sentinel.dev   CNAME → statuspage.io or BetterUptime
www.sentinel.dev      CNAME → app.sentinel.dev
sentinel.dev          A → marketing site (Vercel/Netlify)
```

**Put Cloudflare in front of everything:**
- Free DDoS protection, WAF rules, bot detection
- Enable "Always Use HTTPS", minimum TLS 1.2, HSTS preload

### 3.2 Cloud Provider Choice

For SaaS hosting, any of these work. Recommendation:

| Tier | Recommendation | Rationale |
|------|---------------|-----------|
| Early stage (0–1k users) | **Railway, Render, or Fly.io** | Zero-ops, deploy from Git, scales to zero |
| Growth (1k–50k users) | **AWS with ECS Fargate or EKS** | Best ecosystem, managed services everywhere |
| Enterprise scale (50k+) | **AWS + GCP dual-region** | Redundancy, data residency options |

**Early-stage recommendation: Start on Railway or Fly.io**
- Deploy the entire stack in one day
- No DevOps hire needed initially
- Migrate to AWS/EKS when you hit the limits (~$2k/mo spend is the signal)

### 3.3 Minimum Production Stack (Early Stage)

```
┌─────────────────────────────────────────────────────────┐
│  Cloudflare (DNS, WAF, DDoS)                            │
└─────────────────────────────────────────────────────────┘
         ↓                          ↓
┌──────────────────┐      ┌──────────────────┐
│  Dashboard       │      │  API             │
│  Next.js 15      │      │  Fastify 5       │
│  (Vercel or      │      │  (Railway /      │
│   Railway)       │      │   Fly.io)        │
└──────────────────┘      └──────────────────┘
                                   ↓
                  ┌────────────────────────────────┐
                  │  Managed PostgreSQL             │
                  │  (Railway / Supabase /          │
                  │   Neon / AWS RDS)               │
                  └────────────────────────────────┘
                                   ↓
                  ┌────────────────────────────────┐
                  │  Managed Redis                  │
                  │  (Railway / Upstash /           │
                  │   AWS ElastiCache)              │
                  └────────────────────────────────┘
                                   ↓
                  ┌────────────────────────────────┐
                  │  Agents (Python)                │
                  │  Containerized workers          │
                  │  (Railway workers /             │
                  │   Fly.io machines)              │
                  └────────────────────────────────┘
```

### 3.4 Environment Variables for Production

Create a secrets manager (AWS Secrets Manager, Railway Variables, Doppler, or 1Password Secrets Automation). Never commit `.env` to git.

Minimum required secrets to change from defaults:

```bash
# === REQUIRED — change all of these ===
POSTGRES_PASSWORD=<64-char random>
SENTINEL_SECRET=<64-char random>        # HMAC signing key
NEXTAUTH_SECRET=<64-char random>        # NextAuth JWT signing
DATABASE_URL=postgresql://sentinel:<password>@<host>:5432/sentinel?sslmode=require
REDIS_URL=redis://:<password>@<host>:6379

# === Auth ===
GITHUB_CLIENT_ID=<from github.com/settings/developers>
GITHUB_CLIENT_SECRET=<from github.com/settings/developers>
NEXTAUTH_URL=https://app.sentinel.dev

# === Email (Transactional) ===
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=<resend API key>
SMTP_FROM=no-reply@sentinel.dev

# === Stripe (Billing) ===
STRIPE_SECRET_KEY=sk_live_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx
STRIPE_PRICE_ID_PRO=price_xxxx
STRIPE_PRICE_ID_ENTERPRISE=price_xxxx

# === LLM (for agents) ===
ANTHROPIC_API_KEY=sk-ant-xxxx

# === Monitoring ===
SENTRY_DSN=https://xxx@sentry.io/xxx
```

### 3.5 Deploy the Dashboard to Vercel (Fastest Option)

```bash
# From the sentinel monorepo root
npx vercel --cwd apps/dashboard

# Set environment variables in Vercel dashboard or CLI:
vercel env add NEXTAUTH_URL production
vercel env add NEXTAUTH_SECRET production
vercel env add GITHUB_CLIENT_ID production
# ... all env vars

# Deploy
vercel --prod --cwd apps/dashboard
```

Vercel automatically handles SSL, CDN, edge caching, and preview deployments per branch.

### 3.6 Deploy the API to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login

# Create project
railway init --name sentinel-api

# Link to your GitHub repo
railway link

# Add environment variables
railway variables set SENTINEL_SECRET=xxx
railway variables set DATABASE_URL=xxx
# ...

# Deploy (Railway auto-detects Dockerfile or builds from package.json)
railway up
```

Railway provides a managed PostgreSQL and Redis you can provision in one click from their dashboard.

### 3.7 Deploy Agents as Background Workers

Each Python agent runs as a separate worker process consuming from Redis Streams.

```dockerfile
# agents/security/Dockerfile (example)
FROM python:3.12-slim
WORKDIR /app
COPY . .
RUN pip install -e ".[all]"
CMD ["python", "-m", "sentinel_security.runner"]
```

Deploy each agent as a background worker in Railway / Fly.io:
- Railway: Add a new service, point to `agents/security`, set start command
- Fly.io: `fly deploy` per agent directory
- All agents share the same Redis URL and DATABASE_URL

---

## 4. Phase 2 — Remove & Replace Mock Data

### 4.1 Audit mock data

Run this to find all mock data in the dashboard:

```bash
grep -r "mock\|placeholder\|TODO\|FIXME\|hardcoded\|lorem\|fake" \
  apps/dashboard/app \
  apps/dashboard/components \
  --include="*.tsx" --include="*.ts" -l
```

### 4.2 What to do with each type of mock

**Category 1 — Mock data in UI components (charts, lists)**

These render sample data when no real data exists. Replace with real API calls.

Pattern to apply:
```tsx
// BEFORE (mock)
const findings = [
  { id: "1", severity: "critical", title: "Mock finding" },
  { id: "2", severity: "high", title: "Another mock" },
];

// AFTER (real)
const { data: findings, isLoading } = useSWR(
  `/api/findings?orgId=${orgId}`,
  fetcher
);
if (isLoading) return <SkeletonLoader />;
if (!findings?.length) return <EmptyState message="No findings yet" />;
```

**Category 2 — Placeholder pages (coming soon / not implemented)**

Either implement them before launch or hide them behind a feature flag:

```tsx
// Feature flag pattern
const FEATURES = {
  aiMetrics: process.env.NEXT_PUBLIC_FEATURE_AI_METRICS === "true",
  drift: process.env.NEXT_PUBLIC_FEATURE_DRIFT === "true",
};

// In sidebar nav — only show enabled features
{FEATURES.aiMetrics && <NavItem href="/ai-metrics" label="AI Metrics" />}
```

**Category 3 — TODO comments in API routes**

Every `// TODO` in an API route that is user-facing must be resolved before launch:

```bash
grep -r "TODO\|FIXME" apps/api/src --include="*.ts" | grep -v "__tests__"
```

Triage each:
- Implement it (preferred)
- Return a clear 501 Not Implemented with a message if genuinely deferred
- Never leave silent no-ops in production routes

### 4.3 Empty states vs. mock data

**Keep empty states** — they are correct behavior when an org has no data yet.

```tsx
// Good: real empty state
<EmptyState
  icon={<ShieldIcon />}
  title="No findings yet"
  description="Run your first scan to see results here."
  action={<Button onClick={() => router.push('/docs/quickstart')}>Run First Scan</Button>}
/>
```

**Remove demo/seed data** that auto-populates on fresh org creation. If you want to demo the product, create a separate `demo` org that is reset nightly, or use a dedicated demo environment.

### 4.4 Database seeding strategy

```
Development:  pnpm db:seed  (creates fake data for local testing)
Staging:      pnpm db:seed:staging  (creates a realistic dataset for QA)
Production:   NO seed data — orgs start empty
Demo env:     pnpm db:seed:demo  (resets nightly via cron)
```

---

## 5. Phase 3 — Publish Packages & Extensions

Users can only install your CLI and extensions if they are published to the right registries. This is critical for accessibility.

### 5.1 Publish CLI to npm

```bash
cd apps/cli

# 1. Update package.json
#    "name": "@sentinel/cli"
#    "version": "1.0.0"
#    "publishConfig": { "access": "public" }
#    "repository": { "url": "https://github.com/archagents/sentinel" }
#    "homepage": "https://sentinel.dev"
#    "bin": { "sentinel": "./dist/cli.js" }

# 2. Build
pnpm build

# 3. Login to npm (use your npm account or org)
npm login
# Or for organization packages:
npm login --scope=@sentinel

# 4. Publish
npm publish --access public

# 5. Verify
npm info @sentinel/cli
```

**After publishing, users install with:**
```bash
npm install -g @sentinel/cli
# or
npx @sentinel/cli init
```

**Set up automated publishing** via GitHub Actions on git tag:

```yaml
# .github/workflows/publish-cli.yml
name: Publish CLI
on:
  push:
    tags: ['cli/v*']
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
      - run: pnpm install && pnpm build --filter=@sentinel/cli
      - run: npm publish --access public
        working-directory: apps/cli
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### 5.2 Publish VS Code Extension

```bash
# 1. Install VSCE (VS Code Extension publisher)
npm install -g @vscode/vsce

# 2. Create publisher account at https://marketplace.visualstudio.com/manage
#    Publisher name: sentinel-dev (or your org name)

# 3. Update extensions/vscode/package.json:
#    "publisher": "sentinel-dev"
#    "name": "sentinel-security"
#    "displayName": "SENTINEL Security"
#    "version": "1.0.0"
#    "engines": { "vscode": "^1.85.0" }
#    "repository": { "url": "https://github.com/archagents/sentinel" }

# 4. Add icon (128x128 PNG)
#    "icon": "images/icon.png"

# 5. Package
vsce package

# 6. Publish
vsce publish
# Requires a PAT from https://dev.azure.com (same account as marketplace)

# 7. Verify
# https://marketplace.visualstudio.com/items?itemName=sentinel-dev.sentinel-security
```

**After publishing, users install with:**
```
Ctrl+Shift+X → search "SENTINEL Security" → Install
```

Or via terminal:
```bash
code --install-extension sentinel-dev.sentinel-security
```

### 5.3 Publish JetBrains Plugin

```bash
# 1. Create plugin project in IntelliJ or use existing extensions/jetbrains/

# 2. Create account at https://plugins.jetbrains.com/
#    Organization: Archagents

# 3. Update plugin.xml:
#    <id>dev.sentinel.security</id>
#    <name>SENTINEL Security</name>
#    <vendor url="https://sentinel.dev">Archagents</vendor>

# 4. Build plugin
./gradlew buildPlugin

# 5. Upload to Jetbrains Marketplace
#    https://plugins.jetbrains.com/plugin/add (manual upload)
#    Or via Gradle:
./gradlew publishPlugin -Pplugin.marketplace.token=YOUR_TOKEN
```

### 5.4 Publish Azure DevOps Extension

```bash
# Already have extensions/azure-devops/ — needs publishing

# 1. Install TFX CLI
npm install -g tfx-cli

# 2. Create publisher at https://marketplace.visualstudio.com/manage
#    Publisher ID: sentinel-dev

# 3. Update vss-extension.json:
#    "publisher": "sentinel-dev"
#    "version": "1.0.0"

# 4. Package
tfx extension create --manifest-globs vss-extension.json

# 5. Publish
tfx extension publish \
  --manifest-globs vss-extension.json \
  --token <PAT from Azure DevOps>

# 6. Share with Azure DevOps organizations
#    Initially share as private, then make public
tfx extension share --publisher sentinel-dev --extension-id sentinel-scan --share-with myorg
```

### 5.5 Publish Helm Chart

```bash
# 1. Create a GitHub Pages branch for the chart repo
git checkout --orphan gh-pages
git rm -rf .
mkdir -p charts

# 2. Package and index
helm package deploy/helm/sentinel -d charts/
helm repo index charts/ --url https://charts.sentinel.dev

# 3. Or use GitHub Container Registry (OCI)
helm push sentinel-1.0.0.tgz oci://ghcr.io/archagents/charts

# 4. Users install with:
helm repo add sentinel https://charts.sentinel.dev
helm install sentinel sentinel/sentinel
```

### 5.6 Publish Docker Images

```bash
# 1. Login to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# 2. Build and tag
docker build -t ghcr.io/archagents/sentinel-api:1.0.0 -f apps/api/Dockerfile .
docker build -t ghcr.io/archagents/sentinel-dashboard:1.0.0 -f apps/dashboard/Dockerfile .
docker build -t ghcr.io/archagents/sentinel-agent-security:1.0.0 -f agents/security/Dockerfile .

# 3. Push
docker push ghcr.io/archagents/sentinel-api:1.0.0
docker push ghcr.io/archagents/sentinel-dashboard:1.0.0

# 4. Also push to Docker Hub for discoverability
docker tag ghcr.io/archagents/sentinel-api:1.0.0 archagents/sentinel-api:1.0.0
docker push archagents/sentinel-api:1.0.0
```

---

## 6. Phase 4 — Auth, Billing & Onboarding

### 6.1 Public Signup Flow

Currently, there is no self-serve org creation. You need to build:

**Pages to create:**
```
/signup              — Email + password or GitHub OAuth
/signup/verify       — Email verification
/onboarding/org      — Create organization name, plan selection
/onboarding/invite   — Invite teammates
/onboarding/vcs      — Connect GitHub/GitLab
/onboarding/scan     — Run first scan (guided)
```

**Flow:**

```
User lands on sentinel.dev
    ↓
Clicks "Start Free" → /signup
    ↓
Signs up with GitHub OAuth (fastest) or email+password
    ↓
Email verification sent (if email signup)
    ↓
/onboarding/org  — enter org name → create Organization in DB
    ↓
/onboarding/invite  — invite teammates (optional, skip-able)
    ↓
/onboarding/vcs  — install GitHub App or connect GitLab
    ↓
/onboarding/scan  — copy `sentinel init` + API key, run first scan
    ↓
/  — Dashboard overview (first scan results visible)
```

### 6.2 Transactional Email

Install Resend (easiest for Next.js) or SendGrid:

```bash
npm install resend
```

```typescript
// apps/api/src/email/send.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendVerificationEmail(email: string, token: string) {
  await resend.emails.send({
    from: 'SENTINEL <no-reply@sentinel.dev>',
    to: email,
    subject: 'Verify your SENTINEL account',
    html: `<p>Click to verify: <a href="https://app.sentinel.dev/verify?token=${token}">Verify Email</a></p>`,
  });
}

export async function sendInviteEmail(email: string, orgName: string, inviteToken: string) {
  await resend.emails.send({
    from: 'SENTINEL <no-reply@sentinel.dev>',
    to: email,
    subject: `You've been invited to ${orgName} on SENTINEL`,
    html: `<p>Accept your invitation: <a href="https://app.sentinel.dev/invite?token=${inviteToken}">Join ${orgName}</a></p>`,
  });
}
```

**Emails needed at launch:**
- Welcome / email verification
- Teammate invite
- Password reset
- New finding alert digest (daily/weekly)
- Certificate expiry warning (7 days before)
- Report delivery
- Billing receipts (via Stripe)

### 6.3 Billing with Stripe

**Pricing model recommendation:**

| Plan | Price | Limits | Target |
|------|-------|--------|--------|
| Free | $0/mo | 3 projects, 100 scans/mo, 1 user | Individuals, open source |
| Pro | $49/mo | Unlimited projects, 2k scans/mo, 10 users | Small teams |
| Business | $199/mo | Unlimited scans, 50 users, SSO, SCIM | Growing companies |
| Enterprise | Custom | Unlimited, SLA, self-hosted option, dedicated support | Large orgs |

**Implementation:**

```bash
npm install stripe @stripe/stripe-js
```

```typescript
// apps/api/src/billing/stripe.ts
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function createCheckoutSession(orgId: string, priceId: string) {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `https://app.sentinel.dev/settings/billing?success=true`,
    cancel_url: `https://app.sentinel.dev/settings/billing`,
    metadata: { orgId },
  });
  return session.url;
}

export async function handleWebhook(payload: Buffer, sig: string) {
  const event = stripe.webhooks.constructEvent(
    payload, sig, process.env.STRIPE_WEBHOOK_SECRET!
  );

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      // Update org plan in database
      break;
    case 'customer.subscription.deleted':
      // Downgrade org to free
      break;
    case 'invoice.payment_failed':
      // Send payment failure email, suspend after grace period
      break;
  }
}
```

**Stripe webhook endpoint:** `POST /v1/billing/webhook`

**Dashboard pages to add:**
- `/settings/billing` — current plan, usage, upgrade/downgrade
- `/settings/billing/upgrade` — plan comparison, checkout
- `/settings/billing/invoices` — invoice history

### 6.4 Usage Limits Enforcement

Add middleware to enforce plan limits:

```typescript
// apps/api/src/middleware/plan-limits.ts
export async function enforcePlanLimits(req, reply) {
  const org = await db.organization.findUnique({ where: { id: req.orgId } });
  const plan = org.plan; // 'free' | 'pro' | 'business' | 'enterprise'

  const limits = {
    free:       { scansPerMonth: 100, projects: 3, users: 1 },
    pro:        { scansPerMonth: 2000, projects: Infinity, users: 10 },
    business:   { scansPerMonth: Infinity, projects: Infinity, users: 50 },
    enterprise: { scansPerMonth: Infinity, projects: Infinity, users: Infinity },
  };

  const currentUsage = await getMonthlyUsage(org.id);
  if (currentUsage.scans >= limits[plan].scansPerMonth) {
    return reply.status(402).send({ error: 'Scan limit reached. Upgrade your plan.' });
  }
}
```

---

## 7. Phase 5 — Legal & Compliance Foundations

**Do not skip this. Legal issues can shut down your product.**

### 7.1 Documents to create before public launch

| Document | Purpose | Who writes it |
|----------|---------|---------------|
| Terms of Service | User agreement, acceptable use, liability | You + lawyer |
| Privacy Policy | GDPR/CCPA data handling disclosure | You + lawyer |
| Data Processing Agreement (DPA) | GDPR Article 28 — enterprise requirement | Template + lawyer |
| Cookie Policy | Cookie consent (GDPR) | You |
| Security Policy | Responsible disclosure, CVE handling | You |
| SLA (for paid plans) | Uptime guarantees, support response times | You |
| BAA (Business Associate Agreement) | If any customer is covered by HIPAA | Lawyer |

**Resources:**
- Use Clerky or Stripe Atlas for fast legal formation
- Use Termly or iubenda for Privacy Policy and Cookie Policy generators (fast, cheap)
- Use Bonterms for OSS-friendly DPA templates
- For enterprise custom contracts, use Ironclad or DocuSign CLM

### 7.2 Pages to add to the dashboard/website

```
/legal/terms          Terms of Service
/legal/privacy        Privacy Policy
/legal/dpa            Data Processing Agreement
/legal/security       Security Policy + responsible disclosure
/legal/cookies        Cookie Policy
/legal/sla            Service Level Agreement
```

### 7.3 Cookie consent banner

GDPR requires opt-in consent for non-essential cookies in the EU.

```bash
npm install @cookie-consent/react
# or use Cookieyes, Osano, or Termly's script
```

### 7.4 GDPR operational requirements

- Add data subject rights request form (`/legal/data-request`)
- Respond to deletion requests within 30 days
- Data Processing Register (internal spreadsheet of all data you process)
- Sub-processor list published on website
- Breach notification procedure (notify DPA within 72 hours)
- Privacy by default: new orgs start with minimal data collection

### 7.5 US compliance

- If US customers: ensure CCPA compliance (California Consumer Privacy Act)
- Add "Do Not Sell My Personal Information" link in footer
- SOC 2 Type II is the enterprise sales entry ticket (see Phase 14)

---

## 8. Phase 6 — Security Hardening

The product has solid internal security (HMAC auth, RBAC, SCIM, encryption at rest) but needs production hardening.

### 8.1 Application security checklist

```
[ ] All secrets in secrets manager (not .env files in containers)
[ ] HTTPS enforced everywhere (HSTS header, Cloudflare redirect)
[ ] TLS 1.2 minimum, TLS 1.3 preferred
[ ] Security headers on all responses:
    Content-Security-Policy
    X-Content-Type-Options: nosniff
    X-Frame-Options: SAMEORIGIN
    Referrer-Policy: strict-origin-when-cross-origin
    Permissions-Policy
[ ] Rate limiting on auth endpoints (login, signup, password reset)
[ ] CORS restricted to app domains only
[ ] Database: connection pool with TLS, read replicas for queries
[ ] Redis: AUTH password, TLS, not publicly accessible
[ ] Container images: non-root user, no shell, read-only filesystem
[ ] Dependency scanning: run Dependabot or Snyk on the SENTINEL repo itself
[ ] SBOM generated for each release
[ ] Secret scanning: GitHub Advanced Security or GitGuardian on the repo
[ ] Pen test before launch (can use Cobalt or Synack for SMB pricing)
```

### 8.2 Responsible disclosure program

Set up a vulnerability disclosure policy before going public:

```markdown
# Security Policy (SECURITY.md)

## Reporting a Vulnerability

Email security@sentinel.dev with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

We will respond within 48 hours and aim to patch critical issues within 7 days.
We do not currently offer a bug bounty, but we will credit researchers
who responsibly disclose vulnerabilities.
```

Publish at `https://sentinel.dev/.well-known/security.txt` as well.

### 8.3 Automated dependency updates

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
    groups:
      security:
        applies-to: security-updates
        update-types: ["patch", "minor", "major"]
  - package-ecosystem: pip
    directory: "/agents/security"
    schedule:
      interval: weekly
  - package-ecosystem: docker
    directory: "/"
    schedule:
      interval: weekly
```

---

## 9. Phase 7 — Observability & Operations

You cannot run a production SaaS without knowing when things break.

### 9.1 Error tracking — Sentry

```bash
npm install @sentry/nextjs @sentry/node
```

```typescript
// apps/api/src/server.ts
import * as Sentry from '@sentry/node';
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,  // 10% of transactions
});
```

Every unhandled error, API 5xx, and slow query is tracked automatically. You get alerted before users report issues.

### 9.2 Uptime monitoring

- **BetterUptime** or **UptimeRobot**: ping `/health` every 60 seconds
- Status page: `https://status.sentinel.dev` (public-facing, auto-updates from monitor)
- Alert channels: PagerDuty for on-call, Slack for info

### 9.3 Application metrics

The app already has Prometheus metrics support in the deploy stack. Add dashboards:

```yaml
# Grafana dashboards to create:
- API request rate, latency (p50/p95/p99), error rate
- Scan queue depth (Redis Streams pending messages)
- Agent processing time per agent type
- Database connection pool usage
- Active users per hour (for billing/capacity planning)
- LLM token usage and cost per hour
```

### 9.4 Log aggregation

```
Options:
  Free tier:   Logtail (Better Stack) — 1GB/day free
  Paid:        Datadog, New Relic, Grafana Cloud
  Self-hosted: Loki + Grafana
```

Configure the API to output structured JSON logs (already does this via pino). Ship to your log aggregator.

### 9.5 Health check endpoints

The API already has `/health`. Ensure it checks:
- Database connectivity
- Redis connectivity
- Agent worker liveness (last heartbeat < 60s)

```typescript
// apps/api/src/routes/health.ts
app.get('/health', async (req, reply) => {
  const db = await checkDatabase();
  const redis = await checkRedis();
  const status = db.ok && redis.ok ? 200 : 503;
  return reply.status(status).send({ db, redis, version: '1.0.0' });
});
```

---

## 10. Phase 8 — Backup, DR & Business Continuity

### 10.1 Database backups

```bash
# Automated daily backups to S3
# If using Railway/Supabase/Neon — this is built-in

# If self-managed:
# pg_dump + upload to S3 via cron
0 2 * * * pg_dump $DATABASE_URL | gzip | aws s3 cp - s3://sentinel-backups/postgres/$(date +%Y-%m-%d).sql.gz
```

**Retention policy for backups:**
- Daily: keep 30 days
- Weekly: keep 12 weeks
- Monthly: keep 12 months

**Test restores monthly.** An untested backup is not a backup.

### 10.2 Disaster recovery targets

| Metric | Target |
|--------|--------|
| RTO (Recovery Time Objective) | < 4 hours |
| RPO (Recovery Point Objective) | < 1 hour (last backup) |
| Uptime SLA | 99.9% (8.7h downtime/year) |

### 10.3 Business continuity checklist

```
[ ] Runbook for each failure scenario (DB down, Redis down, agent stuck)
[ ] On-call rotation (even if it's just you + one other person)
[ ] Incident response procedure (how to communicate with customers)
[ ] Status page auto-updates on incident detection
[ ] Customer notification template for major incidents
[ ] Data export API for customers (right to portability — GDPR Art. 20)
```

---

## 11. Phase 9 — Deploy Pipeline for SENTINEL Itself

The product that enforces CI/CD governance should itself have excellent CI/CD.

### 11.1 GitHub Actions pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy SENTINEL

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install && pnpm turbo test

  # Self-scan: SENTINEL scans its own code on every push
  sentinel-self-scan:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - run: npm install -g @sentinel/cli
      - run: git diff HEAD~1 HEAD | sentinel ci --api-url ${{ secrets.SENTINEL_API_URL }} --fail-on critical
        env:
          SENTINEL_API_KEY: ${{ secrets.SENTINEL_API_KEY }}
          SENTINEL_SECRET: ${{ secrets.SENTINEL_SECRET }}

  deploy-api:
    needs: [test, sentinel-self-scan]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy API to Railway
        run: railway up --service api
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

  deploy-dashboard:
    needs: [test, sentinel-self-scan]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy Dashboard to Vercel
        run: vercel --prod --token ${{ secrets.VERCEL_TOKEN }} --cwd apps/dashboard
```

### 11.2 Environment promotion strategy

```
Developer pushes code
    ↓
preview.sentinel.dev  (auto-deploy per PR — Vercel preview)
    ↓
staging.sentinel.dev  (auto-deploy on merge to main — staging environment)
    ↓
app.sentinel.dev      (manual promotion after staging validation)
```

---

## 12. Phase 10 — Beta Program & Waitlist

Do not open to all users on day one. A controlled beta lets you fix problems before they affect paying customers at scale.

### 12.1 Set up a waitlist

Options:
- **Tally.so** (free): embed a waitlist form on your marketing site
- **Waitlisted.co**: waitlist with referral mechanics (viral growth)
- **Launch Darkly / Flagsmith**: feature flags to gradually enable access

```html
<!-- On sentinel.dev landing page -->
<form action="https://formspree.io/f/xxx" method="POST">
  <input type="email" name="email" placeholder="your@email.com" required />
  <input type="text" name="company" placeholder="Company name" />
  <button type="submit">Request Early Access</button>
</form>
```

### 12.2 Beta invite flow

1. Collect signups on waitlist
2. Send invites in batches of 50–100 every 2 weeks
3. Each invite has a unique token that bypasses the waitlist gate
4. Beta users get:
   - Free Pro plan during beta
   - Direct Slack/Discord channel with founders
   - 30-minute onboarding call

### 12.3 Beta feedback loop

- Embed Canny.io or Linear feedback widget in the dashboard
- Weekly "how was your week with SENTINEL?" email (Typeform survey)
- Monitor Sentry errors from beta users, prioritize fixes
- Track activation metric: "user ran their first scan within 7 days of signup"

---

## 13. Phase 11 — Launch Channels & Distribution

Where to launch and how to reach users.

### 13.1 Developer community launches

**Product Hunt**
- Prepare: hunter outreach, upvote squad, teaser posts 2 weeks before
- Launch on a Tuesday–Thursday (highest traffic)
- Product: "SENTINEL — AI-Generated Code Governance for Enterprise Teams"
- Tagline: "Automatically audit, certify, and govern AI-generated code at every commit"
- Assets needed: logo, 3-5 screenshots, 60s demo video, founding story

**Hacker News (Show HN)**
```
Show HN: SENTINEL – We built a compliance certificate system for AI-generated code

We've been building AI-generated code governance tooling for 6 months.
The problem: teams using Copilot, Claude, and Cursor have no way to audit
what percentage of their codebase is AI-generated, whether it contains
vulnerabilities, or whether it meets license compliance requirements.

SENTINEL scans every commit through 7 analysis agents (security, dependency,
license, quality, policy, AI-detection, LLM-review) and issues a cryptographically
signed compliance certificate per commit.

We're open to feedback. Happy to answer any questions.

https://sentinel.dev
```

**Reddit**
- r/devops: focus on CI/CD integration angle
- r/netsec: security scanning focus
- r/programming: AI code governance angle

### 13.2 Content marketing

Write and publish before launch:
- "Why AI-generated code needs a compliance layer" (blog post, 2000 words)
- "How we built cryptographic compliance certificates for git commits" (technical deep-dive)
- "SOC 2 and AI Code: What auditors are starting to ask" (compliance-focused)
- "The 7 things SENTINEL scans for in every commit" (product-focused)

Publish on: Sentinel blog, dev.to, Hashnode, Medium

### 13.3 Ecosystem distribution

**GitHub Marketplace:**
- List the GitHub Action: `archagents/sentinel-scan`
- List the GitHub App: install from `github.com/marketplace/sentinel-security`

**VS Code Marketplace:**
- After publishing extension, submit for "Featured" consideration
- Add badge to README: `[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/sentinel-dev.sentinel-security)](https://marketplace.visualstudio.com/items?itemName=sentinel-dev.sentinel-security)`

**JetBrains Marketplace:**
- Submit to "Editor" and "Security" categories

**Azure DevOps Marketplace:**
- Already have the extension — publish and submit for "Featured" consideration

**Vercel Integration Marketplace:**
- Build a Vercel integration that auto-runs SENTINEL on every Vercel deployment

### 13.4 Developer influencer outreach

Target developers with YouTube channels / newsletters covering:
- AI coding tools (Copilot, Cursor, Claude Code reviews)
- DevSecOps / application security
- Platform engineering

Offer: free Business plan + hands-on demo call.

Examples of channels/newsletters to target:
- Fireship (YouTube)
- The Pragmatic Engineer newsletter
- TLDR DevOps newsletter
- DevSecCon community

### 13.5 Community building

Create before launch:
- **Discord server** for SENTINEL community (use Discord invite link in README)
- **GitHub Discussions** for feature requests and Q&A
- **Twitter/X account** `@sentineldev`
- **LinkedIn page** for enterprise buyers

---

## 14. Phase 12 — Support Infrastructure

You need to handle user questions before launch, not after.

### 14.1 Documentation site

Do not just use the GitHub README. Create a dedicated docs site.

**Recommended: Mintlify** (free for open source, $150/mo for teams)
```bash
npm install -g mintlify
mintlify init  # creates docs.json and starter pages
mintlify dev   # preview at localhost:3000
```

Deploy to `docs.sentinel.dev` automatically from GitHub.

Docs structure:
```
Getting Started
  ├── Quickstart (5 minutes)
  ├── Install CLI
  ├── First Scan
  └── Dashboard Walkthrough

Integrations
  ├── GitHub Actions
  ├── GitLab CI
  ├── Azure Pipelines
  ├── Jenkins
  └── VS Code Extension

Configuration
  ├── Environment Variables
  ├── Scan Policies
  ├── Retention Policies
  └── SSO Setup

API Reference (auto-generated from openapi.yaml)

Self-Hosting
  ├── Docker Compose
  ├── Kubernetes / Helm
  ├── AWS EKS
  ├── GKE
  └── Azure AKS
```

**Use the existing openapi.yaml to auto-generate API docs:**
```bash
# Mintlify auto-imports OpenAPI spec
# Add to mint.json:
{
  "openapi": "docs/api/openapi.yaml"
}
```

### 14.2 In-app support

- **Intercom** or **Plain.com**: live chat widget in dashboard (free tiers available)
- **Crisp**: free tier, good for early-stage

```html
<!-- In apps/dashboard/app/layout.tsx -->
<script>
  window.$crisp=[];
  window.CRISP_WEBSITE_ID="your-crisp-id";
  (function(){ var d=document; var s=d.createElement("script");
  s.src="https://client.crisp.chat/l.js"; s.async=1;
  d.getElementsByTagName("head")[0].appendChild(s); })();
</script>
```

### 14.3 Support tiers

| Plan | Support Channel | Response Time |
|------|-----------------|---------------|
| Free | Community Discord | Best effort |
| Pro | Email | 48 hours |
| Business | Email + Chat | 24 hours |
| Enterprise | Dedicated Slack + Phone | 4 hours (critical: 1 hour) |

---

## 15. Phase 13 — Enterprise Sales Motion

Enterprise deals ($20k–$500k/year) require a different motion than self-serve.

### 15.1 Enterprise requirements checklist

Enterprise buyers (Fortune 500, regulated industries) will ask for:

```
[ ] SOC 2 Type II report (or Type I to start)
[ ] GDPR compliance + DPA
[ ] Penetration test report (last 12 months)
[ ] Security questionnaire responses (SIG Lite, CAIQ, or custom)
[ ] ISO 27001 roadmap (or certification for top-tier)
[ ] Single Sign-On (SAML/OIDC) — ALREADY BUILT
[ ] SCIM provisioning — ALREADY BUILT
[ ] Audit logs export — ALREADY BUILT
[ ] Custom data residency / self-hosted option
[ ] Uptime SLA with financial penalties
[ ] Enterprise Support SLA
[ ] Custom contract / MSA negotiation
[ ] Data Processing Agreement
[ ] Reference customers (3 logos, same industry)
```

### 15.2 Enterprise pricing

Enterprise deals are custom-priced based on:
- Number of developers
- Number of scans per month
- Self-hosted vs. cloud
- SLA requirements
- Data residency requirements

Starting price anchor: **$2,000/month (=$24k/year)** for up to 50 developers.

Use a "Talk to Sales" CTA for enterprise (no self-serve checkout). This lets you qualify leads and customize pricing.

### 15.3 Sales assets to create

```
[ ] 3-slide "elevator pitch" deck
[ ] Full 15-slide sales deck with ROI story
[ ] 1-page technical overview PDF
[ ] ROI calculator (how much does a security breach cost vs. SENTINEL?)
[ ] Customer case study (write one with a beta customer)
[ ] Security questionnaire (pre-filled answers in a spreadsheet)
[ ] Demo environment with realistic data (resets nightly)
```

### 15.4 Early enterprise strategy

1. Reach out to 20 companies in your network directly (warm outreach converts 5–10x better than cold)
2. Offer free 90-day pilot in exchange for:
   - A reference call with the next prospect
   - Permission to use their logo
   - Feedback on missing enterprise features
3. Use pilots to identify the killer enterprise use case (compliance report automation? SOC 2 acceleration?)

---

## 16. Phase 14 — SOC 2 Type I Certification

SOC 2 is the #1 enterprise sales unblocker. Without it, enterprise legal/security teams will kill the deal.

### 16.1 Start immediately — it takes 3–9 months

**Type I**: Point-in-time assessment. Proves controls are *designed* correctly. Can be achieved in 3–4 months. Costs $10k–$30k.

**Type II**: Period-of-time assessment (typically 6 months). Proves controls are *operating* correctly. Required for most enterprise deals. Costs $20k–$50k.

**Strategy:** Aim for Type I within 6 months of launch. Start Type II audit period immediately after Type I.

### 16.2 SOC 2 readiness tools

Use Vanta, Drata, or Secureframe to automate evidence collection:

- **Vanta** ($10k–$20k/year): connects to AWS, GitHub, GSuite, etc. and auto-collects evidence
- **Drata** (similar pricing): strong Slack integrations, good dashboards
- **Secureframe** (cheaper for small teams): good for Series A-stage

These tools cut SOC 2 prep time from 9 months to 3–4 months.

### 16.3 SENTINEL's advantage

SENTINEL is a compliance tool — its own audit log, certificate history, and evidence collection mean it can document many of its own SOC 2 controls. Use SENTINEL to monitor SENTINEL.

```
SOC 2 CC7 (System Monitoring):
  Evidence: SENTINEL's own scan history of the SENTINEL codebase
  100% of commits to the production repo are scanned
  Certificate history available for auditor review
```

### 16.4 Estimated SOC 2 timeline

| Month | Activity |
|-------|----------|
| Month 1 | Select auditor (Prescient Assurance, Johanson Group, A-LIGN recommended for startups) |
| Month 1 | Onboard Vanta/Drata, connect all systems |
| Month 1–2 | Establish required policies (access control, incident response, etc.) |
| Month 2–3 | Implement missing controls identified by gap assessment |
| Month 3–4 | Type I readiness assessment |
| Month 4 | Type I audit fieldwork |
| Month 5 | Receive SOC 2 Type I report |
| Month 5–11 | Type II observation period (6 months minimum) |
| Month 12 | Type II audit fieldwork |
| Month 13 | Receive SOC 2 Type II report |

---

## 17. Launch Readiness Checklist

Go through this before opening to any public users.

### Must-have (launch blockers)

```
Infrastructure
[ ] Production domain configured with SSL
[ ] All "CHANGE_ME" secrets replaced with strong random values
[ ] Database backups configured and tested
[ ] Monitoring and alerting active (Sentry + uptime monitor)
[ ] Health check endpoints responding

Application
[ ] No mock data visible to users (empty states instead)
[ ] Email sending works (invite, verification, password reset)
[ ] Signup + org creation flow tested end-to-end
[ ] Billing integration (Stripe) tested in live mode
[ ] Rate limiting active on auth endpoints
[ ] All TODO/FIXME in user-facing API routes resolved

Packages
[ ] CLI published to npm and installable: npm install -g @sentinel/cli
[ ] Docker images published to GitHub Container Registry

Legal
[ ] Terms of Service published
[ ] Privacy Policy published
[ ] Cookie consent banner live
[ ] GDPR data request process documented

Security
[ ] HTTPS enforced, HSTS enabled
[ ] Security headers present on all responses
[ ] Pen test or self-assessment completed
[ ] Responsible disclosure policy published
[ ] Secrets not in code or logs

Support
[ ] Docs site live at docs.sentinel.dev
[ ] Support email monitored (support@sentinel.dev)
[ ] Status page live at status.sentinel.dev
```

### Nice-to-have (do soon after launch)

```
[ ] VS Code extension published
[ ] JetBrains plugin published
[ ] Azure DevOps extension public
[ ] Helm chart published to public chart repo
[ ] SOC 2 process started
[ ] Product Hunt launch prepared
[ ] Blog post published
[ ] GitHub Action listed on GitHub Marketplace
```

---

## 18. Cost Estimates

### Early stage (0–500 users)

| Service | Cost/month |
|---------|-----------|
| Railway (API + Workers) | $20–$50 |
| Vercel (Dashboard) | $0–$20 |
| Railway PostgreSQL | $5–$25 |
| Railway Redis | $5–$10 |
| Resend (Email) | $0–$20 |
| Cloudflare (DNS + WAF) | $0–$20 |
| Sentry (Error tracking) | $0–$26 |
| BetterUptime (Monitoring) | $0–$20 |
| Anthropic API (LLM agents) | $50–$300 |
| **Total** | **~$80–$500/mo** |

### Growth stage (500–5,000 users)

| Service | Cost/month |
|---------|-----------|
| AWS ECS/EKS | $500–$2,000 |
| RDS PostgreSQL (Multi-AZ) | $200–$600 |
| ElastiCache Redis | $100–$300 |
| CloudFront CDN | $20–$100 |
| Vanta (SOC 2) | $800–$1,500 |
| Intercom (Support) | $74–$400 |
| Datadog / Grafana Cloud | $50–$300 |
| Anthropic API (LLM agents) | $300–$3,000 |
| **Total** | **~$2,000–$8,000/mo** |

At $49/mo Pro plan: break even at ~40–160 paying users.

---

## 19. Recommended Timeline

| Week | Activity |
|------|----------|
| **Week 1–2** | Deploy to Railway/Vercel. Replace all mock data. Set up monitoring. |
| **Week 3–4** | Build signup/onboarding flow. Integrate Stripe. Publish CLI to npm. |
| **Week 5–6** | Legal docs (ToS, Privacy Policy). Security hardening. Implement missing agents (License, Quality). |
| **Week 7–8** | Beta waitlist opens. Invite first 50 users. Set up docs site. |
| **Week 9–10** | Beta feedback iteration. Fix top 10 issues. Publish VS Code extension. |
| **Week 11–12** | Product Hunt launch. Hacker News post. Blog posts live. |
| **Month 4** | GitHub Marketplace listing. Azure DevOps extension public. Helm chart published. |
| **Month 5** | Start SOC 2 Type I process. First enterprise pilot. |
| **Month 9** | SOC 2 Type I report in hand. Active enterprise sales. |
| **Month 13** | SOC 2 Type II report. ISO 27001 roadmap. |

---

## Summary: The Shortest Path to First Paying User

1. **Register `sentinel.dev`** (or similar) — 1 day
2. **Deploy to Railway + Vercel** — 1 day
3. **Replace mock data with empty states** — 2–3 days
4. **Build signup flow + email verification** — 3–5 days
5. **Add Stripe (Free + Pro plans)** — 3–5 days
6. **Publish `@sentinel/cli` to npm** — 2 hours
7. **Write ToS + Privacy Policy** (use generator) — 1 day
8. **Set up Cloudflare, SSL, health checks** — 1 day
9. **Set up Sentry + BetterUptime** — 2 hours
10. **Open waitlist, invite 10 friends/colleagues** — 1 day

**Total: ~3–4 weeks of focused work to go from local to first real user.**

The infrastructure is built. The product works. The gap between "working locally" and "users can sign up" is almost entirely non-product work: deployment, billing, legal, and packaging. None of it is technically hard — it just requires executing each step.

---

*Document version: 1.0 — March 2026. Pricing, service availability, and regulatory requirements change over time. Verify current pricing for all third-party services before committing.*
