# P17 — Enterprise Dashboard Redesign: Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove mock data from all production code paths, add enterprise-quality empty states, and redesign the overview page as a customer-centric command center with onboarding flow.

**Architecture:** The `tryApi` wrapper in `lib/api.ts` currently silently falls back to mock data on any error. We replace that with empty-value fallbacks (`[]`, `null`, zero structs). A new `EmptyState` component provides consistent empty states across all pages. The overview page is restructured into three zones with an onboarding flow that appears when `totalScans === 0`.

**Tech Stack:** Next.js 15 App Router (RSC + Client Components), Tailwind CSS, TypeScript. Tests via Vitest + React Testing Library. The dashboard runs at `apps/dashboard/`. All paths below are relative to `apps/dashboard/` unless stated otherwise.

---

## Task 1: Fix `tryApi` — remove mock data fallbacks from production paths

**Files:**
- Modify: `lib/api.ts`

**Context:**
`tryApi` at line 79 currently accepts a `fallback: T` that is always a `MOCK_*` constant. We change it to accept `empty: T` and remove all MOCK imports.

**Step 1: Run existing tests to establish baseline**
```bash
cd apps/dashboard && npx vitest run --reporter=verbose 2>&1 | tail -20
```
Expected: all existing tests pass (they import mock data directly, unaffected by this change).

**Step 2: Change `tryApi` signature and body**

In `lib/api.ts`, replace lines 79–87:
```typescript
async function tryApi<T>(fn: (headers: Record<string, string>) => Promise<T>, empty: T): Promise<T> {
  try {
    const headers = await getSessionHeaders();
    return await fn(headers);
  } catch {
    return empty;
  }
}
```

Remove the `const USE_MOCK = !process.env.SENTINEL_API_URL;` line (line 61) — it is no longer needed.

**Step 3: Update every `tryApi` call site — replace `MOCK_*` fallbacks with empty values**

In `lib/api.ts`, update each function's fallback argument:

| Function | Old fallback | New empty value |
|----------|-------------|-----------------|
| `getOverviewStats` | `MOCK_OVERVIEW_STATS` | `{ totalScans: 0, activeRevocations: 0, openFindings: 0, passRate: 0 }` |
| `getRecentScans` | `MOCK_SCANS.slice(0, limit)` | `[]` |
| `getProjects` | `MOCK_PROJECTS` | `[]` |
| `getProjectById` | `MOCK_PROJECTS.find(...)` | `null` |
| `getProjectScans` | `MOCK_SCANS.filter(...)` | `[]` |
| `getProjectFindingCounts` | `MOCK_FINDING_COUNTS_BY_CATEGORY` | `[]` |
| `getFindings` | `MOCK_FINDINGS` | `[]` |
| `getFindingById` | `MOCK_FINDINGS.find(...)` | `null` |
| `getCertificates` | `MOCK_CERTIFICATES` | `[]` |
| `getCertificateById` | `MOCK_CERTIFICATES.find(...)` | `null` |
| `getPolicies` | `MOCK_POLICIES` | `[]` |
| `getPolicyById` | `MOCK_POLICIES.find(...)` | `null` |
| `getAuditLog` | `MOCK_AUDIT_LOG` | `[]` |
| `getComplianceScores` | `MOCK_FRAMEWORK_SCORES` | `[]` |
| `getComplianceTrends` | `MOCK_COMPLIANCE_TRENDS[...]` | `[]` |
| `getAttestations` | `MOCK_ATTESTATIONS` | `[]` |
| `getAttestationById` | `MOCK_ATTESTATIONS.find(...)` | `null` |
| `getActiveAttestations` | `MOCK_ATTESTATION_OVERRIDES` | `[]` |
| `getApprovalGates` | `MOCK_APPROVAL_GATES...` | `[]` |
| `getApprovalGateById` | `MOCK_APPROVAL_GATES.find(...)` | `null` |
| `getApprovalStats` | `MOCK_APPROVAL_STATS` | `{ pending: 0, escalated: 0, approved: 0, rejected: 0 }` |
| `getRemediations` | `filterMockRemediations(...)` | `[]` |
| `getRemediationStats` | `MOCK_REMEDIATION_STATS` | `{ open: 0, inProgress: 0, done: 0, overdue: 0 }` |
| `getRemediationById` | `MOCK_REMEDIATION_ITEMS.find(...)` | `null` |

**Step 4: Remove all `MOCK_*` import lines (lines 40–59)**

Delete the entire import block:
```typescript
import {
  MOCK_ATTESTATIONS,
  ...
} from "./mock-data";
import {
  MOCK_ITEMS as MOCK_REMEDIATION_ITEMS,
  MOCK_STATS as MOCK_REMEDIATION_STATS,
} from "./remediation-mock-data";
```

