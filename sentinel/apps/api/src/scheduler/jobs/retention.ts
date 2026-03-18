import { runRetentionCleanup, runTieredRetentionCleanup, DEFAULT_RETENTION_DAYS } from "@sentinel/security";
import type { SchedulerJob, JobContext } from "../types.js";

const AGE_BUCKETS: Array<{ label: string; minDays: number; maxDays: number | null }> = [
  { label: "0-30d",     minDays: 0,   maxDays: 30  },
  { label: "30-90d",    minDays: 30,  maxDays: 90  },
  { label: "90-180d",   minDays: 90,  maxDays: 180 },
  { label: "180-365d",  minDays: 180, maxDays: 365 },
  { label: "365d+",     minDays: 365, maxDays: null },
];

const SEVERITIES = ["critical", "high", "medium", "low"] as const;

/**
 * Refresh RetentionStats for an org — called after each deletion run.
 * Counts findings per severity × age bucket and upserts into retention_stats.
 */
async function refreshRetentionStats(db: any, orgId: string): Promise<void> {
  const now = new Date();
  const snapshotAt = now;

  for (const severity of SEVERITIES) {
    for (const bucket of AGE_BUCKETS) {
      const minCutoff = new Date(now);
      minCutoff.setDate(minCutoff.getDate() - (bucket.maxDays ?? 9999));

      const maxCutoff = new Date(now);
      maxCutoff.setDate(maxCutoff.getDate() - bucket.minDays);

      const where: Record<string, unknown> = {
        orgId,
        severity,
        createdAt: {
          ...(bucket.maxDays !== null ? { gte: minCutoff } : {}),
          lt: maxCutoff,
        },
      };

      const count = await db.finding.count({ where });

      await db.retentionStats.create({
        data: { orgId, severity, ageBucket: bucket.label, recordCount: count, snapshotAt },
      });
    }
  }
}

export class RetentionJob implements SchedulerJob {
  name = "retention" as const;
  schedule = "0 4 * * *";
  tier = "non-critical" as const;
  dependencies = ["redis", "postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    // Recover any executions stuck for more than 2 hours (worker crash recovery)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await ctx.db.retentionExecution.updateMany({
      where: {
        status: { in: ["pending", "deleting"] },
        startedAt: { lt: twoHoursAgo },
      },
      data: { status: "failed", error: "Execution timed out (recovered by sweeper)" },
    });

    const orgs = await ctx.db.organization.findMany({
      select: { id: true, settings: true },
    });

    for (const org of orgs) {
      const policy = await ctx.db.retentionPolicy.findUnique({ where: { orgId: org.id } });

      const policySnapshot = policy
        ? {
            preset: policy.preset,
            tierCritical: policy.tierCritical,
            tierHigh: policy.tierHigh,
            tierMedium: policy.tierMedium,
            tierLow: policy.tierLow,
          }
        : {
            preset: "legacy",
            retentionDays: (org.settings as any)?.retentionDays ?? DEFAULT_RETENTION_DAYS,
          };

      // Create a RetentionExecution record to track this run
      const execution = await ctx.db.retentionExecution.create({
        data: {
          orgId: org.id,
          status: "deleting",
          policySnapshot,
        },
      });

      let result: { deletedFindings: number; deletedAgentResults: number; deletedScans: number };
      let errorMsg: string | null = null;

      try {
        if (policy) {
          result = await runTieredRetentionCleanup(
            ctx.db,
            {
              critical: policy.tierCritical,
              high: policy.tierHigh,
              medium: policy.tierMedium,
              low: policy.tierLow,
            },
            org.id,
          );
          if (result.deletedFindings + result.deletedAgentResults + result.deletedScans > 0) {
            ctx.logger.info(
              { orgId: org.id, tiers: policySnapshot, ...result },
              "Tiered retention cleanup completed",
            );
          }
        } else {
          const retentionDays = (org.settings as any)?.retentionDays ?? DEFAULT_RETENTION_DAYS;
          result = await runRetentionCleanup(ctx.db, retentionDays, org.id);
          if (result.deletedFindings + result.deletedAgentResults + result.deletedScans > 0) {
            ctx.logger.info({ orgId: org.id, retentionDays, ...result }, "Org retention cleanup completed");
          }
        }
      } catch (err: unknown) {
        errorMsg = err instanceof Error ? err.message : String(err);
        result = { deletedFindings: 0, deletedAgentResults: 0, deletedScans: 0 };
        ctx.logger.error({ orgId: org.id, error: errorMsg }, "Retention cleanup failed");
      }

      // Update execution record with results
      await ctx.db.retentionExecution.update({
        where: { id: execution.id },
        data: {
          status: errorMsg ? "failed" : "completed",
          deletedCount: {
            findings: result.deletedFindings,
            agentResults: result.deletedAgentResults,
            scans: result.deletedScans,
          },
          error: errorMsg,
          completedAt: new Date(),
        },
      });

      // Refresh materialized stats after deletion (used by dashboard charts)
      if (!errorMsg) {
        try {
          await refreshRetentionStats(ctx.db, org.id);
        } catch (statsErr: unknown) {
          ctx.logger.warn(
            { orgId: org.id, error: statsErr instanceof Error ? statsErr.message : String(statsErr) },
            "Failed to refresh retention stats (non-fatal)",
          );
        }
      }
    }

    ctx.logger.info("Data retention cleanup completed for all orgs");
  }
}
