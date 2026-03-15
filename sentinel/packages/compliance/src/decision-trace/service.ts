import { extractTrace } from "./extract.js";

export class DecisionTraceService {
  constructor(private db: any) {}

  async createFromFinding(
    findingId: string,
    orgId: string,
    scanId: string,
    rawData: unknown,
  ): Promise<void> {
    const trace = extractTrace(rawData);
    if (!trace) return;

    await this.db.decisionTrace.create({
      data: {
        findingId,
        orgId,
        scanId,
        toolName: trace.toolName,
        promptHash: trace.promptHash,
        promptCategory: trace.promptCategory,
        overallScore: trace.overallScore,
        signals: trace.signals,
      },
    });
  }

  async enrichWithDeclared(
    findingId: string,
    declaredTool: string,
    declaredModel: string,
  ): Promise<void> {
    await this.db.decisionTrace.update({
      where: { findingId },
      data: {
        declaredTool,
        declaredModel,
        modelVersion: declaredModel,
        enrichedAt: new Date(),
      },
    });
  }

  async getByFindingId(findingId: string) {
    return this.db.decisionTrace.findUnique({ where: { findingId } });
  }

  async getByScanId(scanId: string) {
    return this.db.decisionTrace.findMany({
      where: { scanId },
      orderBy: { createdAt: "asc" },
    });
  }
}