Also delete `filterMockRemediations` helper function at the bottom of the file (lines 697–713) — it was only used for the mock fallback.

**Step 5: Run tests to confirm no regressions**
```bash
cd apps/dashboard && npx vitest run --reporter=verbose 2>&1 | tail -20
```
Expected: all tests pass. Tests import directly from `lib/mock-data.ts` and are unaffected.

**Step 6: Commit**
```bash
git add apps/dashboard/lib/api.ts
git commit -m "feat(dashboard): remove mock data from production API fallbacks"
```

---

## Task 2: Fix AI metrics functions — remove `if (USE_MOCK)` blocks

**Files:**
- Modify: `lib/api.ts`

**Context:**
AI metrics functions (`getAIMetricsStats`, `getAIMetricsTrend`, `getAIMetricsTools`, etc.) use direct `if (USE_MOCK)` blocks instead of `tryApi`. Replace them with `tryApi` and empty fallbacks.

**Step 1: Replace `getAIMetricsStats` (around line 717)**

```typescript
export async function getAIMetricsStats(): Promise<AIMetricsStats> {
  return tryApi(async (headers) => {
    const res = await fetch(`${process.env.SENTINEL_API_URL}/v1/ai-metrics/stats`, {
      headers,
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`AI metrics stats: ${res.status}`);
    return res.json();
  }, {
    hasData: false,
    stats: { aiRatio: 0, aiFiles: 0, totalFiles: 0, aiLoc: 0, totalLoc: 0, aiInfluenceScore: 0, avgProbability: 0, medianProbability: 0, p95Probability: 0 },
    toolBreakdown: [],
  });
}
```

**Step 2: Replace `getAIMetricsTrend`**

```typescript
export async function getAIMetricsTrend(days = 30, projectId?: string): Promise<AITrendResult> {
  return tryApi(async (headers) => {
    const params = new URLSearchParams({ days: String(days) });
    if (projectId) params.set("projectId", projectId);
    const res = await fetch(`${process.env.SENTINEL_API_URL}/v1/ai-metrics/trend?${params}`, {
      headers,
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`AI metrics trend: ${res.status}`);
    return res.json();
  }, { points: [], momChange: 0, movingAvg7d: 0, movingAvg30d: 0 });
}
```

**Step 3: Replace `getAIMetricsTools`, `getAIMetricsProjects`, `getAIMetricsCompare`, `getAIMetricsAlerts`, `getAIMetricsConfig`, `updateAIMetricsConfig`**

Each gets `tryApi` with an appropriate empty fallback:
- `getAIMetricsTools` → `[]`
- `getAIMetricsProjects` → `[]`
- `getAIMetricsCompare` → `{ projectIds, days, series: {} }`
- `getAIMetricsAlerts` → `[]`
- `getAIMetricsConfig` → `{ threshold: 0.5, strictMode: false, alertEnabled: false, alertMaxRatio: null, alertSpikeStdDev: 2.0, alertNewTool: true }`
- `updateAIMetricsConfig` → keep as direct fetch (no fallback needed for mutations)

**Step 4: Run tests**
```bash
cd apps/dashboard && npx vitest run --reporter=verbose 2>&1 | tail -20
```

**Step 5: Commit**
```bash
git add apps/dashboard/lib/api.ts
git commit -m "feat(dashboard): replace AI metrics mock blocks with real API calls"
```

---

## Task 3: Create `lib/demo-data.ts` — controlled demo mode

**Files:**
- Create: `lib/demo-data.ts`
- Add comment to: `lib/mock-data.ts`
- Add comment to: `lib/remediation-mock-data.ts`

**Context:**
Mock data should only be used in unit tests or in a dedicated demo environment (`DEMO_MODE=true`). This task creates the controlled export point and adds discoverability comments.

**Step 1: Create `lib/demo-data.ts`**

```typescript
/**
 * SENTINEL Demo Data
 *
 * Re-exports all mock data behind the DEMO_MODE flag.
 * Only use this in demo docker-compose configurations with DEMO_MODE=true.
 * Never import this in production code.
 */
export const DEMO_MODE = process.env.DEMO_MODE === "true";

export * from "./mock-data";
export { MOCK_ITEMS as DEMO_REMEDIATION_ITEMS, MOCK_STATS as DEMO_REMEDIATION_STATS } from "./remediation-mock-data";
```

**Step 2: Add usage comment to `lib/mock-data.ts`** (insert after line 6):
```typescript
/**
 * USAGE: Only import this file from:
 *   - __tests__/ directories (unit tests)
 *   - lib/demo-data.ts (demo environment only)
 * Never import directly in page components or lib/api.ts.
 */
```

**Step 3: Add same comment to `lib/remediation-mock-data.ts`** — add to file header.

