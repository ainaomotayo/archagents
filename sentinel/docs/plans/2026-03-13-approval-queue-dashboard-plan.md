# Approval Queue Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a dashboard page at `/approvals` where reviewers see pending approval gates and can approve/reject them with justification, with real-time updates via SSE + polling fallback.

**Architecture:** Server Component page fetches initial data via existing `tryApi()` pattern, passes to a Client Component orchestrator (`ApprovalQueue`) that manages SSE streaming, optimistic updates, and two-column layout (list + detail). All styling uses existing Tailwind design tokens.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS v4 (existing tokens), SSE (Edge Runtime), existing `apiGet`/`apiPost` HMAC client.

**Design Doc:** `docs/plans/2026-03-13-approval-queue-dashboard-design.md`

---

### Task 1: Add Approval Types and Mock Data

**Files:**
- Modify: `apps/dashboard/lib/types.ts`
- Modify: `apps/dashboard/lib/mock-data.ts`

**Step 1: Add approval types to `lib/types.ts`**

Append after the existing `FindingCountByCategory` interface:

```typescript
// ── Approvals ─────────────────────────────────────────────────────────

export type ApprovalStatus = "pending" | "escalated" | "approved" | "rejected" | "expired";
export type GateType = "risk_threshold" | "category_block" | "license_review" | "always_review";
export type ExpiryAction = "reject" | "approve";

export interface ApprovalDecision {
  id: string;
  decidedBy: string;
  decision: "approve" | "reject";
  justification: string;
  decidedAt: string;
}

export interface ApprovalGate {
  id: string;
  scanId: string;
  projectId: string;
  projectName: string;
  status: ApprovalStatus;
  gateType: GateType;
  triggerCriteria: Record<string, unknown>;
  priority: number;
  assignedRole: string | null;
  assignedTo: string | null;
  requestedAt: string;
  requestedBy: string;
  expiresAt: string;
  escalatesAt: string | null;
  expiryAction: ExpiryAction;
  decidedAt: string | null;
  scan: {
    commitHash: string;
    branch: string;
    riskScore: number;
    findingCount: number;
  };
  decisions: ApprovalDecision[];
}

export interface ApprovalStats {
  pending: number;
  escalated: number;
  decidedToday: number;
  avgDecisionTimeHours: number;
  expiringSoon: number;
}
```

**Step 2: Add mock data to `lib/mock-data.ts`**

Add imports for the new types at the top, then append mock data at the bottom:

```typescript
// Add to import statement at top:
import type {
  // ... existing imports ...
  ApprovalGate,
  ApprovalStats,
} from "./types";

// Append at end of file:

// ── Approvals ─────────────────────────────────────────────────────────

export const MOCK_APPROVAL_STATS: ApprovalStats = {
  pending: 5,
  escalated: 2,
  decidedToday: 8,
  avgDecisionTimeHours: 4.2,
  expiringSoon: 1,
};

export const MOCK_APPROVAL_GATES: ApprovalGate[] = [
  {
    id: "gate-001",
    scanId: "scan-001",
    projectId: "proj-001",
    projectName: "sentinel-api",
    status: "escalated",
    gateType: "risk_threshold",
    triggerCriteria: { riskScore: 72, threshold: { autoPassBelow: 30, autoBlockAbove: 70 } },
    priority: 90,
    assignedRole: "admin",
    assignedTo: null,
    requestedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    requestedBy: "system",
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    escalatesAt: null,
    expiryAction: "reject",
    decidedAt: null,
    scan: { commitHash: "a1b2c3d", branch: "feature/auth-refactor", riskScore: 72, findingCount: 5 },
    decisions: [],
  },
  {
    id: "gate-002",
    scanId: "scan-002",
    projectId: "proj-002",
    projectName: "sentinel-dashboard",
    status: "escalated",
    gateType: "category_block",
    triggerCriteria: { categories: ["copyleft-risk"], severities: ["critical"] },
    priority: 90,
    assignedRole: "admin",
    assignedTo: null,
    requestedAt: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
    requestedBy: "system",
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    escalatesAt: null,
    expiryAction: "reject",
    decidedAt: null,
    scan: { commitHash: "e4f5g6h", branch: "main", riskScore: 85, findingCount: 2 },
    decisions: [],
  },
  {
    id: "gate-003",
    scanId: "scan-003",
    projectId: "proj-001",
    projectName: "sentinel-api",
    status: "pending",
    gateType: "risk_threshold",
    triggerCriteria: { riskScore: 55, threshold: { autoPassBelow: 30, autoBlockAbove: 70 } },
    priority: 55,
    assignedRole: "manager",
    assignedTo: null,
    requestedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    requestedBy: "system",
    expiresAt: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(),
    escalatesAt: new Date(Date.now() + 42 * 60 * 60 * 1000).toISOString(),
    expiryAction: "reject",
    decidedAt: null,
    scan: { commitHash: "i7j8k9l", branch: "feature/payments", riskScore: 55, findingCount: 3 },
    decisions: [],
  },
  {
    id: "gate-004",
    scanId: "scan-004",
    projectId: "proj-003",
    projectName: "sentinel-agents",
    status: "pending",
    gateType: "license_review",
    triggerCriteria: { licenses: ["GPL-3.0"] },
    priority: 50,
    assignedRole: "manager",
    assignedTo: null,
    requestedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    requestedBy: "system",
    expiresAt: new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString(),
    escalatesAt: new Date(Date.now() + 46 * 60 * 60 * 1000).toISOString(),
    expiryAction: "reject",
    decidedAt: null,
    scan: { commitHash: "m0n1o2p", branch: "feature/new-dep", riskScore: 40, findingCount: 1 },
    decisions: [],
  },
  {
    id: "gate-005",
    scanId: "scan-005",
    projectId: "proj-002",
    projectName: "sentinel-dashboard",
    status: "pending",
    gateType: "always_review",
    triggerCriteria: { branches: ["main"] },
    priority: 30,
    assignedRole: "manager",
    assignedTo: null,
    requestedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    requestedBy: "system",
    expiresAt: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
    escalatesAt: new Date(Date.now() + 47 * 60 * 60 * 1000).toISOString(),
    expiryAction: "approve",
    decidedAt: null,
    scan: { commitHash: "q3r4s5t", branch: "main", riskScore: 15, findingCount: 0 },
    decisions: [],
  },
  {
    id: "gate-006",
    scanId: "scan-006",
    projectId: "proj-001",
    projectName: "sentinel-api",
    status: "approved",
    gateType: "risk_threshold",
    triggerCriteria: { riskScore: 45 },
    priority: 45,
    assignedRole: "manager",
    assignedTo: null,
    requestedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    requestedBy: "system",
    expiresAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    escalatesAt: null,
    expiryAction: "reject",
    decidedAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    scan: { commitHash: "u6v7w8x", branch: "feature/caching", riskScore: 45, findingCount: 2 },
    decisions: [{
      id: "dec-001",
      decidedBy: "jane@company.com",
      decision: "approve",
      justification: "Risk is acceptable — caching layer is internal only with no user-facing exposure.",
      decidedAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    }],
  },
  {
    id: "gate-007",
    scanId: "scan-007",
    projectId: "proj-003",
    projectName: "sentinel-agents",
    status: "approved",
    gateType: "category_block",
    triggerCriteria: { categories: ["copyleft-risk"] },
    priority: 60,
    assignedRole: "manager",
    assignedTo: null,
    requestedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    requestedBy: "system",
    expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    escalatesAt: null,
    expiryAction: "reject",
    decidedAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    scan: { commitHash: "y9z0a1b", branch: "feature/license-fix", riskScore: 60, findingCount: 1 },
    decisions: [{
      id: "dec-002",
      decidedBy: "bob@company.com",
      decision: "approve",
      justification: "GPL dependency replaced with MIT-licensed alternative in the follow-up commit.",
      decidedAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    }],
  },
  {
    id: "gate-008",
    scanId: "scan-008",
    projectId: "proj-002",
    projectName: "sentinel-dashboard",
    status: "rejected",
    gateType: "risk_threshold",
    triggerCriteria: { riskScore: 68 },
    priority: 68,
    assignedRole: "manager",
    assignedTo: null,
    requestedAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    requestedBy: "system",
    expiresAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    escalatesAt: null,
    expiryAction: "reject",
    decidedAt: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
    scan: { commitHash: "c2d3e4f", branch: "feature/unsafe-eval", riskScore: 68, findingCount: 4 },
    decisions: [{
      id: "dec-003",
      decidedBy: "jane@company.com",
      decision: "reject",
      justification: "Critical XSS vulnerability via eval() in user-supplied template. Must be remediated before merge.",
      decidedAt: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
    }],
  },
];
```

