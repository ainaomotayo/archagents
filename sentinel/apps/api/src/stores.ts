import type { PrismaClient } from "@sentinel/db";

export function createScanStore(db: PrismaClient) {
  return {
    async create(args: { data: Record<string, unknown> }) {
      return db.scan.create({ data: args.data as any });
    },
    async findUnique(args: { where: { id: string } }) {
      return db.scan.findUnique({
        where: args.where,
        include: { findings: true, certificate: true, agentResults: true },
      });
    },
  };
}

export function createAuditEventStore(db: PrismaClient) {
  return {
    async findFirst(args: any) {
      return db.auditEvent.findFirst(args);
    },
    async create(args: any) {
      return db.auditEvent.create(args);
    },
  };
}

export function createAssessmentStore(db: PrismaClient) {
  return {
    async saveAssessment(data: any) {
      await db.scan.update({
        where: { id: data.scanId },
        data: {
          status: data.status,
          riskScore: data.riskScore,
          completedAt: new Date(),
        },
      });
    },
    async saveCertificate(data: any) {
      await db.certificate.create({
        data: {
          scanId: data.scanId,
          orgId: data.orgId,
          status: data.status ?? "provisional_pass",
          riskScore: data.riskScore ?? 0,
          verdict: JSON.parse(data.certificateJson || "{}").verdict ?? {},
          scanMetadata: JSON.parse(data.certificateJson || "{}").scanMetadata ?? {},
          compliance: JSON.parse(data.certificateJson || "{}").compliance ?? {},
          signature: data.signature,
          expiresAt: new Date(data.expiresAt),
        },
      });
    },
  };
}
