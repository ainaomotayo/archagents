import { EU_AI_ACT_CONTROLS, EU_AI_ACT_CONTROL_MAP } from "./eu-ai-act-controls.js";
import { computeAvailableSteps } from "./dag.js";
import { canTransition, validateTransition, canComplete, canSkip } from "./fsm.js";
import type { WizardStepHandler } from "./step-handler.js";
import { WizardStepRegistry } from "./step-handler.js";
import type { StepState, StepRequirement, WizardProgress, StepUpdatePayload, WizardDocumentType } from "./types.js";
import type { ReportStorage } from "../reports/storage.js";
import type { TechnicalDocData } from "../reports/EuAiActTechnicalDoc.js";
import type { DeclarationData } from "../reports/EuAiActDeclaration.js";
import type { InstructionsData } from "../reports/EuAiActInstructions.js";
import type { MonitoringPlanData } from "../reports/EuAiActMonitoring.js";

const MAX_EVIDENCE_SIZE = 50 * 1024 * 1024; // 50 MB

const DOC_PREREQUISITES: Record<string, string[]> = {
  technical_documentation: ["AIA-9", "AIA-10", "AIA-12", "AIA-14", "AIA-15"],
  declaration_of_conformity: [], // special: all non-skipped completed, progress >= 0.9
  instructions_for_use: ["AIA-9", "AIA-10", "AIA-13", "AIA-14", "AIA-15"],
  post_market_monitoring: ["AIA-17", "AIA-60", "AIA-61"],
};

export class WizardService {
  private storage: ReportStorage | null;

  constructor(
    private db: any,
    private stepRegistry: WizardStepRegistry,
    storage?: ReportStorage,
  ) {
    this.storage = storage ?? null;
  }

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
    const wizard = await this.db.complianceWizard.findUnique({
      where: { id: wizardId },
      include: { steps: { include: { evidence: true } } },
    });
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
    const stepMap = new Map<string, any>(wizard.steps.map((s: any) => [s.controlCode, s]));
    const metadata = (wizard.metadata as Record<string, unknown>) ?? {};
    const systemName = (metadata.systemName as string) || wizard.name;
    const provider = (metadata.provider as string) || "Organization";

    for (const docType of docTypes) {
      let doc = await this.db.wizardDocument.upsert({
        where: { wizardId_documentType: { wizardId, documentType: docType } },
        create: { wizardId, documentType: docType, status: "generating" },
        update: { status: "generating", error: null, generatedAt: null },
      });

      try {
        const pdfBuffer = await this.renderDocument(docType, stepMap, systemName, provider, wizard);

        let reportId: string | null = null;
        if (this.storage && pdfBuffer) {
          const storageKey = `wizards/${wizardId}/${docType}.pdf`;
          await this.storage.upload(storageKey, pdfBuffer, "application/pdf");

          const report = await this.db.report.create({
            data: {
              orgId: wizard.orgId,
              type: `wizard_${docType}`,
              status: "completed",
              storageKey,
              parameters: { wizardId, docType },
              expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
            },
          });
          reportId = report.id;
        }

        doc = await this.db.wizardDocument.update({
          where: { id: doc.id },
          data: { status: "ready", reportId, generatedAt: new Date() },
        });
      } catch (err: any) {
        doc = await this.db.wizardDocument.update({
          where: { id: doc.id },
          data: { status: "failed", error: err.message ?? "Generation failed" },
        });
      }

      await this.appendEvent(wizardId, null, "document_generated", null, null, userId, { documentType: docType });
      documents.push(doc);
    }

    // Reset wizard status from "generating" back to previous
    const allDone = wizard.steps.every((s: any) => s.state === "completed" || s.state === "skipped");
    await this.db.complianceWizard.update({
      where: { id: wizardId },
      data: { status: allDone ? "completed" : "active" },
    });

