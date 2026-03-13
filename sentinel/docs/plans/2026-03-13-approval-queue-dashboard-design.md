# Approval Queue Dashboard — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Build a dashboard page for reviewers to see pending approval gates and act on them (approve/reject with justification). The FSM, API routes, and approval-worker already exist — this is the UI layer.

**Architecture:** Server Component page with initial data fetch, Client Component orchestrator for SSE real-time updates + polling fallback, two-column layout (list + detail), optimistic decision mutations.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS v4 (existing design tokens), SSE + polling hybrid, existing `apiGet`/`apiPost` client with HMAC signing.

---

## 1. Approach Analysis & Justifications

### 1.1 Algorithms — Queue Ordering & Prioritization

Three approaches evaluated for how the approval queue surfaces items to reviewers:

**Approach A: Static Priority Sort**
Sort by `(status='escalated' DESC, priority DESC, requestedAt ASC)` — the ordering the existing `GET /v1/approvals` endpoint returns. Fixed column sort, computed once per query.

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Performance | Excellent | O(n log n) on indexed columns via composite index `[orgId, status, priority]` |
| Scalability | Good | ~50ms for 10K gates with proper indexing |
| Accuracy | Limited | Treats all "priority=50" items identically; no SLA urgency |
| Efficiency | Good | Zero computation beyond DB sort |
| Fairness | Fair | FIFO within priority band, but no time-to-SLA-breach awareness |

**Approach B: Weighted Scoring with SLA Urgency**
Composite score: `score = (priority × 0.3) + (slaUrgency × 0.5) + (escalationBoost × 0.2)` where `slaUrgency = max(0, 1 - (timeRemaining / totalSlaWindow))`. Items closest to SLA breach surface first.

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Performance | Good | O(n) score computation + O(n log n) sort; can compute in-query |
| Scalability | Good | Lightweight inline computation |
| Accuracy | Excellent | Surfaces time-critical items before they expire |
| Efficiency | Very Good | Reviewers handle most urgent items first |
| Fairness | Excellent | Old low-priority items eventually outrank newer high-priority ones |

**Approach C: Adaptive Priority Queue with Reviewer Affinity**
Extends B with per-reviewer ranking based on domain expertise from historical decisions. Min-heap keyed on personalized composite score.

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Performance | Moderate | Per-reviewer computation + affinity model maintenance |
| Scalability | Moderate | Affinity model grows with reviewers × gate types |
| Accuracy | Excellent | Routes items to domain experts |
| Efficiency | Excellent | Faster decisions on familiar patterns |
| Fairness | Complex | Risk of affinity lock-in; needs rotation |

**Decision: Hybrid A+B.** Static priority as base, enhanced with SLA urgency score in the Postgres query. Single ORDER BY expression — no new infrastructure. C is premature without reviewer history data.

### 1.2 Data Structures — Client-Side Queue State

**Approach A: Flat Array with Linear Scan**
Store gates as `ApprovalGate[]`, filter/sort per render. `useMemo` memoizes derived views.

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Performance | Good (<500) | O(n) filter + O(n log n) sort per render |
| SSE reconciliation | Simple | Find-and-replace + full re-sort |

**Approach B: Normalized Map + Derived Views**
`Map<string, ApprovalGate>` keyed by ID. O(1) SSE updates, derived sorted arrays via `useMemo`.

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Performance | Very Good | O(1) updates, derivation only on mutation |
| SSE reconciliation | Excellent | O(1) by ID |

**Approach C: Indexed Collection with Binary Heap**
Min-heap ordered by composite score + HashMap for O(1) lookups. O(log n) insert/update.

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Performance | Excellent (100K+) | Sublinear operations |
| Complexity | High | Custom heap implementation |

**Decision: Hybrid A+B.** Flat array as primary state (pagination caps at ~200 items where linear scan is <0.1ms), with a Map index alongside for O(1) SSE reconciliation. No heap — the API paginates to 50 items.

### 1.3 System Design — Real-Time Data Flow

**Approach A: Pure SSE with Event Replay**
Dedicated SSE endpoint broadcasting approval events. Client reconnects with `Last-Event-ID`.

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Latency | Excellent | Sub-second delivery |
| Reliability | Moderate | Connections drop on network changes |

**Approach B: Polling with Smart Invalidation**
Client polls `GET /v1/approvals?since={timestamp}` every 30s. Mutation-triggered refetch.

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Latency | Moderate | Up to 30s stale |
| Reliability | Excellent | Stateless, self-healing |

**Approach C: WebSocket Bidirectional Channel**
Full-duplex WebSocket for receiving events and sending decisions.

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Latency | Excellent | Bidirectional real-time |
| Complexity | High | New protocol stack, auth over WS, sticky sessions |

