import { runRetentionCleanup, DEFAULT_RETENTION_DAYS } from "@sentinel/security";
import type { SchedulerJob, JobContext } from "../types.js";

export class RetentionJob implements SchedulerJob {
  name = "retention" as const;
  schedule = "0 4 * * *";
  tier = "non-critical" as const;
  dependencies = ["redis", "postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const orgs = await ctx.db.organization.findMany({
      select: { id: true, settings: true },
    });
    for (const org of orgs) {
      const retentionDays = (org.settings as any)?.retentionDays ?? DEFAULT_RETENTION_DAYS;
      const result = await runRetentionCleanup(ctx.db, retentionDays, org.id);
      if (result.deletedFindings + result.deletedAgentResults + result.deletedScans > 0) {
        ctx.logger.info({ orgId: org.id, retentionDays, ...result }, "Org retention cleanup completed");
      }
    }
    ctx.logger.info("Data retention cleanup completed for all orgs");
  }
}