    return { documents };
  }

  private async renderDocument(
    docType: string,
    stepMap: Map<string, any>,
    systemName: string,
    provider: string,
    wizard: any,
  ): Promise<Buffer> {
    const {
      generateEuAiActTechnicalDocPdf,
      generateEuAiActDeclarationPdf,
      generateEuAiActInstructionsPdf,
      generateEuAiActMonitoringPdf,
    } = await import("../reports/generator.js");

    const getReqs = (code: string) => (stepMap.get(code)?.requirements ?? []) as StepRequirement[];
    const getJustification = (code: string) => (stepMap.get(code)?.justification as string) ?? "";
    const getEvidence = (code: string) =>
      (stepMap.get(code)?.evidence ?? []).map((e: any) => ({
        fileName: e.fileName,
        sha256: e.sha256,
        controlCode: code,
        uploadedAt: e.uploadedAt?.toISOString?.() ?? e.uploadedAt ?? "",
      }));

    const allEvidence = Array.from(stepMap.keys()).flatMap(getEvidence);

    switch (docType) {
      case "technical_documentation": {
        const data: TechnicalDocData = {
          systemName,
          provider,
          version: "1.0",
          generatedAt: new Date().toISOString(),
          sections: {
            systemOverview: getJustification("AIA-11") || `Technical documentation for ${systemName}.`,
            riskClassification: { text: getJustification("AIA-9") || "Risk management assessment.", requirements: getReqs("AIA-9") },
            dataGovernance: { text: getJustification("AIA-10") || "Data governance procedures.", requirements: getReqs("AIA-10") },
            algorithmDesign: getJustification("AIA-11") || "System design and development process.",
            humanOversight: { text: getJustification("AIA-14") || "Human oversight mechanisms.", requirements: getReqs("AIA-14") },
            accuracyRobustness: { text: getJustification("AIA-15") || "Accuracy and robustness measures.", requirements: getReqs("AIA-15") },
            logging: { text: getJustification("AIA-12") || "Record-keeping procedures.", requirements: getReqs("AIA-12") },
          },
          evidenceIndex: allEvidence,
        };
        return generateEuAiActTechnicalDocPdf(data);
      }
      case "declaration_of_conformity": {
        const controlStatuses = EU_AI_ACT_CONTROLS.map((c) => {
          const step = stepMap.get(c.code);
          return { code: c.code, title: c.title, status: step?.state ?? "locked" };
        });
        const data: DeclarationData = {
          declarationId: `DOC-${wizard.id.slice(0, 8).toUpperCase()}`,
          date: new Date().toISOString(),
          provider: { name: provider, address: "", contact: "" },
          system: { name: systemName, version: "1.0", identifier: wizard.id },
          conformityAssessment: getJustification("AIA-47") || "Internal conformity assessment completed.",
          standardsApplied: ["EU AI Act (Regulation 2024/1689)", "ISO/IEC 42001:2023"],
          controlStatuses,
          signatoryName: "",
          signatoryPosition: "",
        };
        return generateEuAiActDeclarationPdf(data);
      }
      case "instructions_for_use": {
        const data: InstructionsData = {
          systemName,
          provider: { name: provider, contact: "", support: "" },
          generatedAt: new Date().toISOString(),
          sections: {
            intendedPurpose: getJustification("AIA-13") || "System purpose and intended use.",
            transparencyObligations: getJustification("AIA-13") || "Transparency obligations.",
            humanOversightInstructions: getJustification("AIA-14") || "Human oversight instructions.",
            knownLimitations: getJustification("AIA-13") || "Known limitations and risks.",
            inputDataSpecifications: getJustification("AIA-10") || "Input data specifications.",
            maintenanceUpdates: getJustification("AIA-15") || "Maintenance and update procedures.",
          },
        };
        return generateEuAiActInstructionsPdf(data);
      }
      case "post_market_monitoring": {
        const data: MonitoringPlanData = {
          systemName,
          generatedAt: new Date().toISOString(),
          sections: {
            monitoringScope: getJustification("AIA-61") || "Monitoring scope and objectives.",
            dataCollection: getJustification("AIA-61") || "Data collection procedures.",
            performanceMonitoring: getJustification("AIA-17") || "Performance monitoring approach.",
            incidentReporting: getJustification("AIA-60") || "Incident reporting procedures.",
            correctiveActions: getJustification("AIA-60") || "Corrective action procedures.",
            reviewCadence: getJustification("AIA-61") || "Review and reporting cadence.",
            qmsIntegration: getJustification("AIA-17") || "Quality management system integration.",
          },
        };
        return generateEuAiActMonitoringPdf(data);
      }
      default:
        throw new Error(`Unknown document type: ${docType}`);
    }
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
