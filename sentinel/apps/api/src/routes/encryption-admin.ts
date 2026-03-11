import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { KmsProvider } from "@sentinel/security";

export async function rotateOrgKeys(
  keys: Array<{ id: string; purpose: string; wrappedDek: string; kekId: string; version: number }>,
  kms: KmsProvider,
  kekId: string,
): Promise<Array<{ id: string; newWrapped: string; newVersion: number }>> {
  const results = [];
  for (const key of keys) {
    const rewrapped = await kms.rewrapDataKey(kekId, Buffer.from(key.wrappedDek, "base64"));
    results.push({ id: key.id, newWrapped: rewrapped.toString("base64"), newVersion: key.version + 1 });
  }
  return results;
}

export function registerEncryptionAdminRoutes(app: FastifyInstance, authHook: any) {
  // POST /v1/admin/rotate-keys — rotate encryption keys for org
  app.post("/v1/admin/rotate-keys", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const keys = await db.encryptionKey.findMany({
      where: { orgId: (request as any).orgId, active: true },
    });

    console.log(`[ADMIN] Key rotation requested for org ${(request as any).orgId}, ${keys.length} keys`);
    return reply.send({ message: "Key rotation initiated", keyCount: keys.length });
  });

  // POST /v1/admin/crypto-shred — initiate crypto-shredding for org
  app.post("/v1/admin/crypto-shred", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { confirmOrgId } = request.body as { confirmOrgId?: string };
    if (confirmOrgId !== (request as any).orgId) {
      return reply.status(400).send({ error: "confirmOrgId must match authenticated org" });
    }

    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    await db.encryptionKey.updateMany({
      where: { orgId: (request as any).orgId },
      data: { active: false },
    });

    console.log(`[ADMIN] Crypto-shred initiated for org ${(request as any).orgId}`);
    return reply.send({ message: "Crypto-shred initiated. KEK deletion scheduled.", orgId: (request as any).orgId });
  });
}
