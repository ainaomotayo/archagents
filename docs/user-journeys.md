# SENTINEL User Journeys

A comprehensive reference of every user type, entry point, and end-to-end scenario in the SENTINEL platform.

---

## Table of Contents

1. [User Personas](#1-user-personas)
2. [Entry Points Overview](#2-entry-points-overview)
3. [Journey 1 — Developer: First-Time Setup (Local Dev)](#3-journey-1--developer-first-time-setup-local-dev)
4. [Journey 2 — Developer: Daily Workflow with Git Hooks](#4-journey-2--developer-daily-workflow-with-git-hooks)
5. [Journey 3 — Developer: VS Code Extension](#5-journey-3--developer-vs-code-extension)
6. [Journey 4 — Developer: JetBrains Plugin (IntelliJ / PyCharm / WebStorm)](#6-journey-4--developer-jetbrains-plugin)
7. [Journey 5 — Developer: Claude Code AI Assistant](#7-journey-5--developer-claude-code-ai-assistant)
8. [Journey 6 — DevOps: GitHub Actions CI/CD Integration](#8-journey-6--devops-github-actions-cicd-integration)
9. [Journey 7 — DevOps: GitLab CI/CD Integration](#9-journey-7--devops-gitlab-cicd-integration)
10. [Journey 8 — DevOps: Azure Pipelines Integration](#10-journey-8--devops-azure-pipelines-integration)
11. [Journey 9 — DevOps: Jenkins Integration](#11-journey-9--devops-jenkins-integration)
12. [Journey 10 — DevOps: Bitbucket Pipelines Integration](#12-journey-10--devops-bitbucket-pipelines-integration)
13. [Journey 11 — Security Engineer: Findings Triage & Remediation](#13-journey-11--security-engineer-findings-triage--remediation)
14. [Journey 12 — Security Engineer: Gap Analysis & Heatmap](#14-journey-12--security-engineer-gap-analysis--heatmap)
15. [Journey 13 — Security Engineer: Drift Detection](#15-journey-13--security-engineer-drift-detection)
16. [Journey 14 — Compliance Officer: SOC 2 Attestation Workflow](#16-journey-14--compliance-officer-soc-2-attestation-workflow)
17. [Journey 15 — Compliance Officer: EU AI Act Compliance Wizard](#17-journey-15--compliance-officer-eu-ai-act-compliance-wizard)
18. [Journey 16 — Compliance Officer: Automated Compliance Reports](#18-journey-16--compliance-officer-automated-compliance-reports)
19. [Journey 17 — Engineering Manager: Team Risk Overview & Approvals](#19-journey-17--engineering-manager-team-risk-overview--approvals)
20. [Journey 18 — Admin: Organization Onboarding & SSO Setup](#20-journey-18--admin-organization-onboarding--sso-setup)
21. [Journey 19 — Admin: SCIM Provisioning (Okta / Azure AD)](#21-journey-19--admin-scim-provisioning)
22. [Journey 20 — Admin: Data Retention Policy Configuration](#22-journey-20--admin-data-retention-policy-configuration)
23. [Journey 21 — Admin: Webhook & Notification Setup](#23-journey-21--admin-webhook--notification-setup)
24. [Journey 22 — External Auditor: Read-Only Audit Access](#24-journey-22--external-auditor-read-only-audit-access)
25. [Journey 23 — Platform Team: REST API Integration](#25-journey-23--platform-team-rest-api-integration)
26. [Journey 24 — Platform Team: AI Metrics & LLM Cost Monitoring](#26-journey-24--platform-team-ai-metrics--llm-cost-monitoring)
27. [Journey 25 — Enterprise Admin: Multi-Region Kubernetes Deployment](#27-journey-25--enterprise-admin-multi-region-kubernetes-deployment)
28. [Cross-Journey Reference: Certificate Lifecycle](#28-cross-journey-reference-certificate-lifecycle)
29. [Cross-Journey Reference: Severity Thresholds & Exit Codes](#29-cross-journey-reference-severity-thresholds--exit-codes)

---

## 1. User Personas

| Persona | Role | Primary Goals | Primary Entry Points |
|---------|------|---------------|----------------------|
| **Developer** | Individual contributor | Write code, get fast feedback, fix findings | CLI, IDE extensions, git hooks, Claude Code |
| **Security Engineer** | AppSec / product security | Triage findings, track risk trends, enforce policies | Dashboard, REST API, webhooks |
| **Compliance Officer** | GRC / risk | Generate attestations, run compliance wizards, produce audit evidence | Dashboard, reports, email |
| **Engineering Manager** | Team lead / VP Eng | Review team risk, approve policy changes, track burndown | Dashboard, Slack notifications |
| **DevOps / Platform Engineer** | CI/CD, infrastructure | Integrate scans into pipelines, manage deployment | GitHub Actions, GitLab CI, Azure Pipelines, Jenkins |
| **IT Admin** | IAM, SSO, provisioning | Configure SSO, provision users via SCIM, manage API keys | Dashboard settings, SCIM API |
| **External Auditor** | Independent auditor | Review evidence, download certificates, inspect audit log | Dashboard (read-only viewer role) |
| **Platform/API Integrator** | Internal tooling team | Build custom dashboards, automate workflows via API | REST API, webhooks |

---

## 2. Entry Points Overview

```
Entry Points
├── Local Development
│   ├── CLI: sentinel init / scan / ci
│   ├── Git Hooks: post-commit (auto-installed by sentinel init)
│   ├── VS Code Extension (sidebar, inline diagnostics)
│   ├── JetBrains Plugin (inspection panel)
│   └── Claude Code / GitHub Copilot (AI coding context)
│
├── CI/CD Pipelines
│   ├── GitHub Actions (sentinel-scan action + SARIF upload)
│   ├── GitLab CI (sentinel ci --gitlab-sast)
│   ├── Azure Pipelines (SentinelScan@1 task extension)
│   ├── Jenkins (sh "sentinel ci" pipeline step)
│   └── Bitbucket Pipelines (pipe: sentinel/scan)
│
├── Source Control Integrations
│   ├── GitHub App (Check Runs on PRs, inline PR comments)
│   └── GitLab Webhook (MR pipeline status)
│
├── Web Dashboard
│   ├── Overview (risk summary, burndown, AI metrics)
│   ├── Findings (triage, filter, assign)
│   ├── Certificates (download, verify, revoke)
│   ├── Compliance (gap analysis, attestations, wizards)
│   ├── Drift (behavioral drift monitor)
│   ├── AI Metrics (LLM cost, token usage, latency)
│   ├── Approvals (dual-admin change approval queue)
│   ├── Remediations (auto-fix suggestions)
│   ├── Audit Log (immutable event trail)
│   ├── Reports (scheduled PDF/JSON/CSV export)
│   └── Settings (SSO, VCS, webhooks, workflow, retention)
│
├── Programmatic / API
│   ├── REST API (/v1/*)
│   ├── SCIM 2.0 (/scim/v2/*)
│   └── Outbound Webhooks (findings, certificates, scans)
│
└── Notifications
    ├── Slack
    ├── Microsoft Teams
    ├── PagerDuty
    └── Email (SMTP)
```

---

## 3. Journey 1 — Developer: First-Time Setup (Local Dev)

**Persona:** Junior to senior developer joining a team that uses SENTINEL.
**Entry point:** Terminal + Git.
**Tools:** `sentinel` CLI, any terminal (VS Code integrated terminal, iTerm, bash).

### Scenario

Alice joins Acme Corp as a backend engineer. Her team lead says "run `sentinel init` in every repo you work on." She has never used SENTINEL before.

### Step-by-Step Flow

**Step 1 — Install the CLI**

```bash
npm install -g @sentinel/cli
# or with pnpm
pnpm add -g @sentinel/cli
# verify
sentinel --version
# 0.1.0
```

**Step 2 — Set environment variables**

Alice's admin has given her an API key from the SENTINEL dashboard (Settings > API Keys).

```bash
# Add to ~/.bashrc or ~/.zshrc
export SENTINEL_API_URL="https://sentinel.acme.com"
export SENTINEL_API_KEY="sk-live-xxxxxxxxxxxxxxxxxxxx"
export SENTINEL_SECRET="hmac-secret-from-admin"
export SENTINEL_PROJECT_ID="backend-api"
```

**Step 3 — Initialize the project**

```bash
cd ~/repos/backend-api
sentinel init
# Output: SENTINEL initialized. Post-commit hook installed.
```

This installs a `.git/hooks/post-commit` script that automatically runs `sentinel scan --post-commit` after every commit.

**Step 4 — Make a code change and commit**

```bash
git add src/auth/token.ts
git commit -m "feat: add token refresh endpoint"

# Post-commit hook fires automatically:
# Scanning commit abc1234...
# SENTINEL Scan Report
# ====================
# Status: PROVISIONAL PASS
# Risk Score: 42/100
#
# Categories:
#   Security: warn (2 findings)
#   License: pass (0 findings)
#   Quality: pass (0 findings)
#   ...
```

**Step 5 — Review findings in the dashboard**

Alice opens `https://sentinel.acme.com` in her browser. She sees the new scan under Findings with two medium-severity security warnings in `src/auth/token.ts`. She reads the remediation suggestion and fixes the code.

**What Alice used:** CLI (npm), terminal, git hooks, web dashboard.

---

## 4. Journey 2 — Developer: Daily Workflow with Git Hooks

**Persona:** Experienced developer who has already run `sentinel init`.
**Entry point:** Git commit (automated post-commit hook).
**Tools:** Git, any IDE, terminal.

### Scenario

Bob works on a feature branch. He commits several times per day and wants immediate feedback without leaving his editor.

### Step-by-Step Flow

**Commit 1 — Clean commit**

```bash
git commit -m "refactor: extract validation helpers"
# [post-commit hook]
# No changes to scan.
# (hook exits 0, commit proceeds normally)
```

**Commit 2 — Findings detected**

```bash
git commit -m "feat: add user import via CSV"
# [post-commit hook fires]
# SENTINEL Scan Report
# ====================
# Status: FAIL
# Risk Score: 78/100
#
# Categories:
#   Security: FAIL (1 finding)
#     - CRITICAL: SQL injection via unsanitized CSV column — src/import/csv.ts:47
#   Dependency: warn (1 finding)
#     - HIGH: lodash@4.17.20 — CVE-2021-23337 (prototype pollution)
```

> Note: The post-commit hook is informational only — the commit is NOT undone. Bob can continue working but should address findings before opening a PR.

**Scan staged changes before committing (pre-commit style)**

```bash
git add src/import/csv.ts
sentinel scan --staged
# Scans only what is staged — no commit needed
```

**Scan all working directory changes**

```bash
sentinel scan
# Scans git diff HEAD (unstaged + staged vs last commit)
```

**What Bob used:** Git hooks (automatic), CLI for ad-hoc scans.

---

## 5. Journey 5 — Developer: VS Code Extension

**Persona:** Developer who prefers GUI feedback over terminal output.
**Entry point:** VS Code Extension Marketplace.
**Tools:** Visual Studio Code, SENTINEL VS Code extension.

### Scenario

Carol writes TypeScript in VS Code. She wants inline security feedback as she writes, similar to ESLint or TypeScript error highlighting.

### Step-by-Step Flow

**Step 1 — Install extension**

1. Open VS Code
2. Press `Ctrl+Shift+X` (Extensions sidebar)
3. Search "SENTINEL Security"
4. Click Install
5. Reload VS Code

**Step 2 — Configure connection**

VS Code prompts for credentials on first use. Alternatively, open `.vscode/settings.json`:

```json
{
  "sentinel.apiUrl": "https://sentinel.acme.com",
  "sentinel.apiKey": "${env:SENTINEL_API_KEY}",
  "sentinel.secret": "${env:SENTINEL_SECRET}",
  "sentinel.scanOnSave": true,
  "sentinel.scanOnCommit": true,
  "sentinel.showInlineHints": true
}
```

**Step 3 — Inline diagnostics while editing**

As Carol types in `api/routes/users.ts`, the extension shows:
- Red squiggles under `req.query.userId` with: "SENTINEL: Unsanitized query parameter passed to database query — SQL injection risk (Critical)"
- Yellow squiggles under `import bcrypt from 'bcrypt'` with: "SENTINEL: bcrypt@5.0.1 has known moderate vulnerability CVE-2023-XXXX"

**Step 4 — Save and trigger scan**

On save (`sentinel.scanOnSave: true`):
- Status bar shows: "SENTINEL: Scanning..."
- Then: "SENTINEL: 2 findings (1 critical)"

**Step 5 — Open SENTINEL sidebar**

Click the SENTINEL shield icon in the activity bar:
- Findings tree grouped by file and severity
- Click a finding to jump to the line
- Click "View Remediation" to see the suggested fix
- Click "Open in Dashboard" to see the full finding detail

**Step 6 — Auto-fix (where available)**

For supported finding types, a light bulb appears at the finding line:
- Click the light bulb
- Select "SENTINEL: Apply auto-fix"
- Extension applies the suggested diff

**What Carol used:** VS Code, SENTINEL extension (inline diagnostics, sidebar, auto-fix).

---

## 6. Journey 4 — Developer: JetBrains Plugin

**Persona:** Java/Kotlin/Python developer using IntelliJ IDEA, PyCharm, or WebStorm.
**Entry point:** JetBrains Plugin Marketplace.
**Tools:** JetBrains IDE.

### Scenario

David writes Java microservices in IntelliJ IDEA. His organization enforces SENTINEL for all production services.

### Step-by-Step Flow

**Step 1 — Install plugin**

1. Open IntelliJ IDEA
2. `File > Settings > Plugins > Marketplace`
3. Search "SENTINEL"
4. Install and restart IDE

**Step 2 — Configure**

`File > Settings > Tools > SENTINEL`:
```
API URL:    https://sentinel.acme.com
API Key:    sk-live-xxxxxxxxxxxxxxxxxxxx
Secret:     hmac-secret-from-admin
Scan Mode:  On Commit
Project ID: payment-service
```

**Step 3 — Run inspection**

`Analyze > Run Inspection by Name > SENTINEL Security Scan`

Or press `Ctrl+Shift+S` (custom shortcut) to scan the current file.

Results appear in the **Inspections** tool window at the bottom, grouped by severity:
```
src/main/java/com/acme/payment/TokenService.java
  CRITICAL (line 82): Hardcoded secret in token generation
  HIGH (line 134): Missing input validation on amount field
```

**Step 4 — Commit gate**

When David commits via the IDE's VCS panel (`Ctrl+K`), the pre-commit SENTINEL check runs:
- If findings exist above the configured threshold, a dialog appears:
  "SENTINEL found 1 critical finding. Commit anyway? [Commit] [Review Findings] [Cancel]"

**What David used:** JetBrains IDE plugin, inspection panel, commit-time gate.

---

## 7. Journey 5 — Developer: Claude Code AI Assistant

**Persona:** Developer using Claude Code (Anthropic's CLI for Claude) for AI-assisted development.
**Entry point:** Claude Code CLI / terminal.
**Tools:** Claude Code, SENTINEL CLI, terminal.

### Scenario

Eve uses Claude Code to build a new authentication module. She wants SENTINEL to automatically validate the AI-generated code before she commits it.

### Scenario A — Manual scan after AI generation

**Step 1 — Generate code with Claude Code**

```bash
claude-code "implement JWT authentication middleware for Express with refresh token rotation"
# Claude Code generates: src/middleware/auth.ts
```

**Step 2 — Stage the generated files**

```bash
git add src/middleware/auth.ts
```

**Step 3 — Scan staged changes before committing**

```bash
sentinel scan --staged
# SENTINEL Scan Report
# ====================
# Status: FAIL
# Risk Score: 65/100
#
# Categories:
#   Security: FAIL (3 findings)
#     - HIGH: JWT secret loaded from process.env without fallback check — auth.ts:12
#     - MEDIUM: Refresh token not invalidated on logout — auth.ts:89
#     - MEDIUM: Token expiry too long (7 days) — auth.ts:34
```

**Step 4 — Iterate with Claude Code**

```bash
claude-code "fix the SENTINEL findings: JWT secret must be required (throw if missing), invalidate refresh token on logout, set access token expiry to 15 minutes"
# Claude Code updates src/middleware/auth.ts
```

**Step 5 — Re-scan**

```bash
sentinel scan --staged
# SENTINEL Scan Report
# ====================
# Status: full_pass
# Risk Score: 12/100
# Certificate: cert-abc123
```

**Step 6 — Commit clean code**

```bash
git commit -m "feat: add JWT auth middleware with refresh token rotation"
# Post-commit hook: Status: full_pass — no findings
```

### Scenario B — Claude Code with SENTINEL context (CLAUDE.md)

Teams can configure Claude Code to always be aware of SENTINEL findings by adding context to `CLAUDE.md`:

```markdown
# CLAUDE.md

## Security Requirements
All code changes must pass SENTINEL scan before committing.
Run `sentinel scan --staged` after generating or modifying code.
Fix any critical or high findings before proceeding.

## SENTINEL Configuration
- API: https://sentinel.acme.com
- Project: backend-api
- Policy: strict (fail on medium+)
```

With this in place, Claude Code automatically includes SENTINEL compliance in its workflow without being asked.

### Scenario C — Claude Code in a development container / Codespace

For GitHub Codespaces or Dev Containers, SENTINEL CLI can be included in the container definition:

```json
// .devcontainer/devcontainer.json
{
  "postCreateCommand": "npm install -g @sentinel/cli && sentinel init",
  "remoteEnv": {
    "SENTINEL_API_URL": "${localEnv:SENTINEL_API_URL}",
    "SENTINEL_API_KEY": "${localEnv:SENTINEL_API_KEY}",
    "SENTINEL_SECRET": "${localEnv:SENTINEL_SECRET}"
  }
}
```

Claude Code running inside the Codespace automatically has SENTINEL available.

**What Eve used:** Claude Code, SENTINEL CLI (`scan --staged`), git, CLAUDE.md configuration.

---

## 8. Journey 6 — DevOps: GitHub Actions CI/CD Integration

**Persona:** DevOps or platform engineer setting up automated scanning for a GitHub repository.
**Entry point:** GitHub Actions workflow file.
**Tools:** GitHub, GitHub Actions, SENTINEL CLI, GitHub App.

### Scenario

Frank is a platform engineer at FinCo. He needs to enforce SENTINEL scanning on every PR and main branch push, with SARIF results uploaded to GitHub's Security tab.

### Step-by-Step Flow

**Step 1 — Install the GitHub App**

1. Go to `https://sentinel.acme.com/settings/vcs`
2. Click "Install GitHub App"
3. Authorize for the `finco` GitHub organization
4. Select repositories to enable

The GitHub App enables:
- Check Runs on every PR (pass/fail/provisional)
- Inline PR review comments at the finding location
- Status badge in README

**Step 2 — Add repository secrets**

In GitHub: `Settings > Secrets and variables > Actions`:
```
SENTINEL_API_URL    = https://sentinel.acme.com
SENTINEL_API_KEY    = sk-live-xxxxxxxxxxxxxxxxxxxx
SENTINEL_SECRET     = hmac-secret-from-admin
```

**Step 3 — Create workflow file**

```yaml
# .github/workflows/sentinel.yml
name: SENTINEL Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  sentinel-scan:
    name: Security & Compliance Scan
    runs-on: ubuntu-latest
    permissions:
      security-events: write   # for SARIF upload
      contents: read

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for accurate diff

      - name: Install SENTINEL CLI
        run: npm install -g @sentinel/cli

      - name: Generate diff
        run: |
          if [ "${{ github.event_name }}" = "pull_request" ]; then
            git diff origin/${{ github.base_ref }}...HEAD > /tmp/sentinel.diff
          else
            git diff HEAD~1 HEAD > /tmp/sentinel.diff
          fi

      - name: Run SENTINEL scan
        run: |
          cat /tmp/sentinel.diff | sentinel ci \
            --api-url ${{ secrets.SENTINEL_API_URL }} \
            --sarif \
            --output results.sarif \
            --fail-on critical,high
        env:
          SENTINEL_API_KEY: ${{ secrets.SENTINEL_API_KEY }}
          SENTINEL_SECRET: ${{ secrets.SENTINEL_SECRET }}
          SENTINEL_PROJECT_ID: ${{ github.repository }}
          SENTINEL_BRANCH: ${{ github.ref_name }}
          SENTINEL_COMMIT_HASH: ${{ github.sha }}

      - name: Upload SARIF to GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: results.sarif
          category: sentinel
```

**Step 4 — Open a PR**

When Frank opens a PR:
1. GitHub Actions runs the SENTINEL workflow
2. If findings exist, the Check Run shows "FAIL" with a link to the SARIF results
3. GitHub Security tab shows findings as code scanning alerts
4. GitHub App posts inline comments at the finding locations
5. PR is blocked from merging (if branch protection requires the check)

**Step 5 — Fix findings and re-push**

Frank pushes a fix commit. The workflow re-runs:
1. Check Run shows "PASS"
2. Previous inline comments are resolved
3. PR is unblocked

**Step 6 — View certificate in dashboard**

After merge to main, the scan generates a compliance certificate visible at `https://sentinel.acme.com/certificates`.

**What Frank used:** GitHub App, GitHub Actions, SENTINEL CLI (`ci --sarif`), SARIF upload, GitHub Security tab.

---

## 9. Journey 7 — DevOps: GitLab CI/CD Integration

**Persona:** DevOps engineer using GitLab for source control and CI.
**Entry point:** `.gitlab-ci.yml`.
**Tools:** GitLab CI, SENTINEL CLI, GitLab Security Dashboard.

### Scenario

Grace's team uses GitLab.com for all development. She wants SENTINEL results to appear in GitLab's Security Dashboard.

### Step-by-Step Flow

**Step 1 — Add CI/CD variables**

In GitLab: `Settings > CI/CD > Variables`:
```
SENTINEL_API_URL    = https://sentinel.acme.com  (masked)
SENTINEL_API_KEY    = sk-live-xxxxxxxxxxxxxxxxxxxx  (masked)
SENTINEL_SECRET     = hmac-secret-from-admin  (masked)
```

**Step 2 — Using the GitLab CI Component (SENTINEL Catalog)**

The fastest way is to use the SENTINEL GitLab CI Component:

```yaml
# .gitlab-ci.yml
include:
  - component: gitlab.com/archagents/sentinel/scan@~latest
    inputs:
      api_url: $SENTINEL_API_URL
      fail_on: "critical,high"
      stage: test
```

**Step 3 — Manual configuration (full control)**

```yaml
# .gitlab-ci.yml
stages:
  - test
  - security

sentinel-scan:
  stage: security
  image: node:20-alpine
  before_script:
    - npm install -g @sentinel/cli
  script:
    - |
      if [ "$CI_PIPELINE_SOURCE" = "merge_request_event" ]; then
        git diff origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME...HEAD > /tmp/diff.txt
      else
        git diff HEAD~1 HEAD > /tmp/diff.txt
      fi
    - |
      cat /tmp/diff.txt | sentinel ci \
        --api-url $SENTINEL_API_URL \
        --gitlab-sast \
        --fail-on critical,high
  artifacts:
    reports:
      sast: gl-sast-report.json
    when: always
    expire_in: 30 days
  allow_failure: false
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

**Step 4 — View in GitLab Security Dashboard**

After the pipeline runs:
1. Navigate to `Security > Security Dashboard` in your GitLab project
2. SENTINEL findings appear as SAST vulnerabilities
3. Each finding shows file, line, severity, and description
4. Findings can be dismissed or triaged within GitLab

**Step 5 — MR approval gate**

In GitLab `Settings > Merge Requests`, add SENTINEL as a required status check. MRs cannot be merged until SENTINEL passes.

**What Grace used:** GitLab CI/CD, SENTINEL CLI (`ci --gitlab-sast`), GitLab Security Dashboard, `gl-sast-report.json`.

---

## 10. Journey 8 — DevOps: Azure Pipelines Integration

**Persona:** DevOps engineer at an enterprise using Azure DevOps.
**Entry point:** Azure Pipelines YAML + SENTINEL Azure DevOps Extension.
**Tools:** Azure DevOps, SENTINEL Azure DevOps Extension (`SentinelScan@1`).

### Scenario

Henry works at a financial services company using Azure DevOps. His security team requires SENTINEL scans on all builds.

### Step-by-Step Flow

**Step 1 — Install the extension**

1. Go to Azure DevOps Marketplace
2. Search "SENTINEL Security Scan"
3. Click "Get it free" > select your Azure DevOps organization
4. Install

**Step 2 — Add pipeline variables**

In Azure DevOps: `Pipelines > Library > Variable Groups`:
- Create group "sentinel-config"
  ```
  SENTINEL_API_URL    = https://sentinel.acme.com
  SENTINEL_API_KEY    = sk-live-xxxxxxxxxxxxxxxxxxxx  (secret)
  SENTINEL_SECRET     = hmac-secret-from-admin  (secret)
  ```

**Step 3 — Create pipeline**

```yaml
# azure-pipelines.yml
trigger:
  branches:
    include:
      - main
      - develop

pr:
  branches:
    include:
      - main

variables:
  - group: sentinel-config

stages:
  - stage: SecurityScan
    displayName: SENTINEL Security Scan
    jobs:
      - job: SentinelScan
        displayName: Run SENTINEL Scan
        pool:
          vmImage: ubuntu-latest
        steps:
          - checkout: self
            fetchDepth: 0

          - task: SentinelScan@1
            displayName: SENTINEL Security Scan
            inputs:
              apiUrl: $(SENTINEL_API_URL)
              apiKey: $(SENTINEL_API_KEY)
              secret: $(SENTINEL_SECRET)
              outputFormat: sarif
              failOnFindings: true
              timeout: 120
```

**Step 4 — PR gate**

In Azure DevOps, add "SentinelScan" as a required build policy for the `main` branch:
`Repos > Branches > main > Branch Policies > Build Validation`

PRs are blocked until SENTINEL passes.

**Step 5 — View results**

Pipeline run output shows:
```
SENTINEL Scan Report
====================
Status: PASS
Risk Score: 8/100
Certificate: cert-xyz789
  Verdict: FULL_PASS
  Expires: 2026-06-18T00:00:00.000Z
```

**What Henry used:** Azure DevOps, SENTINEL Extension (`SentinelScan@1`), Variable Groups, Branch Policies.

---

## 11. Journey 9 — DevOps: Jenkins Integration

**Persona:** DevOps engineer managing a Jenkins-based build system.
**Entry point:** Jenkinsfile.
**Tools:** Jenkins, SENTINEL CLI.

### Scenario

Isla's organization uses Jenkins. She wants to add SENTINEL to existing pipelines without major restructuring.

### Step-by-Step Flow

**Step 1 — Install CLI on Jenkins agents**

```bash
# On Jenkins agent (or in Dockerfile for containerized agents)
npm install -g @sentinel/cli
```

**Step 2 — Add credentials**

In Jenkins: `Manage Jenkins > Credentials > System > Global`:
- Add "Secret text" credential: `SENTINEL_API_KEY`
- Add "Secret text" credential: `SENTINEL_SECRET`

**Step 3 — Create Jenkinsfile**

```groovy
pipeline {
    agent any

    environment {
        SENTINEL_API_URL = 'https://sentinel.acme.com'
        SENTINEL_API_KEY = credentials('SENTINEL_API_KEY')
        SENTINEL_SECRET = credentials('SENTINEL_SECRET')
        SENTINEL_PROJECT_ID = "${env.JOB_NAME}"
        SENTINEL_BRANCH = "${env.GIT_BRANCH}"
        SENTINEL_COMMIT_HASH = "${env.GIT_COMMIT}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('SENTINEL Security Scan') {
            steps {
                script {
                    sh '''
                        git diff HEAD~1 HEAD | sentinel ci \
                            --api-url $SENTINEL_API_URL \
                            --sarif \
                            --output sentinel-results.sarif \
                            --fail-on critical,high
                    '''
                }
            }
            post {
                always {
                    archiveArtifacts artifacts: 'sentinel-results.sarif', allowEmptyArchive: true
                }
            }
        }

        stage('Build & Test') {
            steps {
                // ... existing build steps
            }
        }
    }

    post {
        failure {
            echo 'Build failed — check SENTINEL findings in archived artifacts'
        }
    }
}
```

**Step 4 — View results**

Jenkins build output shows the SENTINEL summary. SARIF file is archived. Teams can additionally send findings to a webhook for Slack/Teams notifications.

**What Isla used:** Jenkins, SENTINEL CLI in Jenkinsfile, SARIF archiving, Jenkins credentials store.

---

## 12. Journey 10 — DevOps: Bitbucket Pipelines Integration

**Persona:** DevOps engineer using Atlassian Bitbucket Cloud.
**Entry point:** `bitbucket-pipelines.yml`.
**Tools:** Bitbucket Pipelines, SENTINEL CLI.

```yaml
# bitbucket-pipelines.yml
image: node:20-alpine

pipelines:
  pull-requests:
    '**':
      - step:
          name: SENTINEL Security Scan
          script:
            - npm install -g @sentinel/cli
            - git fetch origin $BITBUCKET_PR_DESTINATION_BRANCH
            - git diff origin/$BITBUCKET_PR_DESTINATION_BRANCH...HEAD | sentinel ci
                --api-url $SENTINEL_API_URL
                --fail-on critical,high
          after-script:
            - echo "SENTINEL scan completed with exit code $BITBUCKET_EXIT_CODE"

  branches:
    main:
      - step:
          name: SENTINEL Main Branch Scan
          script:
            - npm install -g @sentinel/cli
            - git diff HEAD~1 HEAD | sentinel ci --api-url $SENTINEL_API_URL
```

Repository variables (`Settings > Pipelines > Repository variables`):
- `SENTINEL_API_URL`, `SENTINEL_API_KEY`, `SENTINEL_SECRET` (all secured)

---

## 13. Journey 11 — Security Engineer: Findings Triage & Remediation

**Persona:** Application security engineer responsible for resolving findings.
**Entry point:** SENTINEL web dashboard — Findings page.
**Tools:** Dashboard, Slack notifications, REST API.

### Scenario

Jake is an AppSec engineer. Each morning he reviews new findings across all projects, assigns severity-appropriate SLAs, and tracks remediation.

### Step-by-Step Flow

**Step 1 — Morning findings review**

Navigate to `https://sentinel.acme.com/findings`.

Dashboard shows:
```
Total Findings: 47
  Critical:  3  (SLA: 24h)
  High:     12  (SLA: 7d)
  Medium:   22  (SLA: 30d)
  Low:      10  (SLA: 90d)
```

**Step 2 — Filter and triage**

Use filters:
- Severity: Critical
- Status: Open
- Project: payment-service

Results show 3 critical findings:
1. SQL injection in `src/payments/process.ts:142` — unassigned
2. Hardcoded AWS credentials in `config/aws.js:8` — unassigned
3. Prototype pollution in dependency `lodash@4.17.20` — unassigned

**Step 3 — Assign findings**

Click finding #2 (hardcoded credentials):
- Assign to: `@alice`
- Priority: P0 (immediate)
- Add comment: "These credentials must be rotated immediately AND removed from git history."
- Set due date: Today

**Step 4 — View decision trace**

Click "Decision Trace" on any finding to see which SENTINEL agents flagged it, the rule triggered, the confidence score, and the LLM reasoning chain that produced the finding.

```
Finding ID: find-abc123
Agent: security-agent (Semgrep + custom rules)
Rule: sentinel.security.hardcoded-secrets
Confidence: 0.97
Severity: Critical
Reasoning:
  1. Detected string literal matching AWS key pattern on line 8
  2. Value confirmed non-placeholder (entropy > 4.5)
  3. File path config/aws.js suggests production configuration
```

**Step 5 — View remediation suggestion**

Click "View Remediation":
```
Issue: Hardcoded AWS credential in source code
File: config/aws.js:8

Suggested fix:
  Remove the hardcoded key and use environment variable:

  Before:
    const awsKey = "AKIA2XXXXXXXXXXXXX";

  After:
    const awsKey = process.env.AWS_ACCESS_KEY_ID;
    if (!awsKey) throw new Error("AWS_ACCESS_KEY_ID not set");

Actions required:
  1. Rotate the exposed key immediately in AWS IAM
  2. Apply the above code fix
  3. Remove from git history: git filter-repo --path config/aws.js
  4. Force-push (with approvals) to all branches
```

**Step 6 — Apply auto-fix (where supported)**

For some finding types, click "Apply Auto-Fix":
- SENTINEL creates a suggested patch
- Downloads as `.patch` file or opens a GitHub/GitLab MR/PR

**Step 7 — Close finding after fix**

Once the developer pushes the fix and a clean scan runs:
- Finding status automatically changes to `resolved`
- Resolved findings appear in the audit log

**Step 8 — Risk trend tracking**

Navigate to `https://sentinel.acme.com` (Overview):
- Risk burndown chart shows open critical/high over the past 30 days
- Risk Sparkline shows trend direction per project
- IP Attribution card shows what % of code is AI-generated per project

**What Jake used:** Dashboard findings page, decision trace, remediation suggestions, risk trend charts.

---

## 14. Journey 12 — Security Engineer: Gap Analysis & Heatmap

**Persona:** Security engineer running a compliance gap assessment.
**Entry point:** Dashboard — Compliance > Gap Analysis.
**Tools:** Dashboard gap analysis heatmap.

### Scenario

Kira needs to assess which SENTINEL controls are in place versus missing for SOC 2, ISO 27001, and EU AI Act compliance.

### Step-by-Step Flow

**Step 1 — Open gap analysis**

Navigate to `Compliance > Gap Analysis`.

The heatmap shows a grid:
- Rows: compliance frameworks (SOC 2, ISO 27001, EU AI Act, GDPR, NIST CSF)
- Columns: control domains / trust service categories
- Cell color: green (covered), yellow (partial), red (gap), grey (not applicable)

**Step 2 — Filter by framework**

Click "SOC 2 Type II" to filter.

Grid shows CC1–CC9 control categories:
- CC6 (Logical Access): green — SENTINEL RBAC + SCIM + SSO configured
- CC7 (System Operations): yellow — alerting configured but incident response procedure missing evidence
- CC9 (Risk Mitigation): red — no third-party risk assessment uploaded

**Step 3 — Click a gap cell**

Click the red CC9 cell:
- Panel slides open on the right
- Shows: "Gap: Third-party risk assessment not on file"
- Links to: Compliance Wizard for CC9
- Shows: Attestation upload field for evidence

**Step 4 — Upload attestation evidence**

Click "Upload Evidence":
- Drag and drop PDF of third-party vendor assessment
- Tag: `soc2-cc9`
- Status changes from gap (red) to partial (yellow)

**Step 5 — Run compliance wizard**

Click "Start Wizard: CC9":
- Step-by-step questionnaire
- "Do you have a third-party risk register?" → Yes → Upload
- "Are vendor contracts reviewed annually?" → Yes → Upload contract template
- Wizard marks CC9 as covered (green)

**Step 6 — Export gap report**

Click "Export Gap Report":
- Download PDF or CSV showing all gap/partial/covered status
- Include in next audit package

**What Kira used:** Dashboard gap analysis heatmap, compliance wizard, attestation upload.

---

## 15. Journey 13 — Security Engineer: Drift Detection

**Persona:** Security engineer monitoring for behavioral changes between scans.
**Entry point:** Dashboard — Drift page.
**Tools:** Dashboard drift monitor.

### Scenario

Liam monitors for sudden spikes in AI-generated code, which might indicate a developer using an unauthorized AI tool or a supply chain compromise.

### Step-by-Step Flow

**Step 1 — Open drift page**

Navigate to `https://sentinel.acme.com/drift`.

Dashboard shows drift indicators:
```
Project: payment-service
  AI Score Drift:    +38% in last 7 days  [ALERT]
  Dependency Drift:  +2 new packages in last 24h
  Security Drift:    No new vulnerabilities
  License Drift:     1 new GPL-3.0 dependency (policy violation)
```

**Step 2 — Investigate AI score spike**

Click the AI Score Drift alert:
- Timeline chart shows normal AI score ~20% for 30 days, then spike to 58% starting 2026-03-15
- Breakdown by file: `src/billing/invoice-generator.ts` AI probability = 94%
- Commit hash: `a3f9c11` by author: `john.doe@acme.com`

**Step 3 — Review IP attribution**

Click "IP Attribution":
- Shows provenance breakdown for the spike commit
- 94% AI-generated score for `invoice-generator.ts`
- SENTINEL flags this for review per org's AI code policy (threshold: 80%)

**Step 4 — Create finding from drift alert**

Click "Create Finding":
- Automatically creates a policy-type finding: "AI Code Policy Violation — AI score 94% exceeds policy threshold 80%"
- Assigns to the code author for review

**Step 5 — Acknowledge or escalate**

If the AI-generated code is legitimate and reviewed:
- Click "Acknowledge" → records approval in audit log
- Policy allows whitelisting with manager approval

**What Liam used:** Dashboard drift page, AI attribution, drift-to-finding conversion.

---

## 16. Journey 14 — Compliance Officer: SOC 2 Attestation Workflow

**Persona:** GRC / compliance officer preparing for a SOC 2 Type II audit.
**Entry point:** Dashboard — Compliance > Attestations.
**Tools:** Dashboard, compliance wizard, report scheduler, email.

### Scenario

Maria is a compliance officer at a SaaS company undergoing its first SOC 2 Type II audit. Her auditor requires evidence of SENTINEL's continuous monitoring controls.

### Step-by-Step Flow

**Step 1 — Create new attestation**

Navigate to `Compliance > Attestations > New`.

Fill in:
```
Framework:     SOC 2 Type II
Audit Period:  2025-04-01 to 2026-03-31
Auditor:       PwC
Scope:         production-api, payment-service, auth-service
```

**Step 2 — Attach evidence**

The attestation wizard prompts for evidence per trust service category:

- **CC6 — Logical Access Controls**
  - Upload: RBAC configuration export (from Settings > Users)
  - Upload: SSO/SCIM configuration screenshot
  - SENTINEL auto-attaches: Audit log export showing all access events

- **CC7 — System Operations**
  - SENTINEL auto-attaches: All scan results from the audit period (100% of commits scanned)
  - SENTINEL auto-attaches: Certificate history (pass rates by month)
  - Upload: On-call runbook PDF

- **CC8 — Change Management**
  - SENTINEL auto-attaches: Git history of all policy change approvals (dual-admin approval trail)
  - SENTINEL auto-attaches: Finding remediation timeline (open→closed per finding)

**Step 3 — Generate attestation certificate**

Click "Generate Attestation":
- SENTINEL produces a signed attestation PDF
- Contains: org name, audit period, scope, summary metrics, SHA-256 hash of evidence bundle
- Signed with SENTINEL's private key (verifiable via `/v1/certificates/verify`)

**Step 4 — Share with auditor**

Click "Share with Auditor":
- Generates a time-limited read-only link valid 90 days
- Or: Download PDF package and email to auditor
- Or: Grant auditor a Viewer role in SENTINEL (see Journey 22)

**Step 5 — Track attestation status**

Attestation page shows:
```
Attestation: ATT-2026-SOC2-001
Status: Under Review (submitted to PwC 2026-03-15)
Evidence items: 24/24 complete
Outstanding: None
```

**What Maria used:** Attestation wizard, evidence upload, PDF certificate generation, auditor share link.

---

## 17. Journey 15 — Compliance Officer: EU AI Act Compliance Wizard

**Persona:** Compliance officer at an organization subject to the EU AI Act (full enforcement August 2026).
**Entry point:** Dashboard — Compliance > Wizards.
**Tools:** Dashboard compliance wizard.

### Scenario

Nathan's company builds AI-powered recruitment tools classified as high-risk under Annex III of the EU AI Act. He needs to demonstrate SENTINEL's monitoring addresses their obligations.

### Step-by-Step Flow

**Step 1 — Start EU AI Act wizard**

Navigate to `Compliance > Wizards > New > EU AI Act`.

**Step 2 — Risk classification**

Wizard asks:
- "Does your system make decisions affecting employment?" → Yes → Classified as **High-Risk (Annex III)**
- "Is the system deployed in the EU?" → Yes

**Step 3 — Technical documentation requirements**

Wizard maps SENTINEL capabilities to EU AI Act Article 11 (Technical Documentation):
```
Article 11(1)(a) — General description of AI system
  Status: Manual — upload your system description PDF
  [Upload Evidence]

Article 11(1)(b) — Training data description
  Status: SENTINEL auto-generates from scan history
  [View Auto-Generated Evidence]

Article 11(1)(c) — Monitoring & testing (Article 9 risk management)
  Status: Covered — SENTINEL continuous monitoring active
  Evidence: Last 90 days scan results, 100% commit coverage
  [View Certificate History]
```

**Step 4 — Human oversight (Article 14)**

SENTINEL's approval workflow (dual-admin for policy changes) satisfies Article 14 human oversight:
```
Article 14 — Human Oversight
  Status: Covered
  Evidence: 18 policy changes, all with dual-admin approval log
  [View Approval History]
```

**Step 5 — Logging and auditability (Article 12)**

```
Article 12 — Record-Keeping
  Status: Covered
  Evidence: Immutable audit log, 365-day retention configured
  [Export Audit Log]
```

**Step 6 — Generate conformity declaration**

Click "Generate EU AI Act Conformity Report":
- PDF with SENTINEL evidence mapped to each relevant Article
- Gap items highlighted in red for manual completion
- Ready to include in technical documentation file

**What Nathan used:** Compliance wizard, auto-generated evidence, conformity report.

---

## 18. Journey 16 — Compliance Officer: Automated Compliance Reports

**Persona:** Compliance officer who needs regular evidence reports sent to the board and auditors.
**Entry point:** Dashboard — Settings > Report Schedules.
**Tools:** Dashboard, email / Slack.

### Scenario

Olivia needs weekly compliance summaries emailed to the CISO, monthly reports to the board, and a quarterly PDF audit package to the auditor.

### Step-by-Step Flow

**Step 1 — Create report schedule**

Navigate to `Settings > Report Schedules > New`.

```
Report Type:   Compliance Summary
Frequency:     Weekly (every Monday 08:00 UTC)
Recipients:    ciso@acme.com, security@acme.com
Format:        PDF + JSON
Include:
  [x] Finding summary by severity
  [x] Certificate pass rate
  [x] Risk trend chart
  [x] Open critical/high SLA compliance
```

**Step 2 — Create monthly board report**

```
Report Type:   Executive Summary
Frequency:     Monthly (1st of month)
Recipients:    board@acme.com
Format:        PDF
Include:
  [x] Risk score trend (12 months)
  [x] Compliance posture (SOC 2, ISO 27001)
  [x] AI code adoption metrics
  [x] Top 3 risks
```

**Step 3 — Create quarterly audit package**

```
Report Type:   Full Audit Package
Frequency:     Quarterly
Recipients:    auditor@pwc.com
Format:        ZIP (PDF + JSON + CSV)
Include:
  [x] All findings in period
  [x] All certificates
  [x] Audit log export
  [x] Policy change history
  [x] User access review
```

**Step 4 — Preview report**

Click "Preview":
- Generate a test report immediately (same content as scheduled)
- Review layout and data before enabling schedule

**Step 5 — Enable schedule**

Toggle "Active" — reports will be sent on schedule.

**What Olivia used:** Report schedules, PDF generation, scheduled email delivery.

---

## 19. Journey 17 — Engineering Manager: Team Risk Overview & Approvals

**Persona:** Engineering manager or VP Engineering.
**Entry point:** Dashboard overview + Approvals page.
**Tools:** Dashboard, Slack notifications.

### Scenario

Patrick is VP of Engineering. He wants a daily view of team risk and is required to approve certain policy changes as the second approver in the dual-admin workflow.

### Step-by-Step Flow

**Step 1 — Morning risk review**

Navigate to `https://sentinel.acme.com` (Overview):

```
Organization: Acme Corp
Risk Score: 34 (Low)  ▼ -8 from last week

Projects:
  payment-service   Risk: 65  [HIGH]  12 open findings
  auth-service      Risk: 22  [LOW]    3 open findings
  web-frontend      Risk: 18  [LOW]    1 open finding

Certificate Health:
  Full Pass:      78%
  Provisional:    18%
  Failed:          4%

AI Code Adoption: 42% of commits contain AI-generated code
```

**Step 2 — Review pending approvals**

A Slack notification arrives:
```
SENTINEL Alert [Acme Corp]
Pending Approval Required

Security Engineer Alice has submitted:
Retention Policy Change — Reduce critical finding retention from 365d to 90d

Submitted: 2026-03-18 09:15 UTC
Action required: https://sentinel.acme.com/approvals/apr-xyz
```

**Step 3 — Review the change request**

Navigate to `Approvals > apr-xyz`:

```
Change Type:    Retention Policy
Requested by:  alice@acme.com (Security Engineer)
Submitted:     2026-03-18 09:15 UTC
Status:        Pending (1 of 2 approvals received)
Approver 1:    sarah@acme.com ✓ Approved at 09:45 UTC
Approver 2:    patrick@acme.com (pending)

Change Summary:
  Before: Critical findings retained 365 days
  After:  Critical findings retained 90 days

Risk Assessment:
  - Reduces audit evidence window from 12 months to 3 months
  - May impact SOC 2 evidence availability
  - Recommend consulting compliance officer before approving
```

**Step 4 — Approve or reject**

Patrick reviews the risk notes and consults Maria (compliance officer). She confirms 90 days is sufficient.

Click "Approve":
```
Approved by: patrick@acme.com
Timestamp: 2026-03-18 10:22 UTC
Note: Confirmed with compliance — 90d sufficient for current audit requirements
```

Policy change takes effect on next retention job run (04:00 UTC).

**Step 5 — Review project burndown**

Click on `payment-service` (highest risk):
- Finding burndown chart: 24 open 30 days ago → 12 open today (good trend)
- 3 critical findings opened this sprint
- Assigned to 2 developers

**What Patrick used:** Dashboard overview, Slack notifications, approvals workflow, project risk drill-down.

---

## 20. Journey 18 — Admin: Organization Onboarding & SSO Setup

**Persona:** IT administrator setting up SENTINEL for an enterprise organization.
**Entry point:** Dashboard settings.
**Tools:** Dashboard, Identity Provider (Okta, Azure AD, Auth0, etc.).

### Scenario

Quinn is a senior IT admin at a 500-person company. She is deploying SENTINEL enterprise and needs to set up SSO so employees can log in with their company credentials.

### Step-by-Step Flow

**Step 1 — Create organization**

Access the SENTINEL admin console. Create the organization:
```
Name: Acme Corp
Domain: acme.com
Plan: Enterprise
Data Region: us-east
```

**Step 2 — Configure GitHub OAuth (initial access)**

While SSO is being configured, set up GitHub OAuth for admin access:
```
Settings > SSO > GitHub OAuth
  Client ID:      github-oauth-client-id
  Client Secret:  **hidden**
  Allowed orgs:   acme
```

**Step 3 — Configure OIDC SSO (Okta)**

Navigate to `Settings > SSO > OIDC`:

```
Provider:       Okta
Issuer URL:     https://acme.okta.com/oauth2/default
Client ID:      0oa1xxxxxxxxxxxxx
Client Secret:  **hidden**
Scopes:         openid email profile groups
Role Claim:     sentinel_role

Role Mapping:
  sentinel-admins    → admin
  sentinel-managers  → manager
  sentinel-security  → developer (security reviewer)
  sentinel-devs      → developer
  sentinel-viewers   → viewer
```

**Step 4 — Test OIDC login**

Click "Test SSO":
- Opens popup with Okta login
- After authentication, shows: "SSO test successful — mapped role: admin"

**Step 5 — Configure SAML 2.0 (alternative for enterprise IdP)**

Navigate to `Settings > SSO > SAML`:
```
IdP SSO URL:    https://acme.okta.com/app/xxx/sso/saml
IdP Entity ID:  http://www.okta.com/xxx
Certificate:    [Paste X.509 certificate from IdP metadata]

SP Entity ID:   https://sentinel.acme.com/saml/metadata
ACS URL:        https://sentinel.acme.com/saml/callback
```

Download SENTINEL's SP metadata XML and upload to Okta.

**Step 6 — Set SSO as required**

Toggle "Require SSO for all users" — disables password login, all users must authenticate through the IdP.

**Step 7 — Role map review**

Navigate to `Settings > Users`:
```
alice@acme.com     developer   [via SSO: sentinel-devs group]
bob@acme.com       developer   [via SSO: sentinel-devs group]
frank@acme.com     developer   [via SSO: sentinel-devs group]
jake@acme.com      manager     [via SSO: sentinel-security group]
maria@acme.com     manager     [via SSO: sentinel-managers group]
patrick@acme.com   admin       [via SSO: sentinel-admins group]
quinn@acme.com     admin       [via SSO: sentinel-admins group]
```

**What Quinn used:** Dashboard SSO settings, OIDC/SAML configuration, role mapping.

---

## 21. Journey 19 — Admin: SCIM Provisioning

**Persona:** IT admin configuring automated user lifecycle management.
**Entry point:** Dashboard Settings > SCIM + Identity Provider SCIM configuration.
**Tools:** Okta / Azure AD, SENTINEL SCIM 2.0 API.

### Scenario

Quinn (continued from Journey 18) wants users automatically created/updated/deprovisioned when Okta group membership changes.

### Step-by-Step Flow

**Step 1 — Enable SCIM**

Navigate to `Settings > SSO > SCIM`:
- Toggle: Enable SCIM 2.0
- SCIM Base URL: `https://sentinel.acme.com/scim/v2`
- Generate SCIM Bearer Token: click "Generate" → copy token

**Step 2 — Configure SCIM in Okta**

In Okta: `Applications > SENTINEL > Provisioning > Integration`:
```
SCIM connector base URL:  https://sentinel.acme.com/scim/v2
Unique identifier:        email
Authentication Mode:      HTTP Header
Authorization:            Bearer scim-token-xxxxxxxxxxxx
```

Enable:
- [x] Import Users
- [x] Push Users
- [x] Push Groups

**Step 3 — Map Okta attributes to SENTINEL**

```
Okta Attribute   →   SENTINEL Attribute
firstName        →   name.givenName
lastName         →   name.familyName
email            →   emails[primary]
sentinel_role    →   roles[value]  (from Okta profile attribute)
```

**Step 4 — Push group assignments**

In Okta: Push the group `sentinel-security-engineers` to SENTINEL.

SENTINEL creates:
```json
{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
  "id": "usr-abc123",
  "userName": "jake@acme.com",
  "name": { "givenName": "Jake", "familyName": "Smith" },
  "active": true,
  "roles": [{ "value": "manager" }]
}
```

**Step 5 — Deprovision on offboarding**

When an employee is deactivated in Okta, SCIM sends:
```json
{ "active": false }
```

SENTINEL immediately:
1. Revokes all active sessions
2. Deactivates API keys
3. Sets user status to `inactive`
4. Records deprovisioning in audit log

**Step 6 — Verify in SENTINEL**

`Settings > Users` shows all users with `[SCIM]` badge indicating provisioned via SCIM (not manually).

**What Quinn used:** SCIM 2.0 API, Okta SCIM app, automated provisioning/deprovisioning.

---

## 22. Journey 20 — Admin: Data Retention Policy Configuration

**Persona:** Admin or compliance officer configuring data retention.
**Entry point:** Dashboard — Settings > Retention.
**Tools:** Dashboard, dual-admin approval workflow.

### Scenario

Rachel (admin) and Patrick (approver) need to configure tiered retention to comply with GDPR Article 17 (right to erasure) and satisfy SOC 2 evidence requirements.

### Step-by-Step Flow

**Step 1 — View current policy**

Navigate to `Settings > Retention`:

```
Current Policy: Legacy (all findings retained 365 days)
Last changed: Never
```

**Step 2 — Select a preset**

Click "Change Policy":

Available presets:
| Preset | Critical | High | Medium | Low |
|--------|----------|------|--------|-----|
| strict | 730d | 365d | 180d | 90d |
| standard | 365d | 180d | 90d | 30d |
| minimal | 90d | 90d | 30d | 14d |
| custom | configure | configure | configure | configure |

Rachel selects "standard" to start, then switches to "custom":
```
Critical findings: 365 days  (SOC 2 audit window)
High findings:     180 days
Medium findings:    90 days
Low findings:       30 days
```

**Step 3 — Submit for approval**

Click "Submit Change Request":
```
Change summary: Switch from legacy 365d flat retention to tiered policy
Justification: GDPR Article 17 compliance — reduce retention of low-risk data
```

SENTINEL creates a `RetentionPolicyChange` record and notifies the second approver.

**Step 4 — Second approver reviews and approves**

Patrick receives a Slack/email notification:
```
Retention Policy Change — Dual Admin Approval Required
Requested by: rachel@acme.com
[Review & Approve] → https://sentinel.acme.com/approvals/apr-456
```

Patrick reviews and approves (see Journey 17, Step 4).

**Step 5 — Policy takes effect**

Next retention job run (04:00 UTC) applies the new policy:
- Finds all findings older than their tier's retention period
- Deletes expired findings, agent results, and scans
- Creates a `RetentionExecution` record with deletion counts
- Refreshes `RetentionStats` (used by dashboard charts)

**Step 6 — Configure archive destination (optional)**

For organizations that must archive rather than delete:

Navigate to `Settings > Retention > Archive Destinations > Add`:
```
Type:    S3
Name:    Compliance Archive (S3)
Bucket:  acme-sentinel-archive
Region:  us-east-1
KMS Key: arn:aws:kms:us-east-1:123456789:key/abc-def
Prefix:  findings/
```

Click "Test Connection" → "Connection successful — test object written and deleted."

Enable archive on the policy:
- Toggle: "Archive before delete"
- Archive destination: Compliance Archive (S3)

**Step 7 — View retention execution history**

Navigate to `Settings > Retention > Execution History`:
```
2026-03-18 04:00 UTC  completed  deleted: 142 findings, 89 scans
2026-03-17 04:00 UTC  completed  deleted: 0 findings (policy changed today)
2026-03-16 04:00 UTC  completed  deleted: 3 findings
```

**What Rachel/Patrick used:** Retention settings UI, tiered policy configuration, dual-admin approval, archive destination configuration.

---

## 23. Journey 21 — Admin: Webhook & Notification Setup

**Persona:** Admin configuring outbound integrations for Slack, Teams, and custom systems.
**Entry point:** Dashboard — Settings > Webhooks and Settings > Workflow.
**Tools:** Dashboard, Slack, Microsoft Teams, PagerDuty.

### Scenario

Sam wants:
1. Critical findings → PagerDuty alert (immediately)
2. All new findings → Slack #sentinel-findings channel
3. Certificates failing → Microsoft Teams #security channel
4. Custom webhook → internal risk management system (JIRA-like)

### Step-by-Step Flow

**Step 1 — Configure Slack notification endpoint**

`Settings > Notification Endpoints > Add`:
```
Type:   Slack
Name:   Security Findings Slack
URL:    https://hooks.slack.com/services/T0XXX/B0XXX/xxxxxxxxxx
```
Click "Test" — receives test message in Slack.

**Step 2 — Configure PagerDuty endpoint**

```
Type:            PagerDuty
Name:            Critical Alerts PD
Integration Key: pagerduty-routing-key-xxxx
```

**Step 3 — Configure Teams endpoint**

```
Type:   Microsoft Teams
Name:   Security Teams Channel
URL:    https://acmecorp.webhook.office.com/webhookb2/xxx@xxx/IncomingWebhook/xxx
```

**Step 4 — Create notification rules**

`Settings > Workflow > Notification Rules`:

Rule 1:
```
Name:      Critical Findings → PagerDuty
Trigger:   finding.created
Condition: severity = critical AND status = open
Action:    PagerDuty — Critical Alerts PD
```

Rule 2:
```
Name:      All New Findings → Slack
Trigger:   finding.created
Condition: (none — all findings)
Action:    Slack — Security Findings Slack
```

Rule 3:
```
Name:      Certificate Fail → Teams
Trigger:   certificate.status_changed
Condition: status = fail OR status = revoked
Action:    Teams — Security Teams Channel
```

**Step 5 — Configure outbound webhook for JIRA integration**

`Settings > Webhooks > Add Outbound Webhook`:
```
Name:     JIRA Risk System
URL:      https://jira.acme.com/sentinel-webhook
Events:   finding.created, finding.resolved, certificate.created
Secret:   webhook-hmac-secret
Headers:
  X-System-Token: internal-system-token
```

The internal risk system receives events and automatically creates JIRA tickets for critical/high findings.

**What Sam used:** Notification endpoints, notification rules, outbound webhooks, PagerDuty/Slack/Teams integrations.

---

## 24. Journey 22 — External Auditor: Read-Only Audit Access

**Persona:** External auditor from a Big 4 firm reviewing SENTINEL evidence during a SOC 2 audit.
**Entry point:** Dashboard with Viewer role.
**Tools:** Dashboard (read-only), certificate verification endpoint.

### Scenario

Tara is an auditor at PwC conducting a SOC 2 Type II audit for Acme Corp. She needs to independently verify SENTINEL evidence.

### Step-by-Step Flow

**Step 1 — Receive access**

Maria (compliance officer) creates a Viewer account for Tara:
- `Settings > Users > Invite`
- Email: `tara.smith@pwc.com`
- Role: `viewer`
- Access expiry: 90 days (audit period)

Tara receives an email invite and sets her password.

**Step 2 — Log in (no SSO required for external users)**

Tara logs in at `https://sentinel.acme.com` with email/password. She sees a read-only view — no buttons to create/modify anything.

**Step 3 — Review audit log**

Navigate to `Audit Log`:
- All user actions for the audit period are listed
- Filter by: user, action type, date range
- Export as CSV for audit workpapers

```
2026-03-15 14:32  alice@acme.com      retention_policy.change_submitted
2026-03-15 15:10  sarah@acme.com      retention_policy.change_approved
2026-03-15 16:45  patrick@acme.com    retention_policy.change_approved
2026-03-16 04:01  system              retention_job.completed (142 deleted)
```

**Step 4 — Download certificates**

Navigate to `Certificates`:
- List of all compliance certificates generated during the audit period
- Download each as a signed PDF
- Each certificate has a unique ID and SHA-256 fingerprint

**Step 5 — Verify certificate authenticity**

Tara can independently verify any certificate via the public API (no auth required):

```bash
curl https://sentinel.acme.com/v1/certificates/cert-abc123/verify
```

Response:
```json
{
  "valid": true,
  "certificateId": "cert-abc123",
  "orgId": "acme-corp",
  "issuedAt": "2026-03-15T12:00:00Z",
  "expiresAt": "2026-06-15T12:00:00Z",
  "status": "full_pass",
  "riskScore": 14,
  "fingerprint": "sha256:abc123..."
}
```

**Step 6 — Review findings history**

Navigate to `Findings`:
- View all findings from the audit period
- Filter by: resolved, open, by project
- Export as CSV for workpapers

**Step 7 — Review scan coverage**

Navigate to `Reports`:
- Download the "Scan Coverage" report for the audit period
- Shows: 100% of commits scanned, broken down by project, branch, and date

**What Tara used:** Dashboard (viewer role), audit log, certificate download, certificate verification API, findings export.

---

## 25. Journey 23 — Platform Team: REST API Integration

**Persona:** Internal platform team building a custom security dashboard or integrating SENTINEL data into an internal risk platform.
**Entry point:** SENTINEL REST API.
**Tools:** REST API, API keys, HMAC signatures.

### Scenario

Uma is an engineer on the internal developer platform team. She is building a unified "Developer Dashboard" that pulls SENTINEL risk scores alongside GitHub metrics, PagerDuty incident data, and Datadog SLOs.

### Step-by-Step Flow

**Step 1 — Create API key**

Navigate to `Settings > API Keys > Generate`:
```
Name:   platform-dashboard
Role:   viewer
Expiry: Never (rotated monthly via automation)
```
Copy the key: `sk-live-xxxxxxxxxxxxxxxxxxxx`

**Step 2 — Generate HMAC signature**

All SENTINEL API calls require an HMAC-SHA256 signature:

```python
import hmac
import hashlib
import time
import json

def sign_request(body: str, secret: str) -> str:
    timestamp = int(time.time())
    message = f"t={timestamp},{body}"
    sig = hmac.new(
        secret.encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()
    return f"t={timestamp},sig={sig}"

# Usage
body = json.dumps({"foo": "bar"})
signature = sign_request(body, "hmac-secret-from-admin")
```

**Step 3 — Fetch risk scores for all projects**

```python
import requests

headers = {
    "X-Sentinel-API-Key": "sk-live-xxxxxxxxxxxxxxxxxxxx",
    "X-Sentinel-Signature": sign_request("", secret),
    "X-Sentinel-Role": "viewer",
}

# Get organization overview
resp = requests.get(
    "https://sentinel.acme.com/v1/risk-trends",
    params={"period": "30d"},
    headers=headers,
)
data = resp.json()

# data = {
#   "projects": [
#     { "id": "payment-service", "riskScore": 65, "trend": "down", ... },
#     { "id": "auth-service",    "riskScore": 22, "trend": "stable", ... },
#   ]
# }
```

**Step 4 — Fetch findings summary**

```python
# Get finding counts by severity for a specific project
resp = requests.get(
    "https://sentinel.acme.com/v1/findings",
    params={
        "projectId": "payment-service",
        "status": "open",
        "limit": 0,  # count only
        "groupBy": "severity",
    },
    headers=headers,
)
```

**Step 5 — Receive real-time events via webhook**

Uma's platform registers a webhook to receive real-time updates (no polling needed):

```python
# POST https://sentinel.acme.com/v1/webhooks
{
  "url": "https://platform.acme.com/webhooks/sentinel",
  "events": ["finding.created", "finding.resolved", "certificate.status_changed"],
  "secret": "webhook-hmac-secret"
}
```

Incoming webhook payloads to `https://platform.acme.com/webhooks/sentinel`:
```json
{
  "event": "finding.created",
  "timestamp": "2026-03-18T14:32:00Z",
  "data": {
    "findingId": "find-xyz",
    "projectId": "payment-service",
    "severity": "critical",
    "type": "security",
    "title": "SQL injection vulnerability",
    "file": "src/payments/process.ts",
    "line": 142
  }
}
```

**Step 6 — Embed SENTINEL risk badge**

Uma adds SENTINEL's risk badge to the internal dashboard:

```html
<img src="https://sentinel.acme.com/v1/badge/payment-service" alt="SENTINEL Risk" />
```

Returns a dynamic SVG badge showing current risk score and status.

**What Uma used:** REST API, API keys, HMAC signatures, webhooks, badge embed.

---

## 26. Journey 24 — Platform Team: AI Metrics & LLM Cost Monitoring

**Persona:** Platform engineer or FinOps team tracking AI cost and usage.
**Entry point:** Dashboard — AI Metrics.
**Tools:** Dashboard AI Metrics page, REST API.

### Scenario

Victor is a FinOps engineer. He needs to track LLM costs across SENTINEL agents, identify expensive operations, and set budget alerts.

### Step-by-Step Flow

**Step 1 — Open AI Metrics page**

Navigate to `https://sentinel.acme.com/ai-metrics`.

Dashboard shows:
```
LLM Usage — Last 30 days
Total Tokens:      42.3M input / 8.1M output
Total Cost:        $847.23
Avg Cost/Scan:     $0.34
Avg Latency:       2.3s per scan

By Agent:
  security-agent     $312.40  (37%)
  dependency-agent   $198.20  (23%)
  quality-agent      $156.80  (19%)
  policy-agent       $102.50  (12%)
  llm-review-agent   $ 77.33  ( 9%)

By Model:
  claude-sonnet-4-6  $623.18  (74%)
  claude-haiku-4-5   $224.05  (26%)
```

**Step 2 — Identify cost spikes**

Click the cost timeline chart:
- 2026-03-14 spike: $78.40 in one day (vs avg $28)
- Drill down: 23 scans of `payment-service` PR #142
- Large diff (50k+ lines from bulk migration) triggered expensive LLM passes

**Step 3 — Set budget alerts**

`AI Metrics > Budget Alerts > New`:
```
Alert Name:  Daily LLM Cost Threshold
Metric:      Daily LLM cost
Threshold:   $50
Notification: Slack — #devplatform
```

**Step 4 — API access for FinOps platform**

```python
resp = requests.get(
    "https://sentinel.acme.com/v1/ai-metrics",
    params={"period": "30d", "groupBy": "agent"},
    headers=headers,
)
```

**What Victor used:** AI Metrics dashboard, cost breakdown by agent/model, budget alerts.

---

## 27. Journey 25 — Enterprise Admin: Multi-Region Kubernetes Deployment

**Persona:** Enterprise infrastructure/SRE team deploying SENTINEL in a production Kubernetes cluster.
**Entry point:** Helm chart + Kubernetes manifests.
**Tools:** kubectl, Helm 3, cloud provider (AWS EKS / GKE / AKS).

### Scenario

Wendy is an SRE at an enterprise deploying SENTINEL on AWS EKS in us-east-1 and eu-west-1 for data residency compliance.

### Step-by-Step Flow

**Step 1 — Provision infrastructure (us-east-1)**

```bash
# EKS cluster
eksctl create cluster \
  --name sentinel-prod-us \
  --region us-east-1 \
  --nodegroup-name sentinel-nodes \
  --node-type m5.xlarge \
  --nodes 3 \
  --nodes-min 2 \
  --nodes-max 10

# RDS PostgreSQL
aws rds create-db-instance \
  --db-instance-identifier sentinel-postgres \
  --db-instance-class db.r6g.large \
  --engine postgres \
  --engine-version 15 \
  --master-username sentinel \
  --master-user-password $(aws secretsmanager get-secret-value --secret-id sentinel/db-password --query SecretString --output text) \
  --allocated-storage 100 \
  --storage-encrypted \
  --region us-east-1

# ElastiCache Redis
aws elasticache create-replication-group \
  --replication-group-id sentinel-redis \
  --replication-group-description "Sentinel Redis" \
  --num-cache-clusters 2 \
  --cache-node-type cache.r6g.large \
  --engine redis \
  --at-rest-encryption-enabled
```

**Step 2 — Install SENTINEL via Helm**

```bash
helm repo add sentinel https://charts.sentinel.archagents.dev
helm repo update

# Create namespace and secrets
kubectl create namespace sentinel

kubectl create secret generic sentinel-secrets \
  --namespace sentinel \
  --from-literal=database-url="postgresql://sentinel:${DB_PASS}@sentinel-postgres.xxx.rds.amazonaws.com:5432/sentinel" \
  --from-literal=redis-url="redis://sentinel-redis.xxx.cache.amazonaws.com:6379" \
  --from-literal=sentinel-secret="${HMAC_SECRET}" \
  --from-literal=github-client-id="${GITHUB_CLIENT_ID}" \
  --from-literal=github-client-secret="${GITHUB_CLIENT_SECRET}"

# Install
helm install sentinel sentinel/sentinel \
  --namespace sentinel \
  --values values-production.yaml
```

**Step 3 — Example production values**

```yaml
# values-production.yaml
replicaCount:
  api: 3
  dashboard: 2
  worker: 2

image:
  registry: ghcr.io/archagents
  tag: "1.0.0"

resources:
  api:
    requests: { cpu: "500m", memory: "1Gi" }
    limits:   { cpu: "2",    memory: "4Gi" }

autoscaling:
  api:
    enabled: true
    minReplicas: 3
    maxReplicas: 20
    targetCPUUtilizationPercentage: 70

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: sentinel.acme.com
      paths: [{ path: /, pathType: Prefix }]
  tls:
    - secretName: sentinel-tls
      hosts: [sentinel.acme.com]

retention:
  archiveEnabled: true
  archiveBucket: acme-sentinel-archive
  archiveRegion: us-east-1

monitoring:
  prometheusEnabled: true
  grafanaEnabled: true

backup:
  enabled: true
  schedule: "0 2 * * *"
  s3Bucket: acme-sentinel-backups
```

**Step 4 — Verify deployment**

```bash
kubectl -n sentinel get pods
# sentinel-api-xxx          3/3   Running
# sentinel-dashboard-xxx    2/2   Running
# sentinel-worker-xxx       2/2   Running
# sentinel-scheduler-xxx    1/1   Running

kubectl -n sentinel get ingress
# sentinel   nginx   sentinel.acme.com   ...   80, 443
```

**Step 5 — EU data residency (eu-west-1)**

Repeat with a separate cluster and separate database/Redis in eu-west-1. Configure the EU org in SENTINEL to use the EU cluster exclusively (data never leaves eu-west-1).

**What Wendy used:** Helm chart, EKS, RDS, ElastiCache, Kubernetes secrets, Ingress, HPA.

---

## 28. Cross-Journey Reference: Certificate Lifecycle

The compliance certificate is central to SENTINEL. Here is its full lifecycle:

```
Code change committed / PR opened
        ↓
Diff submitted to POST /v1/scans
        ↓
7 agents process in parallel:
  Security Agent (Semgrep + custom rules)
  Dependency Agent (OSV.dev API)
  License Agent (SPDX analysis)
  Quality Agent (complexity, coverage)
  Policy Agent (org policy rules)
  AI Detector Agent (probability scoring)
  LLM Review Agent (reasoning, confidence)
        ↓
Assessor consolidates results
        ↓
Certificate status assigned:
  full_pass        → all categories pass, risk score < 30
  provisional_pass → minor issues, risk score 30-60
  partial          → some categories pass, others warn
  fail             → critical/high findings present
  revoked          → certificate invalidated after post-issuance finding
        ↓
Certificate record created (immutable, signed)
        ↓
GitHub Check Run updated / GitLab pipeline status set
        ↓
Certificate viewable at /certificates
Verifiable via GET /v1/certificates/{id}/verify
Downloadable as signed PDF
        ↓
Expires after configured period (default: 90 days)
```

---

## 29. Cross-Journey Reference: Severity Thresholds & Exit Codes

### CLI Exit Codes

| Code | Meaning | When returned |
|------|---------|---------------|
| 0 | Pass | `full_pass` status, no findings at `--fail-on` threshold |
| 1 | Fail | Findings at or above `--fail-on` severity; `fail` or `revoked` status |
| 2 | Error | API unreachable, no diff provided, timeout |
| 3 | Provisional Pass | `provisional_pass` or `partial` status |

### Default Severity Thresholds by Context

| Context | Default `--fail-on` | Behavior |
|---------|---------------------|----------|
| `sentinel ci` | `critical,high` | Fails pipeline on critical or high findings |
| `sentinel scan` | None (informational) | Always exits 0; shows findings as output |
| Git post-commit hook | None (informational) | Commit is not rolled back |
| Azure Pipelines `SentinelScan@1` | `critical,high` | Configurable via `failOnFindings` input |
| GitHub Actions (recommended) | `critical,high` | Set via `--fail-on critical,high` flag |

### Severity SLA Guidelines

| Severity | Recommended SLA | CVSS v4.0 Range |
|----------|-----------------|-----------------|
| Critical | 24 hours | 9.0–10.0 |
| High | 7 days | 7.0–8.9 |
| Medium | 30 days | 4.0–6.9 |
| Low | 90 days | 0.1–3.9 |
| Info | No SLA | 0.0 |

---

*This document covers all currently implemented user journeys as of SENTINEL v0.1.0 (March 2026). For API reference details, see [docs/api/openapi.yaml](api/openapi.yaml). For security details, see [docs/security-whitepaper.md](security-whitepaper.md).*