**Decision: Hybrid A+B.** SSE primary for <1s updates (reuses existing `useScanStream` pattern), polling fallback every 30s as safety net (reuses existing `apiGet` client). WebSocket rejected — new protocol stack with marginal benefit since decisions are low-frequency HTTP POSTs.

### 1.4 Software Design — Component Architecture

**Approach A: Monolithic Page Component**
Single large component handling data, state, rendering.

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Maintainability | Poor | 500+ lines, untestable |
| Reusability | None | Can't extract for scan detail page |

**Approach B: Feature-Sliced Architecture (Container/Presenter)**
Server Component page → Client Component orchestrator → Presenter components. Shared hooks.

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Maintainability | Excellent | Single-responsibility components |
| Reusability | Excellent | Components reusable in scan detail page |
| Testability | Excellent | Presenters testable with mock props |

**Approach C: Micro-Frontend with Module Federation**
Independent module with own state management, build pipeline, deployment.

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Complexity | High | Infrastructure overhead for single-team project |

**Decision: Pure B.** No hybrid needed — Feature-Sliced matches the existing dashboard convention exactly. A is too simple, C solves a multi-team problem that doesn't exist.

---

## 2. Page Structure & Routes

```
app/(dashboard)/approvals/
  page.tsx                    ← Server Component: fetch initial queue + stats
  [id]/
    page.tsx                  ← Server Component: fetch gate detail

app/api/approvals/
  stream/route.ts             ← Edge Runtime: SSE proxy to API
```

## 3. Types

New types in `lib/types.ts`:

```typescript
export type ApprovalStatus = "pending" | "escalated" | "approved" | "rejected" | "expired";
export type GateType = "risk_threshold" | "category_block" | "license_review" | "always_review";
export type ExpiryAction = "reject" | "approve";

export interface ApprovalGate {
  id: string;
  scanId: string;
  projectId: string;
  projectName: string;
  status: ApprovalStatus;
  gateType: GateType;
  triggerCriteria: Record<string, unknown>;
  priority: number;            // 0-100, escalated = 90
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

export interface ApprovalDecision {
  id: string;
  decidedBy: string;
  decision: "approve" | "reject";
  justification: string;
  decidedAt: string;
}

export interface ApprovalStats {
  pending: number;
  escalated: number;
  decidedToday: number;
  avgDecisionTimeHours: number;
  expiringSoon: number;        // expires within 4 hours
}
```

## 4. Component Architecture

```
approvals/page.tsx (Server Component)
  └─ <ApprovalQueue>  (Client Component — orchestrator)
       ├─ <ApprovalStatsBar>        stats strip
       ├─ <ApprovalFilters>         status tabs + search
       ├─ <div grid xl:grid-cols-[1fr_1fr]>
       │    ├─ <ApprovalListPanel>  scrollable list
       │    │    └─ <ApprovalCard>  per gate
       │    └─ <ApprovalDetailPanel> selected gate + decision form
       │         ├─ gate metadata
       │         ├─ <SlaCountdown>
       │         ├─ <ApprovalDecisionForm>
       │         └─ <ApprovalActivityLog>
       └─ empty state
```

### Component Details

**ApprovalStatsBar** — Horizontal strip mirroring the findings severity strip pattern. Five stat cards: Pending, Escalated, Decided Today, Avg Decision Time, Expiring Soon.

**ApprovalFilters** — Tab-style status filter `[ All | Pending | Escalated | Decided | Expired ]` with counts. Search input for project name/branch/commit.

**ApprovalCard** — Compact list card:
- Status badge (pending=amber, escalated=red+pulse, approved=green, rejected=red, expired=gray)
- Left border accent (2px, color by status; selected = `bg-accent-subtle border-l-accent`)
- SLA countdown in top-right, color-coded: green (>8h), amber (4-8h), red (<4h)
- Content: gate type, project/branch/commit, risk score, finding count, assigned role, requested time

**ApprovalDetailPanel** — Right column, sections:
1. Gate metadata (status, priority, type, trigger criteria)
2. Scan details (project, branch, commit, risk score, findings) with links to scan/findings pages
3. SLA section: countdown timer, progress bar, escalation/expiry times, expiry action
4. Decision form (only for pending/escalated): justification textarea (min 10 chars) + Approve/Reject buttons
5. Activity log: timeline of decisions with who/when/justification

**SlaCountdown** — Live countdown. Color transitions: >8h green, 4-8h amber, <4h red+pulse, expired gray. Progress bar shows elapsed percentage.

**ApprovalDecisionForm** — Justification textarea + two buttons. Loading state disables buttons. Optimistic update moves gate immediately; reverts on error. After decision, auto-selects next pending gate.

## 5. Data Flow

### Initial Load
```
page.tsx (RSC)
  ├─ getApprovalGates()  → GET /v1/approvals?limit=50
  ├─ getApprovalStats()  → GET /v1/approvals/stats
  └─ render <ApprovalQueue initialGates={} initialStats={} />
```

