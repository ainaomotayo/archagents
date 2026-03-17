import { describe, it, expect, vi, beforeEach } from "vitest";
import { WizardService } from "@sentinel/compliance";
import { euAiActRegistry, EU_AI_ACT_CONTROLS } from "@sentinel/compliance";
import { API_PERMISSIONS } from "@sentinel/security";

// ---------------------------------------------------------------------------
// Mock DB factory
// ---------------------------------------------------------------------------
function createMockDb() {
  return {
    complianceWizard: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    wizardStep: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    wizardStepEvidence: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    wizardEvent: {
      create: vi.fn(),
    },
    wizardDocument: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
    report: {
      create: vi.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a full set of 12 steps with optional state overrides. */
function makeSteps(overrides: Record<string, string> = {}) {
  return EU_AI_ACT_CONTROLS.map((c) => ({
    id: `step-${c.code}`,
    wizardId: "wiz-1",
    controlCode: c.code,
    phase: c.phase,
    state: overrides[c.code] ?? (c.dependencies.length === 0 ? "available" : "locked"),
    requirements: c.requirements.map((r) => ({ ...r })),
    justification: null,
    skipReason: null,
    completedAt: null,
  }));
}

/** Mark all mandatory requirements as completed for a given step. */
function completeRequirements(steps: ReturnType<typeof makeSteps>, code: string) {
  const step = steps.find((s) => s.controlCode === code);
  if (!step) throw new Error(`Step ${code} not found`);
  step.requirements = step.requirements.map((r: any) => ({ ...r, completed: true }));
  return step;
}

// ===========================================================================
// 1. Full wizard lifecycle flow
// ===========================================================================
describe("Wizard integration – full lifecycle flow", () => {
  let db: ReturnType<typeof createMockDb>;
  let service: WizardService;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    service = new WizardService(db as any, euAiActRegistry);
  });

  it("create wizard yields 12 steps: 3 available (phase 1), 9 locked", async () => {
    const steps = makeSteps();
    db.complianceWizard.create.mockResolvedValue({
      id: "wiz-1",
      orgId: "org-1",
      frameworkCode: "eu_ai_act",
      name: "Full Lifecycle Test",
      steps,
      events: [{ eventType: "wizard_created" }],
    });

    const result = await service.create("org-1", "user-1", "Full Lifecycle Test");
    expect(result.steps).toHaveLength(12);

    const createCall = db.complianceWizard.create.mock.calls[0][0];
    const stepData = createCall.data.steps.create;
    const available = stepData.filter((s: any) => s.state === "available");
    const locked = stepData.filter((s: any) => s.state === "locked");
    expect(available).toHaveLength(3);
    expect(locked).toHaveLength(9);
    // Phase 1 controls are the available ones
    expect(available.map((s: any) => s.controlCode).sort()).toEqual(["AIA-10", "AIA-12", "AIA-9"]);
  });

  it("updateStep on AIA-9 transitions available -> in_progress", async () => {
    const step = {
      id: "step-AIA-9",
      state: "available",
      controlCode: "AIA-9",
      requirements: EU_AI_ACT_CONTROLS.find((c) => c.code === "AIA-9")!.requirements.map((r) => ({ ...r })),
    };
    db.wizardStep.findUnique.mockResolvedValue(step);
    db.wizardStep.update.mockResolvedValue({ ...step, state: "in_progress" });
    db.wizardStep.findMany.mockResolvedValue(makeSteps());
    db.complianceWizard.update.mockResolvedValue({});

    const result = await service.updateStep("wiz-1", "AIA-9", {
      requirements: [{ key: "risk_identified", completed: true }],
    }, "user-1");

    expect(result.step).toBeTruthy();
    const updateData = db.wizardStep.update.mock.calls[0][0].data;
    expect(updateData.state).toBe("in_progress");
    // step_started event should be logged
    expect(db.wizardEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "step_started" }),
      }),
    );
  });

  it("completeStep on AIA-9 (all reqs met) fires step_completed and triggers unlockDependents", async () => {
    const completedReqs = EU_AI_ACT_CONTROLS.find((c) => c.code === "AIA-9")!.requirements.map((r) => ({
      ...r,
      completed: true,
    }));
    const step = { id: "step-AIA-9", state: "in_progress", controlCode: "AIA-9", requirements: completedReqs };
    db.wizardStep.findUnique.mockResolvedValue(step);
    db.wizardStep.update.mockResolvedValue({ ...step, state: "completed" });
    // After AIA-9 complete: dependents AIA-13, AIA-14 need only AIA-9, so they should unlock
    // AIA-11 needs AIA-9 + AIA-10, AIA-15 needs AIA-9 + AIA-10 — still locked
    db.wizardStep.findMany.mockResolvedValue(makeSteps({ "AIA-9": "completed" }));
    db.complianceWizard.update.mockResolvedValue({});

    const result = await service.completeStep("wiz-1", "AIA-9", "user-1");
    expect(result.step).toBeTruthy();
    expect((result as any).error).toBeUndefined();

    // step_completed event
    const eventCalls = db.wizardEvent.create.mock.calls.map((c: any) => c[0].data.eventType);
    expect(eventCalls).toContain("step_completed");

    // unlockDependents was called (findMany for unlocking)
    expect(db.wizardStep.findMany).toHaveBeenCalled();

    // AIA-13 and AIA-14 depend only on AIA-9 — they should be unlocked
    const unlockCalls = db.wizardStep.update.mock.calls;
    // First call is the step completion; subsequent are unlocks
    const unlockUpdates = unlockCalls.slice(1).map((c: any) => c[0]);
    const unlockedIds = unlockUpdates
      .filter((u: any) => u.data?.state === "available")
      .map((u: any) => u.where.id);
    expect(unlockedIds).toContain("step-AIA-13");
    expect(unlockedIds).toContain("step-AIA-14");
  });

  it("completing AIA-9 + AIA-10 unlocks AIA-11 and AIA-15", async () => {
    const completedReqs = EU_AI_ACT_CONTROLS.find((c) => c.code === "AIA-10")!.requirements.map((r) => ({
      ...r,
      completed: true,
    }));
    const step = { id: "step-AIA-10", state: "in_progress", controlCode: "AIA-10", requirements: completedReqs };
    db.wizardStep.findUnique.mockResolvedValue(step);
    db.wizardStep.update.mockResolvedValue({ ...step, state: "completed" });

    // Both AIA-9 and AIA-10 are completed now
    db.wizardStep.findMany.mockResolvedValue(
      makeSteps({ "AIA-9": "completed", "AIA-10": "completed" }),
    );
    db.complianceWizard.update.mockResolvedValue({});

    await service.completeStep("wiz-1", "AIA-10", "user-1");

    // AIA-11 depends on [AIA-9, AIA-10] — both done
    // AIA-15 depends on [AIA-9, AIA-10] — both done
    const unlockCalls = db.wizardStep.update.mock.calls.slice(1);
    const unlockedIds = unlockCalls
      .filter((c: any) => c[0].data?.state === "available")
      .map((c: any) => c[0].where.id);

    expect(unlockedIds).toContain("step-AIA-11");
    expect(unlockedIds).toContain("step-AIA-15");
  });

  it("completing all phase 1 (AIA-9, AIA-10, AIA-12) makes phase 2 steps available", async () => {
    const completedReqs = EU_AI_ACT_CONTROLS.find((c) => c.code === "AIA-12")!.requirements.map((r) => ({
      ...r,
      completed: true,
    }));
    const step = { id: "step-AIA-12", state: "in_progress", controlCode: "AIA-12", requirements: completedReqs };
    db.wizardStep.findUnique.mockResolvedValue(step);
    db.wizardStep.update.mockResolvedValue({ ...step, state: "completed" });

    // All phase 1 done
    db.wizardStep.findMany.mockResolvedValue(
      makeSteps({ "AIA-9": "completed", "AIA-10": "completed", "AIA-12": "completed" }),
    );
    db.complianceWizard.update.mockResolvedValue({});

    await service.completeStep("wiz-1", "AIA-12", "user-1");

    const unlockCalls = db.wizardStep.update.mock.calls.slice(1);
    const unlockedIds = unlockCalls
      .filter((c: any) => c[0].data?.state === "available")
      .map((c: any) => c[0].where.id);

    // Phase 2: AIA-11, AIA-13, AIA-14, AIA-15 should all be unlocked
    expect(unlockedIds).toContain("step-AIA-11");
    expect(unlockedIds).toContain("step-AIA-13");
    expect(unlockedIds).toContain("step-AIA-14");
    expect(unlockedIds).toContain("step-AIA-15");
  });

  it("getProgress returns correct counts after partial completion", async () => {
    const steps = makeSteps({ "AIA-9": "completed", "AIA-10": "completed", "AIA-12": "skipped" });
    db.complianceWizard.findUnique.mockResolvedValue({ id: "wiz-1", orgId: "org-1", steps });

    const progress = await service.getProgress("wiz-1", "org-1");
    expect(progress).toBeTruthy();
    expect(progress!.completedSteps).toBe(2);
    expect(progress!.skippedSteps).toBe(1);
    expect(progress!.totalSteps).toBe(12);
    expect(progress!.overall).toBeCloseTo(3 / 12);
    expect(progress!.phaseProgress[1]).toEqual({ completed: 3, total: 3 });
  });
});

