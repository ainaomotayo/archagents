import type { SchedulerJob, JobContext } from "../types.js";

export class AIMetricsRollupJob implements SchedulerJob {
  name = "ai-metrics-rollup" as const;
  schedule = "0 4 * * 1"; // Weekly on Monday at 4am UTC
  tier = "non-critical" as const;
  dependencies = ["postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const orgs = await ctx.db.organization.findMany({ select: { id: true } });
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    let rolledUp = 0;

    for (const org of orgs) {
      try {
        // Find daily snapshots older than 90 days
        const oldSnapshots = await ctx.db.aIMetricsSnapshot.findMany({
          where: {
            orgId: org.id,
            granularity: "daily",
            snapshotDate: { lt: cutoff },
          },
          orderBy: { snapshotDate: "asc" },
        });

        if (oldSnapshots.length === 0) continue;

        // Group by ISO week (Monday start)
        const weekGroups = new Map<string, typeof oldSnapshots>();
        for (const snap of oldSnapshots) {
          const weekKey = getISOWeekKey(new Date(snap.snapshotDate));
          const group = weekGroups.get(weekKey) ?? [];
          group.push(snap);
          weekGroups.set(weekKey, group);
        }

        // Average metrics into weekly snapshots
        for (const [weekKey, snapshots] of weekGroups) {
          const weekDate = getWeekStartDate(weekKey);
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

          // Get unique projectId from the group (all should share the same projectId)
          const projectId = snapshots[0].projectId;

          await ctx.db.aIMetricsSnapshot.upsert({
            where: {
              orgId_projectId_granularity_snapshotDate: {
                orgId: org.id,
                projectId: projectId ?? "",
                granularity: "weekly",
                snapshotDate: weekDate,
              },
            },
            create: {
              orgId: org.id,
              projectId: projectId ?? "",
              granularity: "weekly",
              snapshotDate: weekDate,
              ...avg,
            },
            update: avg,
          });
          rolledUp++;
        }

        // Delete rolled-up dailies
        const snapshotIds = oldSnapshots.map((s: any) => s.id);
        await ctx.db.aIMetricsSnapshot.deleteMany({
          where: { id: { in: snapshotIds } },
        });
      } catch (err) {
        ctx.logger.error({ orgId: org.id, err }, "Failed to rollup AI metrics");
      }
    }

    ctx.logger.info({ rolledUp }, "AI metrics weekly rollup completed");
  }
}

/** Returns ISO week key like "2026-W11" */
function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to nearest Thursday (ISO week algorithm)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** Returns Monday date for an ISO week key like "2026-W11" */
function getWeekStartDate(weekKey: string): Date {
  const [yearStr, weekStr] = weekKey.split("-W");
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);
  // Jan 4 is always in week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4.getTime());
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
  return monday;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
