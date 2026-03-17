# EU AI Act Compliance Wizard — Implementation Plan

**Date**: 2026-03-15
**Design Doc**: `docs/plans/2026-03-15-eu-ai-act-wizard-design.md`
**Branch**: `feature/pdf-report-export`

---

## Phase 1: Core Domain (DAG, FSM, Types, Control Definitions)

### Task 1.1: Wizard domain types

**File**: `packages/compliance/src/wizard/types.ts` (new)
**What**: Define all TypeScript types for the wizard domain: `WizardStatus`, `StepState`, `StepRequirement`, `WizardControlMeta`, `WizardProgress`, `StepUpdatePayload`, and the 4 document types.

```ts
// Core enums/unions
export type WizardStatus = "active" | "generating" | "completed" | "archived";
export type StepState = "locked" | "available" | "in_progress" | "completed" | "skipped";
export type WizardDocumentType =
  | "technical_documentation"
  | "declaration_of_conformity"
  | "instructions_for_use"
  | "post_market_monitoring";

export interface StepRequirement {
  key: string;
  label: string;
  completed: boolean;
  optional: boolean;
}

export interface WizardControlMeta {
  code: string;
  article: string;
  title: string;
  phase: number;
  dependencies: string[];
  requirements: StepRequirement[];
  documentContributions: WizardDocumentType[];
  skipUnlocksDependents: boolean;
}

export interface WizardProgress {
  overall: number;         // 0.0-1.0
  completedSteps: number;
  totalSteps: number;
  skippedSteps: number;
  phaseProgress: Record<number, { completed: number; total: number }>;
  availableSteps: string[];
  blockingSteps: string[]; // steps needed for document generation
}

export interface StepUpdatePayload {
  justification?: string;
  requirements?: Array<{ key: string; completed: boolean }>;
}

export interface WizardEventType {
  type: "wizard_created" | "step_started" | "step_completed" | "step_skipped"
    | "evidence_uploaded" | "evidence_deleted" | "document_generated" | "wizard_completed";
}
```

**Verify**: `npx tsc --noEmit` passes.

---

### Task 1.2: EU AI Act control definitions

**File**: `packages/compliance/src/wizard/eu-ai-act-controls.ts` (new)
**What**: Define the 12 `WizardControlMeta` entries exactly as specified in the design doc Section 1. Export as `EU_AI_ACT_CONTROLS: WizardControlMeta[]` and a lookup map `EU_AI_ACT_CONTROL_MAP: Map<string, WizardControlMeta>`.

```ts
import type { WizardControlMeta, StepRequirement } from "./types.js";

export const EU_AI_ACT_CONTROLS: WizardControlMeta[] = [
  {
    code: "AIA-9",
    article: "Art. 9",
    title: "Risk Management System",
    phase: 1,
    dependencies: [],
    requirements: [
      { key: "risk_identified", label: "Risks to health, safety, fundamental rights identified", completed: false, optional: false },
      { key: "risk_mitigated", label: "Risk mitigation measures documented", completed: false, optional: false },
      { key: "risk_residual", label: "Residual risk assessment performed", completed: false, optional: false },
      { key: "risk_testing", label: "Testing procedures defined for risk measures", completed: false, optional: false },
      { key: "risk_lifecycle", label: "Risk management covers entire lifecycle", completed: false, optional: false },
    ],
    documentContributions: ["technical_documentation", "instructions_for_use"],
    skipUnlocksDependents: false,
  },
  // ... remaining 11 controls per design doc
];

export const EU_AI_ACT_CONTROL_MAP = new Map(
  EU_AI_ACT_CONTROLS.map((c) => [c.code, c])
);
```

Include all 12 controls with their exact requirements from the design doc table. Each control must have 3-6 requirements.

**Verify**: Unit test `packages/compliance/src/__tests__/eu-ai-act-controls.test.ts` — 12 controls exist, phase distribution is [3, 4, 3, 2], all dependency codes exist in the map.

---

### Task 1.3: DAG engine (topological sort + dependency resolution)

**File**: `packages/compliance/src/wizard/dag.ts` (new)
**What**: Implement Kahn's algorithm for topological sort and dependency resolution utilities.

```ts
import type { WizardControlMeta, StepState } from "./types.js";

// Kahn's algorithm — returns controls grouped by phase
export function topologicalSort(controls: WizardControlMeta[]): WizardControlMeta[][];

// Given current step states, return codes of steps that should be "available"
export function computeAvailableSteps(
  controls: WizardControlMeta[],
  stepStates: Map<string, StepState>
): string[];

// Check if a specific step can unlock (all deps completed/skipped-with-unlock)
export function canUnlock(
  code: string,
  controls: WizardControlMeta[],
  stepStates: Map<string, StepState>,
  controlMap: Map<string, WizardControlMeta>
): boolean;

// Detect cycles (validation)
export function validateDAG(controls: WizardControlMeta[]): { valid: boolean; cycle?: string[] };
```

