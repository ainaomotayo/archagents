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

    it("rejects invalid strategy type on create", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });

      await expect(
        routes.createPolicy("org-1", { name: "Bad", strategyType: "invalid_type" }),
      ).rejects.toThrow("Invalid strategy type");
    });
  });

  describe("listPolicies", () => {
    it("returns policies for the given org", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalPolicy.findMany.mockResolvedValue([{ id: "pol-1", orgId: "org-1" }]);

      const result = await routes.listPolicies("org-1");
      expect(result).toHaveLength(1);
      expect(mockDb.approvalPolicy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { orgId: "org-1" } }),
      );
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

    it("rejects decision for gate in different org", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalGate.findUnique.mockResolvedValue({
        id: "g1",
        status: "pending",
        orgId: "org-other",
      });

      await expect(
        routes.submitDecision("org-1", "g1", {
          decision: "approve",
          justification: "Risk is acceptable after review",
          decidedBy: "user-1",
        }),
      ).rejects.toThrow("not found");
    });

    it("rejects invalid decision value", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalGate.findUnique.mockResolvedValue({
        id: "g1",
        status: "pending",
        orgId: "org-1",
      });

      await expect(
        routes.submitDecision("org-1", "g1", {
          decision: "maybe",
          justification: "Risk is acceptable after review",
          decidedBy: "user-1",
        }),
      ).rejects.toThrow("Invalid decision");
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
      const decisionData = mockDb.approvalDecision.create.mock.calls[0][0].data;
      expect(decisionData.orgId).toBe("org-1");
    });
  });

  describe("updatePolicy", () => {
    it("updates an existing policy", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalPolicy.findUnique.mockResolvedValue({ id: "pol-1", orgId: "org-1" });
      mockDb.approvalPolicy.update.mockResolvedValue({ id: "pol-1", name: "Updated" });

      const result = await routes.updatePolicy("org-1", "pol-1", { name: "Updated" });
      expect(result).toHaveProperty("name", "Updated");
    });

    it("rejects update for non-existent policy", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalPolicy.findUnique.mockResolvedValue(null);

      await expect(routes.updatePolicy("org-1", "pol-1", { name: "X" })).rejects.toThrow("not found");
    });

    it("rejects update for wrong org", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalPolicy.findUnique.mockResolvedValue({ id: "pol-1", orgId: "org-other" });

      await expect(routes.updatePolicy("org-1", "pol-1", { name: "X" })).rejects.toThrow("not found");
    });

    it("rejects invalid strategy type on update", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalPolicy.findUnique.mockResolvedValue({ id: "pol-1", orgId: "org-1" });

      await expect(
        routes.updatePolicy("org-1", "pol-1", { strategyType: "invalid_type" }),
      ).rejects.toThrow("Invalid strategy type");
    });
  });

  describe("deletePolicy", () => {
    it("deletes an existing policy", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalPolicy.findUnique.mockResolvedValue({ id: "pol-1", orgId: "org-1" });
      mockDb.approvalPolicy.delete.mockResolvedValue({ id: "pol-1" });

      const result = await routes.deletePolicy("org-1", "pol-1");
      expect(result).toHaveProperty("id", "pol-1");
    });

    it("rejects delete for wrong org", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalPolicy.findUnique.mockResolvedValue({ id: "pol-1", orgId: "org-other" });

      await expect(routes.deletePolicy("org-1", "pol-1")).rejects.toThrow("not found");
    });
  });

  describe("getGate", () => {
    it("returns gate for matching org", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalGate.findUnique.mockResolvedValue({ id: "g1", orgId: "org-1", status: "pending" });

      const result = await routes.getGate("org-1", "g1");
      expect(result).toHaveProperty("id", "g1");
    });

    it("returns null for wrong org", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalGate.findUnique.mockResolvedValue({ id: "g1", orgId: "org-other" });

      const result = await routes.getGate("org-1", "g1");
      expect(result).toBeNull();
    });
  });

  describe("reassignGate", () => {
    it("reassigns a non-terminal gate", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalGate.findUnique.mockResolvedValue({ id: "g1", orgId: "org-1", status: "pending" });
      mockDb.approvalGate.update.mockResolvedValue({ id: "g1", assignedTo: "user-2" });

      const result = await routes.reassignGate("org-1", "g1", { assignedTo: "user-2" });
      expect(result).toHaveProperty("assignedTo", "user-2");
    });

    it("rejects reassignment for gate in different org", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalGate.findUnique.mockResolvedValue({ id: "g1", orgId: "org-other", status: "pending" });

      await expect(routes.reassignGate("org-1", "g1", { assignedTo: "user-2" })).rejects.toThrow("not found");
      expect(mockDb.approvalGate.update).not.toHaveBeenCalled();
    });

    it("rejects reassignment of terminal gate", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalGate.findUnique.mockResolvedValue({ id: "g1", orgId: "org-1", status: "approved" });

      await expect(routes.reassignGate("org-1", "g1", { assignedTo: "user-2" })).rejects.toThrow("terminal");
    });
  });

  describe("getStats", () => {
    it("returns queue stats", async () => {
      const routes = buildApprovalRoutes({ db: mockDb as any });
      mockDb.approvalGate.count
        .mockResolvedValueOnce(3)  // pending
        .mockResolvedValueOnce(1)  // escalated
        .mockResolvedValueOnce(5)  // approvedToday
        .mockResolvedValueOnce(2); // rejectedToday

      const result = await routes.getStats("org-1");
      expect(result).toEqual({
        pending: 3,
        escalated: 1,
        approvedToday: 5,
        rejectedToday: 2,
        queueDepth: 4,
      });
    });
  });
});
