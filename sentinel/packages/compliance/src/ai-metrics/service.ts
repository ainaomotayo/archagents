import { computeAIRatio, type FileSignal, type AIRatioResult } from "./compute-ai-ratio.js";
import { computeToolBreakdown, type ToolBreakdownEntry } from "./compute-tool-breakdown.js";
import { computeTrends, type TrendResult, type SnapshotInput } from "./compute-trends.js";
import { selectGranularity } from "./compute-granularity.js";
import { detectAnomalies, type AnomalyAlert, type AnomalyConfig } from "./detect-anomalies.js";

export interface ProjectAIMetric {
  projectId: string;
  projectName: string;
  aiRatio: number;
  aiInfluenceScore: number;
  aiFiles: number;
  totalFiles: number;
}

export interface AIMetricsConfigData {
  threshold: number;
  alertEnabled: boolean;
  alertMaxRatio: number | null;
  alertSpikeStdDev: number;
  alertNewTool: boolean;
}

const DEFAULT_CONFIG: AIMetricsConfigData = {
  threshold: 0.5,
  alertEnabled: false,
  alertMaxRatio: null,
  alertSpikeStdDev: 2,
  alertNewTool: false,
};

export class AIMetricsService {
  constructor(private db: any) {}

  async getCurrentStats(
    orgId: string,
    threshold?: number,
  ): Promise<{ hasData: boolean; stats: AIRatioResult; toolBreakdown: ToolBreakdownEntry[] }> {
    const config = await this.getConfig(orgId);
    const effectiveThreshold = threshold ?? config.threshold;

    const findings = await this.db.finding.findMany({
      where: {
        orgId,
        agentName: "ai-detector",
        category: "ai-generated",
        suppressed: false,
      },
    });

    if (findings.length === 0) {
      const stats = computeAIRatio([], effectiveThreshold);
      return { hasData: false, stats, toolBreakdown: [] };
    }

    const signals = this.findingsToSignals(findings);
    const stats = computeAIRatio(signals, effectiveThreshold);
    const toolBreakdown = computeToolBreakdown(signals, effectiveThreshold);

    return { hasData: true, stats, toolBreakdown };
  }

  async getTrend(
    orgId: string,
    opts: { days?: number; projectId?: string } = {},
  ): Promise<TrendResult> {
    const days = opts.days ?? 30;
    const granularity = selectGranularity(days);

    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: any = {
      orgId,
      granularity,
      snapshotDate: { gte: since },
    };

    if (opts.projectId) {
      where.projectId = opts.projectId;
    } else {
      where.projectId = null;
    }

    const snapshots = await this.db.aIMetricsSnapshot.findMany({
      where,
      orderBy: { snapshotDate: "asc" },
    });

    const inputs: SnapshotInput[] = snapshots.map((s: any) => ({
      snapshotDate: new Date(s.snapshotDate),
      aiRatio: s.aiRatio,
      aiInfluenceScore: s.aiInfluenceScore,
      scanCount: s.scanCount,
    }));

    return computeTrends(inputs, days);
  }

  async getToolBreakdown(
    orgId: string,
    opts: { projectId?: string } = {},
  ): Promise<ToolBreakdownEntry[]> {
    const config = await this.getConfig(orgId);

    const where: any = {
      orgId,
      agentName: "ai-detector",
      category: "ai-generated",
      suppressed: false,
    };

    if (opts.projectId) {
      where.projectId = opts.projectId;
    }

    const findings = await this.db.finding.findMany({ where });
    const signals = this.findingsToSignals(findings);
    return computeToolBreakdown(signals, config.threshold);
  }

  async getProjectLeaderboard(
    orgId: string,
    opts: { limit?: number; sortBy?: string } = {},
  ): Promise<ProjectAIMetric[]> {
    const limit = opts.limit ?? 10;
    const sortBy = opts.sortBy ?? "aiRatio";
    const config = await this.getConfig(orgId);

    const findings = await this.db.finding.findMany({
      where: {
        orgId,
        agentName: "ai-detector",
        category: "ai-generated",
        suppressed: false,
      },
      include: { project: true },
    });

    const byProject = new Map<string, { name: string; findings: any[] }>();
    for (const f of findings) {
      if (!f.projectId) continue;
      const entry = byProject.get(f.projectId) ?? {
        name: f.project?.name ?? f.projectId,
        findings: [] as any[],
      };
      entry.findings.push(f);
      byProject.set(f.projectId, entry);
    }

    const metrics: ProjectAIMetric[] = [];
    for (const [projectId, data] of byProject) {
      const signals = this.findingsToSignals(data.findings);
      const stats = computeAIRatio(signals, config.threshold);
      metrics.push({
        projectId,
        projectName: data.name,
        aiRatio: stats.aiRatio,
        aiInfluenceScore: stats.aiInfluenceScore,
        aiFiles: stats.aiFiles,
        totalFiles: stats.totalFiles,
      });
    }

    metrics.sort((a, b) => {
      const aVal = (a as any)[sortBy] ?? 0;
      const bVal = (b as any)[sortBy] ?? 0;
      return bVal - aVal;
    });

    return metrics.slice(0, limit);
  }