**Verify**: Unit test `packages/compliance/src/__tests__/wizard-dag.test.ts`:
- `topologicalSort` returns 4 phases: [AIA-9,AIA-10,AIA-12], [AIA-11,AIA-13,AIA-14,AIA-15], [AIA-17,AIA-26,AIA-47], [AIA-60,AIA-61]
- `computeAvailableSteps` with all locked returns phase 1 codes
- Completing AIA-9 and AIA-10 makes AIA-11 and AIA-15 available
- Completing only AIA-9 makes AIA-13 and AIA-14 available but NOT AIA-11 (needs AIA-10)
- Skipping AIA-9 (skipUnlocksDependents=false) does NOT unlock AIA-13
- Cycle detection catches a synthetic cycle
- Empty controls returns empty phases

---

### Task 1.4: FSM engine (step state machine)

**File**: `packages/compliance/src/wizard/fsm.ts` (new)
**What**: Implement the step state machine with valid transitions and guards.

```ts
import type { StepState, StepRequirement } from "./types.js";

interface TransitionResult {
  valid: boolean;
  error?: string;
}

// Valid transitions map
const VALID_TRANSITIONS: Record<StepState, StepState[]> = {
  locked: ["available"],
  available: ["in_progress", "skipped"],
  in_progress: ["completed", "skipped", "available"], // available = revert to draft
  completed: ["in_progress"],   // reopen
  skipped: ["available"],       // unskip
};

export function canTransition(from: StepState, to: StepState): boolean;

export function validateTransition(
  from: StepState,
  to: StepState,
  context: {
    requirements?: StepRequirement[];
    skipReason?: string;
  }
): TransitionResult;

// Specific guards
export function canComplete(requirements: StepRequirement[]): TransitionResult;
export function canSkip(reason?: string): TransitionResult;
```

**Verify**: Unit test `packages/compliance/src/__tests__/wizard-fsm.test.ts`:
- All valid transitions return true
- Invalid transitions (locked→completed, completed→skipped) return false
- `canComplete` fails when non-optional requirement is unchecked
- `canComplete` succeeds when all non-optional requirements are checked (optional unchecked OK)
- `canSkip` fails without reason string
- `canSkip` succeeds with reason

---

### Task 1.5: WizardStepHandler registry

**File**: `packages/compliance/src/wizard/step-handler.ts` (new)
**What**: Define `WizardStepHandler` interface and `WizardStepRegistry` class, mirroring the `ReportRegistry` pattern.

```ts
import type { StepRequirement, StepUpdatePayload, WizardControlMeta } from "./types.js";

export interface WizardStepHandler {
  code: string;
  validate(requirements: StepRequirement[], justification?: string): { valid: boolean; errors: string[] };
  getRequirements(): StepRequirement[];
  getGuidance(): string;
}

export class WizardStepRegistry {
  private handlers = new Map<string, WizardStepHandler>();

  register(handler: WizardStepHandler): void {
    if (this.handlers.has(handler.code)) {
      throw new Error(`Handler "${handler.code}" already registered`);
    }
    this.handlers.set(handler.code, handler);
  }

  get(code: string): WizardStepHandler {
    const h = this.handlers.get(code);
    if (!h) throw new Error(`No handler for control "${code}"`);
    return h;
  }

  has(code: string): boolean {
    return this.handlers.has(code);
  }

  getAll(): WizardStepHandler[] {
    return Array.from(this.handlers.values());
  }
}
```

**Verify**: Unit test — register, get, get unknown throws, duplicate throws, getAll returns all.

---

### Task 1.6: 12 EU AI Act step handlers

**File**: `packages/compliance/src/wizard/handlers/` (new directory, 12 files + index.ts)
**What**: Create a handler for each EU AI Act control. Most share a `GenericStepHandler` base that validates non-optional requirements. Controls with special needs (AIA-10, AIA-15) add extra validation.

```
handlers/
  aia-9-risk-management.ts
  aia-10-data-governance.ts
  aia-11-technical-documentation.ts
  aia-12-record-keeping.ts
  aia-13-transparency.ts
  aia-14-human-oversight.ts
  aia-15-accuracy-robustness.ts
  aia-17-quality-management.ts
  aia-26-deployer-obligations.ts
  aia-47-declaration-conformity.ts
  aia-60-incident-reporting.ts
  aia-61-post-market-monitoring.ts
  index.ts   (registers all 12 into a WizardStepRegistry and exports)
```

Each handler implements `WizardStepHandler`:
- `getRequirements()` returns the requirements from `EU_AI_ACT_CONTROLS`
- `validate()` checks all non-optional requirements are completed
- `getGuidance()` returns a markdown string with helpful context

**Verify**: Unit test `packages/compliance/src/__tests__/wizard-handlers.test.ts`:
- All 12 handlers registered
- Each handler's `getRequirements()` returns non-empty array matching the control definition
- Each handler's `validate()` returns `{ valid: false }` when no requirements completed
- Each handler's `validate()` returns `{ valid: true }` when all non-optional requirements completed
- `getGuidance()` returns non-empty string for each

---

### Task 1.7: Barrel export for wizard module

**File**: `packages/compliance/src/wizard/index.ts` (new)
**File**: `packages/compliance/src/index.ts` (edit — add wizard re-export)
**What**: Export all wizard types, DAG, FSM, registry, handlers, and control definitions.

```ts
// wizard/index.ts
export * from "./types.js";
export * from "./eu-ai-act-controls.js";
export * from "./dag.js";
export * from "./fsm.js";
export * from "./step-handler.js";
export { euAiActRegistry } from "./handlers/index.js";

// index.ts — add:
export * from "./wizard/index.js";
```

