import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApprovalRoutes } from "../routes.js";

function createMockDb() {
  const gates: any[] = [];
  const decisions: any[] = [];

  return {
    approvalGate: {
      findMany: vi.fn(async (args: any) => {
        let result = [...gates];
        if (args?.where?.status) {
          if (typeof args.where.status === "string") {
            result = result.filter((g: any) => g.status === args.where.status);
          } else if (args.where.status?.in) {
            result = result.filter((g: any) => args.where.status.in.includes(g.status));
          }
        }
        if (args?.where?.orgId) result = result.filter((g: any) => g.orgId === args.where.orgId);
        return result;
      }),
      findUnique: vi.fn(async (args: any) => gates.find((g: any) => g.id === args.where.id) ?? null),
      findFirst: vi.fn(async (args: any) => {
        let result = gates.find((g: any) => g.id === args.where.id);
        if (result && args.where.orgId && result.orgId !== args.where.orgId) return null;
        return result ?? null;
      }),
      count: vi.fn(async (args: any) => {
        let result = [...gates];
        if (args?.where?.status) {
          const status = typeof args.where.status === "string" ? args.where.status : null;
          if (status) result = result.filter((g: any) => g.status === status);
        }
        if (args?.where?.orgId) result = result.filter((g: any) => g.orgId === args.where.orgId);
        return result.length;
      }),
      update: vi.fn(async (args: any) => {
        const gate = gates.find((g: any) => g.id === args.where.id);
        if (!gate) return null;
        Object.assign(gate, args.data);
        return gate;
      }),
      create: vi.fn(async (args: any) => {
        const gate = { id: `gate-${gates.length + 1}`, ...args.data, decisions: [] };
        gates.push(gate);
        return gate;
      }),
    },
    approvalDecision: {
      create: vi.fn(async (args: any) => {
        const d = { id: `dec-${decisions.length + 1}`, ...args.data };
        decisions.push(d);
        return d;
      }),
    },
    _gates: gates,
    _decisions: decisions,
  };
}

function createMockEventBus() {
  return { publish: vi.fn(async () => {}) };
}

function createMockAuditLog() {
  return { append: vi.fn(async () => {}) };
}

