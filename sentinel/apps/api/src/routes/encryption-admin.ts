import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { KmsProvider, DekCache } from "@sentinel/security";
import { LocalKmsProvider } from "@sentinel/security";

export async function rotateOrgKeys(
  keys: Array<{ id: string; purpose: string; wrappedDek: string | Buffer | Uint8Array<ArrayBuffer>; kekId: string; version: number }>,
  kms: KmsProvider,
  kekId: string,
): Promise<Array<{ id: string; newWrapped: Uint8Array; newVersion: number }>> {
  const results = [];
  for (const key of keys) {
    const wrappedBuf = typeof key.wrappedDek === "string"
      ? Buffer.from(key.wrappedDek, "base64")
      : Buffer.isBuffer(key.wrappedDek)
        ? key.wrappedDek
        : Buffer.from(key.wrappedDek);
    const rewrapped = await kms.rewrapDataKey(kekId, wrappedBuf);
    results.push({ id: key.id, newWrapped: Uint8Array.from(rewrapped), newVersion: key.version + 1 });
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
          data: { wrappedDek: new Uint8Array(r.newWrapped) as Uint8Array<ArrayBuffer>, version: r.newVersion, rotatedAt: new Date() },
        }),
      ),
    );

    console.log(`[ADMIN] Key rotation completed for org ${(request as any).orgId}, ${keys.length} keys`);

    // Audit log: key rotation event (best-effort)
    try {
      const { createHash } = await import("node:crypto");
      const orgId = (request as any).orgId;
      const last = await db.auditEvent.findFirst({ where: { orgId }, orderBy: { timestamp: "desc" } });
      const prevHash = last?.eventHash ?? "genesis";
      const payload = JSON.stringify({ action: "encryption.keys_rotated", resourceId: orgId, detail: { keyCount: keys.length }, prevHash, ts: Date.now() });
      const eventHash = createHash("sha256").update(payload).digest("hex");
      await db.auditEvent.create({
        data: {
          orgId,
          actorType: "api",
          actorId: (request as any).role ?? "admin",
          actorName: "API",
          action: "encryption.keys_rotated",
          resourceType: "encryption_key",
          resourceId: orgId,
          detail: { keyCount: keys.length },
          previousEventHash: prevHash,
          eventHash,
        },
      });
    } catch { /* audit logging is best-effort */ }

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

    // Audit log: crypto-shred event (best-effort)
    try {
      const { createHash } = await import("node:crypto");
      const orgId = (request as any).orgId;
      const last = await db.auditEvent.findFirst({ where: { orgId }, orderBy: { timestamp: "desc" } });
      const prevHash = last?.eventHash ?? "genesis";
      const payload = JSON.stringify({ action: "encryption.crypto_shred", resourceId: orgId, detail: { keysDestroyed: count }, prevHash, ts: Date.now() });
      const eventHash = createHash("sha256").update(payload).digest("hex");
      await db.auditEvent.create({
        data: {
          orgId,
          actorType: "api",
          actorId: (request as any).role ?? "admin",
          actorName: "API",
          action: "encryption.crypto_shred",
          resourceType: "encryption_key",
          resourceId: orgId,
          detail: { keysDestroyed: count },
          previousEventHash: prevHash,
          eventHash,
        },
      });
    } catch { /* audit logging is best-effort */ }

    return reply.send({ message: "Crypto-shred complete. All keys destroyed.", orgId: (request as any).orgId, keysDestroyed: count });
  });
}