**Verify**: `npx tsc --noEmit` passes. Import from `@sentinel/compliance` resolves wizard exports.

---

## Phase 2: Database Schema & WizardService

### Task 2.1: Prisma schema migration

**File**: `packages/db/prisma/schema.prisma` (edit)
**What**: Add 4 new models (`ComplianceWizard`, `WizardStep`, `WizardStepEvidence`, `WizardEvent`, `WizardDocument`) exactly as specified in design doc Section 2. Add relations from `Organization` and `User`.

```prisma
model ComplianceWizard {
  id            String   @id @default(dbgenerated("gen_random_uuid()"))
  orgId         String
  frameworkCode String
  name          String
  status        String   @default("active")
  progress      Float    @default(0)
  metadata      Json     @default("{}")
  createdBy     String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @default(now()) @updatedAt
  completedAt   DateTime?

  organization Organization @relation(fields: [orgId], references: [id])
  creator      User         @relation("WizardCreator", fields: [createdBy], references: [id])
  steps        WizardStep[]
  events       WizardEvent[]
  documents    WizardDocument[]

  @@unique([orgId, frameworkCode, name])
  @@index([orgId])
}

model WizardStep {
  id            String   @id @default(dbgenerated("gen_random_uuid()"))
  wizardId      String
  controlCode   String
  phase         Int
  state         String   @default("locked")
  requirements  Json     @default("[]")
  justification String?
  skipReason    String?
  completedAt   DateTime?
  updatedAt     DateTime @default(now()) @updatedAt

  wizard   ComplianceWizard    @relation(fields: [wizardId], references: [id], onDelete: Cascade)
  evidence WizardStepEvidence[]

  @@unique([wizardId, controlCode])
  @@index([wizardId])
}

model WizardStepEvidence {
  id         String   @id @default(dbgenerated("gen_random_uuid()"))
  stepId     String
  fileName   String
  mimeType   String
  fileSize   Int
  storageKey String
  sha256     String
  uploadedBy String
  uploadedAt DateTime @default(now())

  step    WizardStep @relation(fields: [stepId], references: [id], onDelete: Cascade)
  uploader User      @relation("EvidenceUploader", fields: [uploadedBy], references: [id])
}

model WizardEvent {
  id            String   @id @default(dbgenerated("gen_random_uuid()"))
  wizardId      String
  controlCode   String?
  eventType     String
  previousState String?
  newState      String?
  actorId       String
  metadata      Json     @default("{}")
  timestamp     DateTime @default(now())

  wizard ComplianceWizard @relation(fields: [wizardId], references: [id], onDelete: Cascade)
  actor  User             @relation("WizardEventActor", fields: [actorId], references: [id])

  @@index([wizardId, timestamp])
}

model WizardDocument {
  id           String   @id @default(dbgenerated("gen_random_uuid()"))
  wizardId     String
  documentType String
  reportId     String?
  status       String   @default("pending")
  error        String?
  generatedAt  DateTime?

  wizard ComplianceWizard @relation(fields: [wizardId], references: [id], onDelete: Cascade)
  report Report?          @relation(fields: [reportId], references: [id])

  @@unique([wizardId, documentType])
}
```

Also add relation arrays to `Organization` and `User` models:
```prisma
// Organization:
complianceWizards ComplianceWizard[]

// User:
wizardsCreated       ComplianceWizard[] @relation("WizardCreator")
wizardEvidenceUploads WizardStepEvidence[] @relation("EvidenceUploader")
wizardEvents         WizardEvent[]      @relation("WizardEventActor")
```

**Verify**: `cd packages/db && npx prisma migrate dev --name add_compliance_wizard_tables` succeeds, `npx prisma generate` succeeds.

---

### Task 2.2: WizardService — lifecycle methods

**File**: `packages/compliance/src/wizard/wizard-service.ts` (new)
**What**: Implement `WizardService` with CRUD operations and step initialization.

```ts
import type { PrismaClient } from "@prisma/client";
import { EU_AI_ACT_CONTROLS, EU_AI_ACT_CONTROL_MAP } from "./eu-ai-act-controls.js";
import { WizardStepRegistry } from "./step-handler.js";
import { computeAvailableSteps } from "./dag.js";
import type { WizardStatus, StepState, WizardProgress, StepUpdatePayload } from "./types.js";

export class WizardService {
  constructor(
    private db: PrismaClient,
    private stepRegistry: WizardStepRegistry
  ) {}

  async create(orgId: string, userId: string, name: string, frameworkCode = "eu_ai_act") {
    // 1. Create wizard row
    // 2. Create 12 WizardStep rows — phase 1 steps start as "available", rest as "locked"
    // 3. Append wizard_created event
    // 4. Return wizard with steps
  }

  async get(wizardId: string, orgId: string) {
    // Fetch wizard + steps + documents, verify orgId
  }

  async list(orgId: string) {
    // List all wizards for org, include step count summary
  }

  async delete(wizardId: string, orgId: string) {
    // Verify ownership, cascade delete (Prisma handles via onDelete: Cascade)
  }

  async updateMetadata(wizardId: string, orgId: string, metadata: Record<string, unknown>) {
    // Patch wizard metadata JSONB
  }
}
```

