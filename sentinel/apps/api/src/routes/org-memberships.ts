import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

const VALID_ROLES = ["admin", "manager", "developer", "viewer", "service"];

export async function emitMembershipAudit(
  db: any, orgId: string, action: string, actorId: string, resourceId: string, detail: Record<string, unknown>,
) {
  try {
    const { createHash } = await import("node:crypto");
    const last = await db.auditEvent.findFirst({ where: { orgId }, orderBy: { timestamp: "desc" } });
    const prevHash = last?.eventHash ?? "genesis";
    const payload = JSON.stringify({ action, resourceId, detail, prevHash, ts: Date.now() });
    const eventHash = createHash("sha256").update(payload).digest("hex");
    await db.auditEvent.create({
      data: {
        orgId, actorType: "user", actorId, actorName: actorId,
        action, resourceType: "membership", resourceId, detail,
        previousEventHash: prevHash, eventHash,
      },
    });
  } catch {
    // Don't fail the request if audit logging fails
  }
}

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

  // POST /v1/memberships — add member (accepts userId or email)
  app.post("/v1/memberships", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId: rawUserId, email, role = "viewer" } = request.body as { userId?: string; email?: string; role?: string };
    if (!VALID_ROLES.includes(role)) {
      return reply.status(400).send({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
    }
    const { getDb } = await import("@sentinel/db");
    const db = getDb();

    let userId = rawUserId;
    if (!userId && email) {
      const user = await db.user.findFirst({ where: { email } });
      if (!user) {
        return reply.status(404).send({ error: `No user found with email ${email}. They must sign in to SENTINEL first.` });
      }
      userId = user.id;
    }
    if (!userId) {
      return reply.status(400).send({ error: "userId or email is required" });
    }

    const existing = await db.orgMembership.findFirst({ where: { orgId: (request as any).orgId, userId } });
    if (existing) {
      return reply.status(409).send({ error: "User is already a member of this organization" });
    }

    const membership = await db.orgMembership.create({
      data: { orgId: (request as any).orgId, userId, role, source: "manual" },
    });
    const actorId = request.headers["x-sentinel-user-id"] as string ?? "system";
    await emitMembershipAudit(db, (request as any).orgId, "membership.created", actorId, membership.id, { userId, role });
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
    await emitMembershipAudit(db, (request as any).orgId, "membership.role_changed", requestUserId ?? "system", existing.id, { from: existing.role, to: role });
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
    await emitMembershipAudit(db, (request as any).orgId, "membership.removed", requestUserId ?? "system", existing.id, { userId: existing.userId, role: existing.role });
    return reply.status(204).send();
  });
}