### Real-Time (SSE + Polling)
```
useApprovalStream() hook:
  1. Connect SSE to /api/approvals/stream
  2. On event (gate.created/decided/escalated/expired/reassigned): merge into state
  3. On disconnect: start 30s polling GET /v1/approvals?since={lastFetch}
  4. On reconnect: stop polling, resume SSE
```

### Decision
```
User clicks Approve/Reject with justification
  → optimistic update in local state
  → POST /v1/approvals/:id/decide { decision, justification }
  → success: auto-advance to next pending gate
  → error: revert optimistic update, show error
```

## 6. Queue Ordering (Hybrid A+B)

Server returns gates ordered by SLA-urgency composite score:

```sql
ORDER BY
  CASE WHEN "status" = 'escalated' THEN 0 ELSE 1 END,
  (
    "priority" * 0.3 +
    GREATEST(0.0, 1.0 - EXTRACT(EPOCH FROM ("expiresAt" - NOW())) /
      NULLIF(EXTRACT(EPOCH FROM ("expiresAt" - "requestedAt")), 0)) * 0.5 +
    CASE WHEN "status" = 'escalated' THEN 0.2 ELSE 0.0 END
  ) DESC,
  "requestedAt" ASC
```

Client preserves server ordering. No client-side re-sort.

## 7. Client State (Hybrid A+B)

Flat array as primary state. Map index for O(1) SSE reconciliation:

```typescript
const [gates, setGates] = useState<ApprovalGate[]>(initialGates);
const indexRef = useRef(new Map<string, number>());

useEffect(() => {
  const idx = new Map<string, number>();
  gates.forEach((g, i) => idx.set(g.id, i));
  indexRef.current = idx;
}, [gates]);

function onGateEvent(updated: ApprovalGate) {
  setGates(prev => {
    const idx = indexRef.current.get(updated.id);
    if (idx !== undefined) {
      const next = [...prev];
      next[idx] = updated;
      return next;
    }
    return [updated, ...prev];
  });
}
```

## 8. API Layer

New functions in `lib/api.ts` using existing `tryApi()` + mock fallback pattern:

```typescript
getApprovalGates(status?: string): Promise<ApprovalGate[]>
getApprovalGateById(id: string): Promise<ApprovalGate | null>
getApprovalStats(): Promise<ApprovalStats>
submitApprovalDecision(gateId, decision, justification): Promise<void>
reassignApprovalGate(gateId, assignTo): Promise<void>
```

## 9. SSE Proxy

`app/api/approvals/stream/route.ts` — Edge Runtime:
- Proxies to `SENTINEL_API_URL/v1/approvals/stream`
- Falls back to mock event stream
- 30s heartbeat
- Supports `Last-Event-ID`

## 10. Mock Data

8 mock gates (3 pending, 2 escalated, 2 approved, 1 rejected), 2 mock decisions, mock stats. Allows dashboard to work without backend.

## 11. Sidebar Integration

Add "Approvals" nav item in the Compliance section (between Findings and Certificates). Pending count badge (`bg-status-fail text-text-inverse`) when `pending + escalated > 0`.

## 12. Error Handling

| Scenario | Behavior |
|----------|----------|
| API unreachable | Mock data fallback |
| SSE drops | Auto-reconnect + 30s polling fallback |
| Decision POST fails | Revert optimistic update, inline error |
| Justification <10 chars | Client validation, button disabled |
| Gate already decided (409) | Toast + refresh gate |
| Unauthorized (403) | Permission denied empty state |
| Gate not found (404) | "Not found" with back link |

## 13. Accessibility

- `aria-label` on all interactive elements and badges
- `aria-describedby` linking decision buttons to justification textarea
- Focus management: after decision → focus next pending card
- Keyboard: Tab through list, Enter to select, Tab to form
- `role="timer"` + `aria-live="polite"` on SLA countdown
- Text labels accompany all color-coded states

## 14. Performance Budget

| Metric | Target |
|--------|--------|
| SSR page load | <200ms |
| Time to interactive | <500ms |
| SSE → UI update | <50ms |
| Decision → feedback | <100ms (optimistic) |
| Page JS bundle | <30KB gzipped |

## 15. Testing Strategy

| Layer | What | How |
|-------|------|-----|
| Component | ApprovalCard renders all status variants | Vitest + RTL, mock props |
| Component | DecisionForm validates justification | RTL: type <10 chars → button disabled |
| Component | SlaCountdown color bands | Mock Date.now(), verify classnames |
| Hook | useApprovalStream SSE + merge | Mock EventSource, verify state |
| Hook | useApprovalStream polling fallback | Mock EventSource error, verify fetch |
| Integration | Filter → select → decide → auto-advance | RTL with mock data |
| API | getApprovalGates returns typed data | Mock fetch, verify mapping |
| E2E | Load page, verify render, submit decision | Playwright |