**Verify**: Unit test `packages/compliance/src/__tests__/wizard-service.test.ts`:
- `create()` produces 12 steps, 3 available (phase 1), 9 locked
- `create()` appends wizard_created event
- `create()` duplicate name returns error
- `get()` returns wizard with steps sorted by phase
- `get()` with wrong orgId returns null
- `list()` returns only org's wizards
- `delete()` removes wizard and all related rows

---

### Task 2.3: WizardService — step operations

**File**: `packages/compliance/src/wizard/wizard-service.ts` (edit — add methods)
**What**: Implement step update, complete, skip, and dependency unlock.

```ts
// Add to WizardService:

async updateStep(wizardId: string, code: string, data: StepUpdatePayload, userId: string) {
  // 1. Fetch step, verify state is "available" or "in_progress"
  // 2. If state is "available", transition to "in_progress"
  // 3. Update requirements/justification
  // 4. Append step_started event if transitioned
  // 5. Recalculate wizard progress
}

async completeStep(wizardId: string, code: string, userId: string) {
  // 1. Fetch step, validate state is "in_progress"
  // 2. Validate all non-optional requirements via handler
  // 3. Transition to "completed", set completedAt
  // 4. Run unlockDependents()
  // 5. Append step_completed event
  // 6. Recalculate wizard progress
  // 7. If all steps completed/skipped, set wizard.status = "completed"
}

async skipStep(wizardId: string, code: string, reason: string, userId: string) {
  // 1. Validate reason is non-empty
  // 2. Validate state is "available" or "in_progress"
  // 3. Transition to "skipped", record skipReason
  // 4. If control.skipUnlocksDependents, run unlockDependents()
  // 5. Append step_skipped event
  // 6. Recalculate wizard progress
}

private async unlockDependents(wizardId: string) {
  // Fetch all steps, build state map, call computeAvailableSteps()
  // For each step that should be available but is currently locked, transition
}

async getProgress(wizardId: string, orgId: string): Promise<WizardProgress> {
  // Compute from step states
}
```

**Verify**: Unit tests (continue in same test file):
- `updateStep()` transitions available→in_progress on first update
- `completeStep()` fails with 422 when requirements not met
- `completeStep()` succeeds and unlocks dependents
- `skipStep()` fails without reason
- `skipStep()` with skipUnlocksDependents=false does not unlock dependents
- `getProgress()` returns correct percentages after various completions
- Completing all steps sets wizard status to "completed"

---

### Task 2.4: WizardService — document generation

**File**: `packages/compliance/src/wizard/wizard-service.ts` (edit — add methods)
**What**: Implement document readiness checks and generation delegation.

```ts
// Document prerequisite map
const DOC_PREREQUISITES: Record<string, string[]> = {
  technical_documentation: ["AIA-9", "AIA-10", "AIA-12", "AIA-14", "AIA-15"],
  declaration_of_conformity: [], // all non-skipped must be completed, progress >= 0.9
  instructions_for_use: ["AIA-9", "AIA-10", "AIA-13", "AIA-14", "AIA-15"],
  post_market_monitoring: ["AIA-17", "AIA-60", "AIA-61"],
};

async canGenerateDocument(wizardId: string, docType: string) {
  // Check prerequisite steps are completed
  // Return { ready: boolean; blocking: string[] }
}

async generateDocuments(wizardId: string, docTypes: string[], userId: string) {
  // 1. Validate all requested docs can be generated
  // 2. Set wizard.status = "generating"
  // 3. Create WizardDocument rows with status "pending"
  // 4. For each docType, create a Report via existing report pipeline
  // 5. Link WizardDocument.reportId
  // 6. Append document_generated events
  // 7. Return WizardDocument[]
}
```

**Verify**: Unit tests:
- `canGenerateDocument("technical_documentation")` returns blocking when AIA-9 incomplete
- `canGenerateDocument("technical_documentation")` returns ready when all prereqs completed
- `canGenerateDocument("declaration_of_conformity")` checks >= 90% progress
- `generateDocuments()` fails when wizard.status is already "generating"
- `generateDocuments()` creates WizardDocument rows and Report rows

---

### Task 2.5: Evidence upload/delete in WizardService

**File**: `packages/compliance/src/wizard/wizard-service.ts` (edit — add methods)
**What**: Add evidence file management methods.

```ts
async uploadEvidence(
  wizardId: string,
  code: string,
  file: { fileName: string; mimeType: string; fileSize: number; storageKey: string; sha256: string },
  userId: string
) {
  // 1. Validate step exists and is not locked
  // 2. Validate fileSize <= 50MB
  // 3. Create WizardStepEvidence row
  // 4. Append evidence_uploaded event
}

async deleteEvidence(wizardId: string, code: string, evidenceId: string, userId: string) {
  // 1. Verify evidence belongs to step in wizard
  // 2. Delete DB row (S3 cleanup deferred)
  // 3. Append evidence_deleted event
}
```

**Verify**: Unit tests:
- Upload evidence succeeds for in_progress step
- Upload evidence fails for locked step
- Upload evidence fails if fileSize > 50MB
- Delete evidence succeeds
- Delete evidence fails for non-existent id

