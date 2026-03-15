import { describe, it, expect, vi } from "vitest";
import { ApprovalExpiryJob } from "../jobs/approval-expiry.js";

function createMockCtx(expiredGates: any[] = [], escalateGates: any[] = []) {
  return {
    db: {
      approvalGate: {
        findMany: vi.fn(async (args: any) => {
          // Expired gates query: status in [pending, escalated] AND expiresAt <= now
          if (args?.where?.status?.in && args?.where?.expiresAt) return expiredGates;
          // Escalate gates query: status = pending AND escalatesAt <= now
          if (args?.where?.status === "pending" && args?.where?.escalatesAt) return escalateGates;
          return [];
        }),
        update: vi.fn(async () => ({})),
      },
    },
    eventBus: { publish: vi.fn(async () => {}) },
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    redis: {},
    metrics: { recordTrigger: vi.fn(), recordError: vi.fn() },
    audit: { log: vi.fn(async () => {}) },
  };
}

describe("ApprovalExpiryJob", () => {
  it("has correct name, schedule, tier, and dependencies", () => {
    const job = new ApprovalExpiryJob();
    expect(job.name).toBe("approval-expiry");
    expect(job.schedule).toBe("*/5 * * * *");
    expect(job.tier).toBe("non-critical");
    expect(job.dependencies).toContain("postgres");
  });

  it("expires overdue gates using expiryAction", async () => {
    const expired = [
      { id: "g1", status: "pending", orgId: "org-1", expiryAction: "reject" },
      { id: "g2", status: "escalated", orgId: "org-1", expiryAction: "approve" },
    ];
    const ctx = createMockCtx(expired);
    const job = new ApprovalExpiryJob();
    await job.execute(ctx as any);

    expect(ctx.db.approvalGate.update).toHaveBeenCalledTimes(2);
    // expiryAction "reject" → status "rejected"
    expect(ctx.db.approvalGate.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "g1" }, data: expect.objectContaining({ status: "rejected" }) }),
    );
    // expiryAction "approve" → status "approved"
    expect(ctx.db.approvalGate.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "g2" }, data: expect.objectContaining({ status: "approved" }) }),
    );
  });

  it("publishes gate.expired events", async () => {
    const expired = [{ id: "g1", status: "pending", orgId: "org-1", expiryAction: "reject" }];
    const ctx = createMockCtx(expired);
    const job = new ApprovalExpiryJob();
    await job.execute(ctx as any);

    expect(ctx.eventBus.publish).toHaveBeenCalledWith(
      "sentinel.notifications",
      expect.objectContaining({ topic: "gate.expired" }),
    );
  });

  it("escalates gates past escalation deadline", async () => {
    const escalate = [{ id: "g3", status: "pending", orgId: "org-1" }];
    const ctx = createMockCtx([], escalate);
    const job = new ApprovalExpiryJob();
    await job.execute(ctx as any);

    expect(ctx.db.approvalGate.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "g3" }, data: expect.objectContaining({ status: "escalated" }) }),
    );
  });

  it("publishes gate.escalated events", async () => {
    const escalate = [{ id: "g3", status: "pending", orgId: "org-1" }];
    const ctx = createMockCtx([], escalate);
    const job = new ApprovalExpiryJob();
    await job.execute(ctx as any);

    expect(ctx.eventBus.publish).toHaveBeenCalledWith(
      "sentinel.notifications",
      expect.objectContaining({ topic: "gate.escalated" }),
    );
  });

  it("does nothing when no gates need attention", async () => {
    const ctx = createMockCtx();
    const job = new ApprovalExpiryJob();
    await job.execute(ctx as any);

    expect(ctx.db.approvalGate.update).not.toHaveBeenCalled();
    expect(ctx.eventBus.publish).not.toHaveBeenCalled();
  });

  it("defaults to expired status for unknown expiryAction", async () => {
    const expired = [{ id: "g1", status: "pending", orgId: "org-1", expiryAction: "unknown" }];
    const ctx = createMockCtx(expired);
    const job = new ApprovalExpiryJob();
    await job.execute(ctx as any);

    expect(ctx.db.approvalGate.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "g1" }, data: expect.objectContaining({ status: "expired" }) }),
    );
  });

  it("sets decidedAt on expired gates", async () => {
    const expired = [{ id: "g1", status: "pending", orgId: "org-1", expiryAction: "reject" }];
    const ctx = createMockCtx(expired);
    const job = new ApprovalExpiryJob();
    await job.execute(ctx as any);

    const updateCall = ctx.db.approvalGate.update.mock.calls[0][0];
    expect(updateCall.data.decidedAt).toBeInstanceOf(Date);
  });

  it("propagates errors from gate update", async () => {
    const expired = [
      { id: "g1", status: "pending", orgId: "org-1", expiryAction: "reject" },
    ];
    const ctx = createMockCtx(expired);
    ctx.db.approvalGate.update = vi.fn(async () => { throw new Error("DB error"); });
    const job = new ApprovalExpiryJob();
    await expect(job.execute(ctx as any)).rejects.toThrow("DB error");
  });
});
