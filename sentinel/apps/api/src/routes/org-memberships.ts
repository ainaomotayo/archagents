import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

const VALID_ROLES = ["admin", "manager", "developer", "viewer", "service"];

export function registerOrgMembershipRoutes(app: FastifyInstance, authHook: any) {
  // GET /v1/memberships — list org memberships
  app.get("/v1/memberships", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const memberships = await db.orgMembership.findMany({
      where: { orgId: (request as any).orgId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    return reply.send({ memberships });
  });

  // POST /v1/memberships — add member
  app.post("/v1/memberships", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId, role = "viewer" } = request.body as { userId: string; role?: string };
    if (!userId) {
      return reply.status(400).send({ error: "userId is required" });
    }
    if (!VALID_ROLES.includes(role)) {
      return reply.status(400).send({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
    }
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const membership = await db.orgMembership.create({
      data: { orgId: (request as any).orgId, userId, role, source: "manual" },
    });
    return reply.status(201).send(membership);
  });

  // PUT /v1/memberships/:id — update role (org-scoped)
  app.put("/v1/memberships/:id", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { role } = request.body as { role: string };
    if (!role || !VALID_ROLES.includes(role)) {
      return reply.status(400).send({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
    }
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const existing = await db.orgMembership.findFirst({
      where: { id: (request.params as any).id, orgId: (request as any).orgId },
    });
    if (!existing) return reply.status(404).send({ error: "Membership not found" });

    // Guard: prevent admin self-demotion
    const requestUserId = request.headers["x-sentinel-user-id"] as string | undefined;
    if (requestUserId && existing.userId === requestUserId && existing.role === "admin" && role !== "admin") {
      return reply.status(400).send({ error: "Cannot demote yourself from admin. Ask another admin." });
    }

    const updated = await db.orgMembership.update({
      where: { id: existing.id },
      data: { role },
    });
    return reply.send(updated);
  });

  // DELETE /v1/memberships/:id — remove member (org-scoped)
  app.delete("/v1/memberships/:id", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const existing = await db.orgMembership.findFirst({
      where: { id: (request.params as any).id, orgId: (request as any).orgId },
    });
    if (!existing) return reply.status(404).send({ error: "Membership not found" });

    // Guard: prevent self-removal
    const requestUserId = request.headers["x-sentinel-user-id"] as string | undefined;
    if (requestUserId && existing.userId === requestUserId) {
      return reply.status(400).send({ error: "Cannot remove your own membership. Ask another admin." });
    }

    await db.orgMembership.delete({ where: { id: existing.id } });
    return reply.status(204).send();
  });
}