---

## Phase 3: API Routes

### Task 3.1: Wizard API routes — CRUD

**File**: `apps/api/src/routes/compliance-wizards.ts` (new)
**What**: Implement Fastify routes for wizard CRUD: POST, GET list, GET by id, DELETE, PATCH metadata. Follow the existing route pattern from `attestations.ts`.

```ts
import type { FastifyInstance } from "fastify";
import { WizardService } from "@sentinel/compliance";

export default async function wizardRoutes(fastify: FastifyInstance) {
  const service = new WizardService(fastify.db, fastify.wizardStepRegistry);

  // POST /v1/compliance/wizards
  fastify.post("/v1/compliance/wizards", {
    preHandler: [fastify.requireRole(["admin", "manager"])],
    handler: async (req, reply) => { /* create wizard */ },
  });

  // GET /v1/compliance/wizards
  fastify.get("/v1/compliance/wizards", {
    preHandler: [fastify.requireRole(["admin", "manager", "developer", "viewer"])],
    handler: async (req, reply) => { /* list wizards */ },
  });

  // GET /v1/compliance/wizards/:wizardId
  // DELETE /v1/compliance/wizards/:wizardId
  // PATCH /v1/compliance/wizards/:wizardId
}
```

**Verify**: API integration tests `apps/api/src/routes/__tests__/compliance-wizards.test.ts`:
- POST creates wizard (201), returns wizard with 12 steps
- POST duplicate name (409)
- POST invalid framework (400)
- GET list returns org-scoped wizards
- GET by id returns wizard with steps
- GET by id wrong org (404)
- DELETE removes wizard (admin only)
- DELETE by non-admin (403)
- PATCH updates metadata

---

### Task 3.2: Wizard API routes — step operations

**File**: `apps/api/src/routes/compliance-wizards.ts` (edit — add step routes)
**What**: Add routes for step CRUD, complete, skip operations.

```ts
// GET /v1/compliance/wizards/:wizardId/steps/:code
// PATCH /v1/compliance/wizards/:wizardId/steps/:code
// POST /v1/compliance/wizards/:wizardId/steps/:code/complete
// POST /v1/compliance/wizards/:wizardId/steps/:code/skip
```

**Verify**: API integration tests (continue in same test file):
- GET step returns step detail with evidence list
- PATCH step updates requirements/justification (200)
- PATCH locked step (409 STEP_LOCKED)
- POST complete succeeds when requirements met (200)
- POST complete with unmet requirements (422 REQUIREMENTS_INCOMPLETE)
- POST skip without reason (400 SKIP_REASON_REQUIRED)
- POST skip locked step (409 STEP_LOCKED)
- RBAC: developer can PATCH but not complete, viewer can only GET

---

### Task 3.3: Wizard API routes — evidence upload

**File**: `apps/api/src/routes/compliance-wizards.ts` (edit — add evidence routes)
**What**: Add multipart file upload and evidence delete routes. Reuse existing S3 storage pattern.

```ts
// POST /v1/compliance/wizards/:wizardId/steps/:code/evidence (multipart)
// DELETE /v1/compliance/wizards/:wizardId/steps/:code/evidence/:evidenceId
```

Evidence upload flow:
1. Parse multipart with `@fastify/multipart`
2. Compute SHA-256 server-side, compare with `x-content-sha256` header
3. Upload to S3 with key `wizards/{wizardId}/{code}/{evidenceId}/{fileName}`
4. Create DB row via `WizardService.uploadEvidence()`

**Verify**: API integration tests:
- Upload file succeeds (201), returns evidence record with sha256
- Upload to locked step (409)
- Upload > 50MB (413 FILE_TOO_LARGE)
- SHA-256 mismatch (422 HASH_MISMATCH)
- Delete evidence (200)
- Delete non-existent evidence (404)

---

### Task 3.4: Wizard API routes — progress & documents

**File**: `apps/api/src/routes/compliance-wizards.ts` (edit — add progress/doc routes)
**What**: Add progress endpoint and document generation/listing routes.

```ts
// GET /v1/compliance/wizards/:wizardId/progress
// POST /v1/compliance/wizards/:wizardId/documents/generate
// GET /v1/compliance/wizards/:wizardId/documents
```

Document generation delegates to the existing report-worker batch endpoint. The `POST /documents/generate` route:
1. Validates prerequisites via `WizardService.canGenerateDocument()`
2. Creates Report rows via the existing report pipeline
3. Returns 202 Accepted with document IDs
4. Status tracked via existing SSE `/v1/reports/:id/status` endpoint

**Verify**: API integration tests:
- GET progress returns correct summary
- POST generate with unmet prereqs (422 PREREQUISITES_NOT_MET)
- POST generate succeeds (202), creates WizardDocument rows
- POST generate while already generating (409 GENERATION_IN_PROGRESS)
- GET documents returns list with status
- RBAC: only admin/manager can generate, all roles can list

---

### Task 3.5: Register wizard routes in server.ts

**File**: `apps/api/src/server.ts` (edit)
**What**: Import and register wizard routes, add RBAC entries for all 14 endpoints.

```ts
import wizardRoutes from "./routes/compliance-wizards.js";
// ...
await app.register(wizardRoutes);
```

