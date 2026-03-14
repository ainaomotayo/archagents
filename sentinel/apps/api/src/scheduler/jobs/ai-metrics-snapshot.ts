import { AIMetricsService } from "@sentinel/compliance";
import type { SchedulerJob, JobContext } from "../types.js";

export class AIMetricsSnapshotJob implements SchedulerJob {
  name = "ai-metrics-daily-snapshot" as const;
  schedule = "0 3 * * *"; // Daily at 3am UTC
  tier = "non-critical" as const;
  dependencies = ["postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const orgs = await ctx.db.organization.findMany({ select: { id: true } });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const service = new AIMetricsService(ctx.db);

    let generated = 0;
    for (const org of orgs) {
      try {
        await service.generateDailySnapshot(org.id, today);
        await ctx.eventBus.publish("sentinel.notifications", {
          id: `evt-ai-snapshot-${org.id}-${today.toISOString().slice(0, 10)}`,
          orgId: org.id,
          topic: "ai-metrics.snapshot.generated",
          payload: { date: today.toISOString().slice(0, 10) },
          timestamp: new Date().toISOString(),
        });
        generated++;
      } catch (err) {
        ctx.logger.error({ orgId: org.id, err }, "Failed to generate AI metrics snapshot");
      }
    }
    ctx.logger.info({ generated, total: orgs.length }, "AI metrics daily snapshots generated");
  }
}
