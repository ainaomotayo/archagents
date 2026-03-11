import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { generateApiKey, hashApiKey, extractPrefix } from "@sentinel/auth";

const VALID_ROLES = ["admin", "manager", "developer", "viewer", "service"];

export function registerApiKeyRoutes(app: FastifyInstance, authHook: any) {
  // POST /v1/api-keys — generate new key (returns full key ONCE)
  app.post("/v1/api-keys", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { name, role = "service", expiresAt } = request.body as { name: string; role?: string; expiresAt?: string };
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return reply.status(400).send({ error: "name is required" });
    }
    if (!VALID_ROLES.includes(role)) {
      return reply.status(400).send({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
    }
    const orgId = (request as any).orgId;
    const key = generateApiKey();
    const { hash, salt } = await hashApiKey(key);
    const prefix = extractPrefix(key);

    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const record = await db.apiKey.create({
      data: { orgId, name, keyHash: hash, keySalt: salt, keyPrefix: prefix, role, expiresAt: expiresAt ? new Date(expiresAt) : undefined },
    });

    return reply.status(201).send({ id: record.id, key, prefix, name, role, expiresAt: record.expiresAt });
  });

  // GET /v1/api-keys — list keys (no secrets)
  app.get("/v1/api-keys", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const keys = await db.apiKey.findMany({
      where: { orgId: (request as any).orgId },
      select: { id: true, name: true, keyPrefix: true, role: true, expiresAt: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    });
    return reply.send({ apiKeys: keys });
  });

  // DELETE /v1/api-keys/:id — revoke key
  app.delete("/v1/api-keys/:id", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const key = await db.apiKey.findFirst({
      where: { id: (request.params as any).id, orgId: (request as any).orgId },
    });
    if (!key) return reply.status(404).send({ error: "API key not found" });
    await db.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    return reply.status(204).send();
  });
}