Also add to the RBAC path map in the auth middleware (follow existing pattern for attestation/report routes).

**Verify**: `npx turbo test --filter=@sentinel/api` — all existing + new tests pass.

---

## Phase 4: Document Templates (React-PDF)

### Task 4.1: Technical Documentation template

**File**: `packages/compliance/src/reports/templates/eu-ai-act-technical-doc.ts` (new)
**File**: `packages/compliance/src/reports/EuAiActTechnicalDoc.tsx` (new)
**What**: Create the Technical Documentation report template. The `gather()` method pulls wizard step data (requirements, justifications, evidence) for the prerequisite controls. The React-PDF component renders the 8-section structure from design doc Section 6.

```ts
// Template registration (eu-ai-act-technical-doc.ts):
export const euAiActTechnicalDocTemplate: ReportTemplate<TechnicalDocData> = {
  type: "eu_ai_act_technical_documentation",
  displayName: "EU AI Act — Technical Documentation",
  description: "Comprehensive technical documentation per Article 11",
  gather: async (ctx) => { /* fetch wizard steps AIA-9,10,12,14,15 data */ },
  render: (data, branding) => createElement(EuAiActTechnicalDoc, { data, branding }),
};
```

React-PDF component sections:
1. System Overview (from wizard metadata)
2. Risk Classification (AIA-9)
3. Data Governance (AIA-10)
4. Algorithm Design (AIA-9, AIA-15)
5. Human Oversight Measures (AIA-14)
6. Accuracy & Robustness (AIA-15)
7. Logging Capabilities (AIA-12)
8. Appendix: Evidence Index (all evidence with SHA-256 hashes)

**Verify**: Unit test `packages/compliance/src/reports/__tests__/eu-ai-act-technical-doc.test.ts`:
- `gather()` throws when prerequisite steps are not completed
- `gather()` assembles correct data from wizard steps
- `render()` produces valid React element
- Evidence index includes all uploaded files with hashes

---

### Task 4.2: Declaration of Conformity template

**File**: `packages/compliance/src/reports/templates/eu-ai-act-declaration.ts` (new)
**File**: `packages/compliance/src/reports/EuAiActDeclaration.tsx` (new)
**What**: Create the Declaration of Conformity report. Requires >= 90% progress and all non-skipped steps completed.

Sections: Declaration Header, AI System Identification, Conformity Assessment, Standards Applied, Compliance Statement (per-control status table), Signatory Block.

**Verify**: Unit test:
- `gather()` throws when progress < 90%
- `gather()` assembles per-control compliance status
- `render()` produces valid React element with signatory block

---

### Task 4.3: Instructions for Use template

**File**: `packages/compliance/src/reports/templates/eu-ai-act-instructions.ts` (new)
**File**: `packages/compliance/src/reports/EuAiActInstructions.tsx` (new)
**What**: Create the Instructions for Use report. Prerequisites: AIA-9, AIA-10, AIA-13, AIA-14, AIA-15.

Sections: Provider Information, Intended Purpose, Transparency Obligations, Human Oversight Instructions, Known Limitations, Input Data Specifications, Maintenance & Updates.

**Verify**: Unit test:
- `gather()` throws when prereqs incomplete
- `gather()` assembles correct data
- `render()` produces valid React element

---

### Task 4.4: Post-Market Monitoring Plan template

**File**: `packages/compliance/src/reports/templates/eu-ai-act-monitoring.ts` (new)
**File**: `packages/compliance/src/reports/EuAiActMonitoring.tsx` (new)
**What**: Create the Post-Market Monitoring Plan report. Prerequisites: AIA-17, AIA-60, AIA-61.

Sections: Monitoring Scope, Data Collection, Performance Monitoring, Incident Reporting, Corrective Actions, Review Cadence, Integration with QMS.

**Verify**: Unit test:
- `gather()` throws when prereqs incomplete
- `gather()` assembles correct data
- `render()` produces valid React element

---

### Task 4.5: Register all 4 templates in ReportRegistry

**File**: `packages/compliance/src/reports/templates/index.ts` (edit)
**File**: `packages/compliance/src/reports/generator.ts` (edit)
**What**: Register the 4 EU AI Act document templates in the existing `ReportRegistry` and add generation functions to `generator.ts`.

```ts
// templates/index.ts — add imports and exports
export { euAiActTechnicalDocTemplate } from "./eu-ai-act-technical-doc.js";
export { euAiActDeclarationTemplate } from "./eu-ai-act-declaration.js";
export { euAiActInstructionsTemplate } from "./eu-ai-act-instructions.js";
export { euAiActMonitoringTemplate } from "./eu-ai-act-monitoring.js";
```

**Verify**: `npx tsc --noEmit` passes. Registry lists all existing + 4 new templates.

---

## Phase 5: Dashboard UI

### Task 5.1: Wizard API hooks

**File**: `apps/dashboard/lib/wizard-api.ts` (new)
**What**: TanStack Query hooks for all wizard API endpoints.

