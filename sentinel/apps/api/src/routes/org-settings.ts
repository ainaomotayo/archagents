import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export function registerOrgSettingsRoutes(app: FastifyInstance, authHook: any) {
  // GET /v1/org/settings — get org settings (session policy, etc.)
  app.get("/v1/org/settings", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;

    const org = await db.organization.findFirst({ where: { id: orgId } });
    if (!org) return reply.status(404).send({ error: "Organization not found" });

    const settings = (org.settings as Record<string, unknown>) ?? {};
    return reply.send({
      sessionPolicy: settings.sessionPolicy ?? {
        maxSessionDurationMinutes: 480,
        idleTimeoutMinutes: 60,
        maxConcurrentSessions: 5,
      },
    });
  });

  // PUT /v1/org/settings — update org settings (merge)
  app.put("/v1/org/settings", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const body = request.body as Record<string, unknown>;

    const org = await db.organization.findFirst({ where: { id: orgId } });
    if (!org) return reply.status(404).send({ error: "Organization not found" });

    const existing = (org.settings as Record<string, unknown>) ?? {};
    const merged = { ...existing, ...body };

    await db.organization.update({
      where: { id: orgId },
      data: { settings: merged },
    });

    return reply.send(merged);
  });
}
