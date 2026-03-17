# P15: GitLab CI Native Template & CI Provider Detection Framework

**Date**: 2026-03-17
**Status**: Approved
**Scope**: Full template + GitLab CI/CD Component + CLI provider detection framework (all 4 providers)

## Overview

Add a production-grade GitLab CI template (`.gitlab-ci.yml`), a reusable GitLab CI/CD Component, and a universal CI provider detection framework that replaces the hardcoded GitHub env var fallbacks in the CLI's `ci` command. Also introduces exponential backoff polling, optional SSE streaming, and GitLab Security Dashboard integration via SAST report format.

## Enterprise Approach Selection

### Algorithms — Hybrid B+C: Exponential Backoff (default) + SSE Streaming (opt-in)

- **Default**: Exponential backoff with jitter — 1s→2s→4s→8s→16s cap, +0-500ms random jitter
- **Opt-in**: `--stream` flag for SSE-based real-time results (future API endpoint)
- **Justification**: Backoff reduces API load ~60% vs fixed 2s polling. SSE eliminates polling entirely for latency-sensitive users but requires server-side support — making it opt-in avoids blocking the template on API changes.

### Data Structures — B: Strategy Pattern (CiProviderDetector interface)

- Priority-ordered registry of detectors, each with `canDetect()` + `detect()` methods
- First match wins, generic fallback always available
- **Justification**: O(n) with n=4 providers. Simple, extensible, no over-engineering. Adding a new CI provider = one file + register call.

### System Design — Hybrid A+C: Inline Template + GitLab CI/CD Component

- **Inline template**: Copy-paste `templates/gitlab-ci.yml` for immediate use
- **Component**: `templates/gitlab-component/template.yml` for GitLab's component catalog (`include: component:`)
- **Justification**: Inline template has zero setup cost. Component enables versioned, parameterized consumption for enterprises with many repos. Both share the same CLI invocation underneath.

### Software Design — B: Modular DI (ci-providers/ directory)

- Each detector in its own file under `apps/cli/src/ci-providers/`
- Registry auto-imports and sorts by priority
- **Justification**: Clean separation, independently testable, no circular deps. Matches the existing `packages/vcs/src/providers/` pattern.

## Component Design

### 1. CI Provider Detection Framework

**Directory**: `apps/cli/src/ci-providers/`

```
ci-providers/
├── index.ts              # Registry + detectCiEnvironment() entry point
├── types.ts              # CiProviderDetector interface + CiEnvironment type
├── github.ts             # GitHub Actions detector (priority 10)
├── gitlab.ts             # GitLab CI detector (priority 20)
├── azure-devops.ts       # Azure DevOps Pipelines detector (priority 30)
├── generic.ts            # Generic fallback via git CLI (priority 99)
└── __tests__/
    ├── github.test.ts
    ├── gitlab.test.ts
    ├── azure-devops.test.ts
    ├── generic.test.ts
    └── registry.test.ts
```

**Core types (`types.ts`)**:

```typescript
export interface CiEnvironment {
  provider: "github" | "gitlab" | "azure_devops" | "generic";
  commitSha: string;
  branch: string;
  baseBranch?: string;
  actor: string;
  repository: string;
  mergeRequestId?: string;
  pipelineId?: string;
  pipelineUrl?: string;
  projectId?: string;
  serverUrl?: string;
}

export interface CiProviderDetector {
  readonly name: string;
  readonly priority: number;
  canDetect(): boolean;   // sync — env var check only
  detect(): CiEnvironment; // sync — reads env vars
}
```

**Detection signals**:

| Provider | `canDetect()` | Key env vars |
|----------|---------------|-------------|
| GitHub | `!!process.env.GITHUB_ACTIONS` | `GITHUB_SHA`, `GITHUB_REF_NAME`, `GITHUB_ACTOR`, `GITHUB_REPOSITORY` |
| GitLab | `!!process.env.GITLAB_CI` | `CI_COMMIT_SHA`, `CI_COMMIT_REF_NAME`, `GITLAB_USER_LOGIN`, `CI_PROJECT_PATH`, `CI_MERGE_REQUEST_IID`, `CI_MERGE_REQUEST_TARGET_BRANCH_NAME` |
| Azure DevOps | `!!process.env.TF_BUILD` | `BUILD_SOURCEVERSION`, `BUILD_SOURCEBRANCH`, `BUILD_REQUESTEDFOR`, `BUILD_REPOSITORY_NAME`, `SYSTEM_PULLREQUEST_TARGETBRANCH` |
| Generic | always `true` | `git rev-parse HEAD`, `git branch --show-current`, `git config user.name` |

**Registry (`index.ts`)**:

```typescript
const detectors: CiProviderDetector[] = [
  new GitHubDetector(),
  new GitLabDetector(),
  new AzureDevOpsDetector(),
  new GenericDetector(),
].sort((a, b) => a.priority - b.priority);

export function detectCiEnvironment(): CiEnvironment {
  for (const d of detectors) {
    if (d.canDetect()) return d.detect();
  }
  throw new Error("Unable to detect CI environment");
}
```

### 2. Exponential Backoff Poll Module

**File**: `apps/cli/src/poll.ts`

```typescript
export interface PollOptions {
  initialDelayMs?: number;    // default 1000
  maxDelayMs?: number;        // default 16000
  backoffFactor?: number;     // default 2
  maxJitterMs?: number;       // default 500
  timeoutMs?: number;         // default 300000 (5 min)
  signal?: AbortSignal;
}

export async function pollWithBackoff<T>(
  fn: () => Promise<{ done: boolean; value: T }>,
  opts?: PollOptions,
): Promise<T>
```

Progression: 1s → 2s → 4s → 8s → 16s (cap), each +0-500ms jitter. Replaces fixed 2s `setInterval` in current `pollForResult()`.

### 3. SSE Streaming (Opt-in)

**File**: `apps/cli/src/stream.ts`

- `--stream` CLI flag triggers SSE mode via `GET /v1/scans/:id/stream` (Accept: text/event-stream)
- Falls back to poll if SSE endpoint returns 404
- Parses SSE frames, emits `ScanEvent` callbacks for progress display
- Final `event: complete` frame contains `ScanResult`

### 4. GitLab CI Template

**File**: `templates/gitlab-ci.yml` (replaces current 24-line stub)

Key features:
- `.sentinel-base` hidden job for DRY reuse
- `GIT_DEPTH: 0` for accurate diff analysis
- Configurable variables: `SENTINEL_CLI_VERSION`, `SENTINEL_FAIL_ON`, `SENTINEL_TIMEOUT`, `SENTINEL_OUTPUT_FORMAT`
- `artifacts.reports.sast: gl-sast-report.json` for GitLab Security Dashboard
- Separate manual `sentinel-scan-sarif` job for SARIF export
- `rules:` for merge request and default branch pipelines

### 5. GitLab CI/CD Component

**Directory**: `templates/gitlab-component/`

**`template.yml`** with `spec.inputs`:
- `api-url` (required string)
- `api-key` (string, default `$SENTINEL_API_KEY`)
- `fail-on` (string, default `"critical,high"`)
- `timeout` (string, default `"10m"`)
- `cli-version` (string, default `"latest"`)
- `enable-sast-report` (boolean, default `true`)
- `stage` (string, default `"test"`)

Consumer usage:
```yaml
include:
  - component: gitlab.com/sentinel-security/sentinel-ci/sentinel-scan@1.0.0
    inputs:
      api-url: https://api.sentinel.dev
      fail-on: critical
```

### 6. GitLab Security Dashboard Integration

**File**: `apps/cli/src/formatters/gitlab-sast.ts`

Converts Sentinel findings → GitLab SAST report format v15.1.0:
- Maps severity levels: critical→Critical, high→High, medium→Medium, low→Low, info→Info
- Outputs `gl-sast-report.json` with `scan.type: "sast"`, `scan.analyzer.id: "sentinel"`
- Each finding maps to `vulnerabilities[]` with id, category, name, severity, confidence, location, identifiers (CWE, rule ID)
- Auto-generated when GitLab CI detected OR `--format gitlab-sast`