**Step 3: Commit**

```bash
git add apps/dashboard/lib/types.ts apps/dashboard/lib/mock-data.ts
git commit -m "feat(dashboard): add approval types and mock data"
```

---

### Task 2: Add Approval API Functions

**Files:**
- Modify: `apps/dashboard/lib/api.ts`

**Step 1: Add approval API functions**

Append after the existing `getAuditLog` function in `lib/api.ts`:

```typescript
// ── Approvals ─────────────────────────────────────────────────────────

import type { ApprovalGate, ApprovalStats } from "./types";
import { MOCK_APPROVAL_GATES, MOCK_APPROVAL_STATS } from "./mock-data";

export async function getApprovalGates(status?: string): Promise<ApprovalGate[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const query: Record<string, string> = { limit: "50" };
    if (status && status !== "all") query.status = status;
    const data = await apiGet<{ gates: any[]; total: number }>("/v1/approvals", query, headers);
    return (data.gates ?? []).map(mapGate);
  }, status && status !== "all"
    ? MOCK_APPROVAL_GATES.filter((g) => g.status === status)
    : MOCK_APPROVAL_GATES);
}

export async function getApprovalGateById(id: string): Promise<ApprovalGate | null> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<any>(`/v1/approvals/${id}`, undefined, headers);
    return mapGate(data);
  }, MOCK_APPROVAL_GATES.find((g) => g.id === id) ?? null);
}

export async function getApprovalStats(): Promise<ApprovalStats> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<ApprovalStats>("/v1/approvals/stats", undefined, headers);
  }, MOCK_APPROVAL_STATS);
}

function mapGate(g: any): ApprovalGate {
  return {
    id: g.id,
    scanId: g.scanId,
    projectId: g.projectId,
    projectName: g.project?.name ?? g.projectName ?? "Unknown",
    status: g.status,
    gateType: g.gateType,
    triggerCriteria: g.triggerCriteria ?? {},
    priority: g.priority ?? 0,
    assignedRole: g.assignedRole ?? null,
    assignedTo: g.assignedTo ?? null,
    requestedAt: g.requestedAt,
    requestedBy: g.requestedBy ?? "system",
    expiresAt: g.expiresAt,
    escalatesAt: g.escalatesAt ?? null,
    expiryAction: g.expiryAction ?? "reject",
    decidedAt: g.decidedAt ?? null,
    scan: {
      commitHash: g.scan?.commitHash ?? "",
      branch: g.scan?.branch ?? "",
      riskScore: g.scan?.riskScore ?? 0,
      findingCount: g.scan?._count?.findings ?? g.scan?.findingCount ?? 0,
    },
    decisions: (g.decisions ?? []).map((d: any) => ({
      id: d.id,
      decidedBy: d.decidedBy,
      decision: d.decision,
      justification: d.justification,
      decidedAt: d.decidedAt,
    })),
  };
}
```

