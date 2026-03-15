import { RiskTrendService } from "@sentinel/compliance";

interface RiskTrendRouteDeps {
  db: any;
}

export function buildRiskTrendRoutes(deps: RiskTrendRouteDeps) {
  const service = new RiskTrendService(deps.db);

  return {
    getTrends: async (orgId: string, opts: { days?: number } = {}) =>
      service.getTrends(orgId, opts),
  };
}
