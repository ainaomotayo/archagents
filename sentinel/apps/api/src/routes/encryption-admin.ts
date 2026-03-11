import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { KmsProvider, DekCache } from "@sentinel/security";
import { LocalKmsProvider } from "@sentinel/security";

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

export function registerEncryptionAdminRoutes(app: FastifyInstance, authHook: any, dekCache?: DekCache) {
  // POST /v1/admin/rotate-keys — rotate encryption keys for org
  app.post("/v1/admin/rotate-keys", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const keys = await db.encryptionKey.findMany({
      where: { orgId: (request as any).orgId, active: true },
    });

    if (keys.length === 0) {
      return reply.send({ message: "No active keys to rotate", keyCount: 0 });
    }

    const kms = new LocalKmsProvider();
    const kekId = keys[0].kekId;
    const rotated = await rotateOrgKeys(keys, kms, kekId);

    await db.$transaction(
      rotated.map((r) =>
        db.encryptionKey.update({
          where: { id: r.id },
          data: { wrappedDek: r.newWrapped, version: r.newVersion, rotatedAt: new Date() },
        }),
      ),
    );

    console.log(`[ADMIN] Key rotation completed for org ${(request as any).orgId}, ${keys.length} keys`);
    return reply.send({ message: "Key rotation completed", keyCount: keys.length });
  });

  // POST /v1/admin/crypto-shred — initiate crypto-shredding for org
  app.post("/v1/admin/crypto-shred", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { confirmOrgId } = request.body as { confirmOrgId?: string };
    if (confirmOrgId !== (request as any).orgId) {
      return reply.status(400).send({ error: "confirmOrgId must match authenticated org" });
    }

    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const { count } = await db.encryptionKey.deleteMany({
      where: { orgId: (request as any).orgId },
    });

    // Evict plaintext DEKs from in-memory cache
    if (dekCache) {
      dekCache.evict((request as any).orgId);
    }

    console.log(`[ADMIN] Crypto-shred completed for org ${(request as any).orgId}, ${count} keys destroyed`);
    return reply.send({ message: "Crypto-shred complete. All keys destroyed.", orgId: (request as any).orgId, keysDestroyed: count });
  });
}