```ts
// Query keys
export const wizardKeys = {
  all: (orgId: string) => ["wizards", orgId] as const,
  detail: (wizardId: string) => ["wizard", wizardId] as const,
  step: (wizardId: string, code: string) => ["wizard", wizardId, "step", code] as const,
  progress: (wizardId: string) => ["wizard", wizardId, "progress"] as const,
  documents: (wizardId: string) => ["wizard", wizardId, "documents"] as const,
};

// Hooks
export function useWizards(orgId: string);
export function useWizard(wizardId: string);
export function useWizardStep(wizardId: string, code: string);
export function useWizardProgress(wizardId: string);
export function useWizardDocuments(wizardId: string);

// Mutations
export function useCreateWizard();
export function useUpdateStep();
export function useCompleteStep();
export function useSkipStep();
export function useUploadEvidence();
export function useDeleteEvidence();
export function useGenerateDocuments();
export function useDeleteWizard();
```

**Verify**: TypeScript compiles, hooks return correct types.

---

### Task 5.2: WizardStepper component

**File**: `apps/dashboard/components/compliance/wizard/WizardStepper.tsx` (new)
**What**: Left sidebar showing all 12 controls grouped by 4 phases. Each step shows state-appropriate icon and is clickable only when not locked.

State icons:
- `locked`: Lock icon, greyed out, cursor-not-allowed
- `available`: Circle outline, clickable
- `in_progress`: Half-filled circle, blue
- `completed`: Checkmark, green
- `skipped`: Skip icon, muted text

Props: `steps: WizardStep[]`, `currentCode: string`, `onSelectStep: (code: string) => void`

Uses existing Tailwind classes and shadcn/ui components.

**Verify**: Storybook or unit test — renders 4 phase groups, correct icons per state, click handler fires for non-locked steps.

---

### Task 5.3: RequirementChecklist component

**File**: `apps/dashboard/components/compliance/wizard/RequirementChecklist.tsx` (new)
**What**: Renders step requirements as checkboxes. Auto-saves via debounced `useUpdateStep` mutation. Shows optional badge for optional items. Disabled when step is locked or completed.

Props: `requirements: StepRequirement[]`, `disabled: boolean`, `onChange: (key: string, completed: boolean) => void`

**Verify**: Unit test — renders all requirements, checkbox toggles fire onChange, optional items show badge, disabled state prevents interaction.

---

### Task 5.4: EvidenceUploader component

**File**: `apps/dashboard/components/compliance/wizard/EvidenceUploader.tsx` (new)
**What**: Drag-and-drop file upload with client-side SHA-256 computation. Shows file list with name, size, hash, and delete button. Max 50MB per file.

Uses `SubtleCrypto.digest()` for SHA-256. Calls `useUploadEvidence` mutation.

**Verify**: Unit test — renders drop zone, file list shows uploaded evidence, delete button calls mutation.

---

### Task 5.5: StepBody and step form components

**File**: `apps/dashboard/components/compliance/wizard/StepBody.tsx` (new)
**File**: `apps/dashboard/components/compliance/wizard/GenericStepForm.tsx` (new)
**What**: `StepBody` maps control code to the appropriate form component via `stepComponentMap`. `GenericStepForm` is the default, containing `RequirementChecklist`, `EvidenceUploader`, and a `JustificationEditor` (textarea).

```tsx
// StepBody.tsx
const stepComponentMap: Record<string, React.ComponentType<StepProps>> = {
  // Most controls use GenericStepForm (default)
  // Can override for special controls later
};

export function StepBody({ wizardId, step, ... }: StepProps) {
  const Component = stepComponentMap[step.controlCode] ?? GenericStepForm;
  return <Component wizardId={wizardId} step={step} ... />;
}
```

`GenericStepForm` layout:
1. Guidance text (from handler)
2. Gap analysis preview (if data available)
3. Requirement checklist
4. Justification editor
5. Evidence uploader

**Verify**: Unit test — renders GenericStepForm by default, shows guidance, checklist, and evidence sections.

---

### Task 5.6: StepHeader and StepFooter components

**File**: `apps/dashboard/components/compliance/wizard/StepHeader.tsx` (new)
**File**: `apps/dashboard/components/compliance/wizard/StepFooter.tsx` (new)
**What**:

`StepHeader`: Control title, article reference, status badge (reuse `AttestationStatusBadge` pattern), document contribution tags.

`StepFooter`: Action buttons — "Save Draft" (always), "Complete Step" (enabled when all non-optional requirements met), "Skip Step" (opens reason modal). Complete/Skip disabled for viewer/developer roles (only admin/manager).

**Verify**: Unit test — footer shows correct buttons per state, Complete disabled when requirements incomplete.

---

### Task 5.7: WizardHeader and ProgressSummary

**File**: `apps/dashboard/components/compliance/wizard/WizardHeader.tsx` (new)
**File**: `apps/dashboard/components/compliance/wizard/ProgressSummary.tsx` (new)
**What**:

`WizardHeader`: Wizard name, framework badge, overall progress bar, action dropdown (Generate Documents, Export, Delete).

`ProgressSummary`: Bottom of sidebar — overall percentage, phase breakdown bars, count of completed/skipped/remaining.

**Verify**: Unit test — progress bar reflects percentage, phase breakdown shows correct counts.

---

### Task 5.8: DocumentGenerationPanel

