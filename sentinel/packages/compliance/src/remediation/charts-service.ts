export class ChartsService {
  constructor(private db: any) {}

  async getBurndown(
    orgId: string,
    opts: { scope?: string; scopeValue?: string; days?: number },
  ) {
    const since = new Date();
    since.setDate(since.getDate() - (opts.days ?? 30));

    return this.db.remediationSnapshot.findMany({
      where: {
        orgId,
        scope: opts.scope ?? "org",
        scopeValue: opts.scopeValue ?? null,
        snapshotDate: { gte: since },
      },
      orderBy: { snapshotDate: "asc" },
    });
  }

  async getVelocity(orgId: string, opts: { days?: number }) {
    const since = new Date();
    since.setDate(since.getDate() - (opts.days ?? 90));

    const items = await this.db.remediationItem.findMany({
      where: {
        orgId,
        status: "completed",
        completedAt: { gte: since },
      },
      select: { completedAt: true },
      orderBy: { completedAt: "asc" },
    });

    // Group by week
    const weeks: Record<string, number> = {};
    for (const item of items) {
      const d = new Date(item.completedAt);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().slice(0, 10);
      weeks[key] = (weeks[key] ?? 0) + 1;
    }

    return Object.entries(weeks).map(([week, count]) => ({ week, count }));
  }

  async getAging(orgId: string) {
    const items = await this.db.remediationItem.findMany({
      where: {
        orgId,
        status: {
          in: [
            "open",
            "assigned",
            "in_progress",
            "in_review",
            "awaiting_deployment",
          ],
        },
      },
      select: { createdAt: true, priority: true },
    });

    const now = Date.now();
    const buckets: Record<string, number> = {
      "0-7d": 0,
      "7-14d": 0,
      "14-30d": 0,
      "30d+": 0,
    };
    for (const item of items) {
      const ageDays =
        (now - new Date(item.createdAt).getTime()) / 86400000;
      if (ageDays <= 7) buckets["0-7d"]++;
      else if (ageDays <= 14) buckets["7-14d"]++;
      else if (ageDays <= 30) buckets["14-30d"]++;
      else buckets["30d+"]++;
    }
    return buckets;
  }

  async getSlaCompliance(orgId: string, opts: { days?: number }) {
    const since = new Date();
    since.setDate(since.getDate() - (opts.days ?? 90));

    const completed = await this.db.remediationItem.findMany({
      where: {
        orgId,
        status: "completed",
        completedAt: { gte: since },
        dueDate: { not: null },
      },
      select: { completedAt: true, dueDate: true },
    });

    const total = completed.length;
    const onTime = completed.filter(
      (i: any) => new Date(i.completedAt) <= new Date(i.dueDate),
    ).length;
    return {
      total,
      onTime,
      rate: total > 0 ? Math.round((onTime / total) * 100) : 100,
    };
  }
}
