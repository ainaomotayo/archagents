import { ORG_WIDE_PROJECT_ID } from "@sentinel/compliance";
import type { SchedulerJob, JobContext } from "../types.js";

export class AIMetricsMonthlyRollupJob implements SchedulerJob {
  name = "ai-metrics-monthly-rollup" as const;
  schedule = "0 5 1 * *"; // 1st of month at 5am UTC
  tier = "non-critical" as const;
  dependencies = ["postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const orgs = await ctx.db.organization.findMany({ select: { id: true } });
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    let rolledUp = 0;

    for (const org of orgs) {
      try {
        // Find weekly snapshots older than 1 year
        const oldSnapshots = await ctx.db.aIMetricsSnapshot.findMany({
          where: {
            orgId: org.id,
            granularity: "weekly",
            snapshotDate: { lt: cutoff },
          },
          orderBy: { snapshotDate: "asc" },
        });

        if (oldSnapshots.length === 0) continue;

        // Group by year-month
        const monthGroups = new Map<string, typeof oldSnapshots>();
        for (const snap of oldSnapshots) {
          const d = new Date(snap.snapshotDate);
          const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
          const group = monthGroups.get(key) ?? [];
          group.push(snap);
          monthGroups.set(key, group);
        }

        for (const [monthKey, snapshots] of monthGroups) {
          const [year, month] = monthKey.split("-").map(Number);
          const monthDate = new Date(Date.UTC(year, month - 1, 1));
          const projectId = snapshots[0].projectId;

          const avg = {
            aiRatio: mean(snapshots.map((s: any) => s.aiRatio)),
            aiInfluenceScore: mean(snapshots.map((s: any) => s.aiInfluenceScore)),
            totalFiles: Math.round(mean(snapshots.map((s: any) => s.totalFiles))),
            aiFiles: Math.round(mean(snapshots.map((s: any) => s.aiFiles))),
            totalLoc: Math.round(mean(snapshots.map((s: any) => s.totalLoc ?? 0))),
            aiLoc: Math.round(mean(snapshots.map((s: any) => s.aiLoc ?? 0))),
            avgProbability: mean(snapshots.map((s: any) => s.avgProbability ?? 0)),
            medianProbability: mean(snapshots.map((s: any) => s.medianProbability ?? 0)),
            p95Probability: mean(snapshots.map((s: any) => s.p95Probability ?? 0)),
            toolBreakdown: snapshots[snapshots.length - 1]?.toolBreakdown ?? [],
            complianceGaps: snapshots[snapshots.length - 1]?.complianceGaps ?? {},
            scanCount: snapshots.reduce((sum: number, s: any) => sum + (s.scanCount ?? 0), 0),
          };

          await ctx.db.aIMetricsSnapshot.upsert({
            where: {
              orgId_projectId_granularity_snapshotDate: {
                orgId: org.id,
                projectId: projectId ?? ORG_WIDE_PROJECT_ID,
                granularity: "monthly",
                snapshotDate: monthDate,
              },
            },
            create: {
              orgId: org.id,
              projectId: projectId ?? ORG_WIDE_PROJECT_ID,
              granularity: "monthly",
              snapshotDate: monthDate,
              ...avg,
            },
            update: avg,
          });
          rolledUp++;
        }

        // Delete rolled-up weeklies
        const snapshotIds = oldSnapshots.map((s: any) => s.id);
        await ctx.db.aIMetricsSnapshot.deleteMany({
          where: { id: { in: snapshotIds } },
        });
      } catch (err) {
        ctx.logger.error({ orgId: org.id, err }, "Failed to rollup monthly AI metrics");
      }
    }

    ctx.logger.info({ rolledUp }, "AI metrics monthly rollup completed");
  }
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
