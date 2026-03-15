import { BUILT_IN_FRAMEWORKS } from "@sentinel/compliance";
import type { DigestMetrics } from "@sentinel/compliance";
import type { SchedulerJob, JobContext } from "../types.js";

async function assembleDigestMetrics(
  db: any,
  orgId: string,
  today: Date,
  weekAgo: Date,
): Promise<DigestMetrics> {
  // Scan volume
  const [scansThisWeek, scansLastWeek] = await Promise.all([
    db.scan.count({ where: { orgId, startedAt: { gte: weekAgo } } }),
    db.scan.count({
      where: {
        orgId,
        startedAt: { gte: new Date(weekAgo.getTime() - 7 * 86400000), lt: weekAgo },
      },
    }),
  ]);

  // Finding summary (current unsuppressed)
  const findingGroups = await db.finding.groupBy({
    by: ["severity"],
    where: { orgId, suppressed: false },
    _count: { id: true },
  });
  const findingMap: Record<string, number> = {};
  for (const g of findingGroups) findingMap[g.severity] = g._count.id;

  // Finding summary (week ago for delta)
  const findingGroupsPrev = await db.finding.groupBy({
    by: ["severity"],
    where: { orgId, suppressed: false, createdAt: { lt: weekAgo } },
    _count: { id: true },
  });
  const prevMap: Record<string, number> = {};
  for (const g of findingGroupsPrev) prevMap[g.severity] = g._count.id;

  // Framework scores from latest ComplianceSnapshot
  const frameworkScores = [];
  for (const fw of BUILT_IN_FRAMEWORKS) {
    const snapshots = await db.complianceSnapshot.findMany({
      where: { orgId, frameworkId: fw.slug },
      orderBy: { date: "desc" },
      take: 2,
    });
    const current = snapshots[0];
    const previous = snapshots[1];
    frameworkScores.push({
      slug: fw.slug,
      name: fw.name,
      score: current?.score ?? 0,
      previousScore: previous?.score ?? 0,
      delta: (current?.score ?? 0) - (previous?.score ?? 0),
    });
  }

  // Attestation summary
  const now = new Date();
  const soonCutoff = new Date(now.getTime() + 14 * 86400000);
  const [attested, expired, expiringSoon, totalControls] = await Promise.all([
    db.controlAttestation.count({ where: { orgId, revokedAt: null, expiresAt: { gt: now } } }),
    db.controlAttestation.count({ where: { orgId, revokedAt: null, expiresAt: { lte: now } } }),
    db.controlAttestation.count({ where: { orgId, revokedAt: null, expiresAt: { gt: now, lte: soonCutoff } } }),
    db.controlAttestation.count({ where: { orgId } }),
  ]);

  // Remediation summary from latest snapshot
  const remSnap = await db.remediationSnapshot.findFirst({
    where: { orgId, scope: "org" },
    orderBy: { snapshotDate: "desc" },
  });

  // AI metrics from latest snapshot
  const aiSnap = await db.aiMetricsSnapshot.findFirst({
    where: { orgId, granularity: "daily" },
    orderBy: { snapshotDate: "desc" },
  });
  const aiSnapPrev = await db.aiMetricsSnapshot.findFirst({
    where: { orgId, granularity: "daily", snapshotDate: { lt: weekAgo } },
    orderBy: { snapshotDate: "desc" },
  });

  // Top findings by frequency
  const topFindings = await db.finding.groupBy({
    by: ["title", "severity"],
    where: { orgId, suppressed: false, createdAt: { gte: weekAgo } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 5,
  });

  return {
    scanVolume: {
      total: scansThisWeek,
      weekOverWeek: scansThisWeek - scansLastWeek,
    },
    findingSummary: {
      critical: findingMap.critical ?? 0,
      high: findingMap.high ?? 0,
      medium: findingMap.medium ?? 0,
      low: findingMap.low ?? 0,
      weekOverWeek: {
        critical: (findingMap.critical ?? 0) - (prevMap.critical ?? 0),
        high: (findingMap.high ?? 0) - (prevMap.high ?? 0),
        medium: (findingMap.medium ?? 0) - (prevMap.medium ?? 0),
        low: (findingMap.low ?? 0) - (prevMap.low ?? 0),
      },
    },
    frameworkScores,
    attestationSummary: {
      total: totalControls,
      attested,
      expired,
      expiringSoon,
    },
    remediationSummary: {
      open: remSnap?.openCount ?? 0,
      inProgress: remSnap?.inProgressCount ?? 0,
      completed: remSnap?.completedCount ?? 0,
      avgResolutionHours: remSnap?.avgResolutionHours ?? 0,
    },
    aiMetrics: {
      aiRatio: aiSnap?.aiRatio ?? 0,
      avgProbability: aiSnap?.avgProbability ?? 0,
      weekOverWeek: (aiSnap?.aiRatio ?? 0) - (aiSnapPrev?.aiRatio ?? 0),
    },
    topFindings: topFindings.map((f: any) => ({
      title: f.title ?? "Unknown",
      severity: f.severity,
      count: f._count.id,
    })),
  };
}

export { assembleDigestMetrics };

export class DigestSnapshotJob implements SchedulerJob {
  name = "digest-snapshot" as const;
  schedule = "0 4 * * *";
  tier = "non-critical" as const;
  dependencies = ["postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);

    const orgs = await ctx.db.organization.findMany({ select: { id: true } });

    for (const org of orgs) {
      const metrics = await assembleDigestMetrics(ctx.db, org.id, today, weekAgo);
      await ctx.db.digestSnapshot.upsert({
        where: { orgId_snapshotDate: { orgId: org.id, snapshotDate: today } },
        update: { metrics },
        create: { orgId: org.id, snapshotDate: today, metrics },
      });
    }

    ctx.logger.info({ orgCount: orgs.length }, "Digest snapshots materialized");
  }
}