Note: The `ApprovalGate` and `ApprovalStats` imports should be added to the existing import block at the top of the file. The `MOCK_APPROVAL_GATES` and `MOCK_APPROVAL_STATS` imports should be added to the existing mock-data import block.

**Step 2: Commit**

```bash
git add apps/dashboard/lib/api.ts
git commit -m "feat(dashboard): add approval API functions with mock fallback"
```

---

### Task 3: Add Sidebar Navigation and RBAC for Approvals

**Files:**
- Modify: `apps/dashboard/lib/rbac.ts`
- Modify: `apps/dashboard/components/icons.tsx`

**Step 1: Add approval icon to `components/icons.tsx`**

Add before the `ICON_MAP` export:

```typescript
export function IconCheckCircle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
```

Add to `ICON_MAP`:

```typescript
"check-circle": IconCheckCircle,
```

**Step 2: Add approvals route and nav item to `lib/rbac.ts`**

Add to `ROUTE_PERMISSIONS` array (insert before the `/findings` entry):

```typescript
{ path: "/approvals", roles: ["admin", "manager"] },
```

Add to `NAV_ITEMS` array (insert after the "Findings" entry, index 3):

```typescript
{ label: "Approvals", href: "/approvals", icon: "check-circle" },
```

**Step 3: Commit**

```bash
git add apps/dashboard/lib/rbac.ts apps/dashboard/components/icons.tsx
git commit -m "feat(dashboard): add approvals to sidebar nav and RBAC"
```

---

### Task 4: Create ApprovalCard Component

**Files:**
- Create: `apps/dashboard/components/approvals/approval-card.tsx`

**Step 1: Create the component**

```tsx
import type { ApprovalGate, ApprovalStatus } from "@/lib/types";

const STATUS_STYLES: Record<ApprovalStatus, { bg: string; text: string; dot: string; border: string }> = {
  pending: {
    bg: "bg-status-warn/15",
    text: "text-status-warn",
    dot: "bg-status-warn",
    border: "border-l-status-warn",
  },
  escalated: {
    bg: "bg-status-fail/15",
    text: "text-status-fail",
    dot: "bg-status-fail status-running",
    border: "border-l-status-fail",
  },
  approved: {
    bg: "bg-status-pass/15",
    text: "text-status-pass",
    dot: "bg-status-pass",
    border: "border-l-status-pass",
  },
  rejected: {
    bg: "bg-status-fail/15",
    text: "text-status-fail",
    dot: "bg-status-fail",
    border: "border-l-status-fail",
  },
  expired: {
    bg: "bg-surface-3",
    text: "text-text-tertiary",
    dot: "bg-text-tertiary",
    border: "border-l-text-tertiary",
  },
};

const GATE_TYPE_LABEL: Record<string, string> = {
  risk_threshold: "Risk Threshold",
  category_block: "Category Block",
  license_review: "License Review",
  always_review: "Always Review",
};

function formatTimeRemaining(expiresAt: string): { text: string; urgency: "ok" | "warn" | "critical" | "expired" } {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return { text: "Expired", urgency: "expired" };
  const hours = remaining / (1000 * 60 * 60);
  if (hours < 1) {
    const mins = Math.floor(remaining / (1000 * 60));
    return { text: `${mins}m left`, urgency: "critical" };
  }
  if (hours < 4) return { text: `${hours.toFixed(1)}h left`, urgency: "critical" };
  if (hours < 8) return { text: `${hours.toFixed(1)}h left`, urgency: "warn" };
  return { text: `${Math.floor(hours)}h left`, urgency: "ok" };
}

const URGENCY_COLORS = {
  ok: "text-status-pass",
  warn: "text-status-warn",
  critical: "text-status-fail",
  expired: "text-text-tertiary",
};

interface ApprovalCardProps {
  gate: ApprovalGate;
  selected: boolean;
  onClick: () => void;
}

export function ApprovalCard({ gate, selected, onClick }: ApprovalCardProps) {
  const style = STATUS_STYLES[gate.status];
  const sla = formatTimeRemaining(gate.expiresAt);
  const isActionable = gate.status === "pending" || gate.status === "escalated";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border border-l-[3px] p-4 transition-all duration-150 ${
        selected
          ? `border-border-accent bg-accent-subtle/40 ${style.border}`
          : `border-border bg-surface-1 ${style.border} hover:border-border-accent hover:bg-surface-2`
      } ${!isActionable ? "opacity-60" : ""}`}
      aria-label={`Approval gate for ${gate.projectName}: ${gate.status}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${style.bg} ${style.text} border-current/30`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
          {gate.status}
        </span>
        <div className="flex items-center gap-2">
          <span className="rounded bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-text-secondary">
            {GATE_TYPE_LABEL[gate.gateType] ?? gate.gateType}
          </span>
          {isActionable && (
            <span className={`text-[11px] font-mono font-medium ${URGENCY_COLORS[sla.urgency]}`}>
              {sla.text}
            </span>
          )}
        </div>
      </div>

      <p className="mt-2 truncate text-sm font-semibold text-text-primary">
        {gate.projectName}
        <span className="font-normal text-text-tertiary"> / {gate.scan.branch}</span>
      </p>

      <div className="mt-2 flex items-center gap-3 text-[11px] text-text-tertiary">
        <span>Risk: {gate.scan.riskScore}</span>
        <span>{gate.scan.findingCount} findings</span>
        <span className="font-mono">{gate.scan.commitHash.slice(0, 7)}</span>
        {gate.assignedRole && (
          <span className="ml-auto capitalize">{gate.assignedRole}</span>
        )}
      </div>
    </button>
  );
}

