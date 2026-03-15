import { describe, it, expect, vi, beforeEach } from "vitest";
import { DecisionTraceService } from "../decision-trace/service.js";

function mockDb() {
  return {
    decisionTrace: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

const AI_RAW_DATA = {
  trace: {
    toolName: "copilot",
    promptHash: null,
    promptCategory: "code-completion",
    overallScore: 0.72,
    signals: {
      entropy: { weight: 0.25, rawValue: 3.5, probability: 0.8, contribution: 0.20, detail: {} },
      markers: { weight: 0.35, rawValue: 2, probability: 0.8, contribution: 0.28, detail: {} },
    },
  },
};

describe("DecisionTraceService", () => {
  let db: ReturnType<typeof mockDb>;
  let service: DecisionTraceService;

  beforeEach(() => {
    db = mockDb();
    service = new DecisionTraceService(db);
  });

  it("creates a trace from AI finding rawData", async () => {
    await service.createFromFinding("f1", "org1", "s1", AI_RAW_DATA);
    expect(db.decisionTrace.create).toHaveBeenCalledOnce();
    const call = db.decisionTrace.create.mock.calls[0][0];
    expect(call.data.findingId).toBe("f1");
    expect(call.data.toolName).toBe("copilot");
    expect(call.data.overallScore).toBe(0.72);
  });

  it("skips creation for non-AI findings (no trace key)", async () => {
    await service.createFromFinding("f2", "org1", "s1", { some: "data" });
    expect(db.decisionTrace.create).not.toHaveBeenCalled();
  });

  it("enriches trace with declared metadata", async () => {
    await service.enrichWithDeclared("f1", "cursor", "claude-sonnet-4-20250514");
    expect(db.decisionTrace.update).toHaveBeenCalledOnce();
    const call = db.decisionTrace.update.mock.calls[0][0];
    expect(call.where.findingId).toBe("f1");
    expect(call.data.declaredTool).toBe("cursor");
    expect(call.data.declaredModel).toBe("claude-sonnet-4-20250514");
    expect(call.data.enrichedAt).toBeInstanceOf(Date);
  });

  it("getByFindingId delegates to findUnique", async () => {
    await service.getByFindingId("f1");
    expect(db.decisionTrace.findUnique).toHaveBeenCalledWith({ where: { findingId: "f1" } });
  });

  it("getByScanId delegates to findMany ordered by createdAt", async () => {
    await service.getByScanId("s1");
    expect(db.decisionTrace.findMany).toHaveBeenCalledWith({
      where: { scanId: "s1" },
      orderBy: { createdAt: "asc" },
    });
  });
});
