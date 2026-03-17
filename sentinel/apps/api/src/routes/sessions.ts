import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SessionLifecycle, type SessionPolicy } from "@sentinel/auth";
import { getDb } from "@sentinel/db";

const DEFAULT_POLICY: SessionPolicy = {
  maxSessionDurationMinutes: 480, // 8 hours
  idleTimeoutMinutes: 60,         // 1 hour
  maxConcurrentSessions: 5,
};

function getLifecycle() {
  return new SessionLifecycle(getDb());
}

function getPolicy(orgSettings?: Record<string, unknown>): SessionPolicy {
  if (!orgSettings) return DEFAULT_POLICY;
  return {
    maxSessionDurationMinutes:
      (orgSettings.maxSessionDurationMinutes as number) ?? DEFAULT_POLICY.maxSessionDurationMinutes,
    idleTimeoutMinutes:
      (orgSettings.idleTimeoutMinutes as number) ?? DEFAULT_POLICY.idleTimeoutMinutes,
    maxConcurrentSessions:
      (orgSettings.maxConcurrentSessions as number) ?? DEFAULT_POLICY.maxConcurrentSessions,
  };
}

export function registerSessionRoutes(app: FastifyInstance) {
  // Create a session — called by NextAuth signIn event
  app.post("/v1/auth/sessions", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    if (!body?.userId || !body?.orgId || !body?.provider) {
      return reply.status(400).send({ error: "userId, orgId, and provider are required" });
    }

    const db = getDb();
    const org = await db.organization.findFirst({ where: { id: body.orgId } });
    const orgSettings = (org?.settings as Record<string, unknown>) ?? {};
    const policy = getPolicy(orgSettings);

    const lifecycle = getLifecycle();
    const result = await lifecycle.createSession({
      userId: body.userId,
      orgId: body.orgId,
      provider: body.provider,
      ipAddress: body.ipAddress,
      deviceInfo: body.deviceInfo,
      policy,
    });

    return reply.status(201).send(result);
  });

  // Validate + touch a session — called by NextAuth jwt callback on rotation
  app.post("/v1/auth/sessions/:sessionId/validate", async (request: FastifyRequest, reply: FastifyReply) => {
    const { sessionId } = request.params as { sessionId: string };

    const db = getDb();
    const session = await db.userSession.findFirst({ where: { id: sessionId } });
    if (!session) {
      return reply.send({ valid: false, reason: "not_found" });
    }

    const org = await db.organization.findFirst({ where: { id: session.orgId } });
    const orgSettings = (org?.settings as Record<string, unknown>) ?? {};
    const policy = getPolicy(orgSettings);

    const lifecycle = getLifecycle();
    const validation = await lifecycle.isSessionValid(sessionId, policy);

    // Touch session if still valid (updates lastActivity)
    if (validation.valid) {
      await lifecycle.touchSession(sessionId);
    }

    return reply.send(validation);
  });

  // Revoke all sessions for a user — called by admin or signOut
  app.post("/v1/auth/sessions/revoke", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    if (!body?.userId || !body?.orgId) {
      return reply.status(400).send({ error: "userId and orgId are required" });
    }

    const lifecycle = getLifecycle();
    const count = await lifecycle.revokeAllForUser(body.userId, body.orgId);
    return reply.send({ revoked: count });
  });
}
