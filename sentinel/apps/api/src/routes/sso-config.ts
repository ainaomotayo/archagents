import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

const VALID_PROVIDERS = ["oidc", "saml", "github", "gitlab", "google", "microsoft"];

export function registerSsoConfigRoutes(app: FastifyInstance, authHook: any) {
  // GET /v1/sso-configs — list org SSO configs (no secrets)
  app.get("/v1/sso-configs", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const configs = await db.ssoConfig.findMany({
      where: { orgId: (request as any).orgId },
      select: { id: true, provider: true, displayName: true, issuerUrl: true, enabled: true, enforced: true, createdAt: true, updatedAt: true },
    });
    return reply.send({ ssoConfigs: configs });
  });

  // POST /v1/sso-configs — create SSO config
  app.post("/v1/sso-configs", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { provider, displayName, clientId, clientSecret, issuerUrl, samlMetadata, enforced } = request.body as any;
    if (!provider || !displayName || !clientId || !clientSecret) {
      return reply.status(400).send({ error: "provider, displayName, clientId, and clientSecret are required" });
    }
    if (!VALID_PROVIDERS.includes(provider)) {
      return reply.status(400).send({ error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` });
    }

    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const config = await db.ssoConfig.create({
      data: { orgId: (request as any).orgId, provider, displayName, clientId, clientSecret, issuerUrl, samlMetadata, enforced: enforced ?? false },
    });
    return reply.status(201).send({ id: config.id, provider: config.provider, displayName: config.displayName });
  });

  // PUT /v1/sso-configs/:id — update SSO config (org-scoped)
  app.put("/v1/sso-configs/:id", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const existing = await db.ssoConfig.findFirst({
      where: { id: (request.params as any).id, orgId: (request as any).orgId },
    });
    if (!existing) return reply.status(404).send({ error: "SSO config not found" });

    const { displayName, clientId, clientSecret, issuerUrl, samlMetadata, enforced, enabled } = request.body as any;
    const updateData: Record<string, unknown> = {};
    if (displayName !== undefined) updateData.displayName = displayName;
    if (clientId !== undefined) updateData.clientId = clientId;
    if (clientSecret !== undefined) updateData.clientSecret = clientSecret;
    if (issuerUrl !== undefined) updateData.issuerUrl = issuerUrl;
    if (samlMetadata !== undefined) updateData.samlMetadata = samlMetadata;
    if (enforced !== undefined) updateData.enforced = enforced;
    if (enabled !== undefined) updateData.enabled = enabled;

    const updated = await db.ssoConfig.update({
      where: { id: existing.id },
      data: updateData,
      select: { id: true, provider: true, displayName: true, enabled: true, enforced: true },
    });
    return reply.send(updated);
  });

  // DELETE /v1/sso-configs/:id — delete SSO config (org-scoped)
  app.delete("/v1/sso-configs/:id", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const existing = await db.ssoConfig.findFirst({
      where: { id: (request.params as any).id, orgId: (request as any).orgId },
    });
    if (!existing) return reply.status(404).send({ error: "SSO config not found" });

    await db.ssoConfig.delete({ where: { id: existing.id } });
    return reply.status(204).send();
  });

  // POST /v1/sso-configs/:id/scim-token — generate a new SCIM bearer token
  app.post("/v1/sso-configs/:id/scim-token", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const { randomBytes } = await import("node:crypto");
    const db = getDb();

    const config = await db.ssoConfig.findFirst({
      where: { id: (request.params as any).id, orgId: (request as any).orgId },
    });
    if (!config) return reply.status(404).send({ error: "SSO config not found" });

    const token = `scim_${randomBytes(32).toString("base64url")}`;
    await db.ssoConfig.update({
      where: { id: config.id },
      data: { scimToken: token },
    });

    return reply.send({ scimToken: token, message: "Store this token securely. It will not be shown again." });
  });
}
