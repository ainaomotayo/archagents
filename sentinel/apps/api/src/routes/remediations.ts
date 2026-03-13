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

  async function getById(orgId: string, id: string) {
    return service.getById(orgId, id);
  }

  async function getStats(orgId: string) {
    return service.getStats(orgId);
  }

  async function linkExternal(orgId: string, id: string, externalRef: string) {
    return service.linkExternal(orgId, id, externalRef);
  }

  return { create, list, update, getOverdue, getById, getStats, linkExternal };
}
