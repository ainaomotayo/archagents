import { AIMetricsService } from "@sentinel/compliance";

interface AIMetricsRouteDeps {
  db: any;
}

export function buildAIMetricsRoutes(deps: AIMetricsRouteDeps) {
  const service = new AIMetricsService(deps.db);

  return {
    getStats: async (orgId: string) => service.getCurrentStats(orgId),
    getTrend: async (orgId: string, opts: { days?: number; projectId?: string }) => service.getTrend(orgId, opts),
    getTools: async (orgId: string, opts?: { projectId?: string }) => service.getToolBreakdown(orgId, opts ?? {}),
    getProjects: async (orgId: string, opts: { limit?: number; sortBy?: string }) => service.getProjectLeaderboard(orgId, opts),
    compareProjects: async (orgId: string, projectIds: string[], days?: number) => service.compareProjects(orgId, projectIds, days),
    getCompliance: async (orgId: string) => {
      const snap = await deps.db.aIMetricsSnapshot.findFirst({
        where: { orgId, projectId: null, granularity: "daily" },
        orderBy: { snapshotDate: "desc" },
        select: { complianceGaps: true },
      });
      return snap?.complianceGaps ?? {};
    },
    getAlerts: async (orgId: string) => service.getActiveAlerts(orgId),
    getConfig: async (orgId: string) => service.getConfig(orgId),
    updateConfig: async (orgId: string, data: any) => service.updateConfig(orgId, data),
  };
}