export { formatTimeRemaining, GATE_TYPE_LABEL, STATUS_STYLES };
```

**Step 2: Commit**

```bash
mkdir -p apps/dashboard/components/approvals
git add apps/dashboard/components/approvals/approval-card.tsx
git commit -m "feat(dashboard): add ApprovalCard component"
```

---

### Task 5: Create ApprovalStatsBar Component

**Files:**
- Create: `apps/dashboard/components/approvals/approval-stats-bar.tsx`

**Step 1: Create the component**

```tsx
import type { ApprovalStats } from "@/lib/types";

interface ApprovalStatsBarProps {
  stats: ApprovalStats;
}

const STAT_ITEMS: Array<{
  key: keyof ApprovalStats;
  label: string;
  dotColor: string;
  format?: (v: number) => string;
}> = [
  { key: "pending", label: "Pending", dotColor: "bg-status-warn" },
  { key: "escalated", label: "Escalated", dotColor: "bg-status-fail" },
  { key: "decidedToday", label: "Decided today", dotColor: "bg-status-pass" },
  { key: "avgDecisionTimeHours", label: "Avg time", dotColor: "bg-status-info", format: (v) => `${v.toFixed(1)}h` },
  { key: "expiringSoon", label: "Expiring soon", dotColor: "bg-severity-high" },
];

