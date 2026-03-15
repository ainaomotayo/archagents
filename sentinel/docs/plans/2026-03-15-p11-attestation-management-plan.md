# P11: Attestation Management — Implementation Plan

**Date**: 2026-03-15
**Design Doc**: `docs/plans/2026-03-15-p11-attestation-management-design.md`
**Branch**: `feat/p11-attestation-management`

---

## Task Breakdown

### Phase 1: Foundation (Types, Schema, Mock Data, Navigation)

#### Task 1.1: Attestation types and helpers
**File**: `apps/dashboard/components/compliance/attestation-types.ts` (new)
**What**: Define all attestation TypeScript types, status constants, color mappings, TTL defaults, and state machine helpers.

```ts
// Types to define:
export type AttestationType = "manual" | "scan_approval";
export type AttestationStatus = "draft" | "pending_review" | "pending_approval" | "approved" | "rejected" | "expired" | "superseded";
export type ApprovalStage = "review" | "final_approval";
export type ApprovalDecision = "pending" | "approved" | "rejected" | "changes_requested";
export type EvidenceType = "url" | "ticket" | "document" | "scan" | "certificate" | "finding" | "snapshot";

export interface Attestation { ... }
export interface AttestationApproval { ... }
export interface AttestationEvidence { ... }
export interface AttestationSnapshot { ... }

// Helpers:
export function statusColor(status: AttestationStatus): string  // maps to bg/text class pairs
export function statusLabel(status: AttestationStatus): string  // human-readable label
export function defaultTTLDays(frameworkSlug: string): number   // from design doc table
export function canTransition(from: AttestationStatus, action: string): boolean  // state machine
export function canUserAct(role: string, createdBy: string, reviewedBy: string | null, action: string): boolean  // RBAC
```

**Verify**: Unit tests in `components/compliance/__tests__/attestation-types.test.ts` — status colors, TTL defaults, state transitions, RBAC checks.

---

#### Task 1.2: Prisma schema migration
**File**: `packages/db/prisma/schema.prisma` (edit)
**What**: Add 3 new models (Attestation, AttestationApproval, AttestationEvidence) exactly as specified in design doc. Add relation from Organization.

```prisma
// Add to Organization model:
attestations Attestation[]

// Add 3 new models from design doc (lines 47-118)
// Then generate + apply migration:
// cd packages/db && npx prisma migrate dev --name add_attestation_tables
```

**Verify**: `npx prisma migrate dev` succeeds, `npx prisma generate` succeeds.

---

#### Task 1.3: Mock data for attestations
**File**: `apps/dashboard/lib/mock-data.ts` (edit)
**What**: Add `MOCK_ATTESTATIONS` array (6-8 items covering all statuses) and `MOCK_ATTESTATION_AUDIT` timeline entries. Import new types from `attestation-types.ts`.

```ts
// 8 mock attestations covering:
// - 2x approved (one manual, one scan_approval)
// - 1x pending_review (manual)
// - 1x pending_approval (scan_approval)
// - 1x rejected
// - 1x expired
// - 1x draft
// - 1x superseded
// Each with 1-3 evidence items and 0-2 approvals
```

**Verify**: Import and access `MOCK_ATTESTATIONS` without TS errors.

---

#### Task 1.4: API client functions
**File**: `apps/dashboard/lib/api.ts` (edit)
**What**: Add attestation API functions following existing `tryApi` pattern (see lines 268-280 for `getPolicies` pattern).

```ts
// Add after Compliance section (~line 330):
export async function getAttestations(filters?: { type?: string; status?: string; framework?: string }): Promise<Attestation[]>
export async function getAttestationById(id: string): Promise<Attestation | null>
export async function getActiveAttestations(): Promise<AttestationOverride[]>  // for heatmap integration
```

**Verify**: Functions return mock data when `USE_MOCK` is true.

---

#### Task 1.5: Navigation + RBAC
**File**: `apps/dashboard/lib/rbac.ts` (edit)
**What**: Add nav item and route permission for attestations.

