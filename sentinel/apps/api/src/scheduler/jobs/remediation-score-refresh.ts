import type { SchedulerJob, JobContext } from "../types.js";

export class RemediationScoreRefreshJob implements SchedulerJob {
  name = "remediation-score-refresh" as const;
  schedule = "*/15 * * * *";
  tier = "non-critical" as const;
  dependencies = ["postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const { db, logger } = ctx;

    const activeItems = await db.remediationItem.findMany({
      where: { status: { notIn: ["completed", "accepted_risk"] } },
      select: { id: true, priority: true, dueDate: true, linkedFindingIds: true, findingId: true, priorityScore: true },
    });

    let updated = 0;
    const { computePriorityScore } = await import("@sentinel/compliance");

    for (const item of activeItems) {
      const newScore = computePriorityScore({
        priority: item.priority,
        dueDate: item.dueDate,
        linkedFindingIds: item.linkedFindingIds ?? [],
        findingId: item.findingId ?? null,
      });

      if (newScore !== item.priorityScore) {
        await db.remediationItem.update({ where: { id: item.id }, data: { priorityScore: newScore } });
        updated++;
      }
    }

    logger.info({ total: activeItems.length, updated }, "Priority score refresh complete");
  }
}