**Step 4: Commit**
```bash
git add apps/dashboard/lib/demo-data.ts apps/dashboard/lib/mock-data.ts apps/dashboard/lib/remediation-mock-data.ts
git commit -m "feat(dashboard): add demo-data.ts to isolate mock data behind DEMO_MODE flag"
```

---

## Task 4: Create reusable `EmptyState` component

**Files:**
- Create: `components/empty-state.tsx`
- Create: `components/__tests__/empty-state.test.tsx`

**Context:**
All pages need consistent empty states. This component handles both the default (action needed) and success (nothing to do, which is good) variants.

**Step 1: Write the test first**

```typescript
// components/__tests__/empty-state.test.tsx
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../empty-state";
import { IconFolder } from "../icons";

describe("EmptyState", () => {
  it("renders headline and body text", () => {
    render(<EmptyState icon={IconFolder} headline="No projects yet" body="Add a project to get started." />);
    expect(screen.getByText("No projects yet")).toBeInTheDocument();
    expect(screen.getByText("Add a project to get started.")).toBeInTheDocument();
  });

  it("renders CTA button when provided", () => {
    render(<EmptyState icon={IconFolder} headline="No projects" cta={{ label: "Add project", href: "/settings/vcs" }} />);
    const link = screen.getByRole("link", { name: "Add project" });
    expect(link).toHaveAttribute("href", "/settings/vcs");
  });

  it("applies success variant styling", () => {
    const { container } = render(<EmptyState icon={IconFolder} headline="All clear" variant="success" />);
    expect(container.firstChild).toHaveClass("border-status-pass/20");
  });

  it("does not render CTA when not provided", () => {
    render(<EmptyState icon={IconFolder} headline="No data" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
```

**Step 2: Run test to confirm it fails**
```bash
cd apps/dashboard && npx vitest run components/__tests__/empty-state.test.tsx --reporter=verbose
```
Expected: FAIL — `EmptyState` not found.

**Step 3: Implement `components/empty-state.tsx`**

```typescript
import Link from "next/link";
import type { ComponentType } from "react";

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>;
  headline: string;
  body?: string;
  cta?: { label: string; href: string };
  secondaryLink?: { label: string; href: string };
  variant?: "default" | "success";
}

export function EmptyState({
  icon: Icon,
  headline,
  body,
  cta,
  secondaryLink,
  variant = "default",
}: EmptyStateProps) {
  const isSuccess = variant === "success";
  return (
    <div
      className={`flex min-h-[320px] items-center justify-center rounded-xl border border-dashed bg-surface-1 ${
        isSuccess ? "border-status-pass/20" : "border-border"
      }`}
    >
      <div className="flex flex-col items-center text-center px-6 py-12 max-w-sm">
        <div
          className={`mb-5 flex h-14 w-14 items-center justify-center rounded-xl ring-2 ring-offset-2 ring-offset-surface-1 ${
            isSuccess
              ? "bg-status-pass/10 ring-status-pass/20 text-status-pass"
              : "bg-surface-2 ring-border text-text-tertiary"
          }`}
        >
          <Icon className="h-7 w-7" />
        </div>
        <p className="text-[15px] font-semibold text-text-primary">{headline}</p>
        {body && (
          <p className="mt-2 text-[13px] leading-relaxed text-text-tertiary">{body}</p>
        )}
        {cta && (
          <Link
            href={cta.href}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-all hover:brightness-110 focus-ring"
          >
            {cta.label}
            <span aria-hidden>→</span>
          </Link>
        )}
        {secondaryLink && (
          <a
            href={secondaryLink.href}
            className="mt-3 text-[12px] font-medium text-text-tertiary hover:text-text-secondary transition-colors"
          >
            {secondaryLink.label}
          </a>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Run tests**
```bash
cd apps/dashboard && npx vitest run components/__tests__/empty-state.test.tsx --reporter=verbose
```
Expected: 4/4 PASS.

**Step 5: Commit**
```bash
git add apps/dashboard/components/empty-state.tsx apps/dashboard/components/__tests__/empty-state.test.tsx
git commit -m "feat(dashboard): add reusable EmptyState component"
```

---

## Task 5: Upgrade empty states on secondary pages

**Files:**
- Modify: `app/(dashboard)/certificates/page.tsx`
- Modify: `app/(dashboard)/policies/page.tsx`
- Modify: `app/(dashboard)/audit/page.tsx`
- Modify: `app/(dashboard)/compliance/page.tsx`
- Modify: `app/(dashboard)/approvals/page.tsx`
- Modify: `app/(dashboard)/remediations/page.tsx`

**Context:**
Replace the ad-hoc inline empty state divs on these pages with the new `EmptyState` component. Each page already checks for empty data — we just upgrade the presentation.

**Step 1: Update `certificates/page.tsx`**

Replace the existing empty state div (around lines 65–79) with:
```tsx
import { EmptyState } from "@/components/empty-state";
import { IconShield } from "@/components/icons";