  async compareProjects(
    orgId: string,
    projectIds: string[],
    days?: number,
  ): Promise<any> {
    if (projectIds.length < 2 || projectIds.length > 5) {
      throw new Error("Select 2-5 projects to compare");
    }

    const trends = await Promise.all(
      projectIds.map((projectId) =>
        this.getTrend(orgId, { days: days ?? 30, projectId }),
      ),
    );

    const config = await this.getConfig(orgId);

    const projects = await Promise.all(
      projectIds.map(async (projectId) => {
        const findings = await this.db.finding.findMany({
          where: {
            orgId,
            projectId,
            agentName: "ai-detector",
            category: "ai-generated",
            suppressed: false,
          },
          include: { project: true },
        });
        const signals = this.findingsToSignals(findings);
        const stats = computeAIRatio(signals, config.threshold);
        const toolBreakdown = computeToolBreakdown(signals, config.threshold);
        return {
          projectId,
          projectName: findings[0]?.project?.name ?? projectId,
          stats,
          toolBreakdown,
        };
      }),
    );

    return {
      projects,
      trends: projectIds.map((id, i) => ({ projectId: id, trend: trends[i] })),
    };
  }

  async getActiveAlerts(orgId: string): Promise<AnomalyAlert[]> {
    const config = await this.getConfig(orgId);
    if (!config.alertEnabled) return [];

    const { stats } = await this.getCurrentStats(orgId);

    // Get project-level data
    const leaderboard = await this.getProjectLeaderboard(orgId, { limit: 100 });

    const projectSnapshots = leaderboard.map((p) => ({
      projectId: p.projectId,
      projectName: p.projectName,
      aiRatio: p.aiRatio,
      toolBreakdown: [],
    }));

    // Get org ratio history from snapshots
    const historySnapshots = await this.db.aIMetricsSnapshot.findMany({
      where: { orgId, projectId: null, granularity: "daily" },
      orderBy: { snapshotDate: "asc" },
      take: 30,
    });

    const orgRatioHistory = historySnapshots.map((s: any) => s.aiRatio);

    // Get known tools from previous snapshots
    const knownToolFindings = await this.db.finding.findMany({
      where: {
        orgId,
        agentName: "ai-detector",
        category: "ai-generated",
        suppressed: false,
      },
      select: { rawData: true },
    });

    const knownTools = [
      ...new Set(
        knownToolFindings
          .map((f: any) => f.rawData?.estimated_tool)
          .filter(Boolean) as string[],
      ),
    ];

    const anomalyConfig: AnomalyConfig = {
      alertEnabled: config.alertEnabled,
      alertMaxRatio: config.alertMaxRatio,
      alertSpikeStdDev: config.alertSpikeStdDev,
      alertNewTool: config.alertNewTool,
    };

    return detectAnomalies(
      stats.aiRatio,
      projectSnapshots,
      anomalyConfig,
      orgRatioHistory,
      knownTools,
    );
  }

  async getConfig(orgId: string): Promise<AIMetricsConfigData> {
    const config = await this.db.aIMetricsConfig.findUnique({
      where: { orgId },
    });

    if (!config) {
      return { ...DEFAULT_CONFIG };
    }

    return {
      threshold: config.threshold,
      alertEnabled: config.alertEnabled,
      alertMaxRatio: config.alertMaxRatio,
      alertSpikeStdDev: config.alertSpikeStdDev,
      alertNewTool: config.alertNewTool,
    };
  }

  async updateConfig(
    orgId: string,
    data: Partial<AIMetricsConfigData>,
  ): Promise<any> {
    if (data.threshold !== undefined) {
      if (data.threshold < 0 || data.threshold > 1) {
        throw new Error("Threshold must be between 0 and 1");
      }
    }

    return this.db.aIMetricsConfig.upsert({
      where: { orgId },
      create: {
        orgId,
        ...DEFAULT_CONFIG,
        ...data,
      },
      update: data,
    });
  }

