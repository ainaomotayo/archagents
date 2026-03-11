import { randomBytes } from "node:crypto";

interface WebhookDeps {
  db: any;
}

interface CreateInput {
  orgId: string;
  body: { name: string; url: string; channelType: string; topics: string[]; headers?: Record<string, string> };
  createdBy?: string;
}

function generateSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

export function buildWebhookRoutes(deps: WebhookDeps) {
  async function createEndpoint(input: CreateInput) {
    const { orgId, body, createdBy } = input;
    return deps.db.webhookEndpoint.create({
      data: {
        orgId, name: body.name, url: body.url, channelType: body.channelType,
        secret: generateSecret(), topics: body.topics,
        headers: body.headers ?? {}, createdBy: createdBy ?? null,
      },
    });
  }

  async function listEndpoints(input: { orgId: string; limit: number; offset: number }) {
    return deps.db.webhookEndpoint.findMany({
      where: { orgId: input.orgId }, take: input.limit, skip: input.offset, orderBy: { createdAt: "desc" },
    });
  }

  async function getEndpoint(id: string) {
    return deps.db.webhookEndpoint.findUnique({ where: { id } });
  }

  async function updateEndpoint(id: string, data: Record<string, unknown>) {
    return deps.db.webhookEndpoint.update({ where: { id }, data });
  }

  async function deleteEndpoint(id: string) {
    return deps.db.webhookEndpoint.delete({ where: { id } });
  }

  async function getDeliveries(input: { endpointId: string; limit: number; offset: number }) {
    const [deliveries, total] = await Promise.all([
      deps.db.webhookDelivery.findMany({
        where: { endpointId: input.endpointId }, take: input.limit, skip: input.offset, orderBy: { createdAt: "desc" },
      }),
      deps.db.webhookDelivery.count({ where: { endpointId: input.endpointId } }),
    ]);
    return { deliveries, total };
  }

  return { createEndpoint, listEndpoints, getEndpoint, updateEndpoint, deleteEndpoint, getDeliveries };
}