// ===========================================================================
// 2. Skip behavior
// ===========================================================================
describe("Wizard integration – skip behavior", () => {
  let db: ReturnType<typeof createMockDb>;
  let service: WizardService;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    service = new WizardService(db as any, euAiActRegistry);
  });

  it("skip AIA-12 (skipUnlocksDependents=true) triggers unlockDependents", async () => {
    const step = { id: "step-AIA-12", state: "available", controlCode: "AIA-12" };
    db.wizardStep.findUnique.mockResolvedValue(step);
    db.wizardStep.update.mockResolvedValue({ ...step, state: "skipped" });
    db.wizardStep.findMany.mockResolvedValue(makeSteps({ "AIA-12": "skipped" }));
    db.complianceWizard.update.mockResolvedValue({});

    const result = await service.skipStep("wiz-1", "AIA-12", "Not applicable", "user-1");
    expect(result.step).toBeTruthy();

    // AIA-12 has skipUnlocksDependents=true, so unlockDependents IS called
    // findMany is called twice: once for unlockDependents, once for recalculate
    expect(db.wizardStep.findMany).toHaveBeenCalledTimes(2);
  });

  it("skip AIA-9 (skipUnlocksDependents=false) does NOT trigger unlockDependents", async () => {
    const step = { id: "step-AIA-9", state: "available", controlCode: "AIA-9" };
    db.wizardStep.findUnique.mockResolvedValue(step);
    db.wizardStep.update.mockResolvedValue({ ...step, state: "skipped" });
    db.wizardStep.findMany.mockResolvedValue(makeSteps({ "AIA-9": "skipped" }));
    db.complianceWizard.update.mockResolvedValue({});

    await service.skipStep("wiz-1", "AIA-9", "Not needed for this system", "user-1");

    // AIA-9 has skipUnlocksDependents=false, so unlockDependents NOT called
    // findMany called only once (for recalculate)
    expect(db.wizardStep.findMany).toHaveBeenCalledTimes(1);
  });

  it("skip AIA-9 leaves AIA-13 and AIA-14 locked (skipUnlocksDependents=false)", async () => {
    const step = { id: "step-AIA-9", state: "available", controlCode: "AIA-9" };
    db.wizardStep.findUnique.mockResolvedValue(step);
    db.wizardStep.update.mockResolvedValue({ ...step, state: "skipped" });
    db.wizardStep.findMany.mockResolvedValue(makeSteps({ "AIA-9": "skipped" }));
    db.complianceWizard.update.mockResolvedValue({});

    await service.skipStep("wiz-1", "AIA-9", "Not needed", "user-1");

    // No unlock calls should happen beyond the step state change itself
    const updateCalls = db.wizardStep.update.mock.calls;
    expect(updateCalls).toHaveLength(1); // Only the skip update, no unlocks
  });

  it("skip without reason fails with SKIP_REASON_REQUIRED", async () => {
    const result = await service.skipStep("wiz-1", "AIA-12", "", "user-1");
    expect(result.error).toBe("SKIP_REASON_REQUIRED");
    expect(result.status).toBe(400);
  });
});

