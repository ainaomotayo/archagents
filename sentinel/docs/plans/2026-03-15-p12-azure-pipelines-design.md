# P12: Azure Pipelines CI/CD Template — Design Document

**Date:** 2026-03-15
**Status:** Approved
**Author:** AI Architect

## Problem Statement

Sentinel supports GitHub Actions and GitLab CI via YAML templates in `templates/`. Azure DevOps is the third major CI/CD platform used in enterprise environments. While the backend VCS provider (`packages/vcs/src/providers/azure-devops.ts`), webhook routes, API registration, and Prisma schema are already complete, users cannot run Sentinel scans from Azure Pipelines because:

1. No `azure-pipelines.yml` template exists
2. The CLI only auto-detects GitHub Actions environment variables
3. No setup documentation exists for Azure DevOps

## Scope

**In scope:**
- Azure Pipelines YAML template
- CLI CI provider detection framework (Strategy pattern)
- Exponential backoff with jitter for poll loop
- Setup documentation
- Tests

**Out of scope (future priorities):**
- Dashboard VCS configuration UI
- Azure DevOps Marketplace Extension
- Service Hook auto-provisioning API

## Enterprise Approach Analysis

### Algorithms — Diff Submission & Result Polling

| Approach | Performance | Scalability | Accuracy | Efficiency |
|----------|-------------|-------------|----------|------------|
| A. Fixed 2s interval (current) | Medium | Low | High | Low |
| **B. Exponential backoff + jitter** | Medium | High | High | High |
| C. Webhook callback + poll fallback | High | High | High | High |

**Selected: B** — Reduces API calls by ~70% vs fixed interval with zero infrastructure overhead. Webhook callbacks (C) require Azure Functions or Service Bus relay, adding complexity disproportionate to the gain for scans completing in 10-30s.

### Data Structures — CI Environment Detection

| Approach | Performance | Scalability | Accuracy | Efficiency |
|----------|-------------|-------------|----------|------------|
| A. Linear if-else chain (current) | High | Low | Medium | Low |
| **B. Provider Registry Map** | High | High | High | High |
| C. JSON config-driven detection | High | High | Medium | Medium |

**Selected: B** — Typed interfaces give compile-time safety, IDE support, and testability. JSON config (C) over-abstracts for 4 known providers. If-else chains (A) already show fragility with only GitHub support.

### System Design — Pipeline Template Architecture

| Approach | Performance | Scalability | Accuracy | Efficiency |
|----------|-------------|-------------|----------|------------|
| **A. Single-stage inline template** | High | Medium | High | High |
| B. Multi-stage with dedicated gates | Low | High | Medium | Low |
| C. Marketplace Extension task | High | High | High | Medium |

**Selected: A** — Consistent with GitHub Actions and GitLab CI templates. Multi-stage (B) adds ~30s overhead for no benefit. Extensions (C) are the right long-term play but require marketplace infrastructure. Template A is the foundation that future Extension C would wrap.

### Software Design — CLI Code Architecture

| Approach | Performance | Scalability | Accuracy | Efficiency |
|----------|-------------|-------------|----------|------------|
| A. Conditional branching (current) | High | Low | Medium | Low |
| **B. Strategy pattern with detectors** | High | High | High | High |
| C. Plugin-based dynamic loading | Medium | Very High | Medium | Low |

**Selected: B** — Mirrors the existing VCS provider pattern (`VcsProviderBase` → implementations). Creates architectural consistency. Plugin loading (C) over-engineers for 4 providers.

## Component Design

### 1. Azure Pipelines Template

**File:** `sentinel/templates/azure-pipelines.yml`

Design decisions:
- `trigger` (push) + `pr` (pull request) sections, branches `['*']`
- `vmImage: ubuntu-latest`, Node.js 22
- `checkout` with `fetchDepth: 0` for full git history
- Maps Azure DevOps built-in variables to `SENTINEL_*` as bridge
- PR-aware diff: uses merge-base for PRs, HEAD~1 for pushes
- Exit codes gate the pipeline (0=pass, 1=fail, 2=error, 3=provisional)
- Secrets via Azure Pipeline Variables (group or inline)

### 2. CI Provider Detection Framework

**Location:** `sentinel/apps/cli/src/ci-providers/`

