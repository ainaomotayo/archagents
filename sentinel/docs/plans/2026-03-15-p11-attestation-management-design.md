# P11: Attestation Management Page — Design Document

**Date**: 2026-03-15
**Status**: Approved
**Author**: Claude Opus 4.6

## Overview

Add an attestation management system at `/compliance/attestations` with two capabilities:

1. **Manual Control Attestations** — Compliance officers create attestations for controls that automated scanning can't verify (e.g., "Disaster recovery plan exists" for SOC2 CC7.4). Approved attestations override heatmap scores.
2. **Scan Result Approval** — Managers review and sign off on automated scan/certificate results, adding human accountability to machine-generated compliance data.

Both flow through a **3-stage sequential approval pipeline**: Creator -> Reviewer -> Final Approver. Each stage transition is recorded as an immutable audit event in the existing hash-chained `audit_events` table.

## Enterprise Approach Decisions

### Algorithms: Versioned Override with Temporal Query

- **Primary**: Every attestation is immutable once approved — new attestations create new versions. `valid_from`/`valid_until` window enables point-in-time queries.
- **Score override**: Approved attestation score replaces automated score in heatmap with visual distinction (shield icon).
- **Rejected**: Simple latest-wins (loses history, insufficient for auditors), Bayesian confidence blending (hard to explain to auditors, probabilistic scores create confusion in GRC).

### Data Structures: Hybrid Normalized Tables + Audit Events