  async generateDailySnapshot(orgId: string, date: Date): Promise<void> {
    const config = await this.getConfig(orgId);

    const findings = await this.db.finding.findMany({
      where: {
        orgId,
        agentName: "ai-detector",
        category: "ai-generated",
        suppressed: false,
      },
      include: { project: true },
    });

    const allSignals = this.findingsToSignals(findings);
    const orgStats = computeAIRatio(allSignals, config.threshold);
    const orgToolBreakdown = computeToolBreakdown(allSignals, config.threshold);
    const orgComplianceGaps = this.computeComplianceGaps(findings);

    const orgSnapshotData = {
      aiRatio: orgStats.aiRatio,
      aiInfluenceScore: orgStats.aiInfluenceScore,
      totalFiles: orgStats.totalFiles,
      aiFiles: orgStats.aiFiles,
      totalLoc: orgStats.totalLoc,
      aiLoc: orgStats.aiLoc,
      avgProbability: orgStats.avgProbability,
      medianProbability: orgStats.medianProbability,
      p95Probability: orgStats.p95Probability,
      toolBreakdown: orgToolBreakdown as any,
      complianceGaps: orgComplianceGaps as any,
      scanCount: findings.length,
    };

    // Upsert org-wide snapshot
    await this.db.aIMetricsSnapshot.upsert({
      where: {
        orgId_projectId_granularity_snapshotDate: {
          orgId,
          projectId: "",
          granularity: "daily",
          snapshotDate: date,
        },
      },
      create: { orgId, projectId: null, granularity: "daily", snapshotDate: date, ...orgSnapshotData },
      update: orgSnapshotData,
    });

    // Group by project and create per-project snapshots
    const byProject = new Map<string, any[]>();
    for (const f of findings) {
      if (!f.projectId) continue;
      const arr = byProject.get(f.projectId) ?? [];
      arr.push(f);
      byProject.set(f.projectId, arr);
    }

    for (const [projectId, projectFindings] of byProject) {
      const signals = this.findingsToSignals(projectFindings);
      const stats = computeAIRatio(signals, config.threshold);
      const toolBreakdown = computeToolBreakdown(signals, config.threshold);
      const complianceGaps = this.computeComplianceGaps(projectFindings);

      const projData = {
        aiRatio: stats.aiRatio,
        aiInfluenceScore: stats.aiInfluenceScore,
        totalFiles: stats.totalFiles,
        aiFiles: stats.aiFiles,
        totalLoc: stats.totalLoc,
        aiLoc: stats.aiLoc,
        avgProbability: stats.avgProbability,
        medianProbability: stats.medianProbability,
        p95Probability: stats.p95Probability,
        toolBreakdown: toolBreakdown as any,
        complianceGaps: complianceGaps as any,
        scanCount: projectFindings.length,
      };

      await this.db.aIMetricsSnapshot.upsert({
        where: {
          orgId_projectId_granularity_snapshotDate: {
            orgId,
            projectId,
            granularity: "daily",
            snapshotDate: date,
          },
        },
        create: { orgId, projectId, granularity: "daily", snapshotDate: date, ...projData },
        update: projData,
      });
    }
  }

  private computeComplianceGaps(findings: any[]): Record<string, number> {
    const gaps: Record<string, number> = {};
    for (const f of findings) {
      const category = f.rawData?.compliance_gap ?? f.category ?? "unknown";
      // Count AI findings lacking provenance, oversight, or bias review
      if (!f.rawData?.provenance_verified) gaps.provenance = (gaps.provenance ?? 0) + 1;
      if (!f.rawData?.human_reviewed) gaps.oversight = (gaps.oversight ?? 0) + 1;
      if (!f.rawData?.bias_checked) gaps.bias = (gaps.bias ?? 0) + 1;
    }
    return gaps;
  }

  private findingsToSignals(findings: any[]): FileSignal[] {
    return findings.map((f: any) => ({
      file: f.file,
      loc: f.rawData?.loc ?? 0,
      aiProbability: f.rawData?.ai_probability ?? f.confidence ?? 0,
      markerTools: f.rawData?.marker_tools ?? [],
      estimatedTool: f.rawData?.estimated_tool ?? null,
    }));
  }
}
