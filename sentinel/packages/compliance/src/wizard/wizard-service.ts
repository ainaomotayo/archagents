import { EU_AI_ACT_CONTROLS, EU_AI_ACT_CONTROL_MAP } from "./eu-ai-act-controls.js";
import { computeAvailableSteps } from "./dag.js";
import { canTransition, validateTransition, canComplete, canSkip } from "./fsm.js";
import type { WizardStepHandler } from "./step-handler.js";
import { WizardStepRegistry } from "./step-handler.js";
import type { StepState, StepRequirement, WizardProgress, StepUpdatePayload, WizardDocumentType } from "./types.js";

const MAX_EVIDENCE_SIZE = 50 * 1024 * 1024; // 50 MB

const DOC_PREREQUISITES: Record<string, string[]> = {
  technical_documentation: ["AIA-9", "AIA-10", "AIA-12", "AIA-14", "AIA-15"],
  declaration_of_conformity: [], // special: all non-skipped completed, progress >= 0.9
  instructions_for_use: ["AIA-9", "AIA-10", "AIA-13", "AIA-14", "AIA-15"],
  post_market_monitoring: ["AIA-17", "AIA-60", "AIA-61"],
};

export class WizardService {
  constructor(
    private db: any,
    private stepRegistry: WizardStepRegistry,
  ) {}

  // --- Lifecycle ---

  async create(orgId: string, userId: string, name: string, frameworkCode = "eu_ai_act") {
    const controls = EU_AI_ACT_CONTROLS;

    const wizard = await this.db.complianceWizard.create({
      data: {
        orgId,
        frameworkCode,
        name,
        createdBy: userId,
        steps: {
          create: controls.map((c) => ({
            controlCode: c.code,
            phase: c.phase,
            state: c.dependencies.length === 0 ? "available" : "locked",
            requirements: JSON.parse(JSON.stringify(c.requirements)),
          })),
        },
        events: {
          create: {
            eventType: "wizard_created",
            actorId: userId,
          },
        },
      },
      include: { steps: { orderBy: { phase: "asc" } }, events: true },
    });

    return wizard;
  }

  async get(wizardId: string, orgId: string) {
    const wizard = await this.db.complianceWizard.findUnique({
      where: { id: wizardId },
      include: {
        steps: { orderBy: { phase: "asc" }, include: { evidence: true } },
        documents: true,
      },
    });
    if (!wizard || wizard.orgId !== orgId) return null;
    return wizard;
  }