// ===========================================================================
// 3. Document generation
// ===========================================================================
describe("Wizard integration – document generation", () => {
  let db: ReturnType<typeof createMockDb>;
  let service: WizardService;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    service = new WizardService(db as any, euAiActRegistry);
  });

  it("canGenerateDocument returns blocking steps when prereqs incomplete", async () => {
    db.wizardStep.findMany.mockResolvedValue(makeSteps());

    const result = await service.canGenerateDocument("wiz-1", "technical_documentation");
    expect(result.ready).toBe(false);
    expect(result.blocking).toContain("AIA-9");
    expect(result.blocking).toContain("AIA-10");
    expect(result.blocking).toContain("AIA-12");
    expect(result.blocking).toContain("AIA-14");
    expect(result.blocking).toContain("AIA-15");
  });

  it("canGenerateDocument returns ready when all prereqs completed", async () => {
    const overrides: Record<string, string> = {
      "AIA-9": "completed",
      "AIA-10": "completed",
      "AIA-12": "completed",
      "AIA-14": "completed",
      "AIA-15": "completed",
    };
    db.wizardStep.findMany.mockResolvedValue(makeSteps(overrides));

    const result = await service.canGenerateDocument("wiz-1", "technical_documentation");
    expect(result.ready).toBe(true);
    expect(result.blocking).toHaveLength(0);
  });

  it("declaration_of_conformity requires >= 90% progress", async () => {
    // Only 3/12 done = 25%
    db.wizardStep.findMany.mockResolvedValue(
      makeSteps({ "AIA-9": "completed", "AIA-10": "completed", "AIA-12": "completed" }),
    );

    const result = await service.canGenerateDocument("wiz-1", "declaration_of_conformity");
    expect(result.ready).toBe(false);
    expect(result.blocking.length).toBeGreaterThan(0);
  });

  it("declaration_of_conformity ready when >= 90% progress", async () => {
    // 11/12 = 91.7%
    const overrides = Object.fromEntries(
      EU_AI_ACT_CONTROLS.slice(0, 11).map((c) => [c.code, "completed"]),
    );
    db.wizardStep.findMany.mockResolvedValue(makeSteps(overrides));

    const result = await service.canGenerateDocument("wiz-1", "declaration_of_conformity");
    expect(result.ready).toBe(true);
    expect(result.blocking).toHaveLength(0);
  });

  it("canGenerateDocument returns blocking for unknown document type", async () => {
    db.wizardStep.findMany.mockResolvedValue(makeSteps());

    const result = await service.canGenerateDocument("wiz-1", "unknown_doc_type");
    expect(result.ready).toBe(false);
    expect(result.blocking[0]).toContain("Unknown document type");
  });

  it("generateDocuments fails when status is 'generating'", async () => {
    db.complianceWizard.findUnique.mockResolvedValue({ id: "wiz-1", status: "generating" });

    const result = await service.generateDocuments("wiz-1", ["technical_documentation"], "user-1");
    expect(result.error).toBe("GENERATION_IN_PROGRESS");
    expect(result.status).toBe(409);
  });

  it("generateDocuments fails when prereqs not met", async () => {
    db.complianceWizard.findUnique.mockResolvedValue({ id: "wiz-1", status: "active" });
    db.wizardStep.findMany.mockResolvedValue(makeSteps()); // nothing completed

    const result = await service.generateDocuments("wiz-1", ["technical_documentation"], "user-1");
    expect(result.error).toBe("PREREQUISITES_NOT_MET");
    expect(result.status).toBe(422);
  });

  it("generateDocuments succeeds and creates document rows", async () => {
    const allCompleted = makeSteps(
      Object.fromEntries(EU_AI_ACT_CONTROLS.map((c) => [c.code, "completed"])),
    ).map((s) => ({ ...s, evidence: [] }));
    db.complianceWizard.findUnique.mockResolvedValue({
      id: "wiz-1", orgId: "org-1", status: "active", name: "Test", metadata: {},
      steps: allCompleted,
    });
    db.complianceWizard.update.mockResolvedValue({});
    db.wizardStep.findMany.mockResolvedValue(allCompleted);
    db.wizardDocument.upsert.mockResolvedValue({
      id: "doc-1",
      documentType: "technical_documentation",
      status: "pending",
    });

    const result = await service.generateDocuments("wiz-1", ["technical_documentation"], "user-1");
    expect((result as any).documents).toHaveLength(1);
    expect(db.wizardDocument.upsert).toHaveBeenCalled();
    expect(db.complianceWizard.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "generating" } }),
    );
  });
});

