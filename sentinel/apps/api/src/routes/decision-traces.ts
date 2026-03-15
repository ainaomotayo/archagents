import { DecisionTraceService } from "@sentinel/compliance";

interface DecisionTraceRouteDeps {
  db: any;
}

export function buildDecisionTraceRoutes(deps: DecisionTraceRouteDeps) {
  const service = new DecisionTraceService(deps.db);

  return {
    getByFinding: (findingId: string) => service.getByFindingId(findingId),
    getByScan: (scanId: string) => service.getByScanId(scanId),
  };
}
