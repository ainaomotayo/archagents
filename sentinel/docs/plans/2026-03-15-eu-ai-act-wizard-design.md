# EU AI Act Compliance Wizard Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Build a step-by-step compliance wizard that guides users through all 12 EU AI Act controls, collecting attestations and evidence, then generating the 4 required regulatory documents as PDF reports.

**Architecture:** DAG + FSM hybrid — a Directed Acyclic Graph defines control dependencies (topological sort via Kahn's algorithm produces 4 phases), while each step runs an independent Finite State Machine (locked → available → in_progress → completed → skipped). A WizardService orchestrates the flow, composing existing AttestationService, GapAnalysis, RemediationService, and ReportRegistry. Document generation reuses the existing PDF report pipeline (report-worker, S3, SSE status).

**Tech Stack:** TypeScript, Fastify, PostgreSQL, Prisma, React, Next.js, TanStack Query, React-PDF, S3-compatible storage, Redis Streams (SSE).

---

## Section 1: Control Definitions & Dependency Graph

### EU AI Act 12 Controls with Wizard Metadata

| Code | Article | Title | Phase | Dependencies | Requirements Count |
|------|---------|-------|-------|-------------|-------------------|
| AIA-9 | Art. 9 | Risk Management System | 1 | none | 5 |
| AIA-10 | Art. 10 | Data & Data Governance | 1 | none | 6 |
| AIA-11 | Art. 11 | Technical Documentation | 2 | AIA-9, AIA-10 | 4 |
| AIA-12 | Art. 12 | Record-Keeping (Logging) | 1 | none | 3 |
| AIA-13 | Art. 13 | Transparency & User Info | 2 | AIA-9 | 4 |
| AIA-14 | Art. 14 | Human Oversight | 2 | AIA-9 | 5 |
| AIA-15 | Art. 15 | Accuracy, Robustness & Cybersecurity | 2 | AIA-9, AIA-10 | 6 |
| AIA-17 | Art. 17 | Quality Management System | 3 | AIA-11, AIA-15 | 5 |
| AIA-26 | Art. 26 | Obligations of Deployers | 3 | AIA-13, AIA-14 | 4 |
| AIA-47 | Art. 47 | EU Declaration of Conformity | 3 | AIA-11, AIA-17 | 3 |
| AIA-60 | Art. 60 | Serious Incident Reporting | 4 | AIA-17, AIA-26 | 4 |
| AIA-61 | Art. 61 | Post-Market Monitoring | 4 | AIA-17, AIA-60 | 5 |

### Dependency DAG

```
Phase 1 (no deps):     AIA-9  AIA-10  AIA-12
                         │ │     │
Phase 2:            AIA-13 AIA-14 AIA-11  AIA-15
                         │   │     │  │     │
Phase 3:            AIA-26       AIA-17  AIA-47
                      │            │
Phase 4:            AIA-60       AIA-61
```

### Topological Sort (Kahn's Algorithm)

The DAG is processed via Kahn's algorithm to produce a deterministic phase ordering:
1. Initialize in-degree map for all 12 controls
2. Enqueue all controls with in-degree 0 (Phase 1: AIA-9, AIA-10, AIA-12)
3. Process queue: dequeue control, add to current phase, decrement in-degree of dependents
4. When queue empties but controls remain, start next phase with newly zero-in-degree controls
5. If controls remain with non-zero in-degree after all phases, cycle detected (error)

Time complexity: O(V + E) where V=12 controls, E=14 dependency edges.

### Document Types

The wizard produces 4 required EU AI Act documents:

1. **Technical Documentation** (Article 11) — Comprehensive technical description
2. **EU Declaration of Conformity** (Article 47) — Formal legal declaration
3. **Instructions for Use** (Article 13) — Deployer-facing documentation
4. **Post-Market Monitoring Plan** (Article 72) — Ongoing monitoring definition

---

## Section 2: Database Schema & Domain Model

### New Tables

```sql
-- Wizard session tracking
CREATE TABLE "ComplianceWizard" (
    "id"            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "orgId"         TEXT NOT NULL REFERENCES "Organization"("id"),
    "frameworkCode"  TEXT NOT NULL,     -- "eu_ai_act"
    "name"          TEXT NOT NULL,      -- user-provided wizard name
    "status"        TEXT NOT NULL DEFAULT 'active',  -- active | generating | completed | archived
    "progress"      DOUBLE PRECISION NOT NULL DEFAULT 0,  -- 0.0 to 1.0
    "metadata"      JSONB DEFAULT '{}', -- system name, provider info, etc.
    "createdBy"     TEXT NOT NULL REFERENCES "User"("id"),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"   TIMESTAMP(3),
    UNIQUE("orgId", "frameworkCode", "name")
);

-- Per-control step state
CREATE TABLE "WizardStep" (
    "id"            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "wizardId"      TEXT NOT NULL REFERENCES "ComplianceWizard"("id") ON DELETE CASCADE,
    "controlCode"   TEXT NOT NULL,     -- "AIA-9", "AIA-10", etc.
    "phase"         INTEGER NOT NULL,  -- 1-4
    "state"         TEXT NOT NULL DEFAULT 'locked',  -- locked | available | in_progress | completed | skipped
    "requirements"  JSONB NOT NULL DEFAULT '[]',     -- [{key, label, completed, optional}]
    "justification" TEXT,              -- rich text explanation
    "skipReason"    TEXT,              -- required when state = skipped
    "completedAt"   TIMESTAMP(3),
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("wizardId", "controlCode")
);

-- Evidence files attached to steps
CREATE TABLE "WizardStepEvidence" (
    "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "stepId"      TEXT NOT NULL REFERENCES "WizardStep"("id") ON DELETE CASCADE,
    "fileName"    TEXT NOT NULL,
    "mimeType"    TEXT NOT NULL,
    "fileSize"    INTEGER NOT NULL,
    "storageKey"  TEXT NOT NULL,      -- S3 key
    "sha256"      TEXT NOT NULL,      -- hex-encoded hash
    "uploadedBy"  TEXT NOT NULL REFERENCES "User"("id"),
    "uploadedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Append-only audit log
CREATE TABLE "WizardEvent" (
    "id"            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "wizardId"      TEXT NOT NULL REFERENCES "ComplianceWizard"("id") ON DELETE CASCADE,
    "controlCode"   TEXT,             -- null for wizard-level events
    "eventType"     TEXT NOT NULL,    -- step_started | step_completed | step_skipped | evidence_uploaded | document_generated | wizard_created | wizard_completed
    "previousState" TEXT,
    "newState"      TEXT,
    "actorId"       TEXT NOT NULL REFERENCES "User"("id"),
    "metadata"      JSONB DEFAULT '{}',
    "timestamp"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Generated documents
CREATE TABLE "WizardDocument" (
    "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "wizardId"    TEXT NOT NULL REFERENCES "ComplianceWizard"("id") ON DELETE CASCADE,
    "documentType" TEXT NOT NULL,     -- technical_documentation | declaration_of_conformity | instructions_for_use | post_market_monitoring
    "reportId"    TEXT REFERENCES "Report"("id"),  -- links to existing Report table
    "status"      TEXT NOT NULL DEFAULT 'pending',  -- pending | generating | ready | failed
    "error"       TEXT,
    "generatedAt" TIMESTAMP(3),
    UNIQUE("wizardId", "documentType")
);

CREATE INDEX "idx_wizard_org" ON "ComplianceWizard"("orgId");
CREATE INDEX "idx_wizard_step_wizard" ON "WizardStep"("wizardId");
CREATE INDEX "idx_wizard_event_wizard" ON "WizardEvent"("wizardId", "timestamp");
```

### TypeScript Domain Types

```typescript
type WizardStatus = "active" | "generating" | "completed" | "archived";
type StepState = "locked" | "available" | "in_progress" | "completed" | "skipped";

interface StepRequirement {
  key: string;       // e.g. "risk_assessment_documented"
  label: string;     // "Risk assessment process is documented"
  completed: boolean;
  optional: boolean;
}

interface WizardControlMeta {
  code: string;          // "AIA-9"
  article: string;       // "Art. 9"
  title: string;
  phase: number;
  dependencies: string[];
  requirements: StepRequirement[];
  documentContributions: string[];  // which documents this step feeds
  skipUnlocksDependents: boolean;
}
```

---

## Section 3: WizardStepHandler Registry & WizardService

### Registry Pattern

```typescript
interface WizardStepHandler {
  code: string;
  validate(step: WizardStep): { valid: boolean; errors: string[] };
  getRequirements(): StepRequirement[];
  getGuidance(): string;  // help text for this step
  mapFromGapAnalysis(gaps: GapItem[]): Partial<StepUpdatePayload>;
}

class WizardStepRegistry {
  private handlers = new Map<string, WizardStepHandler>();

  register(handler: WizardStepHandler): void;
  get(code: string): WizardStepHandler;  // throws if not found
  getAll(): WizardStepHandler[];
}
```

Each of the 12 EU AI Act controls gets a handler registered in the registry. Mirrors the existing `ReportRegistry` + `ReportTemplate` pattern.

### WizardService

```typescript
class WizardService {
  constructor(
    private db: PrismaClient,
    private stepRegistry: WizardStepRegistry,
    private attestationService: AttestationService,
    private gapAnalysisService: GapAnalysisService,
    private reportRegistry: ReportRegistry
  ) {}

  // Lifecycle
  async createWizard(orgId: string, userId: string, name: string): Promise<Wizard>;
  async getWizard(wizardId: string): Promise<Wizard & { steps: WizardStep[] }>;
  async deleteWizard(wizardId: string): Promise<void>;

  // Step operations
  async updateStep(wizardId: string, code: string, data: StepUpdatePayload): Promise<WizardStep>;
  async completeStep(wizardId: string, code: string, userId: string): Promise<WizardStep>;
  async skipStep(wizardId: string, code: string, reason: string, userId: string): Promise<WizardStep>;

  // Progress
  async getProgress(wizardId: string): Promise<WizardProgress>;
  async getAvailableSteps(wizardId: string): Promise<string[]>;

  // Document generation
  async canGenerateDocument(wizardId: string, docType: string): Promise<{ ready: boolean; blocking: string[] }>;
  async generateDocuments(wizardId: string, docTypes: string[], userId: string): Promise<WizardDocument[]>;
}
```

### Dependency Unlock Algorithm

When a step completes or is skipped (with `skipUnlocksDependents: true`):

```
function unlockDependents(wizardId, completedCode):
    allSteps = getSteps(wizardId)
    for each step in allSteps where step.state == "locked":
        deps = getDependencies(step.controlCode)
        if all deps are completed or (skipped AND skipUnlocksDependents):
            transition(step, "available")
            appendEvent(wizardId, step.code, "step_unlocked")
```

### Gap Analysis Integration

On wizard creation, `WizardService` calls `computeGapAnalysis()` for the EU AI Act framework. For each control with existing gap data, the step handler's `mapFromGapAnalysis()` pre-populates the step with automated findings, saving manual effort.

---

## Section 4: API Endpoints & RBAC

### Endpoints (14 routes under `/v1/compliance/wizards`)

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| POST | `/v1/compliance/wizards` | Create wizard | admin, manager |
| GET | `/v1/compliance/wizards` | List wizards for org | admin, manager, developer, viewer |
| GET | `/v1/compliance/wizards/:wizardId` | Get wizard with steps | admin, manager, developer, viewer |
| DELETE | `/v1/compliance/wizards/:wizardId` | Delete wizard | admin |
| PATCH | `/v1/compliance/wizards/:wizardId` | Update wizard metadata | admin, manager |
| GET | `/v1/compliance/wizards/:wizardId/steps/:code` | Get step detail | admin, manager, developer, viewer |
| PATCH | `/v1/compliance/wizards/:wizardId/steps/:code` | Update step (evidence, justification, requirements) | admin, manager, developer |
| POST | `/v1/compliance/wizards/:wizardId/steps/:code/complete` | Complete step | admin, manager |
| POST | `/v1/compliance/wizards/:wizardId/steps/:code/skip` | Skip step | admin, manager |
| POST | `/v1/compliance/wizards/:wizardId/steps/:code/evidence` | Upload evidence file | admin, manager, developer |
| DELETE | `/v1/compliance/wizards/:wizardId/steps/:code/evidence/:evidenceId` | Delete evidence | admin, manager |
| GET | `/v1/compliance/wizards/:wizardId/progress` | Get progress summary | admin, manager, developer, viewer |
| POST | `/v1/compliance/wizards/:wizardId/documents/generate` | Generate documents | admin, manager |
| GET | `/v1/compliance/wizards/:wizardId/documents` | List generated documents | admin, manager, developer, viewer |

### Error Handling Matrix

| Scenario | Status | Code |
|----------|--------|------|
| Step not available (locked) | 409 | `STEP_LOCKED` |
| Requirements not met for complete | 422 | `REQUIREMENTS_INCOMPLETE` |
| Skip without reason | 400 | `SKIP_REASON_REQUIRED` |
| Document prerequisites not met | 422 | `PREREQUISITES_NOT_MET` |
| Concurrent step update (stale) | 409 | `CONFLICT` |
| Wizard already generating docs | 409 | `GENERATION_IN_PROGRESS` |
| Duplicate wizard name for framework | 409 | `DUPLICATE_WIZARD` |
| Evidence file too large (>50MB) | 413 | `FILE_TOO_LARGE` |
| Evidence hash mismatch | 422 | `HASH_MISMATCH` |

---

## Section 5: Frontend Component Architecture

### Component Tree

```
WizardPage (route: /compliance/wizards/[wizardId])
├── WizardStepper (left sidebar)
│   ├── PhaseGroup (x4 phases)
│   │   └── StepItem (xN controls per phase)
│   └── ProgressSummary (bottom)
├── WizardContent (main area)
│   ├── StepHeader (control title, article ref, status badge)
│   ├── StepBody (dynamic per control)
│   │   ├── GapAnalysisPreview (current automated findings)
│   │   ├── AttestationForm (evidence collection)
│   │   │   ├── EvidenceUploader (file upload + hash)
│   │   │   └── JustificationEditor (rich text)
│   │   └── RequirementChecklist (per-requirement checkboxes)
│   └── StepFooter (Save Draft / Complete / Skip + reason)
└── WizardHeader (top bar)
    ├── WizardTitle + FrameworkBadge
    ├── OverallProgress (percentage + bar)
    └── ActionMenu (Generate Documents / Export / Delete)
```

### Key Components

**WizardStepper** — Left sidebar showing all 12 controls grouped by phase. Each step shows an icon reflecting its FSM state: `locked` (lock icon, greyed, not clickable), `available` (circle outline, clickable), `in_progress` (half-filled circle), `completed` (checkmark, green), `skipped` (skip icon, muted). Steps unlock reactively from API-returned `availableSteps[]` — no client-side DAG computation.

**StepBody** — Uses a strategy pattern mirroring the backend `WizardStepHandler`. A `stepComponentMap: Record<string, React.ComponentType<StepProps>>` maps control codes to step-specific form components. Most controls share a `GenericStepForm`; only controls with special requirements (AIA-10 data governance, AIA-15 accuracy metrics) get custom components.

```typescript
interface StepProps {
  wizardId: string;
  step: WizardStepResponse;
  gapItems: GapItem[];
  existingAttestation?: ControlAttestation;
  onSave: (data: StepUpdatePayload) => Promise<void>;
  onComplete: () => Promise<void>;
  onSkip: (reason: string) => Promise<void>;
}
```

**RequirementChecklist** — Each requirement renders as a checkbox. Auto-saves via debounced PATCH. Step can only transition to `completed` when all non-optional requirements are checked.

**EvidenceUploader** — Computes SHA-256 client-side before upload, supports drag-and-drop, max 50MB per file.

**DocumentGenerationPanel** — Shows 4 document cards with readiness indicator, "Generate" button, SSE-powered progress bar (reuses existing `useReportStatus` hook), and download link.

### State Management

TanStack Query with keys:
- `["wizard", wizardId]` — wizard + all steps
- `["wizard", wizardId, "step", code]` — single step detail
- `["wizard", wizardId, "documents"]` — generated documents
- `["wizard", wizardId, "progress"]` — progress summary

Optimistic updates for checkbox toggling and draft saves.

### Routing

```
/compliance/wizards                    → WizardListPage
/compliance/wizards/new                → CreateWizardPage
/compliance/wizards/[wizardId]         → WizardPage (redirects to first available step)
/compliance/wizards/[wizardId]/[code]  → WizardPage (specific step)
```

### Responsive Behavior

Desktop (>=1024px): sidebar stepper + main content side by side. Mobile (<1024px): stepper collapses to horizontal progress bar with dropdown step selector.

---

## Section 6: Document Templates

Each document registers as a `ReportTemplate` in the existing registry, reusing the same pipeline (report-worker, S3, signed URL).

### Document 1: Technical Documentation (Article 11)

**Template type:** `eu_ai_act_technical_documentation`

**Structure:**
1. System Overview — name, intended purpose, version, deployer info
2. Risk Classification — risk category justification, prohibited use exclusions
3. Data Governance — training data description, bias mitigation, data quality metrics (AIA-10)
4. Algorithm Design — model architecture, decision-making logic, performance metrics (AIA-9, AIA-15)
5. Human Oversight Measures — override mechanisms, monitoring procedures (AIA-14)
6. Accuracy & Robustness — test results, error rates, cybersecurity measures (AIA-15)
7. Logging Capabilities — events recorded, retention periods (AIA-12)
8. Appendix: Evidence Index — table of all uploaded evidence with SHA-256 hashes

**Prerequisites:** Steps AIA-9, AIA-10, AIA-12, AIA-14, AIA-15 must be `completed`.

### Document 2: EU Declaration of Conformity (Article 47)

**Template type:** `eu_ai_act_declaration_of_conformity`

**Structure:**
1. Declaration Header — unique number, date, provider details
2. AI System Identification — name, version, unique identifier
3. Conformity Assessment — assessment body reference, procedure used
4. Standards Applied — harmonized standards or common specifications
5. Compliance Statement — per-control status with article references
6. Signatory Block — name, position, signature placeholder, date

**Prerequisites:** All non-skipped steps must be `completed`, overall progress >= 90%.

### Document 3: Instructions for Use (Article 13)

**Template type:** `eu_ai_act_instructions_for_use`

**Structure:**
1. Provider Information — contact details, support channels
2. Intended Purpose — use cases, deployment context, target users
3. Transparency Obligations — how to inform end-users (AIA-13)
4. Human Oversight Instructions — how deployers monitor and intervene (AIA-14)
5. Known Limitations — foreseeable misuse, accuracy boundaries (AIA-9, AIA-15)
6. Input Data Specifications — expected formats, quality requirements (AIA-10)
7. Maintenance & Updates — delivery method, re-assessment triggers

**Prerequisites:** Steps AIA-9, AIA-10, AIA-13, AIA-14, AIA-15 must be `completed`.

### Document 4: Post-Market Monitoring Plan (Article 72)

**Template type:** `eu_ai_act_post_market_monitoring`

**Structure:**
1. Monitoring Scope — systems covered, deployment environments
2. Data Collection — operational data collected, feedback channels
3. Performance Monitoring — KPIs, drift detection thresholds (AIA-61)
4. Incident Reporting — serious incident procedure, notification timelines (AIA-60)
5. Corrective Actions — remediation workflows, recall procedures
6. Review Cadence — review frequency, responsible parties
7. Integration with QMS — link to quality management system (AIA-17)

**Prerequisites:** Steps AIA-17, AIA-60, AIA-61 must be `completed`.

---

## Section 7: Testing Strategy

### Unit Tests (~60 tests)

**DAG & Dependency Resolution (12 tests):**
- Topological sort produces correct 4-phase ordering
- Cycle detection throws on malformed dependency input
- `getAvailableSteps()` returns only steps whose dependencies are all completed
- Completing a step unlocks correct downstream steps
- Skipping with `skipUnlocksDependents: true` still unlocks dependents
- Skipping without that flag blocks dependents

**FSM Transitions (10 tests):**
- Valid transitions: locked→available, available→in_progress, in_progress→completed, available→skipped
- Invalid transitions throw: locked→completed, completed→in_progress, skipped→completed
- Skip requires reason string
- Completing requires all non-optional requirements checked
- Each transition appends to event log

**WizardService (18 tests):**
- `createWizard()` creates wizard + 12 steps, phase 1 available, rest locked
- `updateStep()` persists evidence, justification, requirement completion
- `completeStep()` validates requirements, transitions FSM, triggers unlock
- `skipStep()` records reason, conditionally unlocks dependents
- `getProgress()` returns correct percentage, phase breakdown, blocking items
- `canGenerateDocument()` returns false when prerequisites incomplete
- `generateDocuments()` delegates to report-worker batch endpoint
- Integration with AttestationService — completing a step creates/renews attestation
- Integration with GapAnalysisService — step pre-populates from existing gap items

**WizardStepHandler Registry (8 tests):**
- All 12 controls have registered handlers
- `getHandler(code)` returns correct handler
- `getHandler("unknown")` throws
- Each handler's `validate()` correctly checks required fields
- Each handler's `getRequirements()` returns non-empty array

**Document Generation (12 tests):**
- Each of 4 templates: gather assembles correct data from wizard steps
- Each of 4 templates: gather throws when prerequisites not met
- Each of 4 templates: render produces valid React element
- Technical Documentation includes evidence index with hashes

### API Integration Tests (~25 tests)

- Wizard CRUD: create (201), get, list (org-scoped), delete, invalid framework (400), duplicate (409)
- Step operations: update, complete, complete with unmet requirements (422), skip, skip locked (409), gap preview, file upload + hash, oversize file (413), bad MIME (415), concurrent update (409)
- Document & progress: progress percentages, generate (202), unmet prerequisites (422), document list, SSE status
- RBAC: admin/manager create/complete/generate, developer view/update, viewer read-only, service denied

### E2E Tests (~8 tests, Playwright)

- Full wizard flow: create → complete phase 1 → verify phase 2 unlocks
- Skip step → verify dependents remain locked (when `skipUnlocksDependents: false`)
- Complete all 12 steps → generate all 4 documents → verify downloads
- Stepper UI reflects correct states
- Requirement checklist: check all → complete enables
- Evidence upload: drag file → see hash → file in list
- Mobile: stepper collapses to horizontal bar
- Resume wizard: navigate away → return → state persisted

### Test Tooling

- Unit: Vitest (existing in `packages/compliance`)
- API integration: Vitest + Fastify `inject()` (existing in `apps/api`)
- E2E: Playwright (existing in `apps/dashboard`)
- Fixtures: `packages/compliance/src/__tests__/wizard-fixtures.ts`

---

## Section 8: Error Handling & Resilience

### Concurrent Access

**Optimistic locking on steps:** Each `WizardStep` has `updatedAt`. PATCH/complete/skip include `If-Match` header. Stale requests return 409 with current state for client merge/retry.

**Wizard-level lock for document generation:** `generateDocuments()` sets `wizard.status = "generating"`. Second request returns 409. Stuck generation (10min no update) eligible for admin reset.

### Evidence Upload Failures

- SHA-256 computed client-side, verified server-side. Mismatch returns 422 `HASH_MISMATCH`.
- Atomic upload: S3 first, then DB row. Orphaned S3 objects cleaned up after 1 hour.

### Document Generation Failures

Reuses existing report-worker retry mechanism:
- Transient failures: 3 retries, exponential backoff (1s, 4s, 16s)
- Permanent failures: no retry, status `failed` with error message
- Partial batch: each document independent, partial success allowed
- SSE disconnection: reconnect with `Last-Event-ID`, server replays missed events

### Data Integrity

- **Event log immutability:** `WizardEvent` is append-only, no UPDATE/DELETE via API
- **Server-side prerequisite enforcement:** `gather()` validates step states regardless of client state
- **Cascade deletion:** DELETE wizard cascades to steps/evidence/events/documents, S3 cleanup async

### Degraded Mode

- **Gap analysis unavailable:** Wizard still functions, preview shows "Unavailable" message
- **S3 unavailable:** Evidence upload fails with retry prompt, text-based data (justifications, checklists) still works in PostgreSQL

### Rate Limiting

- Evidence upload: 10 files/min/user
- Document generation: 5 batch requests/hour/org
- Step updates: 60 requests/min/user

Uses existing Fastify rate-limit plugin with route-specific overrides.