// ===========================================================================
// 4. Evidence operations
// ===========================================================================
describe("Wizard integration – evidence", () => {
  let db: ReturnType<typeof createMockDb>;
  let service: WizardService;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    service = new WizardService(db as any, euAiActRegistry);
  });

  const evidenceFile = {
    fileName: "audit-report.pdf",
    mimeType: "application/pdf",
    fileSize: 2048,
    storageKey: "s3://sentinel/evidence/audit-report.pdf",
    sha256: "e3b0c44298fc1c149afbf4c8996fb924",
  };

  it("upload evidence to in_progress step succeeds", async () => {
    db.wizardStep.findUnique.mockResolvedValue({ id: "step-AIA-9", state: "in_progress" });
    db.wizardStepEvidence.create.mockResolvedValue({ id: "ev-1", fileName: "audit-report.pdf" });

    const result = await service.uploadEvidence("wiz-1", "AIA-9", evidenceFile, "user-1");
    expect(result.evidence).toBeTruthy();
    expect(db.wizardStepEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fileName: "audit-report.pdf", sha256: "e3b0c44298fc1c149afbf4c8996fb924" }),
      }),
    );
    // evidence_uploaded event
    const eventCalls = db.wizardEvent.create.mock.calls.map((c: any) => c[0].data.eventType);
    expect(eventCalls).toContain("evidence_uploaded");
  });

  it("upload evidence to available step succeeds (not locked)", async () => {
    db.wizardStep.findUnique.mockResolvedValue({ id: "step-AIA-9", state: "available" });
    db.wizardStepEvidence.create.mockResolvedValue({ id: "ev-2", fileName: "audit-report.pdf" });

    const result = await service.uploadEvidence("wiz-1", "AIA-9", evidenceFile, "user-1");
    expect(result.evidence).toBeTruthy();
  });

  it("upload evidence to locked step fails", async () => {
    db.wizardStep.findUnique.mockResolvedValue({ id: "step-AIA-11", state: "locked" });

    const result = await service.uploadEvidence("wiz-1", "AIA-11", evidenceFile, "user-1");
    expect(result.error).toBe("STEP_LOCKED");
    expect(result.status).toBe(409);
  });

  it("upload evidence exceeding 50MB fails", async () => {
    db.wizardStep.findUnique.mockResolvedValue({ id: "step-AIA-9", state: "in_progress" });

    const result = await service.uploadEvidence("wiz-1", "AIA-9", {
      ...evidenceFile,
      fileSize: 60 * 1024 * 1024,
    }, "user-1");
    expect(result.error).toBe("FILE_TOO_LARGE");
    expect(result.status).toBe(413);
  });

  it("delete evidence succeeds", async () => {
    db.wizardStepEvidence.findUnique.mockResolvedValue({
      id: "ev-1",
      fileName: "audit-report.pdf",
      step: { wizardId: "wiz-1", controlCode: "AIA-9" },
    });
    db.wizardStepEvidence.delete.mockResolvedValue({});

    const result = await service.deleteEvidence("wiz-1", "AIA-9", "ev-1", "user-1");
    expect(result.deleted).toBe(true);
    // evidence_deleted event
    const eventCalls = db.wizardEvent.create.mock.calls.map((c: any) => c[0].data.eventType);
    expect(eventCalls).toContain("evidence_deleted");
  });

  it("delete evidence for non-existent id returns NOT_FOUND", async () => {
    db.wizardStepEvidence.findUnique.mockResolvedValue(null);

    const result = await service.deleteEvidence("wiz-1", "AIA-9", "ev-missing", "user-1");
    expect(result.error).toBe("NOT_FOUND");
    expect(result.status).toBe(404);
  });

  it("delete evidence for wrong wizard returns NOT_FOUND", async () => {
    db.wizardStepEvidence.findUnique.mockResolvedValue({
      id: "ev-1",
      fileName: "audit-report.pdf",
      step: { wizardId: "wiz-other", controlCode: "AIA-9" },
    });

    const result = await service.deleteEvidence("wiz-1", "AIA-9", "ev-1", "user-1");
    expect(result.error).toBe("NOT_FOUND");
  });
});

