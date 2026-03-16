import { WizardService, euAiActRegistry } from "@sentinel/compliance";

interface WizardRouteDeps {
  db: any;
}

export function buildWizardRoutes(deps: WizardRouteDeps) {
  const { db } = deps;
  const service = new WizardService(db, euAiActRegistry);

  return {
    async createWizard(orgId: string, userId: string, body: any) {
      const { name, frameworkCode } = body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return { error: "Name is required", status: 400 };
      }
      try {
        return await service.create(orgId, userId, name.trim(), frameworkCode);
      } catch (err: any) {
        if (err.code === "P2002") { // Prisma unique constraint
          return { error: "DUPLICATE_WIZARD", status: 409 };
        }
        throw err;
      }
    },

    async listWizards(orgId: string) {
      return service.list(orgId);
    },

    async getWizard(wizardId: string, orgId: string) {
      return service.get(wizardId, orgId);
    },

    async deleteWizard(wizardId: string, orgId: string) {
      return service.delete(wizardId, orgId);
    },

    async updateWizardMetadata(wizardId: string, orgId: string, metadata: Record<string, unknown>) {
      return service.updateMetadata(wizardId, orgId, metadata);
    },

    async getStep(wizardId: string, code: string, orgId: string) {
      // Verify wizard belongs to org first
      const wizard = await service.get(wizardId, orgId);
      if (!wizard) return null;
      const step = wizard.steps.find((s: any) => s.controlCode === code);
      return step ?? null;
    },

    async updateStep(wizardId: string, code: string, body: any, userId: string) {
      return service.updateStep(wizardId, code, body, userId);
    },

    async completeStep(wizardId: string, code: string, userId: string) {
      return service.completeStep(wizardId, code, userId);
    },

    async skipStep(wizardId: string, code: string, body: any, userId: string) {
      const { reason } = body;
      return service.skipStep(wizardId, code, reason ?? "", userId);
    },

    async uploadEvidence(wizardId: string, code: string, file: any, userId: string) {
      return service.uploadEvidence(wizardId, code, file, userId);
    },

    async deleteEvidence(wizardId: string, code: string, evidenceId: string, userId: string) {
      return service.deleteEvidence(wizardId, code, evidenceId, userId);
    },

    async getProgress(wizardId: string, orgId: string) {
      return service.getProgress(wizardId, orgId);
    },

    async canGenerateDocument(wizardId: string, docType: string) {
      return service.canGenerateDocument(wizardId, docType);
    },

    async generateDocuments(wizardId: string, body: any, userId: string) {
      const { documentTypes } = body;
      if (!Array.isArray(documentTypes) || documentTypes.length === 0) {
        return { error: "documentTypes array required", status: 400 };
      }
      return service.generateDocuments(wizardId, documentTypes, userId);
    },

    async listDocuments(wizardId: string, orgId: string) {
      const wizard = await service.get(wizardId, orgId);
      if (!wizard) return null;
      return wizard.documents ?? [];
    },
  };
}
