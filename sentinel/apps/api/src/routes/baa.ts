import { BAARegistryService } from "@sentinel/compliance";

interface BAARouteDeps {
  db: any;
}

export function buildBAARoutes(deps: BAARouteDeps) {
  const { db } = deps;
  const service = new BAARegistryService(db);

  async function register(orgId: string, body: any) {
    return service.register(orgId, body);
  }

  async function list(orgId: string) {
    return service.list(orgId);
  }

  async function update(orgId: string, id: string, body: any) {
    return service.update(orgId, id, body);
  }

  async function terminate(orgId: string, id: string) {
    return service.terminate(orgId, id);
  }

  return { register, list, update, terminate };
}
