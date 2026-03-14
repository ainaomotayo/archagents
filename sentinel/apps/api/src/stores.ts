import type { PrismaClient } from "@sentinel/db";
import { DecisionTraceService, IPAttributionService } from "@sentinel/compliance";

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

// Map confidence string to float for Prisma
const CONFIDENCE_MAP: Record<string, number> = {
  high: 0.9,
  medium: 0.7,
  low: 0.5,
};

export function createAssessmentStore(db: PrismaClient) {
  return {
    async saveAssessment(data: any) {
      // 1. Update scan status and risk score
      await db.scan.update({
        where: { id: data.scanId },
        data: {
          status: data.status,
          riskScore: data.riskScore,
          completedAt: new Date(),
        },
      });

      // 2. Persist all findings to the database
      if (Array.isArray(data.findings) && data.findings.length > 0) {
        const findingRecords = data.findings.map((f: any) => ({
          scanId: data.scanId,
          orgId: data.orgId,
          agentName: f.scanner ?? f.agentName ?? "unknown",
          type: f.type ?? "security",
          severity: f.severity ?? "medium",
          category: f.category ?? null,
          file: f.file ?? "",
          lineStart: f.lineStart ?? f.line_start ?? 0,
          lineEnd: f.lineEnd ?? f.line_end ?? 0,
          title: f.title ?? null,
          description: f.description ?? null,
          remediation: f.remediation ?? null,
          cweId: f.cweId ?? f.cwe_id ?? null,
          confidence:
            typeof f.confidence === "number"
              ? f.confidence
              : CONFIDENCE_MAP[f.confidence] ?? 0.7,
          rawData: f,
        }));
        await db.finding.createMany({ data: findingRecords });

        // 2b. Create DecisionTrace rows for AI detector findings
        const aiFindings = findingRecords.filter(
          (r: any) => r.agentName === "ai-detector",
        );
        if (aiFindings.length > 0) {
          const persisted = await db.finding.findMany({
            where: { scanId: data.scanId, agentName: "ai-detector" },
            select: { id: true, rawData: true, orgId: true },
          });
          const traceService = new DecisionTraceService(db);
          for (const f of persisted) {
            try {
              await traceService.createFromFinding(
                f.id,
                f.orgId,
                data.scanId,
                f.rawData,
              );
            } catch {
              // Best-effort — trace creation failure should not block assessment
            }
          }
        }

        // 2c: Generate IP attribution certificate (best-effort)
        try {
          const ipService = new IPAttributionService(db);
          await ipService.generateForScan(
            data.scanId,
            findingRecords[0]?.orgId ?? "",
            process.env.SENTINEL_SECRET ?? "",
          );
        } catch {
          // Non-fatal — certificate generation is best-effort
        }
      }

      // 3. Persist agent results
      if (Array.isArray(data.agentResults) && data.agentResults.length > 0) {
        const agentRecords = data.agentResults.map((ar: any) => ({
          scanId: data.scanId,
          agentName: ar.agentName ?? "unknown",
          agentVersion: ar.agentVersion ?? "0.0.0",
          rulesetVersion: ar.rulesetVersion ?? "",
          rulesetHash: ar.rulesetHash ?? "",
          status: ar.status ?? "completed",
          findingCount: ar.findingCount ?? 0,
          durationMs: ar.durationMs ?? 0,
          errorDetail: ar.errorDetail ?? null,
        }));
        await db.agentResult.createMany({ data: agentRecords });
      }
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