- **Primary**: 3 normalized tables (`attestations`, `attestation_approvals`, `attestation_evidence`) for fast relational queries.
- **Audit layer**: Existing `audit_events` table with hash chain records every state transition as immutable events.
- **Why hybrid**: Normalized tables give fast reads for UI; audit events give immutable trail for compliance. Pure event-sourcing is overkill infrastructure for low-volume attestation writes.
- **Rejected**: Flat table with JSONB approvals (can't query "pending my approval" efficiently), pure event-sourcing (complex materializer not justified for dozens of attestations per quarter).

### System Design: Synchronous Server-Side Rendering + router.refresh()

- **Primary**: All data fetched server-side in Next.js server components. Form mutations via server actions with `router.refresh()` after success.
- **Rationale**: Attestation workflows are low-frequency (5-10 per session). Real-time infrastructure not justified.
- **Rejected**: Optimistic updates (brief inconsistency for approval state is risky), WebSocket/SSE (stateful connections for 1-3 concurrent users is overkill).

### Software Design: Feature-Sliced Components with Prop Drilling

- **Primary**: ~17 focused components, parent client component orchestrates state via props. Matches established gap-analysis pattern.
- **Rejected**: Monolithic page (untestable, full re-renders), Context+Reducer (boilerplate for 2-3 level tree depth).

## Database Schema

### 3 New Tables

```prisma
model Attestation {
  id              String    @id @default(uuid()) @db.Uuid
  orgId           String    @map("org_id") @db.Uuid
  type            String    // "manual" | "scan_approval"
  frameworkSlug   String    @map("framework_slug")
  controlCode     String    @map("control_code")
  title           String
  description     String    @db.Text
  score           Float     // 0.0-1.0, the attested score for this control
  status          String    @default("draft")
  // "draft" | "pending_review" | "pending_approval" | "approved" | "rejected" | "expired" | "superseded"

  // Linkage (for scan_approval type)
  scanId          String?   @map("scan_id") @db.Uuid
  certificateId   String?   @map("certificate_id") @db.Uuid

  // Auto-snapshot (frozen at creation)
  snapshot        Json      @default("{}")

  // Temporal versioning
  version         Int       @default(1)
  validFrom       DateTime  @map("valid_from") @default(now())
  validUntil      DateTime? @map("valid_until")
  expiresAt       DateTime  @map("expires_at")
  supersededById  String?   @map("superseded_by_id") @db.Uuid

  createdBy       String    @map("created_by")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  approvals AttestationApproval[]
  evidence  AttestationEvidence[]

  @@index([orgId])
  @@index([orgId, frameworkSlug, controlCode, status])
  @@index([expiresAt])
  @@map("attestations")
}

model AttestationApproval {
  id              String    @id @default(uuid()) @db.Uuid
  attestationId   String    @map("attestation_id") @db.Uuid
  stage           String    // "review" | "final_approval"
  decision        String    // "pending" | "approved" | "rejected" | "changes_requested"
  comment         String?   @db.Text
  decidedBy       String?   @map("decided_by")
  decidedAt       DateTime? @map("decided_at")
  createdAt       DateTime  @default(now()) @map("created_at")

  attestation Attestation @relation(fields: [attestationId], references: [id])

  @@index([attestationId])
  @@index([decidedBy, decision])
  @@map("attestation_approvals")
}

model AttestationEvidence {
  id              String   @id @default(uuid()) @db.Uuid
  attestationId   String   @map("attestation_id") @db.Uuid
  type            String   // "url" | "ticket" | "document" | "scan" | "certificate" | "finding" | "snapshot"
  title           String
  refId           String?  @map("ref_id")
  url             String?
  source          String?  // "jira" | "confluence" | "github" | "internal"
  metadata        Json     @default("{}")
  createdAt       DateTime @default(now()) @map("created_at")

  attestation Attestation @relation(fields: [attestationId], references: [id])

  @@index([attestationId])
  @@map("attestation_evidence")
}
```

### Multi-Tenancy

All attestation queries scoped by `org_id` via existing `withTenant()` pattern. Attestation table has `orgId` column with index.

### Temporal Versioning

- New attestation for same control creates new row, sets `supersededById` on old one
- Old attestation: status -> "superseded", `validUntil` = now()
- Point-in-time queries: `WHERE valid_from <= $timestamp AND (valid_until IS NULL OR valid_until > $timestamp)`

## Routes

```
/compliance/attestations          -> Attestation list (main page)
/compliance/attestations/new      -> Create new attestation form
/compliance/attestations/[id]     -> Attestation detail + approval workflow
```

## Page Layouts

### Attestation List

```
+------------------------------------------------------------------+
| <- Compliance    Attestations              [+ New Attestation]    |
| Manage control attestations and scan approvals                   |
+----------+----------+----------+----------------------------------+
| Total    | Approved | Pending  | Expiring Soon                    |
| 24       | 18       | 4        | 2 (within 30 days)               |
+----------+----------+----------+----------------------------------+
| Filter: [All] [Manual] [Scan Approval]  Status: [All v]          |
| Framework: [All v]                       Search: [____________]   |
+------------------------------------------------------------------+
| +------------------------------------------------------------+   |
| | CC6.1 -- Logical Access Controls           SOC 2           |   |
| | Score: 95%  Approved  Expires: Apr 15  By: jane@co.com     |   |
| | Stage: check Review -> check Final Approval   [View ->]    |   |
| +------------------------------------------------------------+   |
| | A.12.4 -- Logging and Monitoring          ISO 27001        |   |
| | Score: 88%  Pending Review  Expires: May 2                 |   |
| | Stage: o Review -> o Final Approval          [View ->]     |   |
| +------------------------------------------------------------+   |
+------------------------------------------------------------------+
```

### Create Attestation

```
+------------------------------------------------------------------+
| <- Attestations    New Attestation           [Save Draft] [Submit]|
+------------------------------------------------------------------+
| Type:  (*) Manual Control  ( ) Scan Approval                     |
+------------------------------------------------------------------+
| Framework: [SOC 2 v]     Control: [CC6.1 -- Logical Access v]    |
| Title:     [________________________________________]             |
| Score:     [0.95] (0.0-1.0)                                      |
| Expires:   [2026-06-15] (default: 90 days for SOC 2)             |
+------------------------------------------------------------------+
| Description                                                       |
| +------------------------------------------------------------+   |
| | Markdown textarea...                                        |   |
| +------------------------------------------------------------+   |
+------------------------------------------------------------------+
| Evidence References                                     [+ Add]  |
| +------------------------------------------------------+         |
| | URL: Confluence DR Plan -- https://...              [x]       |
| | Ticket: JIRA-1234 -- Annual pentest report          [x]       |
| | Auto-Snapshot: Captured at 2026-03-15T10:30Z         ok       |
| +------------------------------------------------------+         |
+------------------------------------------------------------------+
| +-- Auto-Snapshot Preview ----------------------------------+    |
| | Control: CC6.1  Score: 72%  Passing: 18  Failing: 7      |    |
| | Framework: SOC 2  Score: 81%  Verdict: Partial            |    |
| | Certificate: #cf9a  Status: provisional  Risk: 28         |    |
| | Captured: 2026-03-15T10:30:00Z                            |    |
| +-----------------------------------------------------------+    |
+------------------------------------------------------------------+
```

### Attestation Detail + Approval

```
+------------------------------------------------------------------+
| <- Attestations    CC6.1 -- Logical Access Controls      v2      |
| Created by jane@co.com on Mar 15, 2026                           |
+--------------------------------+---------------------------------+
| Status                         | Approval Pipeline               |
| Pending Review                 |                                 |
| Score: 95%  Framework: SOC 2   |  1. Review     o Pending        |
| Expires: Jun 15, 2026          |  2. Final      o Waiting        |
|                                |                                 |
+--------------------------------+  +-- Review Action -----------+ |
| Description                    |  | [Approve] [Request Changes]| |
| Our disaster recovery plan...  |  | [Reject]                   | |
|                                |  | Comment: [______________]  | |
|                                |  +----------------------------+ |
+--------------------------------+                                 |
| Evidence (3 items)             |                                 |
| URL: Confluence DR Plan         |                                 |
| Ticket: JIRA-1234 Pentest      |                                 |
| Auto-Snapshot (Mar 15)          |                                 |
+--------------------------------+                                 |
| Auto-Snapshot                  |                                 |
| Control: 72% -> Attested: 95% |                                 |
| 18 passing, 7 failing         |                                 |
| Certificate: provisional       |                                 |
+--------------------------------+---------------------------------+
| Audit Trail                                                       |
| Mar 15 10:30  jane@co  Created attestation                       |
| Mar 15 10:30  system   Auto-snapshot captured                    |
| Mar 15 10:31  jane@co  Submitted for review                     |
| Mar 15 14:20  bob@co   Review: Approved -- "Looks thorough"     |
+------------------------------------------------------------------+
```

## Component Tree

```
apps/dashboard/
+-- app/(dashboard)/compliance/
|   +-- attestations/
|       +-- page.tsx                      -> server component, list data fetch
|       +-- new/
|       |   +-- page.tsx                  -> server component, framework metadata fetch
|       +-- [id]/
|           +-- page.tsx                  -> server component, attestation detail fetch
|           +-- actions.ts                -> server actions (create, submit, approve, reject)
+-- components/compliance/
    +-- AttestationListClient.tsx         -> client orchestrator for list page
    +-- AttestationSummaryCards.tsx       -> 4 stat cards (total, approved, pending, expiring)
    +-- AttestationFilterBar.tsx          -> type/status/framework filters + search
    +-- AttestationCard.tsx               -> single attestation row in list
    +-- AttestationStatusBadge.tsx        -> colored status pill
    +-- ApprovalPipelineIndicator.tsx     -> visual 2-step pipeline
    +-- AttestationFormClient.tsx         -> client orchestrator for create/edit form
    +-- AttestationTypeSelector.tsx       -> radio: manual vs scan_approval
    +-- FrameworkControlPicker.tsx        -> cascading framework -> control dropdowns
    +-- EvidenceReferenceList.tsx         -> list of evidence items with add/remove
    +-- EvidenceReferenceForm.tsx         -> add evidence modal (type picker + fields)
    +-- AutoSnapshotCard.tsx              -> frozen compliance state preview
    +-- AttestationDetailClient.tsx       -> client orchestrator for detail page
    +-- ApprovalActionPanel.tsx           -> approve/reject/request-changes with comment
    +-- AttestationAuditTrail.tsx         -> timeline of audit events
    +-- attestation-types.ts             -> shared types, helpers, constants
```

## Data Flow

```
Attestation List Page (server component):
  +-- GET /v1/attestations               -> list with approvals
  +-- Pass as props to AttestationListClient

Create Page (server component):
  +-- GET /v1/compliance/scores          -> framework + control metadata
  +-- GET /v1/certificates               -> for scan_approval type linkage
  +-- Pass as props to AttestationFormClient

Detail Page (server component):
  +-- GET /v1/attestations/:id           -> full detail with evidence + approvals
  +-- GET /v1/audit?resource=attestation&id=:id -> audit trail
  +-- Pass as props to AttestationDetailClient

Client Mutations (server actions):
  +-- createAttestation(data)            -> POST /v1/attestations
  +-- submitForReview(id)                -> PATCH /v1/attestations/:id/submit
  +-- reviewAttestation(id, decision)    -> POST /v1/attestations/:id/review
  +-- finalApproveAttestation(id, decision) -> POST /v1/attestations/:id/approve

Heatmap Integration:
  +-- getActiveAttestations()            -> GET /v1/attestations?status=approved&active=true
  +-- GapAnalysisClient merges overrides into framework scores
  +-- HeatmapCell shows shield icon for attested cells
```

## Auto-Snapshot Capture Flow

When a user creates an attestation and selects a framework + control:

1. Client extracts current state from already-loaded compliance scores
2. Client fetches latest certificate for additional context
3. Snapshot object built: `{ controlScore, frameworkScore, passing, failing, total, certificateId, certificateStatus, scanRiskScore, capturedAt }`
4. Displayed in AutoSnapshotCard for preview
5. On save, stored in `attestation.snapshot` JSONB + as an `AttestationEvidence` record of type `"snapshot"`

## Status Transition State Machine

```
                    +-------------+
                    |    draft     |
                    +------+------+
                           | submit
                    +------v------+
              +-----|pending_review|<--------+
              |     +------+------+          |
              |            | review           | changes_requested
              |     +------v--------+        |
              |     |pending_approval|-------+
              |     +------+--------+
              |            | final_approve
              |     +------v------+
              |     |   approved   |---- (time) ---> expired
              |     +-------------+
              |
       reject |
              |     +-------------+
              +---->|   rejected   |
                    +-------------+

New version of same control -> previous approved -> superseded
```

## RBAC Enforcement

| Action | Roles | Constraint |
|--------|-------|------------|
| View attestations | admin, manager, dev, viewer | - |
| Create attestation | admin, manager | - |
| Submit for review | admin, manager | Must be creator |
| Review (stage 1) | admin, manager | Cannot be creator |
| Final approve (stage 2) | admin | Cannot be creator or reviewer |
| View all roles | all | - |

## Heatmap Integration

- `getActiveAttestations()` returns approved + non-expired attestations as `{ frameworkSlug, controlCode, score, attestationId, expiresAt }[]`
- GapAnalysisClient merges overrides before rendering: attestation score replaces automated score
- HeatmapCell gets `isAttested` prop: renders shield icon at top-right, tooltip shows "(Attested, expires DATE)"
- ControlDetailPanel shows "Automated: X% -> Attested: Y%" comparison + "View attestation" link

## Framework Default TTLs

| Framework | Default Expiry | Rationale |
|-----------|---------------|-----------|
| SOC 2 | 90 days | Quarterly review cycle |
| ISO 27001 | 180 days | Semi-annual audit cycle |
| SLSA | 90 days | Build attestation freshness |
| GDPR | 365 days | Annual DPA review |
| CIS | 90 days | Quarterly benchmark |
| OpenSSF | 90 days | Scorecard freshness |
| EU AI Act | 180 days | Regulatory review cycle |

Configurable per-organization via `Organization.settings.attestationDefaults`.

## API Endpoints (New)

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/v1/attestations` | GET | List attestations (filterable) | all roles |
| `/v1/attestations` | POST | Create attestation | admin, manager |
| `/v1/attestations/:id` | GET | Get attestation detail | all roles |
| `/v1/attestations/:id/submit` | PATCH | Submit for review | creator only |
| `/v1/attestations/:id/review` | POST | Review decision | admin, manager (not creator) |
| `/v1/attestations/:id/approve` | POST | Final approval | admin (not creator/reviewer) |

## Dependencies

- **No new npm packages** — built with React, Tailwind, SVG
- **Prisma migration** — 1 new migration for 3 tables
- **Mock data** — `MOCK_ATTESTATIONS` in `lib/mock-data.ts`

## Testing

| Layer | File | Coverage |
|-------|------|----------|
| Unit | `attestation-types.test.ts` | Status colors, TTL defaults, snapshot validation, state transitions |
| Component | `attestation-card.test.tsx` | Card renders status, pipeline, framework/control info |
| Component | `approval-action-panel.test.tsx` | RBAC enforcement, decision buttons, comment field |
| Component | `evidence-reference-list.test.tsx` | Add/remove evidence, type picker, auto-snapshot |
| Integration | `attestation-form.test.tsx` | Full form: type -> framework -> control -> evidence -> snapshot -> submit |
| Integration | `heatmap-attestation.test.tsx` | Heatmap cells show attested override, shield icon, tooltip |
| E2E | `attestation-flow.spec.ts` | Create -> submit -> review -> approve -> heatmap shows override |
