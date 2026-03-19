# P17 — Enterprise Dashboard Redesign: Design Document

**Date:** 2026-03-19
**Branch:** feat/p17-enterprise-dashboard
**Status:** Approved, ready for implementation

---

## Problem Statement

The live SENTINEL dashboard shows mock data to real users. This happens because:

1. `tryApi()` in `lib/api.ts` silently catches API errors and returns mock data as a fallback — even in production when `SENTINEL_API_URL` is set.
2. AI metrics functions use direct `if (USE_MOCK)` blocks with hardcoded numbers.
3. A fresh org with no projects sees fake "acme/payment-service" data instead of an onboarding experience.

Mock data visible to real enterprise customers is trust-breaking. Empty states with clear calls-to-action are the correct behavior.

---

## Goals

1. **Remove mock data from all production code paths** — real users see real data or empty states, never fake data.
2. **Keep mock data available** for unit tests and a nightly-reset demo environment (`DEMO_MODE=true`).
3. **Enterprise-quality empty states** on every page with actionable CTAs.
4. **Redesign the overview page** as an enterprise command center with org health score, security posture, compliance readiness, and AI governance panels.
5. **Onboarding flow** for new orgs (zero scans): welcome banner + 4-step checklist + product explainer.
6. **Polish key pages**: Projects (health column, overdue warnings), Findings (severity filters, success empty state), Compliance (no placeholder scores), Settings/Integrations (promoted VCS connections).

---

## Section 1: Data Layer

### `tryApi` change

```typescript
// BEFORE: silently returns mock data on error
async function tryApi<T>(fn, fallback: T): Promise<T> {
  if (USE_MOCK) return fallback;
  try {
    return await fn(headers);
  } catch {
    return fallback; // <-- returns MOCK_PROJECTS etc.
  }
}

// AFTER: returns empty value on error, never mock data
async function tryApi<T>(fn: (h: Record<string,string>) => Promise<T>, empty: T): Promise<T> {
  try {
    const headers = await getSessionHeaders();
    return await fn(headers);
  } catch {
    return empty;
  }
}
```

Each call site passes its natural empty value (`[]`, `null`, zero-value struct) instead of a `MOCK_*` constant.

### AI metrics functions

Replace `if (USE_MOCK)` blocks with:
- Real API call via `tryApi`
- Empty/zero value fallback: `{ hasData: false, stats: {...zeros}, toolBreakdown: [] }`

### Demo mode

New `lib/demo-data.ts`:
- `export const DEMO_MODE = process.env.DEMO_MODE === "true";`
- Re-exports all mock data behind this flag
- Used only in a dedicated demo docker-compose override

### Files touched

- `apps/dashboard/lib/api.ts` — remove all `MOCK_*` imports and fallbacks; change `tryApi`; rewrite AI metrics functions
- `apps/dashboard/lib/demo-data.ts` — new file, wraps mock data behind `DEMO_MODE`
- `apps/dashboard/lib/mock-data.ts` — add header comment restricting usage to tests and demo-data
- `apps/dashboard/lib/remediation-mock-data.ts` — same header comment

---

## Section 2: Empty State Component

New reusable component: `components/empty-state.tsx`

```tsx
interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  headline: string;
  body?: string;
  cta?: { label: string; href: string };
  secondaryLink?: { label: string; href: string };
  variant?: "default" | "success";
}
```

Visual spec:
- Container: `min-h-[320px]` centered content, dashed border card, `bg-surface-1`
- Icon: `h-12 w-12` with a soft glow ring (`ring-2 ring-offset-2 ring-border rounded-xl p-2.5`)
- Success variant: green icon tint
- CTA: accent button with `→` arrow icon

### Page-by-page empty states

| Page | Variant | Headline | CTA |
|------|---------|----------|-----|
| Overview (0 scans) | — | See onboarding banner (Section 4) | — |
| Projects | default | "No repositories monitored yet" | "Go to Integrations" → `/settings/vcs` |
| Findings (0 open) | success | "No open findings — your codebase is clean" | "View scan history" → `/projects` |
| Findings (filtered) | default | "No findings match these filters" | — |
| Certificates | default | "No certificates issued yet" | "Run your first scan" → `/projects` |
| Compliance (no data) | default | "Compliance posture requires scan data" | "Add a project" → `/settings/vcs` |
| Audit Log | default | "No activity recorded yet" | — |
| Approvals | success | "No approvals pending" | — |
| Remediations | success | "No open remediations" | — |
| Policies | default | "No policies configured" | "Create a policy" → `/policies/new` |

---

## Section 3: Overview Page — Enterprise Command Center

