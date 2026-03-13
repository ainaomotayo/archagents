import type { SchedulerJob, JobContext } from "../types.js";

export class RemediationOverdueJob implements SchedulerJob {
  name = "remediation-overdue" as const;
  schedule = "30 6 * * *";
  tier = "non-critical" as const;
  dependencies = ["postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const { db, eventBus, logger } = ctx;
    const now = new Date();

    const overdue = await db.remediationItem.findMany({
      where: {
        status: { in: ["open", "in_progress"] },
        dueDate: { lt: now },
      },
    });

    for (const item of overdue) {
      await eventBus.publish("sentinel.notifications", {
        id: `evt-${item.id}-overdue`,
        orgId: item.orgId,
        topic: "remediation.overdue",
        payload: {
          remediationId: item.id,
          controlCode: item.controlCode,
          title: item.title,
          dueDate: item.dueDate,
        },
        timestamp: now.toISOString(),
      });
    }

    logger.info({ overdue: overdue.length }, "Remediation overdue sweep complete");
  }
}