// ===========================================================================
// 5. RBAC checks
// ===========================================================================
describe("Wizard RBAC", () => {
  const wizardPaths = API_PERMISSIONS.filter((p) => p.path.includes("/wizards"));

  it("has 15 wizard RBAC entries", () => {
    expect(wizardPaths.length).toBe(15);
  });

  it("admin can access all wizard endpoints", () => {
    for (const p of wizardPaths) {
      expect(p.roles).toContain("admin");
    }
  });

  it("manager can access all wizard endpoints except DELETE", () => {
    const nonDelete = wizardPaths.filter((p) => p.method !== "DELETE");
    for (const p of nonDelete) {
      expect(p.roles).toContain("manager");
    }
  });

  it("viewer can only access GET endpoints", () => {
    const viewerPaths = wizardPaths.filter((p) => p.roles.includes("viewer"));
    for (const p of viewerPaths) {
      expect(p.method).toBe("GET");
    }
  });

  it("developer can access GET and PATCH/POST evidence endpoints", () => {
    const devPaths = wizardPaths.filter((p) => p.roles.includes("developer"));
    expect(devPaths.length).toBeGreaterThan(0);
    // developer can GET all wizard endpoints and POST evidence
    const devPost = devPaths.filter((p) => p.method === "POST");
    expect(devPost.some((p) => p.path.includes("evidence"))).toBe(true);
  });

  it("only admin can DELETE wizard", () => {
    const deletePath = wizardPaths.find(
      (p) => p.method === "DELETE" && p.path === "/v1/compliance/wizards/:wizardId",
    );
    expect(deletePath).toBeTruthy();
    expect(deletePath!.roles).toEqual(["admin"]);
  });

  it("complete and skip endpoints require admin or manager", () => {
    const completePath = wizardPaths.find((p) => p.path.includes("/complete"));
    const skipPath = wizardPaths.find((p) => p.path.includes("/skip"));

    expect(completePath).toBeTruthy();
    expect(completePath!.roles).toEqual(["admin", "manager"]);
    expect(skipPath).toBeTruthy();
    expect(skipPath!.roles).toEqual(["admin", "manager"]);
  });

  it("documents/generate requires admin or manager", () => {
    const genPath = wizardPaths.find((p) => p.path.includes("documents/generate"));
    expect(genPath).toBeTruthy();
    expect(genPath!.method).toBe("POST");
    expect(genPath!.roles).toEqual(["admin", "manager"]);
  });

  it("GET documents endpoint is accessible to all roles including viewer", () => {
    const docsPath = wizardPaths.find(
      (p) => p.method === "GET" && p.path.includes("/documents"),
    );
    expect(docsPath).toBeTruthy();
    expect(docsPath!.roles).toContain("viewer");
    expect(docsPath!.roles).toContain("developer");
  });
});