// In JSX, replace the empty state div:
{certificates.length === 0 ? (
  <EmptyState
    icon={IconShield}
    headline="No certificates issued yet"
    body="Certificates are issued automatically when scans pass all compliance thresholds."
    cta={{ label: "Run your first scan", href: "/projects" }}
  />
) : ( ... )}
```

**Step 2: Update `policies/page.tsx`**

Read the file first, then replace its empty state with:
```tsx
<EmptyState
  icon={IconFileText}
  headline="No policies configured"
  body="Policies define the rules SENTINEL enforces on every scan."
  cta={{ label: "Create a policy", href: "/policies/new" }}
/>
```

**Step 3: Update `audit/page.tsx`**

Read the file first, then replace its empty state with:
```tsx
<EmptyState
  icon={IconClock}
  headline="No activity recorded yet"
  body="All authentication, scan, and configuration events will appear here."
/>
```

**Step 4: Update `compliance/page.tsx`**

Read the file first. If compliance scores are empty (`frameworkScores.length === 0`), show:
```tsx
<EmptyState
  icon={IconClipboardCheck}
  headline="Compliance posture requires scan data"
  body="Run at least one scan to see your compliance posture across configured frameworks."
  cta={{ label: "Add a project", href: "/settings/vcs" }}
/>
```

**Step 5: Update `approvals/page.tsx`**

Read the file first. When pending approvals are empty, use success variant:
```tsx
<EmptyState
  icon={IconCheckCircle}
  headline="No approvals pending"
  body="Your team is all caught up. New approval requests will appear here."
  variant="success"
/>
```

**Step 6: Update `remediations/page.tsx`**

Read the file first. When remediations list is empty and no filter is active, use success variant:
```tsx
<EmptyState
  icon={IconCheckSquare}
  headline="No open remediations"
  body="All remediation items have been resolved."
  variant="success"
/>
```

**Step 7: Run tests**
```bash
cd apps/dashboard && npx vitest run --reporter=verbose 2>&1 | tail -20
```

**Step 8: Commit**
```bash
git add apps/dashboard/app/\(dashboard\)/certificates/page.tsx \
        apps/dashboard/app/\(dashboard\)/policies/page.tsx \
        apps/dashboard/app/\(dashboard\)/audit/page.tsx \
        apps/dashboard/app/\(dashboard\)/compliance/page.tsx \
        apps/dashboard/app/\(dashboard\)/approvals/page.tsx \
        apps/dashboard/app/\(dashboard\)/remediations/page.tsx