export function ApprovalStatsBar({ stats }: ApprovalStatsBarProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {STAT_ITEMS.map(({ key, label, dotColor, format }) => (
        <div
          key={key}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2"
        >
          <span className={`h-2 w-2 rounded-full ${dotColor}`} />
          <span className="text-[11px] font-semibold text-text-secondary">
            {label}
          </span>
          <span className="font-mono text-[13px] font-bold text-text-primary">
            {format ? format(stats[key]) : stats[key]}
          </span>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/dashboard/components/approvals/approval-stats-bar.tsx
git commit -m "feat(dashboard): add ApprovalStatsBar component"
```

---

### Task 6: Create ApprovalDetailPanel with DecisionForm and ActivityLog

**Files:**
- Create: `apps/dashboard/components/approvals/approval-detail-panel.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import type { ApprovalGate } from "@/lib/types";
import { GATE_TYPE_LABEL, formatTimeRemaining } from "./approval-card";

interface ApprovalDetailPanelProps {
  gate: ApprovalGate;
  onDecision: (gateId: string, decision: "approve" | "reject", justification: string) => Promise<void>;
  isSubmitting: boolean;
}

export function ApprovalDetailPanel({ gate, onDecision, isSubmitting }: ApprovalDetailPanelProps) {
  const [justification, setJustification] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isActionable = gate.status === "pending" || gate.status === "escalated";
  const canSubmit = justification.trim().length >= 10 && !isSubmitting;
  const sla = formatTimeRemaining(gate.expiresAt);

  const handleDecision = async (decision: "approve" | "reject") => {
    setError(null);
    try {
      await onDecision(gate.id, decision, justification.trim());
      setJustification("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit decision");
    }
  };

  // SLA progress bar
  const totalWindow = new Date(gate.expiresAt).getTime() - new Date(gate.requestedAt).getTime();
  const elapsed = Date.now() - new Date(gate.requestedAt).getTime();
  const progress = Math.min(100, Math.max(0, (elapsed / totalWindow) * 100));

  const slaBarColor =
    sla.urgency === "critical" ? "bg-status-fail"
    : sla.urgency === "warn" ? "bg-status-warn"
    : sla.urgency === "expired" ? "bg-text-tertiary"
    : "bg-status-pass";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold text-text-primary">Gate Detail</h2>
        <div className="mt-3 rounded-xl border border-border bg-surface-1 p-5">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Status</p>
              <p className="mt-1 text-[12px] font-semibold capitalize text-text-secondary">{gate.status}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Priority</p>
              <p className="mt-1 font-mono text-[12px] text-text-secondary">{gate.priority}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Type</p>
              <p className="mt-1 text-[12px] text-text-secondary">{GATE_TYPE_LABEL[gate.gateType] ?? gate.gateType}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Assigned To</p>
              <p className="mt-1 text-[12px] capitalize text-text-secondary">{gate.assignedRole ?? "Unassigned"}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Expiry Action</p>
              <p className="mt-1 text-[12px] capitalize text-text-secondary">{gate.expiryAction}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Requested By</p>
              <p className="mt-1 text-[12px] text-text-secondary">{gate.requestedBy}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Scan Details */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Scan Details</h2>
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Project</p>
              <p className="mt-1 text-[12px] font-semibold text-text-secondary">{gate.projectName}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Branch</p>
              <p className="mt-1 font-mono text-[12px] text-text-secondary">{gate.scan.branch}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Risk Score</p>
              <p className="mt-1 font-mono text-[12px] text-text-secondary">{gate.scan.riskScore}/100</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Findings</p>
              <p className="mt-1 font-mono text-[12px] text-text-secondary">{gate.scan.findingCount}</p>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <Link
              href={`/findings?scanId=${gate.scanId}`}
              className="text-[12px] font-medium text-accent hover:underline"
            >
              View Findings →
            </Link>
          </div>
        </div>
      </div>

      {/* SLA */}
      {isActionable && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">SLA</h2>
          <div className="rounded-xl border border-border bg-surface-1 p-5">
            <div className="flex items-center justify-between text-[12px]">
              <span className={`font-semibold ${sla.urgency === "critical" ? "text-status-fail" : sla.urgency === "warn" ? "text-status-warn" : "text-status-pass"}`}>
                {sla.text}
              </span>
              <span className="text-text-tertiary">{Math.round(progress)}% elapsed</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className={`h-full rounded-full transition-all ${slaBarColor}`}
                style={{ width: `${progress}%` }}
                role="progressbar"
                aria-valuenow={Math.round(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            {gate.escalatesAt && (
              <p className="mt-2 text-[11px] text-text-tertiary">
                Escalates: {new Date(gate.escalatesAt).toLocaleString()}
              </p>
            )}
            <p className="mt-1 text-[11px] text-text-tertiary">
              On expiry: <span className="capitalize font-medium">{gate.expiryAction}</span>
            </p>
          </div>
        </div>
      )}

      {/* Decision Form */}
      {isActionable && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Decision</h2>
          <div className="rounded-xl border border-border bg-surface-1 p-5">
            <label htmlFor="justification" className="block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Justification (min 10 characters)
            </label>
            <textarea
              id="justification"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Explain your decision..."
              rows={3}
              className="mt-2 w-full rounded-lg border border-border bg-surface-2 px-4 py-3 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {error && (
              <p className="mt-2 text-[12px] text-status-fail">{error}</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => handleDecision("approve")}
                disabled={!canSubmit}
                aria-describedby="justification"
                className="flex items-center gap-2 rounded-lg bg-status-pass/20 px-4 py-2 text-[13px] font-semibold text-status-pass border border-status-pass/30 transition-colors hover:bg-status-pass/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Submitting..." : "✓ Approve"}
              </button>
              <button
                onClick={() => handleDecision("reject")}
                disabled={!canSubmit}
                aria-describedby="justification"
                className="flex items-center gap-2 rounded-lg bg-status-fail/20 px-4 py-2 text-[13px] font-semibold text-status-fail border border-status-fail/30 transition-colors hover:bg-status-fail/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Submitting..." : "✗ Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activity Log */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Activity</h2>
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          {gate.decisions.length === 0 ? (
            <p className="text-[13px] text-text-tertiary">No decisions yet — awaiting reviewer action.</p>
          ) : (
            <div className="space-y-4">
              {gate.decisions.map((d) => (
                <div key={d.id} className="flex gap-3">
                  <span className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${d.decision === "approve" ? "bg-status-pass" : "bg-status-fail"}`} />
                  <div>
                    <p className="text-[12px] text-text-secondary">
                      <span className="font-semibold capitalize">{d.decision}d</span> by{" "}
                      <span className="font-medium">{d.decidedBy}</span>
                      <span className="text-text-tertiary"> · {formatRelativeTime(d.decidedAt)}</span>
                    </p>
                    <p className="mt-1 text-[12px] italic text-text-tertiary">
                      &ldquo;{d.justification}&rdquo;
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

**Step 2: Commit**

```bash
git add apps/dashboard/components/approvals/approval-detail-panel.tsx
git commit -m "feat(dashboard): add ApprovalDetailPanel with decision form and activity log"
```

---

### Task 7: Create useApprovalStream Hook (SSE + Polling Hybrid)

**Files:**
- Create: `apps/dashboard/lib/use-approval-stream.ts`

**Step 1: Create the hook**

```typescript
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ApprovalGate } from "./types";

export type ApprovalEventType =
  | "gate.created"
  | "gate.decided"
  | "gate.escalated"
  | "gate.expired"
  | "gate.reassigned";

export interface ApprovalStreamEvent {
  type: ApprovalEventType;
  gate: ApprovalGate;
  id: string;
}

export interface ApprovalStreamState {
  events: ApprovalStreamEvent[];
  connected: boolean;
  error: string | null;
}

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const POLL_INTERVAL_MS = 30_000;

export function useApprovalStream(
  onGateUpdate: (gate: ApprovalGate) => void,
): ApprovalStreamState {
  const [state, setState] = useState<ApprovalStreamState>({
    events: [],
    connected: false,
    error: null,
  });

  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEventId = useRef("");
  const onGateUpdateRef = useRef(onGateUpdate);
  onGateUpdateRef.current = onGateUpdate;

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  }, []);

  useEffect(() => {
    const baseUrl = "/api/approvals/stream";

    // ── SSE path ──
    if (typeof EventSource !== "undefined") {
      let es: EventSource | null = null;

      const connect = () => {
        const url = lastEventId.current
          ? `${baseUrl}?lastEventId=${encodeURIComponent(lastEventId.current)}`
          : baseUrl;

        es = new EventSource(url);

        es.onopen = () => {
          setState((prev) => ({ ...prev, connected: true, error: null }));
          reconnectAttempts.current = 0;
        };

        const eventTypes: ApprovalEventType[] = [
          "gate.created",
          "gate.decided",
          "gate.escalated",
          "gate.expired",
          "gate.reassigned",
        ];

        for (const eventType of eventTypes) {
          es.addEventListener(eventType, (e: MessageEvent) => {
            try {
              const gate = JSON.parse(e.data) as ApprovalGate;
              const id = e.lastEventId ?? "";
              if (id) lastEventId.current = id;
              setState((prev) => ({
                ...prev,
                events: [...prev.events, { type: eventType, gate, id }],
              }));
              onGateUpdateRef.current(gate);
            } catch {
              // Ignore malformed events
            }
          });
        }

        es.onerror = () => {
          setState((prev) => ({ ...prev, connected: false }));
          es?.close();

          const delay = Math.min(
            RECONNECT_BASE_MS * 2 ** reconnectAttempts.current + Math.random() * 500,
            RECONNECT_MAX_MS,
          );
          reconnectAttempts.current += 1;
          reconnectTimer.current = setTimeout(connect, delay);
          setState((prev) => ({ ...prev, error: "Connection lost. Reconnecting..." }));
        };
      };

      connect();

      return () => {
        es?.close();
        cleanup();
      };
    }

    // ── Polling fallback ──
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch("/api/approvals/stream?poll=true");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (Array.isArray(json.gates)) {
          for (const gate of json.gates) {
            onGateUpdateRef.current(gate);
          }
        }
        setState((prev) => ({ ...prev, connected: true, error: null }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          connected: false,
          error: err instanceof Error ? err.message : "Polling failed",
        }));
      }
    };

    poll();
    const id = setInterval(() => {
      if (active) poll();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(id);
      cleanup();
    };
  }, [cleanup]);

  return state;
}
```

**Step 2: Commit**

```bash
git add apps/dashboard/lib/use-approval-stream.ts
git commit -m "feat(dashboard): add useApprovalStream hook with SSE + polling fallback"
```

---

### Task 8: Create SSE Proxy Endpoint

**Files:**
- Create: `apps/dashboard/app/api/approvals/stream/route.ts`

**Step 1: Create the route**

```typescript
/**
 * SSE endpoint for real-time approval events.
 *
 * GET /api/approvals/stream
 *
 * Proxies to the SENTINEL API's `/v1/approvals/stream` endpoint.
 * Falls back to a mock event stream for standalone development.
 * Supports `lastEventId` query parameter for SSE reconnection.
 * Supports `poll=true` query parameter for polling fallback.
 */

import { NextRequest } from "next/server";

export const runtime = "edge";

const API_URL = process.env.SENTINEL_API_URL ?? "http://localhost:8080";

function buildMockPollResponse() {
  return Response.json({ gates: [], total: 0 });
}

export async function GET(request: NextRequest) {
  const isPoll = request.nextUrl.searchParams.get("poll") === "true";
  const lastEventId = request.nextUrl.searchParams.get("lastEventId") ?? "";

  // Polling mode: return current state as JSON
  if (isPoll) {
    try {
      const { signRequest } = await import("@sentinel/auth");
      const secret = process.env.SENTINEL_SECRET ?? "";
      const signature = signRequest("", secret);
      const res = await fetch(`${API_URL}/v1/approvals?limit=50`, {
        headers: {
          "X-Sentinel-Signature": signature,
          "X-Sentinel-API-Key": "dashboard",
        },
      });
      if (res.ok) {
        const data = await res.json();
        return Response.json(data);
      }
    } catch {
      // Fall through to mock
    }
    return buildMockPollResponse();
  }

  // SSE mode: proxy stream from API
  const apiStreamUrl = `${API_URL}/v1/approvals/stream`;
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
  };
  if (lastEventId) {
    headers["Last-Event-ID"] = lastEventId;
  }

  try {
    const apiRes = await fetch(apiStreamUrl, {
      headers,
      signal: request.signal,
    });

    if (apiRes.ok && apiRes.body) {
      return new Response(apiRes.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }
  } catch {
    // API unreachable — fall through to mock
  }

  // Fallback: mock SSE stream with heartbeat
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let counter = 0;

      // Send initial heartbeat
      controller.enqueue(encoder.encode(": heartbeat\n\n"));

      // Keep connection alive with periodic heartbeats
      const interval = setInterval(() => {
        if (request.signal.aborted) {
          clearInterval(interval);
          controller.close();
          return;
        }
        counter++;
        controller.enqueue(encoder.encode(`: heartbeat ${counter}\n\n`));
      }, 30_000);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
```

**Step 2: Commit**

```bash
mkdir -p apps/dashboard/app/api/approvals/stream
git add apps/dashboard/app/api/approvals/stream/route.ts
git commit -m "feat(dashboard): add SSE proxy endpoint for approval events"
```

---

### Task 9: Create ApprovalQueue Orchestrator Component

**Files:**
- Create: `apps/dashboard/components/approvals/approval-queue.tsx`

**Step 1: Create the orchestrator**

```tsx
"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { ApprovalGate, ApprovalStats } from "@/lib/types";
import { ApprovalCard } from "./approval-card";
import { ApprovalStatsBar } from "./approval-stats-bar";
import { ApprovalDetailPanel } from "./approval-detail-panel";
import { useApprovalStream } from "@/lib/use-approval-stream";

interface ApprovalQueueProps {
  initialGates: ApprovalGate[];
  initialStats: ApprovalStats;
}

type StatusFilter = "all" | "pending" | "escalated" | "approved" | "rejected" | "expired";

const FILTER_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "escalated", label: "Escalated" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
];

export function ApprovalQueue({ initialGates, initialStats }: ApprovalQueueProps) {
  const [gates, setGates] = useState<ApprovalGate[]>(initialGates);
  const [stats, setStats] = useState<ApprovalStats>(initialStats);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialGates.find((g) => g.status === "pending" || g.status === "escalated")?.id ?? null,
  );
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  // Index for O(1) SSE reconciliation
  const indexRef = useRef(new Map<string, number>());
  useEffect(() => {
    const idx = new Map<string, number>();
    gates.forEach((g, i) => idx.set(g.id, i));
    indexRef.current = idx;
  }, [gates]);

  const onGateUpdate = useCallback((updated: ApprovalGate) => {
    setGates((prev) => {
      const idx = indexRef.current.get(updated.id);
      if (idx !== undefined) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [updated, ...prev];
    });
  }, []);

  const { connected } = useApprovalStream(onGateUpdate);

  // Filtered + searched gates
  const filteredGates = useMemo(() => {
    let result = gates;
    if (filter !== "all") {
      result = result.filter((g) => g.status === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (g) =>
          g.projectName.toLowerCase().includes(q) ||
          g.scan.branch.toLowerCase().includes(q) ||
          g.scan.commitHash.toLowerCase().includes(q),
      );
    }
    return result;
  }, [gates, filter, search]);

  // Filter counts
  const filterCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: gates.length,
      pending: 0,
      escalated: 0,
      approved: 0,
      rejected: 0,
      expired: 0,
    };
    for (const g of gates) {
      if (g.status in counts) counts[g.status as StatusFilter]++;
    }
    return counts;
  }, [gates]);

  const selectedGate = gates.find((g) => g.id === selectedId) ?? null;

  const handleDecision = useCallback(
    async (gateId: string, decision: "approve" | "reject", justification: string) => {
      setSubmittingId(gateId);

      // Optimistic update
      setGates((prev) =>
        prev.map((g) =>
          g.id === gateId
            ? {
                ...g,
                status: decision === "approve" ? ("approved" as const) : ("rejected" as const),
                decidedAt: new Date().toISOString(),
                decisions: [
                  ...g.decisions,
                  {
                    id: `local-${Date.now()}`,
                    decidedBy: "you",
                    decision,
                    justification,
                    decidedAt: new Date().toISOString(),
                  },
                ],
              }
            : g,
        ),
      );

      // Auto-advance to next pending
      const nextPending = gates.find(
        (g) => g.id !== gateId && (g.status === "pending" || g.status === "escalated"),
      );
      if (nextPending) setSelectedId(nextPending.id);

      try {
        const { apiPost } = await import("@/lib/api-client");
        await apiPost(`/v1/approvals/${gateId}/decide`, { decision, justification });
      } catch (err) {
        // Revert optimistic update
        setGates((prev) =>
          prev.map((g) =>
            g.id === gateId
              ? {
                  ...initialGates.find((og) => og.id === gateId) ?? g,
                }
              : g,
          ),
        );
        setSelectedId(gateId);
        throw err;
      } finally {
        setSubmittingId(null);
      }
    },
    [gates, initialGates],
  );

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="animate-fade-up" style={{ animationDelay: "0.03s" }}>
        <ApprovalStatsBar stats={stats} />
      </div>

      {/* Filters */}
      <div className="animate-fade-up flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ animationDelay: "0.06s" }}>
        <div className="flex gap-1">
          {FILTER_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                filter === value
                  ? "bg-accent-subtle text-accent border border-accent/30"
                  : "text-text-secondary hover:bg-surface-2 hover:text-text-primary border border-transparent"
              }`}
            >
              {label}
              <span className="ml-1 font-mono text-[10px] opacity-70">
                {filterCounts[value]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project, branch, commit..."
            className="w-64 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[12px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {!connected && (
            <span className="flex items-center gap-1 text-[11px] text-status-warn">
              <span className="h-1.5 w-1.5 rounded-full bg-status-warn" />
              Reconnecting...
            </span>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      {filteredGates.length === 0 ? (
        <div className="animate-fade-up flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-surface-1" style={{ animationDelay: "0.09s" }}>
          <div className="text-center">
            <p className="text-[14px] font-semibold text-text-primary">
              {filter === "all" ? "No approval gates" : `No ${filter} gates`}
            </p>
            <p className="mt-1 text-[12px] text-text-tertiary">
              {filter === "all"
                ? "All scans are passing without requiring review."
                : "Try adjusting your filters."}
            </p>
          </div>
        </div>
      ) : (
        <div className="animate-fade-up grid gap-6 xl:grid-cols-[1fr_1fr]" style={{ animationDelay: "0.09s" }}>
          {/* List panel */}
          <div className="max-h-[calc(100vh-280px)] space-y-2 overflow-y-auto pr-1">
            {filteredGates.map((gate) => (
              <ApprovalCard
                key={gate.id}
                gate={gate}
                selected={gate.id === selectedId}
                onClick={() => setSelectedId(gate.id)}
              />
            ))}
          </div>

          {/* Detail panel */}
          <div className="max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {selectedGate ? (
              <ApprovalDetailPanel
                gate={selectedGate}
                onDecision={handleDecision}
                isSubmitting={submittingId === selectedGate.id}
              />
            ) : (
              <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-surface-1">
                <p className="text-[13px] text-text-tertiary">
                  Select a gate to view details
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/dashboard/components/approvals/approval-queue.tsx
git commit -m "feat(dashboard): add ApprovalQueue orchestrator with optimistic updates"
```

---

### Task 10: Create Approvals Page (Server Component)

**Files:**
- Create: `apps/dashboard/app/(dashboard)/approvals/page.tsx`

**Step 1: Create the page**

```tsx
import { getApprovalGates, getApprovalStats } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { ApprovalQueue } from "@/components/approvals/approval-queue";

export default async function ApprovalsPage() {
  const [gates, stats] = await Promise.all([
    getApprovalGates(),
    getApprovalStats(),
  ]);

  const actionableCount = gates.filter(
    (g) => g.status === "pending" || g.status === "escalated",
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description={`${actionableCount} gates awaiting review${stats.escalated > 0 ? ` · ${stats.escalated} escalated` : ""}`}
      />
      <ApprovalQueue initialGates={gates} initialStats={stats} />
    </div>
  );
}
```

**Step 2: Commit**

```bash
mkdir -p apps/dashboard/app/\(dashboard\)/approvals
git add 'apps/dashboard/app/(dashboard)/approvals/page.tsx'
git commit -m "feat(dashboard): add approvals page with server-side data fetch"
```

---

### Task 11: Create Approval Detail Page (Deep-Link)

**Files:**
- Create: `apps/dashboard/app/(dashboard)/approvals/[id]/page.tsx`

**Step 1: Create the page**

```tsx
import Link from "next/link";
import { getApprovalGateById } from "@/lib/api";
import { IconChevronLeft } from "@/components/icons";
import { ApprovalDetailClient } from "./detail-client";

interface ApprovalDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ApprovalDetailPage({ params }: ApprovalDetailPageProps) {
  const { id } = await params;
  const gate = await getApprovalGateById(id);

  if (!gate) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface-1">
          <svg
            className="h-7 w-7 text-text-tertiary"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-text-primary">Gate not found</p>
          <p className="mt-1 text-[13px] text-text-tertiary">
            The requested approval gate could not be located or may have been resolved.
          </p>
        </div>
        <Link
          href="/approvals"
          className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border bg-surface-1 px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary focus-ring"
        >
          <IconChevronLeft className="h-3.5 w-3.5" />
          Back to Approvals
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <Link
          href="/approvals"
          className="inline-flex items-center gap-1 text-[13px] text-text-tertiary hover:text-accent transition-colors focus-ring rounded"
        >
          <IconChevronLeft className="h-3.5 w-3.5" />
          Approvals
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-text-primary">
          Approval Gate — {gate.projectName}
        </h1>
        <p className="mt-1 text-[13px] text-text-secondary">
          {gate.scan.branch} · {gate.scan.commitHash.slice(0, 7)} · {gate.gateType.replace(/_/g, " ")}
        </p>
      </div>
      <div className="animate-fade-up max-w-2xl" style={{ animationDelay: "0.05s" }}>
        <ApprovalDetailClient gate={gate} />
      </div>
    </div>
  );
}
```

**Step 2: Create the client wrapper**

Create `apps/dashboard/app/(dashboard)/approvals/[id]/detail-client.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ApprovalGate } from "@/lib/types";
import { ApprovalDetailPanel } from "@/components/approvals/approval-detail-panel";

interface ApprovalDetailClientProps {
  gate: ApprovalGate;
}

export function ApprovalDetailClient({ gate: initialGate }: ApprovalDetailClientProps) {
  const [gate, setGate] = useState(initialGate);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleDecision = useCallback(
    async (gateId: string, decision: "approve" | "reject", justification: string) => {
      setIsSubmitting(true);

      // Optimistic update
      setGate((prev) => ({
        ...prev,
        status: decision === "approve" ? "approved" as const : "rejected" as const,
        decidedAt: new Date().toISOString(),
        decisions: [
          ...prev.decisions,
          {
            id: `local-${Date.now()}`,
            decidedBy: "you",
            decision,
            justification,
            decidedAt: new Date().toISOString(),
          },
        ],
      }));

      try {
        const { apiPost } = await import("@/lib/api-client");
        await apiPost(`/v1/approvals/${gateId}/decide`, { decision, justification });
        router.refresh();
      } catch (err) {
        setGate(initialGate);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [initialGate, router],
  );

  return (
    <ApprovalDetailPanel
      gate={gate}
      onDecision={handleDecision}
      isSubmitting={isSubmitting}
    />
  );
}
```

**Step 3: Commit**

```bash
mkdir -p 'apps/dashboard/app/(dashboard)/approvals/[id]'
git add 'apps/dashboard/app/(dashboard)/approvals/[id]/page.tsx' 'apps/dashboard/app/(dashboard)/approvals/[id]/detail-client.tsx'
git commit -m "feat(dashboard): add approval gate detail page with deep-link support"
```

---

### Task 12: Wire Everything Together and Verify

**Files:**
- Verify all imports resolve
- Verify the dashboard builds

**Step 1: Verify the build**

Run from the monorepo root:
```bash
cd apps/dashboard && npx next build
```

If there are import errors, fix them. Common issues:
- Missing `@/components/approvals/` path resolution
- `apiPost` not exported from `api-client.ts` (it already is)

**Step 2: Start the dashboard and verify visually**

```bash
cd apps/dashboard && npx next dev
```

Navigate to `http://localhost:3000/approvals`:
- Verify the page loads with mock data
- Verify 8 mock gates render in the list
- Verify clicking a gate shows the detail panel
- Verify the stats bar shows correct counts
- Verify filter tabs filter correctly
- Verify the decision form appears for pending/escalated gates
- Verify the "Approvals" nav item appears in the sidebar

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(dashboard): wire approval components and verify build"
```

---

### Task 13: Add Component Tests

**Files:**
- Create: `apps/dashboard/components/approvals/__tests__/approval-card.test.tsx`

**Step 1: Create tests**

Use vitest + React Testing Library. Test:
- ApprovalCard renders pending status with amber badge
- ApprovalCard renders escalated status with red badge and pulse
- ApprovalCard renders approved status with green badge and opacity
- ApprovalCard shows SLA countdown for actionable gates
- ApprovalCard does not show SLA countdown for decided gates
- ApprovalCard shows project name and branch
- ApprovalCard calls onClick when clicked
- Selected card has accent background

**Step 2: Run tests**

```bash
npx vitest run components/approvals/__tests__/approval-card.test.tsx
```

**Step 3: Commit**

```bash
git add apps/dashboard/components/approvals/__tests__/
git commit -m "test(dashboard): add ApprovalCard component tests"
```

---

### Summary

| Task | Component | Files |
|------|-----------|-------|
| 1 | Types + Mock Data | `lib/types.ts`, `lib/mock-data.ts` |
| 2 | API Functions | `lib/api.ts` |
| 3 | Sidebar + RBAC | `lib/rbac.ts`, `components/icons.tsx` |
| 4 | ApprovalCard | `components/approvals/approval-card.tsx` |
| 5 | ApprovalStatsBar | `components/approvals/approval-stats-bar.tsx` |
| 6 | ApprovalDetailPanel | `components/approvals/approval-detail-panel.tsx` |
| 7 | useApprovalStream | `lib/use-approval-stream.ts` |
| 8 | SSE Proxy | `app/api/approvals/stream/route.ts` |
| 9 | ApprovalQueue | `components/approvals/approval-queue.tsx` |
| 10 | Approvals Page | `app/(dashboard)/approvals/page.tsx` |
| 11 | Detail Page | `app/(dashboard)/approvals/[id]/page.tsx` + `detail-client.tsx` |
| 12 | Integration Verify | Build + visual verification |
| 13 | Component Tests | `__tests__/approval-card.test.tsx` |