```ts
// In NAV_ITEMS, after "Gap Analysis" entry (line 50):
{ label: "Attestations", href: "/compliance/attestations", icon: "clipboard-check" },

// In ROUTE_PERMISSIONS, the /compliance entry (line 31) already covers /compliance/attestations
// No change needed there — all roles can view.
```

**File**: `apps/dashboard/components/icons.tsx` (edit)
**What**: Add `IconClipboardCheck` icon for nav, and `IconShieldCheck2` (filled shield) for attested heatmap cells.

**Verify**: Nav shows "Attestations" link under Compliance section. Clicking navigates to `/compliance/attestations`.

---

### Phase 2: Attestation List Page

#### Task 2.1: List page server component
**File**: `apps/dashboard/app/(dashboard)/compliance/attestations/page.tsx` (new)
**What**: Server component that fetches attestations + passes to client.

```tsx
// Pattern: match gap-analysis/page.tsx (line 1-29)
import { PageHeader } from "@/components/page-header";
import { getAttestations } from "@/lib/api";
import { AttestationListClient } from "@/components/compliance/AttestationListClient";

export default async function AttestationsPage() {
  const attestations = await getAttestations();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Attestations"
        description="Manage control attestations and scan approvals"
        action={<Link href="/compliance/attestations/new">+ New Attestation</Link>}
      />
      <AttestationListClient attestations={attestations} />
    </div>
  );
}
```

**Verify**: Page renders at `/compliance/attestations` with header and action button.

---

#### Task 2.2: Summary stat cards
**File**: `apps/dashboard/components/compliance/AttestationSummaryCards.tsx` (new)
**What**: 4 stat cards — Total, Approved, Pending, Expiring Soon (within 30 days). Pattern matches `SummaryCards.tsx`.

**Verify**: Cards show correct counts from mock data.

---

#### Task 2.3: Filter bar
**File**: `apps/dashboard/components/compliance/AttestationFilterBar.tsx` (new)
**What**: Type filter (All/Manual/Scan Approval), Status dropdown, Framework dropdown, search input. Pattern matches `FrameworkFilterBar.tsx`.

**Verify**: Filters narrow list correctly.

---

#### Task 2.4: Attestation card + status badge + pipeline indicator
**Files** (all new):
- `components/compliance/AttestationCard.tsx` — single row showing control, framework, score, status, expiry, creator, pipeline
- `components/compliance/AttestationStatusBadge.tsx` — colored status pill (pattern: `VerdictBadge.tsx`)
- `components/compliance/ApprovalPipelineIndicator.tsx` — 2-step visual: Review -> Final Approval with check/circle/pending icons

**Verify**: Cards render all mock attestations with correct status colors and pipeline states.

---

#### Task 2.5: List client orchestrator
**File**: `apps/dashboard/components/compliance/AttestationListClient.tsx` (new)
**What**: "use client" component that holds filter state, computes filtered list, renders SummaryCards + FilterBar + cards list.

```tsx
// Pattern: match GapAnalysisClient.tsx
"use client";
import { useState, useMemo } from "react";
// ... compose AttestationSummaryCards, AttestationFilterBar, AttestationCard
```

**Verify**: Full list page works end-to-end with filtering and search.

---

### Phase 3: Create Attestation Page

#### Task 3.1: Server actions
**File**: `apps/dashboard/app/(dashboard)/compliance/attestations/[id]/actions.ts` (new)
**What**: Server actions for all mutations. Pattern matches `policies/[id]/actions.ts`.

```ts
"use server";
import { revalidatePath } from "next/cache";

export async function createAttestation(data: CreateAttestationInput) { ... }
export async function submitForReview(id: string) { ... }
export async function reviewAttestation(id: string, decision: string, comment?: string) { ... }
export async function finalApproveAttestation(id: string, decision: string, comment?: string) { ... }
```

**Verify**: Actions call API (or mock) and revalidate paths.

---

#### Task 3.2: Create page server component
**File**: `apps/dashboard/app/(dashboard)/compliance/attestations/new/page.tsx` (new)
**What**: Server component that fetches framework/control metadata and certificates for form dropdowns.