The overview page is restructured into three zones. The health hero (Zone 1) is replaced by an onboarding banner when `totalScans === 0`.

### Zone 1 — Org Health Hero

A full-width card with:
- **Left**: Large letter grade (A–F) in a circular ring, colored by grade. Grade derived from: `passRate × 0.5 + complianceAvg × 0.3 + (1 - criticalFindingRatio) × 0.2`
- **Right**: Three inline KPIs — Total Scans, Open Findings, Pass Rate — each with a subtle trend indicator (calculated delta, not hardcoded)
- Empty/uninitialized: show onboarding banner (Section 4) instead

### Zone 2 — Insights Grid (3-column)

- **Security Posture card**: Finding severity horizontal bar (Critical / High / Medium / Low). Empty: "Run a scan to see your security posture"
- **Compliance Readiness card**: Framework mini progress bars. Empty: "Configure a compliance framework"
- **AI Code Governance card**: AI ratio gauge + top tool detected. Hidden entirely when `hasData === false`

### Zone 3 — Activity (2/3 + 1/3)

- **Risk Trend chart** (left): existing bar chart with labeled axes and legend. Empty state: centered "No scan history yet" with muted icon
- **Recent Activity feed** (right): timeline of last 6 scan events with status dots. Empty: "Activity will appear here after your first scan"

### Stat card improvements

- Hardcoded trend values (`+12%`, `-8%`) replaced with calculated deltas from `getRecentScans` comparison or omitted entirely when insufficient data
- Values show `—` instead of `0` for metrics that are meaningless without scan data (e.g., passRate before any scans)

---

## Section 4: Onboarding Flow

Shown when `totalScans === 0`. Disappears once the org has at least one completed scan.

### Welcome Banner (replaces Zone 1)

Full-width card with accent border glow:
- Product name + tagline: "AI-powered code governance for your engineering org"
- Three-step visual pipeline: "Connect a repo → Run a scan → Review results"
- Primary CTA: "Connect your first repository" → `/settings/vcs`
- Secondary link: "Learn how it works" (links to docs or scrolls to explainer)

### Onboarding Checklist (right-column widget)

Collapsible card in Zone 3 right column (replaces activity feed):
- [ ] Connect a repository via VCS settings
- [ ] Trigger your first scan (push a commit or use the CLI)
- [ ] Review your findings and set thresholds
- [ ] Configure a compliance framework

Each step auto-checks when detected from API data (client component polling or derived from server props). Entire widget dismissed once all 4 complete.

### Product Explainer Strip (below banner)

Three columns, shown only when `totalScans === 0`:
- **Scan**: Push code → agents analyze security, dependencies, AI usage, policy compliance
- **Certify**: Clean scans earn a cryptographic certificate with risk score
- **Govern**: Track compliance frameworks, manage findings, enforce approval gates

---

## Section 5: Projects & Other Key Pages

### Projects Page

- Add "Connect repository" button in `PageHeader` action slot (always visible)
- Project card: add **health chip** — `Healthy` (green), `At Risk` (amber), `Critical` (red) — derived from `lastScanStatus` + `findingCount`
- Add "Scan overdue" warning chip when `lastScanDate` is > 7 days ago
- Empty state: upgrade to new `EmptyState` component

### Findings Page

- Add severity filter pills row (All / Critical / High / Medium / Low) as client-side quick filters
- Add "Show suppressed" toggle
- Finding rows: colored left border by severity (`border-l-2`)
- Empty (0 findings): success variant — "No open findings. Your codebase is clean."
- Empty (filtered): default — "No findings match these filters. Try adjusting your filters."

### Compliance Page

- Framework score cards: show `--` with "Requires scan data" tooltip when no scan data exists
- Remove framework cards entirely if no frameworks configured → show "No frameworks configured" empty state

### Navigation

New nav order:
1. Overview
2. Projects
3. Findings
4. Compliance
5. Approvals
6. Remediations
7. Policies
8. **Integrations** (new, maps to `/settings/vcs`)
9. Settings

`/settings/vcs` page title updated to "Integrations" in its `PageHeader`.

---

## Out of Scope

- Redesigning compliance wizard, gap analysis, attestation flows
- Reports page
- Audit log detailed view
- AI metrics deep-dive page
- Mobile responsive improvements (separate project)

---

## Testing

- Update all unit tests that import `MOCK_*` to import from `lib/demo-data.ts` or keep importing from `lib/mock-data.ts` directly (both acceptable for tests)
- Add Playwright E2E: "new org empty state shows onboarding banner"
- Add Playwright E2E: "overview page shows real data after first scan"
- Existing mock-data.test.ts continues to pass (mock data file is unchanged)
