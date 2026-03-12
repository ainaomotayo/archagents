import { RemediationService } from "@sentinel/compliance";

interface RemediationRouteDeps {
  db: any;
}

export function buildRemediationRoutes(deps: RemediationRouteDeps) {
  const { db } = deps;
  const service = new RemediationService(db);

  async function create(orgId: string, body: any) {
    return service.create(orgId, body);
  }

  async function list(orgId: string, filters: any) {
    return service.list(orgId, filters);
  }

  async function update(orgId: string, id: string, body: any) {
    return service.update(orgId, id, body);
  }

  async function getOverdue(orgId: string) {
    return service.getOverdue(orgId);
  }

  return { create, list, update, getOverdue };
}