```tsx
import { getComplianceScores, getCertificates } from "@/lib/api";
import { AttestationFormClient } from "@/components/compliance/AttestationFormClient";

export default async function NewAttestationPage() {
  const [frameworks, certificates] = await Promise.all([
    getComplianceScores(),
    getCertificates(),
  ]);
  return <AttestationFormClient frameworks={frameworks} certificates={certificates} />;
}
```

---

#### Task 3.3: Type selector + Framework/Control picker
**Files** (new):
- `components/compliance/AttestationTypeSelector.tsx` — radio group: Manual Control vs Scan Approval
- `components/compliance/FrameworkControlPicker.tsx` — cascading dropdowns: select framework -> populates controls

**Verify**: Selecting framework populates control dropdown from compliance scores data.

---

#### Task 3.4: Evidence reference components
**Files** (new):
- `components/compliance/EvidenceReferenceList.tsx` — list of evidence items with remove buttons + "Add" button
- `components/compliance/EvidenceReferenceForm.tsx` — inline form: type picker (URL/Ticket/Document) + title + URL/ref fields

**Verify**: Can add/remove evidence items. Auto-snapshot item is non-removable.

---

#### Task 3.5: Auto-snapshot card
**File**: `components/compliance/AutoSnapshotCard.tsx` (new)
**What**: Displays frozen compliance state: control score, framework score, passing/failing counts, certificate status. Built from framework scores data passed as prop.

**Verify**: Shows current state when framework+control selected, "No control selected" otherwise.

---

#### Task 3.6: Form client orchestrator
**File**: `apps/dashboard/components/compliance/AttestationFormClient.tsx` (new)
**What**: "use client" component orchestrating the entire create form. Holds form state, validates, calls `createAttestation` server action.

```tsx
// State: type, frameworkSlug, controlCode, title, description, score, expiresAt, evidence[]
// On framework+control select: compute snapshot from frameworks prop
// On submit: call createAttestation action, router.push to detail page
```

**Verify**: Full create flow: select type -> pick framework/control -> fill details -> add evidence -> snapshot appears -> save draft or submit.

---

### Phase 4: Attestation Detail + Approval Page

#### Task 4.1: Detail page server component
**File**: `apps/dashboard/app/(dashboard)/compliance/attestations/[id]/page.tsx` (new)
**What**: Server component that fetches attestation detail + audit trail.

```tsx
import { getAttestationById, getAuditLog } from "@/lib/api";
import { AttestationDetailClient } from "@/components/compliance/AttestationDetailClient";
import { notFound } from "next/navigation";

export default async function AttestationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attestation = await getAttestationById(id);
  if (!attestation) notFound();
  const auditEvents = await getAuditLog(); // filtered by resource in real API
  return <AttestationDetailClient attestation={attestation} auditEvents={auditEvents} />;
}
```

---

#### Task 4.2: Approval action panel
**File**: `components/compliance/ApprovalActionPanel.tsx` (new)
**What**: Shows Approve/Request Changes/Reject buttons + comment textarea. Enforces RBAC: cannot review own attestation, final approver cannot be creator or reviewer. Calls server actions.

**Verify**: Component tests — buttons disabled for wrong roles, correct action called on click.

---

#### Task 4.3: Audit trail component
**File**: `components/compliance/AttestationAuditTrail.tsx` (new)
**What**: Timeline of audit events — created, submitted, reviewed, approved/rejected. Vertical timeline with icons and timestamps.

**Verify**: Renders mock audit events in chronological order.

---

#### Task 4.4: Detail client orchestrator
**File**: `components/compliance/AttestationDetailClient.tsx` (new)
**What**: "use client" component: left column (status, description, evidence, snapshot), right column (approval pipeline + action panel), bottom (audit trail).

**Verify**: Full detail page renders. Approval actions trigger server actions + router.refresh().

---

### Phase 5: Heatmap Integration

