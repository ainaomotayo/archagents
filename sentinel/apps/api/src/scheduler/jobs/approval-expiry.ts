import type { SchedulerJob, JobContext } from "../types.js";

export class ApprovalExpiryJob implements SchedulerJob {
  name = "approval-expiry" as const;
  schedule = "*/5 * * * *";
  tier = "non-critical" as const;
  dependencies = ["postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const now = new Date();

    // 1. Expire overdue gates
    const expiredGates = await ctx.db.approvalGate.findMany({
      where: {
        status: { in: ["pending", "escalated"] },
        expiresAt: { lte: now },
      },
    });

    for (const gate of expiredGates) {
      // expiryAction determines the terminal status: "approve" → approved, "reject" → rejected, else expired
      const finalStatus =
        gate.expiryAction === "approve" ? "approved" :
        gate.expiryAction === "reject" ? "rejected" :
        "expired";

      await ctx.db.approvalGate.update({
        where: { id: gate.id },
        data: { status: finalStatus, decidedAt: now },
      });

      await ctx.eventBus.publish("sentinel.notifications", {
        id: `evt-${gate.id}-expired`,
        orgId: gate.orgId,
        topic: "gate.expired",
        payload: { ...gate, status: finalStatus, expiryAction: gate.expiryAction },
        timestamp: now.toISOString(),
      });

      ctx.logger.info({ gateId: gate.id, expiryAction: gate.expiryAction, finalStatus }, "Approval gate expired");
    }

    // 2. Escalate gates past escalation deadline
    const escalateGates = await ctx.db.approvalGate.findMany({
      where: {
        status: "pending",
        escalatesAt: { lte: now, not: null },
      },
    });

    for (const gate of escalateGates) {
      await ctx.db.approvalGate.update({
        where: { id: gate.id },
        data: { status: "escalated" },
      });

      await ctx.eventBus.publish("sentinel.notifications", {
        id: `evt-${gate.id}-escalated`,
        orgId: gate.orgId,
        topic: "gate.escalated",
        payload: { ...gate, status: "escalated" },
        timestamp: now.toISOString(),
      });

      ctx.logger.info({ gateId: gate.id }, "Approval gate escalated");
    }

    if (expiredGates.length > 0 || escalateGates.length > 0) {
      ctx.logger.info(
        { expired: expiredGates.length, escalated: escalateGates.length },
        "Approval expiry job completed",
      );
    }
  }
}