describe("buildApprovalRoutes", () => {
  let db: ReturnType<typeof createMockDb>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let auditLog: ReturnType<typeof createMockAuditLog>;
  let routes: ReturnType<typeof buildApprovalRoutes>;

  beforeEach(() => {
    db = createMockDb();
    eventBus = createMockEventBus();
    auditLog = createMockAuditLog();
    routes = buildApprovalRoutes({ db: db as any, eventBus: eventBus as any, auditLog: auditLog as any });
  });

  describe("listGates", () => {
    it("returns empty list when no gates", async () => {
      const result = await routes.listGates({ orgId: "org-1", limit: 50, offset: 0 });
      expect(result.gates).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("passes status filter to query", async () => {
      db._gates.push({ id: "g1", orgId: "org-1", status: "pending" });
      db._gates.push({ id: "g2", orgId: "org-1", status: "approved" });
      await routes.listGates({ orgId: "org-1", limit: 50, offset: 0, status: "pending" });
      expect(db.approvalGate.findMany).toHaveBeenCalled();
      const call = db.approvalGate.findMany.mock.calls[0][0];
      expect(call.where.status).toBe("pending");
    });
  });

  describe("getGate", () => {
    it("returns null for missing gate", async () => {
      const result = await routes.getGate("nonexistent", "org-1");
      expect(result).toBeNull();
    });

    it("returns gate when found", async () => {
      db._gates.push({ id: "g1", status: "pending", orgId: "org-1" });
      const result = await routes.getGate("g1", "org-1");
      expect(result).toBeTruthy();
      expect(result!.id).toBe("g1");
    });

    it("returns null for gate in different org", async () => {
      db._gates.push({ id: "g1", status: "pending", orgId: "org-2" });
      const result = await routes.getGate("g1", "org-1");
      expect(result).toBeNull();
    });
  });

  describe("decideGate", () => {
    it("returns 404 for missing gate", async () => {
      const result = await routes.decideGate({
        gateId: "nonexistent", orgId: "org-1", decidedBy: "user-1",
        decision: "approve", justification: "looks good to me",
      });
      expect(result.error).toBeDefined();
      expect(result.status).toBe(404);
    });

    it("returns 409 for terminal gate", async () => {
      db._gates.push({ id: "g1", status: "approved", orgId: "org-1" });
      const result = await routes.decideGate({
        gateId: "g1", orgId: "org-1", decidedBy: "user-1",
        decision: "reject", justification: "test reason here",
      });
      expect(result.error).toBeDefined();
      expect(result.status).toBe(409);
    });

    it("approves a pending gate", async () => {
      db._gates.push({ id: "g1", status: "pending", orgId: "org-1", scanId: "s1" });
      const result = await routes.decideGate({
        gateId: "g1", orgId: "org-1", decidedBy: "user-1",
        decision: "approve", justification: "looks good to me",
      });
      expect(result.error).toBeUndefined();
      expect(db.approvalGate.update).toHaveBeenCalled();
      expect(db.approvalDecision.create).toHaveBeenCalled();
    });

    it("publishes event with correct payload and logs audit", async () => {
      db._gates.push({ id: "g1", status: "pending", orgId: "org-1", scanId: "s1" });
      await routes.decideGate({
        gateId: "g1", orgId: "org-1", decidedBy: "user-1",
        decision: "approve", justification: "looks good to me",
      });
      expect(eventBus.publish).toHaveBeenCalledWith(
        "sentinel.notifications",
        expect.objectContaining({
          orgId: "org-1",
          topic: "gate.decided",
          timestamp: expect.any(String),
        }),
      );
      expect(auditLog.append).toHaveBeenCalledWith(
        "org-1",
        expect.objectContaining({
          actor: expect.objectContaining({ id: "user-1" }),
          action: "approval.approved",
          resource: expect.objectContaining({ type: "approval_gate", id: "g1" }),
          detail: expect.objectContaining({ decision: "approve", justification: "looks good to me" }),
        }),
      );
    });

    it("returns 404 for gate in different org (cross-org isolation)", async () => {
      db._gates.push({ id: "g1", status: "pending", orgId: "org-2", scanId: "s1" });
      const result = await routes.decideGate({
        gateId: "g1", orgId: "org-1", decidedBy: "user-1",
        decision: "approve", justification: "looks good to me",
      });
      expect(result.status).toBe(404);
      expect(db.approvalGate.update).not.toHaveBeenCalled();
    });

    it("stores orgId in decision record", async () => {
      db._gates.push({ id: "g1", status: "pending", orgId: "org-1", scanId: "s1" });
      await routes.decideGate({
        gateId: "g1", orgId: "org-1", decidedBy: "user-1",
        decision: "approve", justification: "looks good to me",
      });
      const decisionData = db.approvalDecision.create.mock.calls[0][0].data;
      expect(decisionData.orgId).toBe("org-1");
    });

    it("rejects an escalated gate", async () => {
      db._gates.push({ id: "g1", status: "escalated", orgId: "org-1", scanId: "s1" });
      const result = await routes.decideGate({
        gateId: "g1", orgId: "org-1", decidedBy: "user-1",
        decision: "reject", justification: "not acceptable at all",
      });
      expect(result.error).toBeUndefined();
      expect(db.approvalGate.update).toHaveBeenCalled();
    });
  });

  describe("getStats", () => {
    it("returns zeroed stats when no gates", async () => {
      const result = await routes.getStats("org-1");
      expect(result.pending).toBe(0);
      expect(result.escalated).toBe(0);
      expect(result.decidedToday).toBe(0);
      expect(result.expiringSoon).toBe(0);
      expect(typeof result.avgDecisionTimeHours).toBe("number");
    });
  });

  describe("reassignGate", () => {
    it("returns 404 for missing gate", async () => {
      const result = await routes.reassignGate({ gateId: "nonexistent", orgId: "org-1", assignTo: "user-2" });
      expect(result.error).toBeDefined();
      expect(result.status).toBe(404);
    });

    it("updates assignedTo on a pending gate", async () => {
      db._gates.push({ id: "g1", status: "pending", orgId: "org-1" });
      const result = await routes.reassignGate({ gateId: "g1", orgId: "org-1", assignTo: "user-2" });
      expect(result.error).toBeUndefined();
      expect(db.approvalGate.update).toHaveBeenCalled();
    });

    it("returns 409 on terminal gate", async () => {
      db._gates.push({ id: "g1", status: "approved", orgId: "org-1" });
      const result = await routes.reassignGate({ gateId: "g1", orgId: "org-1", assignTo: "user-2" });
      expect(result.error).toBeDefined();
      expect(result.status).toBe(409);
    });

    it("publishes event on reassign", async () => {
      db._gates.push({ id: "g1", status: "pending", orgId: "org-1" });
      await routes.reassignGate({ gateId: "g1", orgId: "org-1", assignTo: "user-2" });
      expect(eventBus.publish).toHaveBeenCalledWith(
        "sentinel.notifications",
        expect.objectContaining({ orgId: "org-1", topic: "gate.reassigned" }),
      );
    });

    it("returns 404 for gate in different org (cross-org isolation)", async () => {
      db._gates.push({ id: "g1", status: "pending", orgId: "org-2" });
      const result = await routes.reassignGate({ gateId: "g1", orgId: "org-1", assignTo: "user-2" });
      expect(result.status).toBe(404);
      expect(db.approvalGate.update).not.toHaveBeenCalled();
    });
  });

  describe("createGate", () => {
    it("creates a gate with defaults", async () => {
      await routes.createGate({
        orgId: "org-1", scanId: "s1", projectId: "p1",
        gateType: "risk_threshold", requestedBy: "system",
      });
      expect(db.approvalGate.create).toHaveBeenCalled();
      const call = db.approvalGate.create.mock.calls[0][0];
      expect(call.data.orgId).toBe("org-1");
      expect(call.data.expiryAction).toBe("reject");
    });

    it("publishes gate.created event", async () => {
      await routes.createGate({
        orgId: "org-1", scanId: "s1", projectId: "p1",
        gateType: "risk_threshold", requestedBy: "system",
      });
      expect(eventBus.publish).toHaveBeenCalledWith(
        "sentinel.notifications",
        expect.objectContaining({ topic: "gate.created" }),
      );
    });
  });
});