#### Task 5.1: Heatmap cell attestation overlay
**File**: `components/compliance/HeatmapCell.tsx` (edit)
**What**: Add `isAttested?: boolean` and `attestedScore?: number` props. When attested, show small shield icon at top-right of cell. Use attested score for color instead of automated score. Tooltip shows "(Attested, expires DATE)".

**Verify**: Heatmap grid test updated — attested cells show shield icon and use override score.

---

#### Task 5.2: ControlDetailPanel attestation info
**File**: `components/compliance/ControlDetailPanel.tsx` (edit)
**What**: When control has active attestation, show "Automated: X% -> Attested: Y%" comparison + "View attestation" link.

**Verify**: Panel shows attestation info when present.

---

#### Task 5.3: GapAnalysisClient merge overrides
**File**: `components/compliance/GapAnalysisClient.tsx` (edit)
**What**: Accept `attestationOverrides` prop. Before rendering, merge: for each override, replace control score with attested score and mark `isAttested: true`.

**File**: `app/(dashboard)/compliance/gap-analysis/page.tsx` (edit)
**What**: Fetch active attestations via `getActiveAttestations()` and pass to GapAnalysisClient.

**Verify**: Gap analysis page shows shield icons on attested controls with override scores.

---

### Phase 6: Tests

#### Task 6.1: Unit tests — attestation types
**File**: `components/compliance/__tests__/attestation-types.test.ts` (new)
**Tests**:
- `statusColor` returns correct classes for all 7 statuses
- `defaultTTLDays` returns correct values per framework
- `canTransition` validates all valid/invalid transitions from state machine
- `canUserAct` enforces RBAC matrix from design doc

---

#### Task 6.2: Component tests — attestation card
**File**: `components/compliance/__tests__/attestation-card.test.tsx` (new)
**Tests**:
- Renders title, framework, control code, score, status badge
- Pipeline indicator shows correct stages
- "View" link navigates to detail page

---

#### Task 6.3: Component tests — approval action panel
**File**: `components/compliance/__tests__/approval-action-panel.test.tsx` (new)
**Tests**:
- Admin can approve/reject at review stage
- Creator cannot review their own attestation
- Final approver cannot be creator or reviewer
- Comment field required for "changes_requested"

---

#### Task 6.4: Component tests — evidence reference list
**File**: `components/compliance/__tests__/evidence-reference-list.test.tsx` (new)
**Tests**:
- Renders existing evidence items
- Add button opens form
- Remove button removes item
- Auto-snapshot evidence is non-removable

---

#### Task 6.5: Integration test — attestation form
**File**: `components/compliance/__tests__/attestation-form.test.tsx` (new)
**Tests**:
- Full form flow: type selection -> framework -> control -> evidence -> snapshot captured -> submit
- Score validation (0.0-1.0)
- Expiry defaults to framework TTL

---

#### Task 6.6: Integration test — heatmap attestation
**File**: `components/compliance/__tests__/heatmap-attestation.test.tsx` (new)
**Tests**:
- Heatmap cell shows shield icon when attested
- Attested score used for cell color
- ControlDetailPanel shows attestation comparison

---

#### Task 6.7: E2E test — full attestation flow
**File**: `__tests__/e2e/attestation-flow.spec.ts` (new)
**Tests**:
- Navigate to attestations page
- Create new manual attestation
- Submit for review
- Review and approve (as different user mock)
- Verify heatmap shows override

---

## File Summary

