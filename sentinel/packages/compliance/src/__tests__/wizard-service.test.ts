import { describe, it, expect, vi, beforeEach } from "vitest";
import { WizardService } from "../wizard/wizard-service.js";
import { euAiActRegistry } from "../wizard/handlers/index.js";
import { EU_AI_ACT_CONTROLS } from "../wizard/eu-ai-act-controls.js";

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

describe("WizardService", () => {
  let db: ReturnType<typeof createMockDb>;
  let service: WizardService;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    service = new WizardService(db as any, euAiActRegistry);
  });

  describe("create", () => {
    it("creates wizard with 12 steps, 3 available (phase 1), 9 locked", async () => {
      const fakeWizard = {
        id: "wiz-1",
        orgId: "org-1",
        frameworkCode: "eu_ai_act",
        name: "Test Wizard",
        steps: makeSteps(),
        events: [{ eventType: "wizard_created" }],
      };
      db.complianceWizard.create.mockResolvedValue(fakeWizard);

      const result = await service.create("org-1", "user-1", "Test Wizard");
      expect(result.steps).toHaveLength(12);

      const createCall = db.complianceWizard.create.mock.calls[0][0];
      const stepData = createCall.data.steps.create;
      expect(stepData).toHaveLength(12);

      const available = stepData.filter((s: any) => s.state === "available");
      const locked = stepData.filter((s: any) => s.state === "locked");
      expect(available).toHaveLength(3);
      expect(locked).toHaveLength(9);
    });

    it("creates wizard_created event", async () => {
      db.complianceWizard.create.mockResolvedValue({ id: "wiz-1", steps: [], events: [] });
      await service.create("org-1", "user-1", "Test");

      const createCall = db.complianceWizard.create.mock.calls[0][0];
      expect(createCall.data.events.create.eventType).toBe("wizard_created");
    });
  });

  describe("get", () => {
    it("returns wizard with steps sorted by phase", async () => {
      db.complianceWizard.findUnique.mockResolvedValue({
        id: "wiz-1",
        orgId: "org-1",
        steps: makeSteps(),
      });

      const result = await service.get("wiz-1", "org-1");
      expect(result).toBeTruthy();
      expect(result!.steps).toHaveLength(12);
    });

    it("returns null for wrong orgId", async () => {
      db.complianceWizard.findUnique.mockResolvedValue({
        id: "wiz-1",
        orgId: "org-other",
      });

      const result = await service.get("wiz-1", "org-1");
      expect(result).toBeNull();
    });
  });

  describe("delete", () => {
    it("removes wizard", async () => {
      db.complianceWizard.findUnique.mockResolvedValue({ id: "wiz-1", orgId: "org-1" });
      db.complianceWizard.delete.mockResolvedValue({});

      const result = await service.delete("wiz-1", "org-1");
      expect(result).toEqual({ deleted: true });
      expect(db.complianceWizard.delete).toHaveBeenCalledWith({ where: { id: "wiz-1" } });
    });
  });

  describe("updateStep", () => {
    it("transitions available to in_progress on first update", async () => {
      const step = { id: "step-1", state: "available", requirements: [{ key: "a", label: "A", completed: false, optional: false }] };
      db.wizardStep.findUnique.mockResolvedValue(step);
      db.wizardStep.update.mockResolvedValue({ ...step, state: "in_progress" });
      db.wizardStep.findMany.mockResolvedValue(makeSteps());
      db.complianceWizard.update.mockResolvedValue({});

      const result = await service.updateStep("wiz-1", "AIA-9", { justification: "test" }, "user-1");
      expect(result.step).toBeTruthy();

      const updateCall = db.wizardStep.update.mock.calls[0][0];
      expect(updateCall.data.state).toBe("in_progress");
    });

    it("rejects locked step", async () => {
      db.wizardStep.findUnique.mockResolvedValue({ id: "step-1", state: "locked" });

      const result = await service.updateStep("wiz-1", "AIA-11", {}, "user-1");
      expect(result.error).toBe("STEP_LOCKED");
    });
  });

  describe("completeStep", () => {
    it("fails when requirements not met", async () => {
      const step = {
        id: "step-1",
        state: "in_progress",
        requirements: [{ key: "a", label: "A", completed: false, optional: false }],
      };
      db.wizardStep.findUnique.mockResolvedValue(step);

      const result = await service.completeStep("wiz-1", "AIA-9", "user-1");
      expect(result.error).toBe("REQUIREMENTS_INCOMPLETE");
      expect(result.status).toBe(422);
    });

    it("succeeds and unlocks dependents", async () => {
      const step = {
        id: "step-1",
        state: "in_progress",
        controlCode: "AIA-9",
        requirements: [
          { key: "risk_identified", label: "", completed: true, optional: false },
          { key: "risk_mitigated", label: "", completed: true, optional: false },
          { key: "risk_residual", label: "", completed: true, optional: false },
          { key: "risk_testing", label: "", completed: true, optional: false },
          { key: "risk_lifecycle", label: "", completed: true, optional: false },
        ],
      };
      db.wizardStep.findUnique.mockResolvedValue(step);
      db.wizardStep.update.mockResolvedValue({ ...step, state: "completed" });
      db.wizardStep.findMany.mockResolvedValue(makeSteps({ "AIA-9": "completed" }));
      db.complianceWizard.update.mockResolvedValue({});

      const result = await service.completeStep("wiz-1", "AIA-9", "user-1");
      expect(result.step).toBeTruthy();
      expect(db.wizardEvent.create).toHaveBeenCalled();
    });
  });

  describe("skipStep", () => {
    it("fails without reason", async () => {
      const result = await service.skipStep("wiz-1", "AIA-12", "", "user-1");
      expect(result.error).toBe("SKIP_REASON_REQUIRED");
    });

    it("with skipUnlocksDependents=false does not unlock dependents", async () => {
      const step = { id: "step-1", state: "available", controlCode: "AIA-9" };
      db.wizardStep.findUnique.mockResolvedValue(step);
      db.wizardStep.update.mockResolvedValue({ ...step, state: "skipped" });
      // AIA-9 has skipUnlocksDependents=false, so unlockDependents won't be called
      db.wizardStep.findMany.mockResolvedValue(makeSteps({ "AIA-9": "skipped" }));
      db.complianceWizard.update.mockResolvedValue({});

      const result = await service.skipStep("wiz-1", "AIA-9", "Not needed", "user-1");
      expect(result.step).toBeTruthy();
      // unlockDependents should NOT be called for AIA-9 (skipUnlocksDependents=false)
      // We check that findMany was only called once (for recalculate, not for unlockDependents)
      expect(db.wizardStep.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("getProgress", () => {
    it("returns correct percentages", async () => {
      const steps = makeSteps({ "AIA-9": "completed", "AIA-10": "completed", "AIA-12": "skipped" });
      db.complianceWizard.findUnique.mockResolvedValue({ id: "wiz-1", orgId: "org-1", steps });

      const progress = await service.getProgress("wiz-1", "org-1");
      expect(progress).toBeTruthy();
      expect(progress!.completedSteps).toBe(2);
      expect(progress!.skippedSteps).toBe(1);
      expect(progress!.totalSteps).toBe(12);
      expect(progress!.overall).toBeCloseTo(3 / 12);
    });
  });

  describe("canGenerateDocument", () => {
    it("returns blocking when AIA-9 incomplete", async () => {
      db.wizardStep.findMany.mockResolvedValue(makeSteps());

      const result = await service.canGenerateDocument("wiz-1", "technical_documentation");
      expect(result.ready).toBe(false);
      expect(result.blocking).toContain("AIA-9");
    });

    it("returns ready when all prereqs completed", async () => {
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

    it("declaration_of_conformity checks >= 90% progress", async () => {
      // Only 3/12 done = 25%
      db.wizardStep.findMany.mockResolvedValue(makeSteps({
        "AIA-9": "completed",
        "AIA-10": "completed",
        "AIA-12": "completed",
      }));

      const result = await service.canGenerateDocument("wiz-1", "declaration_of_conformity");
      expect(result.ready).toBe(false);
    });
  });

  describe("generateDocuments", () => {
    it("fails when already generating", async () => {
      db.complianceWizard.findUnique.mockResolvedValue({ id: "wiz-1", status: "generating" });

      const result = await service.generateDocuments("wiz-1", ["technical_documentation"], "user-1");
      expect(result.error).toBe("GENERATION_IN_PROGRESS");
    });

    it("creates WizardDocument rows", async () => {
      // All steps completed for prereq check
      const allCompleted = makeSteps(
        Object.fromEntries(EU_AI_ACT_CONTROLS.map((c) => [c.code, "completed"])),
      ).map((s) => ({ ...s, evidence: [] }));
      db.complianceWizard.findUnique.mockResolvedValue({
        id: "wiz-1", orgId: "org-1", status: "active", name: "Test", metadata: {},
        steps: allCompleted,
      });
      db.complianceWizard.update.mockResolvedValue({});
      db.wizardStep.findMany.mockResolvedValue(allCompleted);
      db.wizardDocument.upsert.mockResolvedValue({ id: "doc-1", documentType: "technical_documentation", status: "generating" });
      db.wizardDocument.update.mockResolvedValue({ id: "doc-1", documentType: "technical_documentation", status: "ready" });

      const result = await service.generateDocuments("wiz-1", ["technical_documentation"], "user-1");
      expect(result.documents).toHaveLength(1);
      expect(db.wizardDocument.upsert).toHaveBeenCalled();
    });
  });

  describe("evidence", () => {
    it("uploadEvidence succeeds for in_progress step", async () => {
      db.wizardStep.findUnique.mockResolvedValue({ id: "step-1", state: "in_progress" });
      db.wizardStepEvidence.create.mockResolvedValue({ id: "ev-1", fileName: "test.pdf" });

      const result = await service.uploadEvidence("wiz-1", "AIA-9", {
        fileName: "test.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
        storageKey: "s3://bucket/key",
        sha256: "abc123",
      }, "user-1");

      expect(result.evidence).toBeTruthy();
    });

    it("uploadEvidence fails for locked step", async () => {
      db.wizardStep.findUnique.mockResolvedValue({ id: "step-1", state: "locked" });

      const result = await service.uploadEvidence("wiz-1", "AIA-11", {
        fileName: "test.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
        storageKey: "s3://bucket/key",
        sha256: "abc123",
      }, "user-1");

      expect(result.error).toBe("STEP_LOCKED");
    });

    it("uploadEvidence fails if fileSize > 50MB", async () => {
      db.wizardStep.findUnique.mockResolvedValue({ id: "step-1", state: "in_progress" });

      const result = await service.uploadEvidence("wiz-1", "AIA-9", {
        fileName: "huge.bin",
        mimeType: "application/octet-stream",
        fileSize: 60 * 1024 * 1024,
        storageKey: "s3://bucket/key",
        sha256: "abc123",
      }, "user-1");

      expect(result.error).toBe("FILE_TOO_LARGE");
    });

    it("deleteEvidence succeeds", async () => {
      db.wizardStepEvidence.findUnique.mockResolvedValue({
        id: "ev-1",
        fileName: "test.pdf",
        step: { wizardId: "wiz-1", controlCode: "AIA-9" },
      });
      db.wizardStepEvidence.delete.mockResolvedValue({});

      const result = await service.deleteEvidence("wiz-1", "AIA-9", "ev-1", "user-1");
      expect(result.deleted).toBe(true);
    });

    it("deleteEvidence fails for non-existent id", async () => {
      db.wizardStepEvidence.findUnique.mockResolvedValue(null);

      const result = await service.deleteEvidence("wiz-1", "AIA-9", "ev-nope", "user-1");
      expect(result.error).toBe("NOT_FOUND");
    });
  });
});
