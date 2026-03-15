import { fillGaps, computeDirection, computeChangePercent, type TrendPoint } from "./compute.js";

export interface ProjectTrend {
  points: TrendPoint[];
  direction: "up" | "down" | "flat";
  changePercent: number;
}

export interface RiskTrendResult {
  trends: Record<string, ProjectTrend>;
  meta: {
    days: number;
    generatedAt: string;
  };
}

export class RiskTrendService {
  constructor(private db: any) {}

  async getTrends(
    orgId: string,
    opts: { days?: number } = {},
  ): Promise<RiskTrendResult> {
    const days = Math.max(1, Math.min(opts.days ?? 90, 365));
    const since = new Date();
    since.setDate(since.getDate() - days);

    const today = new Date();
    const startDate = since.toISOString().slice(0, 10);
    const endDate = today.toISOString().slice(0, 10);

    const scans = await this.db.scan.findMany({
      where: {
        orgId,
        status: "completed",
        riskScore: { not: null },
        startedAt: { gte: since },
      },
      select: {
        projectId: true,
        riskScore: true,
        startedAt: true,
      },
      orderBy: { startedAt: "asc" },
    });

    // Group by project, then by day (take MAX per day)
    const byProject = new Map<string, Map<string, number>>();
    for (const scan of scans) {
      const pid = scan.projectId;
      const dateStr = new Date(scan.startedAt).toISOString().slice(0, 10);
      if (!byProject.has(pid)) byProject.set(pid, new Map());
      const dayMap = byProject.get(pid)!;
      const existing = dayMap.get(dateStr) ?? 0;
      dayMap.set(dateStr, Math.max(existing, scan.riskScore));
    }

    // Build trends per project
    const trends: Record<string, ProjectTrend> = {};
    for (const [projectId, dayMap] of byProject) {
      const rawPoints: TrendPoint[] = Array.from(dayMap.entries())
        .map(([date, score]) => ({ date, score }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const points = fillGaps(rawPoints, startDate, endDate);
      trends[projectId] = {
        points,
        direction: computeDirection(points),
        changePercent: computeChangePercent(points),
      };
    }

    return {
      trends,
      meta: {
        days,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