| # | File | Action | Phase |
|---|------|--------|-------|
| 1 | `components/compliance/attestation-types.ts` | new | 1.1 |
| 2 | `packages/db/prisma/schema.prisma` | edit | 1.2 |
| 3 | `lib/mock-data.ts` | edit | 1.3 |
| 4 | `lib/api.ts` | edit | 1.4 |
| 5 | `lib/rbac.ts` | edit | 1.5 |
| 6 | `components/icons.tsx` | edit | 1.5 |
| 7 | `app/(dashboard)/compliance/attestations/page.tsx` | new | 2.1 |
| 8 | `components/compliance/AttestationSummaryCards.tsx` | new | 2.2 |
| 9 | `components/compliance/AttestationFilterBar.tsx` | new | 2.3 |
| 10 | `components/compliance/AttestationCard.tsx` | new | 2.4 |
| 11 | `components/compliance/AttestationStatusBadge.tsx` | new | 2.4 |
| 12 | `components/compliance/ApprovalPipelineIndicator.tsx` | new | 2.4 |
| 13 | `components/compliance/AttestationListClient.tsx` | new | 2.5 |
| 14 | `app/(dashboard)/compliance/attestations/[id]/actions.ts` | new | 3.1 |
| 15 | `app/(dashboard)/compliance/attestations/new/page.tsx` | new | 3.2 |
| 16 | `components/compliance/AttestationTypeSelector.tsx` | new | 3.3 |
| 17 | `components/compliance/FrameworkControlPicker.tsx` | new | 3.3 |
| 18 | `components/compliance/EvidenceReferenceList.tsx` | new | 3.4 |
| 19 | `components/compliance/EvidenceReferenceForm.tsx` | new | 3.4 |
| 20 | `components/compliance/AutoSnapshotCard.tsx` | new | 3.5 |
| 21 | `components/compliance/AttestationFormClient.tsx` | new | 3.6 |
| 22 | `app/(dashboard)/compliance/attestations/[id]/page.tsx` | new | 4.1 |
| 23 | `components/compliance/ApprovalActionPanel.tsx` | new | 4.2 |
| 24 | `components/compliance/AttestationAuditTrail.tsx` | new | 4.3 |
| 25 | `components/compliance/AttestationDetailClient.tsx` | new | 4.4 |
| 26 | `components/compliance/HeatmapCell.tsx` | edit | 5.1 |
| 27 | `components/compliance/ControlDetailPanel.tsx` | edit | 5.2 |
| 28 | `components/compliance/GapAnalysisClient.tsx` | edit | 5.3 |
| 29 | `app/(dashboard)/compliance/gap-analysis/page.tsx` | edit | 5.3 |
| 30 | `components/compliance/__tests__/attestation-types.test.ts` | new | 6.1 |
| 31 | `components/compliance/__tests__/attestation-card.test.tsx` | new | 6.2 |
| 32 | `components/compliance/__tests__/approval-action-panel.test.tsx` | new | 6.3 |
| 33 | `components/compliance/__tests__/evidence-reference-list.test.tsx` | new | 6.4 |
| 34 | `components/compliance/__tests__/attestation-form.test.tsx` | new | 6.5 |
| 35 | `components/compliance/__tests__/heatmap-attestation.test.tsx` | new | 6.6 |
| 36 | `__tests__/e2e/attestation-flow.spec.ts` | new | 6.7 |

**Total**: 36 files (24 new, 8 edits, 4 new tests + 3 new component tests)

## Dependency Graph

```
Phase 1 (foundation) ─── all independent, do in parallel:
  1.1 types ──┐
  1.2 schema  │
  1.3 mock ───┤── Phase 2 (list page) ──── Phase 3 (create) ──── Phase 4 (detail)
  1.4 api ────┤                                                        │
  1.5 nav ────┘                                                        │
                                                              Phase 5 (heatmap)
                                                                       │
                                                              Phase 6 (tests)
```

- Phase 1 tasks are fully independent — can parallelize all 5
- Phase 2 depends on 1.1 + 1.3 + 1.4
- Phase 3 depends on 2.1 (for navigation) + 1.1
- Phase 4 depends on 3.1 (server actions) + 1.1
- Phase 5 depends on 1.4 (getActiveAttestations)
- Phase 6 depends on all prior phases

## Review Checkpoints

- **After Phase 1**: Run `npx prisma generate`, verify types compile, mock data renders
- **After Phase 2**: Visual review of list page at `/compliance/attestations`
- **After Phase 3**: Visual review of create form, test full create flow
- **After Phase 4**: Visual review of detail page, test approval workflow
- **After Phase 5**: Visual review of heatmap with attested cells
- **After Phase 6**: `npx vitest run` all pass, `npx playwright test` E2E pass
