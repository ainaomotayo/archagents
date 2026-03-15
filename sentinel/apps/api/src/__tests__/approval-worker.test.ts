import { describe, it, expect, vi, beforeEach } from "vitest";
import { processEscalations, processExpirations } from "../approval-worker.js";

const mockDb = {
  approvalGate: {
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
  },
  scan: { update: vi.fn() },
};

const mockEventBus = {
  publish: vi.fn(),
};

describe("approval-worker", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("processEscalations", () => {
    it("escalates gates past escalatesAt deadline", async () => {
      const gate = {
        id: "g1",
        orgId: "org-1",
        scanId: "scan-1",
        status: "pending",
        escalatesAt: new Date(Date.now() - 1000),
        assignedRole: "manager",
        priority: 50,
      };
      mockDb.approvalGate.findMany.mockResolvedValue([gate]);
      mockDb.approvalGate.update.mockResolvedValue({ ...gate, status: "escalated" });

      const count = await processEscalations(mockDb as any, mockEventBus as any);
      expect(count).toBe(1);
      expect(mockDb.approvalGate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "g1" },
          data: expect.objectContaining({
            status: "escalated",
            assignedRole: "admin",
            priority: 90,
          }),
        }),
      );
    });

    it("does nothing when no gates need escalation", async () => {
      mockDb.approvalGate.findMany.mockResolvedValue([]);
      const count = await processEscalations(mockDb as any, mockEventBus as any);
      expect(count).toBe(0);
    });
  });

  describe("processExpirations", () => {
    it("expires gates past expiresAt and applies expiryAction=reject", async () => {
      const gate = {
        id: "g1",
        orgId: "org-1",
        scanId: "scan-1",
        status: "pending",
        expiresAt: new Date(Date.now() - 1000),
        expiryAction: "reject",
      };
      mockDb.approvalGate.findMany.mockResolvedValue([gate]);
      mockDb.approvalGate.update.mockResolvedValue({ ...gate, status: "expired" });

      const count = await processExpirations(mockDb as any, mockEventBus as any);
      expect(count).toBe(1);
      expect(mockDb.scan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ approvalStatus: "rejected" }),
        }),
      );
    });

    it("applies expiryAction=approve and publishes certificate request", async () => {
      const gate = {
        id: "g1",
        orgId: "org-1",
        scanId: "scan-1",
        status: "escalated",
        expiresAt: new Date(Date.now() - 1000),
        expiryAction: "approve",
      };
      mockDb.approvalGate.findMany.mockResolvedValue([gate]);
      mockDb.approvalGate.update.mockResolvedValue({ ...gate, status: "expired" });

      const count = await processExpirations(mockDb as any, mockEventBus as any);
      expect(count).toBe(1);
      expect(mockDb.scan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ approvalStatus: "approved" }),
        }),
      );
    });
  });
});
