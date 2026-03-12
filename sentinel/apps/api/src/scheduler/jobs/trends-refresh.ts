import type { SchedulerJob, JobContext } from "../types.js";

export class TrendsRefreshJob implements SchedulerJob {
  name = "trends-refresh" as const;
  schedule = "5 5 * * *";
  tier = "non-critical" as const;
  dependencies = ["postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    try {
      await ctx.db.$executeRawUnsafe(
        "REFRESH MATERIALIZED VIEW CONCURRENTLY compliance_trends",
      );
      ctx.logger.info("Compliance trends materialized view refreshed");
    } catch (err) {
      ctx.logger.warn(
        { err },
        "Failed to refresh compliance_trends view - may not exist yet",
      );
    }
  }
}