git commit -m "feat(dashboard): upgrade empty states on secondary pages to EmptyState component"
```

---

## Task 6: Upgrade Projects and Findings pages

**Files:**
- Modify: `app/(dashboard)/projects/page.tsx`
- Modify: `app/(dashboard)/findings/page.tsx`
- Create: `app/(dashboard)/findings/findings-client.tsx`

**Context:**
Projects gets a "Connect repository" button, project health chip, and overdue scan warning. Findings gets severity filter pills (requires a client component for interactivity) and colored left borders.

**Step 1: Update `projects/page.tsx`**

- Import `EmptyState` and `IconGitBranch`
- Add "Connect repository" button to `PageHeader` action slot:
  ```tsx
  action={
    <Link href="/settings/vcs" className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[12px] font-semibold text-white transition-all hover:brightness-110 focus-ring">
      Connect repository <span aria-hidden>+</span>
    </Link>
  }
  ```
- Replace existing empty state div with:
  ```tsx
  <EmptyState
    icon={IconGitBranch}
    headline="No repositories monitored yet"
    body="Connect a repository via your VCS integration to start scanning."
    cta={{ label: "Go to Integrations", href: "/settings/vcs" }}
  />
  ```
- Add health chip to each project card. After the `StatusBadge`, add:
  ```tsx
  // Compute health from lastScanStatus and findingCount
  const getHealthChip = (status: string | null, findings: number) => {
    if (!status) return null;
    if (status === "fail" || findings >= 10) return { label: "Critical", color: "text-status-fail bg-status-fail/10" };
    if (status === "provisional" || findings >= 3) return { label: "At Risk", color: "text-status-warn bg-status-warn/10" };
    return { label: "Healthy", color: "text-status-pass bg-status-pass/10" };
  };
  // Render as: <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${chip.color}`}>{chip.label}</span>
  ```
- Add overdue warning: if `lastScanDate` is more than 7 days ago, add a small amber chip "Scan overdue" next to the health chip.

**Step 2: Create `findings/findings-client.tsx`** — client component for severity filtering

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import { FindingCard } from "@/components/finding-card";
import { EmptyState } from "@/components/empty-state";
import { IconCheckCircle, IconSearch } from "@/components/icons";
import type { Finding } from "@/lib/types";

type Severity = "all" | "critical" | "high" | "medium" | "low";

interface FindingsClientProps {
  findings: Finding[];
}

export function FindingsClient({ findings }: FindingsClientProps) {
  const [activeSeverity, setActiveSeverity] = useState<Severity>("all");

  const filtered = activeSeverity === "all"
    ? findings
    : findings.filter((f) => f.severity === activeSeverity);

  const severities: Severity[] = ["all", "critical", "high", "medium", "low"];
  const counts: Record<Severity, number> = {
    all: findings.length,
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };

  const pillColor: Record<Severity, string> = {
    all: "bg-surface-2 text-text-secondary",
    critical: "bg-severity-critical/15 text-severity-critical",
    high: "bg-severity-high/15 text-severity-high",
    medium: "bg-severity-medium/15 text-severity-medium",
    low: "bg-severity-low/15 text-severity-low",
  };

  if (findings.length === 0) {
    return (
      <EmptyState
        icon={IconCheckCircle}
        headline="No open findings — your codebase is clean"
        body="All recent scans passed without security, dependency, or policy violations."
        variant="success"
        secondaryLink={{ label: "View scan history", href: "/projects" }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Severity filter pills */}
      <div className="flex flex-wrap gap-2">
        {severities.map((sev) => (
          <button
            key={sev}
            onClick={() => setActiveSeverity(sev)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold capitalize transition-all focus-ring ${
              activeSeverity === sev
                ? pillColor[sev] + " ring-1 ring-current/30"
                : "bg-surface-1 text-text-tertiary hover:bg-surface-2"
            }`}
          >
            {sev === "all" ? "All" : sev} ({counts[sev]})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={IconSearch}
          headline="No findings match these filters"
          body="Try adjusting your severity filter."
        />
      ) : (
        <div className="grid gap-2.5">
          {filtered.map((finding, i) => (
            <Link
              key={finding.id}
              href={`/findings/${finding.id}`}
              className="animate-fade-up block focus-ring rounded-lg border-l-2 transition-all"
              style={{
                animationDelay: `${0.03 + 0.04 * i}s`,
                borderLeftColor:
                  finding.severity === "critical" ? "var(--color-severity-critical)" :
                  finding.severity === "high" ? "var(--color-severity-high)" :
                  finding.severity === "medium" ? "var(--color-severity-medium)" :
                  "var(--color-severity-low)",
              }}
              aria-label={`View finding: ${finding.title}`}
            >
              <FindingCard finding={finding} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Update `findings/page.tsx`** to use `FindingsClient`

Replace the findings list section with:
```tsx
import { FindingsClient } from "./findings-client";

// In JSX, replace the filter pills and findings list:
<FindingsClient findings={findings} />
```

Remove the old inline severity filter pills and the inline findings list — they're now inside `FindingsClient`.

**Step 4: Run tests**
```bash
cd apps/dashboard && npx vitest run --reporter=verbose 2>&1 | tail -20
```

**Step 5: Commit**
```bash
git add apps/dashboard/app/\(dashboard\)/projects/page.tsx \
        apps/dashboard/app/\(dashboard\)/findings/page.tsx \
        apps/dashboard/app/\(dashboard\)/findings/findings-client.tsx
git commit -m "feat(dashboard): add health chips + overdue warnings to projects; severity filter pills to findings"
```

---

## Task 7: Update navigation — add Integrations, reorder nav

**Files:**
- Modify: `lib/rbac.ts`
- Modify: `components/sidebar.tsx`
- Modify: `app/(dashboard)/settings/vcs/page.tsx`

**Context:**
`NAV_ITEMS` in `lib/rbac.ts` defines the sidebar. We reorder to the approved enterprise nav and add "Integrations" pointing to `/settings/vcs`. The sidebar renders groups based on array slice positions — update those too.

**Step 1: Write test for nav order**

```typescript
// lib/__tests__/rbac.test.ts (add to existing file or create)
import { NAV_ITEMS } from "../rbac";

it("has Integrations as second-to-last item before Settings", () => {
  const intIdx = NAV_ITEMS.findIndex((i) => i.href === "/settings/vcs");
  const settingsIdx = NAV_ITEMS.findIndex((i) => i.href === "/settings");
  expect(intIdx).toBeGreaterThan(0);
  expect(intIdx).toBe(settingsIdx - 1);
});

it("Overview is first nav item", () => {
  expect(NAV_ITEMS[0].href).toBe("/");
});
```

**Step 2: Run test to confirm it fails**
```bash
cd apps/dashboard && npx vitest run lib/__tests__/rbac.test.ts --reporter=verbose
```

**Step 3: Update `NAV_ITEMS` in `lib/rbac.ts`**

Replace the existing `NAV_ITEMS` array with the approved order:
```typescript
export const NAV_ITEMS: NavItem[] = [
  // Core
  { label: "Overview",      href: "/",                        icon: "home" },
  { label: "Projects",      href: "/projects",                icon: "folder" },
  { label: "Findings",      href: "/findings",                icon: "search" },
  // Compliance
  { label: "Compliance",    href: "/compliance",              icon: "clipboard-check" },
  { label: "Gap Analysis",  href: "/compliance/gap-analysis", icon: "grid" },
  { label: "Attestations",  href: "/compliance/attestations", icon: "shield-check" },
  { label: "Approvals",     href: "/approvals",               icon: "check-circle" },
  { label: "Remediations",  href: "/remediations",            icon: "wrench" },
  { label: "Policies",      href: "/policies",                icon: "file-text" },
  // Tools
  { label: "AI Metrics",    href: "/ai-metrics",              icon: "cpu" },
  { label: "Certificates",  href: "/certificates",            icon: "shield" },
  { label: "Audit Log",     href: "/audit",                   icon: "clock" },
  // System
  { label: "Integrations",  href: "/settings/vcs",            icon: "git-branch" },
  { label: "Settings",      href: "/settings",                icon: "settings" },
];
```

Also add the `/settings/vcs` route permission (it's already covered by `/settings` but add explicit entry for clarity):
```typescript
{ path: "/settings/vcs", roles: ["admin"] },
```
Add this before the existing `{ path: "/settings", roles: ["admin"] }` line.

**Step 4: Update `components/sidebar.tsx`** — fix section slice indices to match new array

The sidebar slices items into 3 sections. Update to match the new 14-item nav:
- Section "Navigation" (Core): `items.slice(0, 3)` → Overview, Projects, Findings
- Section "Compliance": `items.slice(3, 9)` → Compliance, Gap Analysis, Attestations, Approvals, Remediations, Policies
- Section "Tools": `items.slice(9, 12)` → AI Metrics, Certificates, Audit Log
- Section "System": `items.slice(12)` → Integrations, Settings

Update sidebar labels and slice boundaries accordingly. The sidebar currently has 3 sections using `items.slice(0,4)`, `items.slice(4,9)`, `items.slice(9)` — change to the 4-section layout above.

**Step 5: Update `settings/vcs/page.tsx`** — change PageHeader title to "Integrations"

Read the file, then change:
```tsx
<PageHeader title="Integrations" description="Connect your version control system to enable automated scanning." />
```

**Step 6: Run tests**
```bash
cd apps/dashboard && npx vitest run --reporter=verbose 2>&1 | tail -20
```

**Step 7: Commit**
```bash
git add apps/dashboard/lib/rbac.ts apps/dashboard/components/sidebar.tsx apps/dashboard/app/\(dashboard\)/settings/vcs/page.tsx
git commit -m "feat(dashboard): reorder nav, add Integrations link, update sidebar sections"
```

---

## Task 8: Build Onboarding components

**Files:**
- Create: `components/onboarding-banner.tsx`
- Create: `components/onboarding-checklist.tsx`
- Create: `components/product-explainer.tsx`

**Context:**
These three components appear on the overview page when `totalScans === 0`. They guide new users through the first scan. Use the `frontend-design` skill to ensure these are polished enterprise-quality.

**Step 1: Invoke `frontend-design` skill** for these three components

Provide the following spec to the `frontend-design` skill:

> Create three enterprise-quality Next.js components for the SENTINEL governance platform. Dark theme (bg-surface-0/1/2, text-text-primary/secondary/tertiary, accent color = teal/cyan). No external dependencies beyond what's in the project (Tailwind, Next.js, Lucide-style icons via `@/components/icons`).
>
> **1. `OnboardingBanner`** (`components/onboarding-banner.tsx`)
> Full-width card with a subtle teal left border glow. Left side: shield icon (large, accent-colored), "Welcome to SENTINEL" headline (xl bold), tagline "AI-powered code governance for your engineering org." (sm muted). Center: three-step horizontal pipeline showing "① Connect a repo → ② Run a scan → ③ Review results" as connected steps with step circles and arrows. Right side: primary CTA button "Connect your first repository →" linking to `/settings/vcs`, and a muted secondary link "Learn how it works" below it. Smooth fade-in animation.
>
> **2. `OnboardingChecklist`** (`components/onboarding-checklist.tsx`)
> Client component. A collapsible card with title "Getting started" and a chevron toggle. Four checklist items with animated checkboxes:
> - Connect a repository (link: /settings/vcs)
> - Trigger your first scan (link: /projects)
> - Review your findings (link: /findings)
> - Configure a compliance framework (link: /compliance)
> Each item is checked/unchecked based on props (`completedSteps: string[]`). Checked items get a strikethrough and dimmed opacity. When all 4 complete, show a success message "You're all set!" and hide the list. Pass `completedSteps` from server props.
>
> **3. `ProductExplainer`** (`components/product-explainer.tsx`)
> Three-column grid of feature cards. Each card: icon (large, accent-colored with glow), bold title, 2-line description.
> - Scan: MagnifyingGlass icon, "Automated Code Analysis", "Every push triggers security, dependency, AI-usage, and policy checks."
> - Certify: Award/Shield icon, "Cryptographic Certificates", "Clean scans earn tamper-proof certificates with risk scores attached to each commit."
> - Govern: ChartBar icon, "Compliance & Governance", "Track SOC2, SLSA, and custom frameworks. Enforce approval gates before merging."
> Subtle border, hover lift effect, fade-in animation.

**Step 2: Run tests**
```bash
cd apps/dashboard && npx vitest run --reporter=verbose 2>&1 | tail -20
```

**Step 3: Commit**
```bash
git add apps/dashboard/components/onboarding-banner.tsx \
        apps/dashboard/components/onboarding-checklist.tsx \
        apps/dashboard/components/product-explainer.tsx
git commit -m "feat(dashboard): add onboarding banner, checklist, and product explainer components"
```

---

## Task 9: Redesign overview page — enterprise command center

**Files:**
- Modify: `app/(dashboard)/page.tsx`

**Context:**
The overview page is restructured into 3 zones. When `totalScans === 0`, Zone 1 shows the `OnboardingBanner`. Otherwise it shows an Org Health Hero with a letter grade. Hardcoded trend values (`"+12%"`, `"-8%"`) are removed and replaced with either calculated deltas or omitted. Use `frontend-design` skill for the visual design of the health hero and insights grid.

**Step 1: Restructure page data fetching**

In the `OverviewPage` async function, fetch:
```typescript
const [stats, recentScans, complianceScores, aiStats] = await Promise.all([
  getOverviewStats(),
  getRecentScans(10),
  getComplianceScores().catch(() => []),
  getAIMetricsStats().catch(() => null),
]);

const isNewOrg = stats.totalScans === 0;

// Calculate org health grade
function calcOrgGrade(passRate: number, complianceAvg: number, openFindings: number): string {
  if (passRate === 0 && complianceAvg === 0) return "—";
  const score = passRate * 0.5 + complianceAvg * 0.3 + Math.max(0, 100 - openFindings * 5) * 0.2;
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "F";
}
const complianceAvg = complianceScores.length > 0
  ? complianceScores.reduce((sum, fw) => sum + fw.score, 0) / complianceScores.length
  : 0;
const grade = calcOrgGrade(stats.passRate, complianceAvg, stats.openFindings);

// Calculate trend: compare first half vs second half of recent scans
const midpoint = Math.floor(recentScans.length / 2);
const older = recentScans.slice(0, midpoint);
const newer = recentScans.slice(midpoint);
const avgRisk = (scans: typeof recentScans) =>
  scans.length ? scans.reduce((s, sc) => s + sc.riskScore, 0) / scans.length : null;
const riskDelta = older.length && newer.length
  ? Math.round(((avgRisk(newer)! - avgRisk(older)!) / (avgRisk(older)! || 1)) * 100)
  : null;
```

**Step 2: Invoke `frontend-design` skill for the overview layout**

Provide this spec:

> Redesign the SENTINEL overview page (`app/(dashboard)/page.tsx`) as an enterprise command center. Dark theme. Three zones:
>
> **Zone 1 — Org Health Hero** (shown when `isNewOrg === false`):
> Full-width card. Left 1/3: Large letter grade "A"–"F" or "—" inside a circular SVG progress ring (colored: A=green, B=teal, C=amber, D=orange, F=red, —=gray). Title "Security Posture" below grade. Right 2/3: Three stat KPIs in a row — "Total Scans" (value or "—" if 0), "Open Findings" (value, red if >0), "Pass Rate" (value%, green if ≥80, amber if ≥60, red below). Each KPI shows a trend delta below if `riskDelta` is available (e.g. "↑ 12% this week"), omit if null. No hardcoded trend strings.
>
> **Zone 1 alternative** (shown when `isNewOrg === true`):
> Render `<OnboardingBanner />` instead of the health hero.
>
> **Zone 2 — Insights Grid** (3-column, only when `isNewOrg === false`):
> - Security Posture card: Finding severity as a horizontal segmented bar (Critical=red, High=orange, Medium=amber, Low=gray segments, proportional widths). Show counts next to each segment. Empty state: "Run a scan to see security posture."
> - Compliance Readiness card: List of framework scores as mini rows (name + progress bar + score%). Empty: "No frameworks configured."
> - AI Code Governance card: Only render when `aiStats?.hasData === true`. Show AI ratio as a large percentage, "AI Code Detected" label, and top tool chip. When `hasData === false`, render nothing (hide this card, expand others to fill).
>
> **Zone 3 — Activity** (2/3 + 1/3):
> - Risk Trend chart (left, existing bar chart code but with labeled Y-axis ticks at 0/25/50/75/100 and X-axis date labels). Empty state: centered "No scan history yet" with a muted bar chart icon.
> - Right column (1/3): When `isNewOrg === true`, render `<OnboardingChecklist completedSteps={[]} />`. When not new org, render the existing Recent Activity timeline feed.
>
> **Below Zone 3** (only when `isNewOrg === true`): render `<ProductExplainer />`.
>
> Stat cards: show `—` for passRate when `totalScans === 0`. Remove hardcoded `"+12%"` etc. strings entirely from the stat cards array.

**Step 3: Run tests**
```bash
cd apps/dashboard && npx vitest run --reporter=verbose 2>&1 | tail -20
```

**Step 4: Commit**
```bash
git add apps/dashboard/app/\(dashboard\)/page.tsx
git commit -m "feat(dashboard): redesign overview page as enterprise command center with onboarding flow"
```

---

## Task 10: Add E2E test — new org empty states

**Files:**
- Create: `__tests__/e2e/empty-states.spec.ts`

**Context:**
Playwright test that confirms: (1) when the API returns empty data, the overview shows the onboarding banner rather than mock data; (2) the projects page shows the empty state. Uses the existing E2E test infrastructure.

**Step 1: Check existing E2E test setup**
```bash
ls apps/dashboard/__tests__/e2e/
```

**Step 2: Create `__tests__/e2e/empty-states.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";

// These tests mock the API to return empty data
test.describe("Empty states — new org", () => {
  test.beforeEach(async ({ page }) => {
    // Mock API to return empty responses
    await page.route("**/v1/scans**", (route) =>
      route.fulfill({ json: { scans: [], total: 0 } })
    );
    await page.route("**/v1/findings**", (route) =>
      route.fulfill({ json: { findings: [], total: 0 } })
    );
    await page.route("**/v1/certificates**", (route) =>
      route.fulfill({ json: { certificates: [], total: 0 } })
    );
    await page.route("**/v1/projects**", (route) =>
      route.fulfill({ json: [] })
    );
    await page.route("**/v1/approvals/stats**", (route) =>
      route.fulfill({ json: { pending: 0, escalated: 0, approved: 0, rejected: 0 } })
    );
  });

  test("overview page shows onboarding banner when no scans exist", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Welcome to SENTINEL")).toBeVisible();
    await expect(page.getByRole("link", { name: /connect your first repository/i })).toBeVisible();
    // Should NOT show mock data like "acme/sentinel-core"
    await expect(page.getByText("acme/sentinel-core")).not.toBeVisible();
  });

  test("projects page shows empty state CTA when no projects", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByText("No repositories monitored yet")).toBeVisible();
    await expect(page.getByRole("link", { name: /go to integrations/i })).toBeVisible();
  });

  test("findings page shows success empty state when no findings", async ({ page }) => {
    await page.goto("/findings");
    await expect(page.getByText(/no open findings/i)).toBeVisible();
  });
});
```

**Step 3: Run E2E tests**
```bash
cd apps/dashboard && npx playwright test __tests__/e2e/empty-states.spec.ts --reporter=list
```

**Step 4: Commit**
```bash
git add apps/dashboard/__tests__/e2e/empty-states.spec.ts
git commit -m "test(dashboard): add E2E tests for new org empty states"
```

---

## Task 11: Final check — run all tests, verify mock data removal

**Step 1: Run full test suite**
```bash
cd apps/dashboard && npx vitest run --reporter=verbose 2>&1 | tail -30
```
Expected: all tests pass.

**Step 2: Confirm no MOCK_* usage in api.ts**
```bash
grep -n "MOCK_" apps/dashboard/lib/api.ts
```
Expected: no output.

**Step 3: Confirm no USE_MOCK in api.ts**
```bash
grep -n "USE_MOCK" apps/dashboard/lib/api.ts
```
Expected: no output.

**Step 4: Confirm mock-data.ts is only imported from tests and demo-data.ts**
```bash
grep -r "mock-data" apps/dashboard --include="*.ts" --include="*.tsx" -l | grep -v __tests__ | grep -v demo-data
```
Expected: no output (only test files and demo-data.ts should import mock-data).

**Step 5: Build the dashboard to check for TypeScript errors**
```bash
cd apps/dashboard && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

**Step 6: Final commit if any cleanup needed, then invoke `superpowers:finishing-a-development-branch`**
```bash
git status
```