```
types.ts              # CiProviderInfo, CiProviderDetector interfaces
github.ts             # GitHub Actions: GITHUB_ACTIONS, GITHUB_SHA, etc.
gitlab.ts             # GitLab CI: GITLAB_CI, CI_COMMIT_SHA, etc.
azure-devops.ts       # Azure Pipelines: TF_BUILD, BUILD_SOURCEVERSION, etc.
generic.ts            # Fallback: SENTINEL_* env vars only
detect.ts             # Factory: SENTINEL_PROVIDER override → iterate detectors
```

**Interface:**
```typescript
interface CiProviderInfo {
  provider: string;        // "github" | "gitlab" | "azure_devops" | "generic"
  commitHash: string;
  branch: string;
  author: string;
  prNumber?: number;
  projectId: string;
  repositoryUrl?: string;
}

interface CiProviderDetector {
  readonly name: string;
  canDetect(): boolean;
  detect(): CiProviderInfo;
}
```

**Azure DevOps env var mapping:**

| Azure Variable | Target Field | Transform |
|---------------|-------------|-----------|
| `TF_BUILD` | detection trigger | === "True" |
| `BUILD_SOURCEVERSION` | commitHash | direct |
| `BUILD_SOURCEBRANCH` | branch | strip `refs/heads/` |
| `BUILD_REQUESTEDFOR` | author | direct |
| `SYSTEM_PULLREQUEST_PULLREQUESTID` | prNumber | parseInt |
| `BUILD_REPOSITORY_NAME` | projectId | direct |
| `BUILD_REPOSITORY_URI` | repositoryUrl | direct |

**Detection priority:** `SENTINEL_PROVIDER` override → AzureDevOps → GitHub → GitLab → Generic

**Integration:** `buildPayload()` in `ci.ts` delegates to `detectCiProvider()` instead of inline env var lookups. Backward-compatible — existing `GITHUB_*` and `SENTINEL_*` vars continue to work.

### 3. Exponential Backoff Enhancement

**File:** `sentinel/apps/cli/src/commands/ci.ts` (modify `pollForResult`)

```
Initial: 1000ms
Factor: 2x
Cap: 16000ms
Jitter: 0-500ms random
```

Progression: 1s → 2s → 4s → 8s → 16s (cap). For a 15s scan: ~4 polls vs ~7 (fixed). For a 120s scan: ~12 polls vs ~60 (fixed).

External contract unchanged — same return type, same timeout behavior.

### 4. Documentation

**File:** `sentinel/docs/azure-devops-setup.md`

Sections: Prerequisites, Server Setup, Pipeline Setup, Webhook Setup, Verification, Troubleshooting.

### 5. Tests

| File | Coverage |
|------|----------|
| `ci-providers/azure-devops.test.ts` | canDetect, env var mapping, PR parsing, branch stripping |
| `ci-providers/detect.test.ts` | Priority order, override, fallback |
| `ci-providers/github.test.ts` | Regression after refactor |
| `commands/ci.test.ts` | Backoff interval progression |

## Data Flow

```
Azure Pipelines Agent
  ├── checkout (fetch-depth: 0)
  ├── install @sentinel/cli
  ├── git diff HEAD~1 HEAD (push) or git diff origin/main...HEAD (PR)
  └── sentinel ci --api-url $SENTINEL_API_URL
        ├── detectCiProvider() → AzureDevOpsCiDetector
        │     └── reads TF_BUILD, BUILD_SOURCEVERSION, etc.
        ├── buildPayload(diff) → SentinelDiffPayload
        ├── submitScan() → POST /v1/scans → scanId
        ├── pollForResult(scanId) [exponential backoff]
        │     └── GET /v1/scans/{scanId}/poll (1s, 2s, 4s, 8s, 16s...)
        └── exit code → pipeline pass/fail gate
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Azure env vars change across agent versions | Low | Medium | Generic fallback detector; SENTINEL_* override always works |
| Backoff increases tail latency | Medium | Low | 16s cap; scan typically completes in <30s |
| Template YAML syntax issues | Low | Low | Validated by Azure Pipelines at creation time |

## Success Criteria

1. User can copy `azure-pipelines.yml` to repo, configure 3 variables, and run a Sentinel scan
2. CLI auto-detects Azure Pipelines environment without manual SENTINEL_* variable setup
3. Poll loop uses 70% fewer API calls than current fixed-interval approach
4. All existing tests continue to pass (backward compatibility)
5. New tests cover all 4 CI provider detectors
