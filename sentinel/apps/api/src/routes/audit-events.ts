import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { AuditLog } from "@sentinel/audit";

export function registerAuditEventRoutes(app: FastifyInstance, auditLog: AuditLog) {
  // POST /v1/audit-events — append a structured audit event
  app.post("/v1/audit-events", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    if (!body?.orgId || !body?.action) {
      return reply.status(400).send({ error: "orgId and action are required" });
    }

    const event = await auditLog.append(body.orgId, {
      actor: {
        type: body.actorType ?? "system",
        id: body.actorId ?? "unknown",
        name: body.actorName ?? "unknown",
        ip: body.actorIp,
      },
      action: body.action,
      resource: {
        type: body.resourceType ?? "auth",
        id: body.resourceId ?? body.orgId,
      },
      detail: body.detail ?? {},
    });

    return reply.status(201).send({ id: (event as any).id });
  });
}