  async list(orgId: string) {
    return this.db.complianceWizard.findMany({
      where: { orgId },
      include: {
        steps: { select: { state: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async delete(wizardId: string, orgId: string) {
    const wizard = await this.db.complianceWizard.findUnique({ where: { id: wizardId } });
    if (!wizard || wizard.orgId !== orgId) return null;
    await this.db.complianceWizard.delete({ where: { id: wizardId } });
    return { deleted: true };
  }

  async updateMetadata(wizardId: string, orgId: string, metadata: Record<string, unknown>) {
    const wizard = await this.db.complianceWizard.findUnique({ where: { id: wizardId } });
    if (!wizard || wizard.orgId !== orgId) return null;
    return this.db.complianceWizard.update({
      where: { id: wizardId },
      data: { metadata },
    });
  }

  // --- Step Operations ---

  async updateStep(wizardId: string, code: string, data: StepUpdatePayload, userId: string) {
    const step = await this.getStep(wizardId, code);
    if (!step) return { error: "STEP_NOT_FOUND", status: 404 };

    if (step.state === "locked") {
      return { error: "STEP_LOCKED", status: 409 };
    }

    const updates: any = { updatedAt: new Date() };
    let transitioned = false;

    if (step.state === "available") {
      updates.state = "in_progress";
      transitioned = true;
    }

    if (data.justification !== undefined) {
      updates.justification = data.justification;
    }

    if (data.requirements) {
      const reqs: StepRequirement[] = step.requirements as StepRequirement[];
      for (const update of data.requirements) {
        const req = reqs.find((r) => r.key === update.key);
        if (req) req.completed = update.completed;
      }
      updates.requirements = reqs;
    }

    const updated = await this.db.wizardStep.update({
      where: { id: step.id },
      data: updates,
    });

    if (transitioned) {
      await this.appendEvent(wizardId, code, "step_started", "available", "in_progress", userId);
    }

    await this.recalculateProgress(wizardId);
    return { step: updated };
  }

  async completeStep(wizardId: string, code: string, userId: string) {
    const step = await this.getStep(wizardId, code);
    if (!step) return { error: "STEP_NOT_FOUND", status: 404 };

    if (!canTransition(step.state as StepState, "completed")) {
      return { error: "STEP_LOCKED", status: 409 };
    }

    const reqs = step.requirements as StepRequirement[];
    const check = canComplete(reqs);
    if (!check.valid) {
      return { error: "REQUIREMENTS_INCOMPLETE", status: 422, message: check.error };
    }

    const updated = await this.db.wizardStep.update({
      where: { id: step.id },
      data: { state: "completed", completedAt: new Date() },
    });

    await this.appendEvent(wizardId, code, "step_completed", step.state, "completed", userId);
    await this.unlockDependents(wizardId, userId);
    await this.recalculateProgress(wizardId);
    await this.checkWizardCompletion(wizardId);

    return { step: updated };
  }

  async skipStep(wizardId: string, code: string, reason: string, userId: string) {
    const skipCheck = canSkip(reason);
    if (!skipCheck.valid) {
      return { error: "SKIP_REASON_REQUIRED", status: 400, message: skipCheck.error };
    }

    const step = await this.getStep(wizardId, code);
    if (!step) return { error: "STEP_NOT_FOUND", status: 404 };

    if (!canTransition(step.state as StepState, "skipped")) {
      return { error: "STEP_LOCKED", status: 409 };
    }

    const updated = await this.db.wizardStep.update({
      where: { id: step.id },
      data: { state: "skipped", skipReason: reason },
    });

    await this.appendEvent(wizardId, code, "step_skipped", step.state, "skipped", userId);

    const control = EU_AI_ACT_CONTROL_MAP.get(code);
    if (control?.skipUnlocksDependents) {
      await this.unlockDependents(wizardId, userId);
    }

    await this.recalculateProgress(wizardId);
    return { step: updated };
  }

  // --- Progress ---

  async getProgress(wizardId: string, orgId: string): Promise<WizardProgress | null> {
    const wizard = await this.db.complianceWizard.findUnique({
      where: { id: wizardId },
      include: { steps: true },
    });
    if (!wizard || wizard.orgId !== orgId) return null;

    return this.computeProgress(wizard.steps);
  }

  // --- Document Generation ---

  async canGenerateDocument(wizardId: string, docType: string) {
    const steps = await this.db.wizardStep.findMany({ where: { wizardId } });
    const stateMap = new Map(steps.map((s: any) => [s.controlCode, s.state]));

    const prereqs = DOC_PREREQUISITES[docType];
    if (!prereqs) return { ready: false, blocking: [`Unknown document type: ${docType}`] };

    // Special case: declaration of conformity
    if (docType === "declaration_of_conformity") {
      const progress = this.computeProgress(steps);
      if (progress.overall < 0.9) {
        const blocking = steps
          .filter((s: any) => s.state !== "completed" && s.state !== "skipped")
          .map((s: any) => s.controlCode);
        return { ready: false, blocking };
      }
      return { ready: true, blocking: [] };
    }

    const blocking: string[] = [];
    for (const code of prereqs) {
      const state = stateMap.get(code);
      if (state !== "completed") {
        blocking.push(code);
      }
    }

    return { ready: blocking.length === 0, blocking };
  }

  async generateDocuments(wizardId: string, docTypes: string[], userId: string) {
    const wizard = await this.db.complianceWizard.findUnique({ where: { id: wizardId } });
    if (!wizard) return { error: "NOT_FOUND", status: 404 };
    if (wizard.status === "generating") {
      return { error: "GENERATION_IN_PROGRESS", status: 409 };
    }

    // Check all prerequisites
    for (const docType of docTypes) {
      const check = await this.canGenerateDocument(wizardId, docType);
      if (!check.ready) {
        return { error: "PREREQUISITES_NOT_MET", status: 422, blocking: check.blocking, docType };
      }
    }

    await this.db.complianceWizard.update({
      where: { id: wizardId },
      data: { status: "generating" },
    });

    const documents = [];
    for (const docType of docTypes) {
      const doc = await this.db.wizardDocument.upsert({
        where: { wizardId_documentType: { wizardId, documentType: docType } },
        create: { wizardId, documentType: docType, status: "pending" },
        update: { status: "pending", error: null, generatedAt: null },
      });

      await this.appendEvent(wizardId, null, "document_generated", null, null, userId, { documentType: docType });
      documents.push(doc);
    }

    return { documents };
  }

  // --- Evidence ---

  async uploadEvidence(
    wizardId: string,
    code: string,
    file: { fileName: string; mimeType: string; fileSize: number; storageKey: string; sha256: string },
    userId: string,
  ) {
    const step = await this.getStep(wizardId, code);
    if (!step) return { error: "STEP_NOT_FOUND", status: 404 };
    if (step.state === "locked") return { error: "STEP_LOCKED", status: 409 };
    if (file.fileSize > MAX_EVIDENCE_SIZE) return { error: "FILE_TOO_LARGE", status: 413 };

    const evidence = await this.db.wizardStepEvidence.create({
      data: {
        stepId: step.id,
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        storageKey: file.storageKey,
        sha256: file.sha256,
        uploadedBy: userId,
      },
    });

    await this.appendEvent(wizardId, code, "evidence_uploaded", null, null, userId, {
      evidenceId: evidence.id,
      fileName: file.fileName,
    });

    return { evidence };
  }

  async deleteEvidence(wizardId: string, code: string, evidenceId: string, userId: string) {
    const evidence = await this.db.wizardStepEvidence.findUnique({
      where: { id: evidenceId },
      include: { step: true },
    });

    if (!evidence || evidence.step.wizardId !== wizardId || evidence.step.controlCode !== code) {
      return { error: "NOT_FOUND", status: 404 };
    }

    await this.db.wizardStepEvidence.delete({ where: { id: evidenceId } });

    await this.appendEvent(wizardId, code, "evidence_deleted", null, null, userId, {
      evidenceId,
      fileName: evidence.fileName,
    });

    return { deleted: true };
  }

  // --- Private Helpers ---

  private async getStep(wizardId: string, code: string) {
    return this.db.wizardStep.findUnique({
      where: { wizardId_controlCode: { wizardId, controlCode: code } },
    });
  }

  private async unlockDependents(wizardId: string, userId: string) {
    const steps = await this.db.wizardStep.findMany({ where: { wizardId } });
    const stateMap = new Map<string, StepState>(
      steps.map((s: any) => [s.controlCode, s.state as StepState]),
    );

    const shouldBeAvailable = computeAvailableSteps(EU_AI_ACT_CONTROLS, stateMap);

    for (const code of shouldBeAvailable) {
      const step = steps.find((s: any) => s.controlCode === code);
      if (step && step.state === "locked") {
        await this.db.wizardStep.update({
          where: { id: step.id },
          data: { state: "available" },
        });
        await this.appendEvent(wizardId, code, "step_unlocked", "locked", "available", userId);
      }
    }
  }

  private async recalculateProgress(wizardId: string) {
    const steps = await this.db.wizardStep.findMany({ where: { wizardId } });
    const progress = this.computeProgress(steps);
    await this.db.complianceWizard.update({
      where: { id: wizardId },
      data: { progress: progress.overall },
    });
  }

  private computeProgress(steps: any[]): WizardProgress {
    const total = steps.length;
    const completed = steps.filter((s) => s.state === "completed").length;
    const skipped = steps.filter((s) => s.state === "skipped").length;
    const overall = total > 0 ? (completed + skipped) / total : 0;

    const phaseProgress: Record<number, { completed: number; total: number }> = {};
    for (const step of steps) {
      if (!phaseProgress[step.phase]) {
        phaseProgress[step.phase] = { completed: 0, total: 0 };
      }
      phaseProgress[step.phase].total++;
      if (step.state === "completed" || step.state === "skipped") {
        phaseProgress[step.phase].completed++;
      }
    }

    const stateMap = new Map<string, StepState>(
      steps.map((s) => [s.controlCode, s.state as StepState]),
    );
    const availableSteps = computeAvailableSteps(EU_AI_ACT_CONTROLS, stateMap);

    // Blocking: incomplete steps that are prereqs for any document
    const blocking = new Set<string>();
    for (const prereqs of Object.values(DOC_PREREQUISITES)) {
      for (const code of prereqs) {
        const state = stateMap.get(code);
        if (state !== "completed") blocking.add(code);
      }
    }

    return {
      overall,
      completedSteps: completed,
      totalSteps: total,
      skippedSteps: skipped,
      phaseProgress,
      availableSteps,
      blockingSteps: Array.from(blocking),
    };
  }

  private async checkWizardCompletion(wizardId: string) {
    const steps = await this.db.wizardStep.findMany({ where: { wizardId } });
    const allDone = steps.every((s: any) => s.state === "completed" || s.state === "skipped");
    if (allDone) {
      await this.db.complianceWizard.update({
        where: { id: wizardId },
        data: { status: "completed", completedAt: new Date() },
      });
    }
  }

  private async appendEvent(
    wizardId: string,
    controlCode: string | null,
    eventType: string,
    previousState: string | null,
    newState: string | null,
    actorId: string,
    metadata: Record<string, unknown> = {},
  ) {
    await this.db.wizardEvent.create({
      data: { wizardId, controlCode, eventType, previousState, newState, actorId, metadata },
    });
  }
}
