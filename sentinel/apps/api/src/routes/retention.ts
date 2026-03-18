import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { registerAllAdapters } from "@sentinel/retention";

export function registerRetentionRoutes(app: FastifyInstance, authHook: any) {
  registerAllAdapters();
  // ---------------------------------------------------------------------------
  // Policy & Presets
  // ---------------------------------------------------------------------------

  // GET /v1/retention/presets — return built-in presets
  app.get("/v1/retention/presets", { preHandler: authHook }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const { RETENTION_PRESETS } = await import("@sentinel/retention");
    return reply.send({ presets: RETENTION_PRESETS });
  });

  // GET /v1/retention/policy — active policy for org (fallback to legacy retentionDays)
  app.get("/v1/retention/policy", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const { detectPreset } = await import("@sentinel/retention");
    const db = getDb();
    const orgId = (request as any).orgId;

    const policy = await db.retentionPolicy.findUnique({ where: { orgId } });
    if (policy) {
      return reply.send({ policy });
    }

    // Fallback: legacy flat retentionDays from org settings
    const org = await db.organization.findFirst({ where: { id: orgId } });
    const settings = (org?.settings as Record<string, unknown>) ?? {};
    const days = (settings.retentionDays as number) ?? 90;
    const tiers = { critical: days, high: days, medium: days, low: days };

    return reply.send({
      policy: {
        id: null,
        orgId,
        preset: detectPreset(tiers),
        tierCritical: days,
        tierHigh: days,
        tierMedium: days,
        tierLow: days,
        createdAt: null,
        updatedAt: null,
        legacy: true,
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Approval Workflow
  // ---------------------------------------------------------------------------

  // POST /v1/retention/policy/changes — create a pending change request
  app.post("/v1/retention/policy/changes", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const { validateTierValues, detectPreset } = await import("@sentinel/retention");
    const db = getDb();
    const orgId = (request as any).orgId;
    const userId = (request as any).userId;
    const userRole = (request as any).userRole;

    if (!["admin", "manager"].includes(userRole)) {
      return reply.status(403).send({ error: "Only admin or manager can request policy changes" });
    }

    const body = request.body as {
      preset?: string;
      tierCritical: number;
      tierHigh: number;
      tierMedium: number;
      tierLow: number;
    };

    const tiers = {
      critical: body.tierCritical,
      high: body.tierHigh,
      medium: body.tierMedium,
      low: body.tierLow,
    };

    const validation = validateTierValues(tiers);
    if (!validation.valid) {
      return reply.status(400).send({ error: "Invalid tier values", details: validation.errors });
    }

    // Only one pending change per org
    const existing = await db.retentionPolicyChange.findFirst({
      where: { orgId, status: "pending" },
    });
    if (existing) {
      return reply.status(409).send({ error: "A pending change already exists", changeId: existing.id });
    }

    const preset = body.preset ?? detectPreset(tiers);

    const change = await db.retentionPolicyChange.create({
      data: {
        orgId,
        requestedBy: userId,
        preset,
        tierCritical: tiers.critical,
        tierHigh: tiers.high,
        tierMedium: tiers.medium,
        tierLow: tiers.low,
      },
    });

    return reply.status(201).send({ change });
  });

  // GET /v1/retention/policy/changes — list changes (paginated)
  app.get("/v1/retention/policy/changes", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const query = request.query as { page?: string; limit?: string; status?: string };
    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20", 10)));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { orgId };
    if (query.status) where.status = query.status;

    const [changes, total] = await Promise.all([
      db.retentionPolicyChange.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      db.retentionPolicyChange.count({ where }),
    ]);

    return reply.send({ changes, total, page, limit });
  });

  // GET /v1/retention/policy/changes/:id — single change
  app.get("/v1/retention/policy/changes/:id", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const { id } = request.params as { id: string };

    const change = await db.retentionPolicyChange.findFirst({ where: { id, orgId } });
    if (!change) return reply.status(404).send({ error: "Change not found" });

    return reply.send({ change });
  });

  // POST /v1/retention/policy/changes/:id/approve — approve and apply
  app.post("/v1/retention/policy/changes/:id/approve", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const userId = (request as any).userId;
    const userRole = (request as any).userRole;
    const { id } = request.params as { id: string };

    if (!["admin", "manager"].includes(userRole)) {
      return reply.status(403).send({ error: "Only admin or manager can approve changes" });
    }

    const change = await db.retentionPolicyChange.findFirst({ where: { id, orgId } });
    if (!change) return reply.status(404).send({ error: "Change not found" });
    if (change.status !== "pending") {
      return reply.status(400).send({ error: `Change is already ${change.status}` });
    }
    if (change.requestedBy === userId) {
      return reply.status(403).send({ error: "Cannot approve your own change request" });
    }

    const now = new Date();

    // Upsert the retention policy
    await db.retentionPolicy.upsert({
      where: { orgId },
      create: {
        orgId,
        preset: change.preset,
        tierCritical: change.tierCritical,
        tierHigh: change.tierHigh,
        tierMedium: change.tierMedium,
        tierLow: change.tierLow,
      },
      update: {
        preset: change.preset,
        tierCritical: change.tierCritical,
        tierHigh: change.tierHigh,
        tierMedium: change.tierMedium,
        tierLow: change.tierLow,
      },
    });

    // Mark change as applied
    const updated = await db.retentionPolicyChange.update({
      where: { id },
      data: {
        status: "applied",
        reviewedBy: userId,
        reviewedAt: now,
        appliedAt: now,
      },
    });

    return reply.send({ change: updated });
  });

  // POST /v1/retention/policy/changes/:id/reject — reject with optional note
  app.post("/v1/retention/policy/changes/:id/reject", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const userId = (request as any).userId;
    const userRole = (request as any).userRole;
    const { id } = request.params as { id: string };

    if (!["admin", "manager"].includes(userRole)) {
      return reply.status(403).send({ error: "Only admin or manager can reject changes" });
    }

    const change = await db.retentionPolicyChange.findFirst({ where: { id, orgId } });
    if (!change) return reply.status(404).send({ error: "Change not found" });
    if (change.status !== "pending") {
      return reply.status(400).send({ error: `Change is already ${change.status}` });
    }

    const body = (request.body as { note?: string }) ?? {};

    const updated = await db.retentionPolicyChange.update({
      where: { id },
      data: {
        status: "rejected",
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNote: body.note ?? null,
      },
    });

    return reply.send({ change: updated });
  });

  // ---------------------------------------------------------------------------
  // Archive Destinations
  // ---------------------------------------------------------------------------

  // GET /v1/retention/archives — list (mask credentials)
  app.get("/v1/retention/archives", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;

    const archives = await db.archiveDestination.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
    });

    // Mask credential references — only indicate presence
    const masked = archives.map((a) => ({
      ...a,
      hasCredential: !!a.credentialRef,
      credentialRef: undefined,
    }));

    return reply.send({ archives: masked });
  });

  // POST /v1/retention/archives — create (admin only)
  app.post("/v1/retention/archives", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const { encryptCredential } = await import("@sentinel/retention");
    const db = getDb();
    const orgId = (request as any).orgId;
    const userRole = (request as any).userRole;

    if (userRole !== "admin") {
      return reply.status(403).send({ error: "Only admin can create archive destinations" });
    }

    const body = request.body as {
      type: string;
      name: string;
      config: Record<string, unknown>;
      credential?: string;
    };

    if (!body.type || !body.name) {
      return reply.status(400).send({ error: "type and name are required" });
    }

    let credentialRef: string | null = null;

    if (body.credential) {
      const key = Buffer.from(process.env.SENTINEL_ENCRYPTION_KEY ?? "", "hex");
      if (key.length !== 32) {
        return reply.status(500).send({ error: "Encryption key not configured" });
      }
      const encrypted = encryptCredential(body.credential, key);
      const cred = await db.encryptedCredential.create({
        data: {
          orgId,
          ciphertext: Uint8Array.from(encrypted.ciphertext),
          iv: Uint8Array.from(encrypted.iv),
          tag: Uint8Array.from(encrypted.tag),
        },
      });
      credentialRef = cred.id;
    }

    const archive = await db.archiveDestination.create({
      data: {
        orgId,
        type: body.type,
        name: body.name,
        config: (body.config ?? {}) as any,
        credentialRef,
      },
    });

    return reply.status(201).send({
      archive: { ...archive, hasCredential: !!credentialRef, credentialRef: undefined },
    });
  });

  // PUT /v1/retention/archives/:id — update
  app.put("/v1/retention/archives/:id", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const { encryptCredential } = await import("@sentinel/retention");
    const db = getDb();
    const orgId = (request as any).orgId;
    const userRole = (request as any).userRole;
    const { id } = request.params as { id: string };

    if (userRole !== "admin") {
      return reply.status(403).send({ error: "Only admin can update archive destinations" });
    }

    const existing = await db.archiveDestination.findFirst({ where: { id, orgId } });
    if (!existing) return reply.status(404).send({ error: "Archive destination not found" });

    const body = request.body as {
      name?: string;
      config?: Record<string, unknown>;
      credential?: string;
      enabled?: boolean;
    };

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.config !== undefined) updateData.config = body.config;
    if (body.enabled !== undefined) updateData.enabled = body.enabled;

    if (body.credential !== undefined) {
      const key = Buffer.from(process.env.SENTINEL_ENCRYPTION_KEY ?? "", "hex");
      if (key.length !== 32) {
        return reply.status(500).send({ error: "Encryption key not configured" });
      }

      // Delete old credential if exists
      if (existing.credentialRef) {
        await db.encryptedCredential.delete({ where: { id: existing.credentialRef } }).catch(() => {});
      }

      if (body.credential) {
        const encrypted = encryptCredential(body.credential, key);
        const cred = await db.encryptedCredential.create({
          data: {
            orgId,
            ciphertext: Uint8Array.from(encrypted.ciphertext),
            iv: Uint8Array.from(encrypted.iv),
            tag: Uint8Array.from(encrypted.tag),
          },
        });
        updateData.credentialRef = cred.id;
      } else {
        updateData.credentialRef = null;
      }
    }

    const updated = await db.archiveDestination.update({ where: { id }, data: updateData });

    return reply.send({
      archive: { ...updated, hasCredential: !!updated.credentialRef, credentialRef: undefined },
    });
  });

  // DELETE /v1/retention/archives/:id — delete
  app.delete("/v1/retention/archives/:id", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const userRole = (request as any).userRole;
    const { id } = request.params as { id: string };

    if (userRole !== "admin") {
      return reply.status(403).send({ error: "Only admin can delete archive destinations" });
    }

    const existing = await db.archiveDestination.findFirst({ where: { id, orgId } });
    if (!existing) return reply.status(404).send({ error: "Archive destination not found" });

    // Delete encrypted credential if present
    if (existing.credentialRef) {
      await db.encryptedCredential.delete({ where: { id: existing.credentialRef } }).catch(() => {});
    }

    await db.archiveDestination.delete({ where: { id } });

    return reply.status(204).send();
  });

  // POST /v1/retention/archives/:id/test — test connectivity
  app.post("/v1/retention/archives/:id/test", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const { getArchiveAdapter, decryptCredential } = await import("@sentinel/retention");
    const db = getDb();
    const orgId = (request as any).orgId;
    const { id } = request.params as { id: string };

    const archive = await db.archiveDestination.findFirst({ where: { id, orgId } });
    if (!archive) return reply.status(404).send({ error: "Archive destination not found" });

    let credential: Record<string, unknown> | undefined;
    if (archive.credentialRef) {
      const cred = await db.encryptedCredential.findUnique({ where: { id: archive.credentialRef } });
      if (cred) {
        const key = Buffer.from(process.env.SENTINEL_ENCRYPTION_KEY ?? "", "hex");
        if (key.length !== 32) {
          return reply.status(500).send({ error: "Encryption key not configured" });
        }
        const plain = decryptCredential(
          {
            ciphertext: Buffer.from(cred.ciphertext),
            iv: Buffer.from(cred.iv),
            tag: Buffer.from(cred.tag),
          },
          key,
        );
        try {
          credential = JSON.parse(plain);
        } catch {
          credential = { raw: plain };
        }
      }
    }

    try {
      const adapter = getArchiveAdapter(archive.type);
      const result = await adapter.testConnection({
        type: archive.type,
        config: archive.config as Record<string, unknown>,
        credential,
      });
      return reply.send({ ok: result.ok, error: result.error });
    } catch (err: any) {
      return reply.status(422).send({ ok: false, error: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // Dashboard Data — Stats, Trend, Preview, Executions
  // ---------------------------------------------------------------------------

  // GET /v1/retention/stats — latest stats per severity+ageBucket
  app.get("/v1/retention/stats", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;

    // Get the latest snapshot timestamp
    const latest = await db.retentionStats.findFirst({
      where: { orgId },
      orderBy: { snapshotAt: "desc" },
      select: { snapshotAt: true },
    });

    if (!latest) return reply.send({ stats: [], snapshotAt: null });

    const stats = await db.retentionStats.findMany({
      where: { orgId, snapshotAt: latest.snapshotAt },
      orderBy: [{ severity: "asc" }, { ageBucket: "asc" }],
    });

    return reply.send({ stats, snapshotAt: latest.snapshotAt });
  });

  // GET /v1/retention/stats/trend — last 30 days of stats
  app.get("/v1/retention/stats/trend", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const query = request.query as { days?: string };
    const days = Math.min(90, Math.max(1, parseInt(query.days ?? "30", 10)));

    const since = new Date();
    since.setDate(since.getDate() - days);

    const stats = await db.retentionStats.findMany({
      where: { orgId, snapshotAt: { gte: since } },
      orderBy: { snapshotAt: "asc" },
    });

    return reply.send({ stats, since: since.toISOString(), days });
  });

  // GET /v1/retention/preview — count findings per severity tier that would be deleted
  app.get("/v1/retention/preview", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const { detectPreset } = await import("@sentinel/retention");
    const db = getDb();
    const orgId = (request as any).orgId;

    // Load active policy or fallback
    const policy = await db.retentionPolicy.findUnique({ where: { orgId } });
    let tiers: { critical: number; high: number; medium: number; low: number };

    if (policy) {
      tiers = {
        critical: policy.tierCritical,
        high: policy.tierHigh,
        medium: policy.tierMedium,
        low: policy.tierLow,
      };
    } else {
      const org = await db.organization.findFirst({ where: { id: orgId } });
      const settings = (org?.settings as Record<string, unknown>) ?? {};
      const days = (settings.retentionDays as number) ?? 90;
      tiers = { critical: days, high: days, medium: days, low: days };
    }

    const now = new Date();
    const severities = ["critical", "high", "medium", "low"] as const;
    const preview: Record<string, { count: number; cutoffDate: string }> = {};

    for (const sev of severities) {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - tiers[sev]);
      const count = await db.finding.count({
        where: {
          orgId,
          severity: sev,
          createdAt: { lt: cutoff },
        },
      });
      preview[sev] = { count, cutoffDate: cutoff.toISOString() };
    }

    return reply.send({ preview, tiers });
  });

  // GET /v1/retention/executions — paginated execution history
  app.get("/v1/retention/executions", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20", 10)));
    const skip = (page - 1) * limit;

    const [executions, total] = await Promise.all([
      db.retentionExecution.findMany({
        where: { orgId },
        orderBy: { startedAt: "desc" },
        skip,
        take: limit,
      }),
      db.retentionExecution.count({ where: { orgId } }),
    ]);

    return reply.send({ executions, total, page, limit });
  });

  // GET /v1/retention/executions/:id — single execution
  app.get("/v1/retention/executions/:id", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const { id } = request.params as { id: string };

    const execution = await db.retentionExecution.findFirst({ where: { id, orgId } });
    if (!execution) return reply.status(404).send({ error: "Execution not found" });

    return reply.send({ execution });
  });
}
