import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock PrismaClient for route tests
const mockDb = {
  approvalPolicy: {
    create: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  approvalGate: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
  approvalDecision: {
    create: vi.fn(),
  },
  scan: {
    update: vi.fn(),
  },
};

vi.mock("@sentinel/db", () => ({
  getDb: () => mockDb,
  withTenant: (_db: any, _orgId: string, fn: any) => fn(mockDb),
  disconnectDb: vi.fn(),
}));

vi.mock("@sentinel/events", () => ({
  EventBus: vi.fn().mockImplementation(() => ({
    publish: vi.fn(),
    subscribe: vi.fn(),
    disconnect: vi.fn(),
  })),
  withRetry: vi.fn().mockImplementation((_r, _s, handler) => handler),
  getDlqDepth: vi.fn().mockResolvedValue(0),
  readDlq: vi.fn().mockResolvedValue([]),
}));

import { buildApprovalRoutes } from "./approvals.js";

describe("buildApprovalRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createPolicy", () => {
    it("creates a policy with valid input", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalPolicy.create.mockResolvedValue({ id: "pol-1", name: "Test" });

      const result = await routes.createPolicy("org-1", {
        name: "Risk Gate",
        strategyType: "risk_threshold",
        config: { autoPassBelow: 30, autoBlockAbove: 70 },
      });

      expect(result).toHaveProperty("id", "pol-1");
      expect(mockDb.approvalPolicy.create).toHaveBeenCalled();
    });
  });

  describe("listPendingGates", () => {
    it("returns gates ordered by priority", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalGate.findMany.mockResolvedValue([
        { id: "g1", priority: 90, status: "escalated" },
        { id: "g2", priority: 50, status: "pending" },
      ]);

      const result = await routes.listPendingGates("org-1");
      expect(result.gates).toHaveLength(2);
    });
  });

  describe("submitDecision", () => {
    it("rejects decision on non-pending gate", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalGate.findUnique.mockResolvedValue({
        id: "g1",
        status: "approved",
        orgId: "org-1",
      });

      await expect(
        routes.submitDecision("org-1", "g1", {
          decision: "approve",
          justification: "Looks good to me",
          decidedBy: "user-1",
        }),
      ).rejects.toThrow();
    });

    it("requires justification of at least 10 characters", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalGate.findUnique.mockResolvedValue({
        id: "g1",
        status: "pending",
        orgId: "org-1",
      });

      await expect(
        routes.submitDecision("org-1", "g1", {
          decision: "approve",
          justification: "ok",
          decidedBy: "user-1",
        }),
      ).rejects.toThrow("at least 10");
    });

    it("approves a pending gate", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalGate.findUnique.mockResolvedValue({
        id: "g1",
        status: "pending",
        orgId: "org-1",
        scanId: "scan-1",
      });
      mockDb.approvalGate.update.mockResolvedValue({ id: "g1", status: "approved" });
      mockDb.approvalDecision.create.mockResolvedValue({ id: "dec-1" });

      const result = await routes.submitDecision("org-1", "g1", {
        decision: "approve",
        justification: "Risk is acceptable after review",
        decidedBy: "user-1",
      });

      expect(result.status).toBe("approved");
      expect(mockDb.approvalDecision.create).toHaveBeenCalled();
    });
  });
});