### 7. Refactored CI Command

**File**: `apps/cli/src/commands/ci.ts` (modify existing 329 lines)

Changes:
1. Replace hardcoded `GITHUB_SHA`/`GITHUB_REF_NAME`/`GITHUB_ACTOR` with `detectCiEnvironment()`
2. Replace fixed 2s poll with `pollWithBackoff()`
3. Add `--stream` option for SSE mode
4. Add `--format gitlab-sast` option
5. Auto-write `gl-sast-report.json` when GitLab detected
6. Keep all existing options and exit code logic intact

## Data Flow

```
GitLab MR push
  → .gitlab-ci.yml (or Component include:)
    → npm install @sentinel/cli
    → sentinel ci --api-url $SENTINEL_API_URL
      → detectCiEnvironment()  → GitLabDetector matches GITLAB_CI=true
        → CiEnvironment { provider: "gitlab", commitSha, branch, mergeRequestId, ... }
      → buildPayload(env, options) → POST /v1/scans
      → pollWithBackoff() or streamResults() → wait for scan
      → formatGitLabSast(findings) → gl-sast-report.json
      → formatSarif(findings) → sentinel.sarif (if --format sarif)
      → exit 0 (pass) or 1 (fail)
  → GitLab artifacts upload
    → Security Dashboard reads gl-sast-report.json
```

## Test Plan

| Component | Type | Key Scenarios | Est. Tests |
|-----------|------|---------------|------------|
| GitHubDetector | Unit | Env var mapping, missing vars throw, canDetect true/false | 8 |
| GitLabDetector | Unit | Full MR context, push-only context, missing vars | 8 |
| AzureDevOpsDetector | Unit | PR context, CI-only context, branch ref stripping | 8 |
| GenericDetector | Unit | Git CLI fallback, no git available | 5 |
| Registry | Unit | Priority ordering, first-match wins, fallback to generic | 6 |
| pollWithBackoff | Unit | Immediate resolve, multi-iteration, timeout, abort, jitter bounds | 10 |
| formatGitLabSast | Unit | Severity mapping, location, empty findings, CWE identifiers | 8 |
| buildPayload | Unit | All 4 providers produce valid payloads | 4 |
| ci.ts integration | Integration | GitLab env → scan → poll → output files (mocked API) | 12 |
| gitlab-ci.yml | Lint | Valid YAML, required keys present | 3 |
| Component template | Lint | Valid spec.inputs schema, interpolation syntax | 3 |
| **Total** | | | **~75** |

## Files Changed

### New files
- `apps/cli/src/ci-providers/types.ts`
- `apps/cli/src/ci-providers/index.ts`
- `apps/cli/src/ci-providers/github.ts`
- `apps/cli/src/ci-providers/gitlab.ts`
- `apps/cli/src/ci-providers/azure-devops.ts`
- `apps/cli/src/ci-providers/generic.ts`
- `apps/cli/src/ci-providers/__tests__/github.test.ts`
- `apps/cli/src/ci-providers/__tests__/gitlab.test.ts`
- `apps/cli/src/ci-providers/__tests__/azure-devops.test.ts`
- `apps/cli/src/ci-providers/__tests__/generic.test.ts`
- `apps/cli/src/ci-providers/__tests__/registry.test.ts`
- `apps/cli/src/poll.ts`
- `apps/cli/src/poll.test.ts`
- `apps/cli/src/stream.ts`
- `apps/cli/src/formatters/gitlab-sast.ts`
- `apps/cli/src/formatters/gitlab-sast.test.ts`
- `templates/gitlab-component/template.yml`
- `templates/gitlab-component/README.md`

### Modified files
- `templates/gitlab-ci.yml` — Full rewrite from 24-line stub
- `apps/cli/src/commands/ci.ts` — Refactor to use detection framework + backoff
- `apps/cli/src/commands/ci.test.ts` — Update tests for new detection flow
- `apps/cli/src/cli.ts` — Add `--stream` and `--format gitlab-sast` options