**File**: `apps/dashboard/components/compliance/wizard/DocumentGenerationPanel.tsx` (new)
**What**: Shows 4 document cards. Each shows readiness status (ready/blocked with blocking step list), "Generate" button, SSE-powered progress indicator (reuses existing `useReportStatus` pattern), and download link when ready.

```tsx
// For each document type:
// 1. Call useWizardDocuments() to get current status
// 2. Show blocking steps if not ready
// 3. Show progress bar during generation
// 4. Show download link when status = "ready"
```

**Verify**: Unit test — shows 4 cards, blocked state shows blocking steps, ready state shows generate button.

---

### Task 5.9: WizardPage (main page assembly)

**File**: `apps/dashboard/app/(dashboard)/compliance/wizards/[wizardId]/page.tsx` (new)
**File**: `apps/dashboard/app/(dashboard)/compliance/wizards/[wizardId]/[[...code]]/page.tsx` (new)
**What**: Main wizard page assembling all components. Uses URL param for current step selection.

Layout: `WizardHeader` (top) + `WizardStepper` (left sidebar) + `WizardContent` (main: StepHeader + StepBody + StepFooter).

Responsive: Desktop sidebar + main. Mobile (<1024px): stepper collapses to horizontal progress bar with dropdown.

**Verify**: Page renders without errors, navigating between steps updates URL and content.

---

### Task 5.10: WizardListPage and CreateWizardPage

**File**: `apps/dashboard/app/(dashboard)/compliance/wizards/page.tsx` (new)
**File**: `apps/dashboard/app/(dashboard)/compliance/wizards/new/page.tsx` (new)
**What**:

`WizardListPage`: Table of existing wizards with name, framework, progress, status, created date, actions (view/delete). Empty state with "Create Wizard" CTA.

`CreateWizardPage`: Form with wizard name, framework selector (EU AI Act pre-selected), optional metadata (system name, provider info). Submits via `useCreateWizard`, redirects to wizard page.

**Verify**: List page renders wizard table, create page submits form and redirects.

---

### Task 5.11: Navigation integration

**File**: `apps/dashboard/components/layout/sidebar.tsx` (edit) or equivalent nav file
**What**: Add "Compliance Wizard" nav item under the Compliance section, linking to `/compliance/wizards`.

**Verify**: Navigation item appears, links to wizard list page.

---

## Phase 6: Integration & E2E Tests

### Task 6.1: Full-flow API integration test

**File**: `apps/api/src/routes/__tests__/compliance-wizards-flow.test.ts` (new)
**What**: End-to-end API flow test: create wizard → update steps → complete phase 1 → verify phase 2 unlocks → complete all → generate documents.

Tests:
1. Create wizard, verify 12 steps created
2. Update AIA-9 requirements, verify state transitions to in_progress
3. Complete AIA-9, AIA-10, AIA-12 (phase 1)
4. Verify AIA-11, AIA-13, AIA-14, AIA-15 now available
5. Complete all remaining steps through phase 4
6. Generate all 4 documents, verify 202 accepted
7. Verify wizard status is "completed"

**Verify**: Test passes end-to-end.

---

### Task 6.2: Playwright E2E tests

**File**: `apps/dashboard/e2e/compliance-wizard.spec.ts` (new)
**What**: Browser-based E2E tests covering the critical user flows.

Tests:
1. Create wizard → see 12 steps in stepper
2. Complete phase 1 step → verify phase 2 step becomes clickable
3. Skip a step → verify dependents remain locked
4. Check all requirements → complete button enables → click complete
5. Upload evidence file → see in evidence list
6. Navigate away and return → state persisted
7. Generate documents → see progress → download link appears
8. Mobile viewport: stepper collapses to horizontal bar

**Verify**: `npx playwright test apps/dashboard/e2e/compliance-wizard.spec.ts` passes.

---

## Task Dependency Graph

```
Phase 1 (parallel where possible):
  1.1 (types) ──┬── 1.2 (controls) ──── 1.6 (handlers)
                 ├── 1.3 (DAG)           │
                 ├── 1.4 (FSM)           │
                 └── 1.5 (registry) ─────┘
                                          └── 1.7 (barrel)

Phase 2 (sequential):
  2.1 (Prisma) → 2.2 (service CRUD) → 2.3 (step ops) → 2.4 (doc gen) → 2.5 (evidence)

Phase 3 (sequential, depends on Phase 2):
  3.1 (CRUD routes) → 3.2 (step routes) → 3.3 (evidence routes) → 3.4 (doc routes) → 3.5 (register)

Phase 4 (parallel, depends on Phase 2):
  4.1 (tech doc) ┐
  4.2 (declaration)│── 4.5 (register templates)
  4.3 (instructions)│
  4.4 (monitoring) ┘

Phase 5 (depends on Phase 3):
  5.1 (hooks) → 5.2-5.8 (components, parallel) → 5.9-5.10 (pages) → 5.11 (nav)

Phase 6 (depends on all):
  6.1 (API flow test) + 6.2 (E2E tests)
```

## Estimated Test Counts

| Category | Count |
|----------|-------|
| DAG engine | 7 |
| FSM engine | 6 |
| Control definitions | 4 |
| Step handlers | 5 |
| WizardService | 17 |
| API integration | 25 |
| Document templates | 12 |
| E2E (Playwright) | 8 |
| **Total** | **~84** |
