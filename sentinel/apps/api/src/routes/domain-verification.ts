import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export function registerDomainRoutes(app: FastifyInstance, authHook: any) {
  // GET /v1/domains — list verified domains for org
  app.get("/v1/domains", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const org = await db.organization.findUnique({ where: { id: (request as any).orgId } });
    const settings = (org?.settings as any) ?? {};
    return reply.send({
      verifiedDomains: settings.verifiedDomains ?? [],
      pendingDomains: Object.keys(settings.pendingDomains ?? {}),
    });
  });

  // POST /v1/domains — add a domain (generates DNS TXT verification token)
  app.post("/v1/domains", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { domain } = request.body as { domain?: string };
    if (!domain || !/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
      return reply.status(400).send({ error: "Invalid domain format" });
    }

    const { randomBytes } = await import("node:crypto");
    const token = `sentinel-verify=${randomBytes(16).toString("hex")}`;

    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const org = await db.organization.findUnique({ where: { id: orgId } });
    if (!org) return reply.status(404).send({ error: "Organization not found" });

    const settings = (org.settings as any) ?? {};
    const pendingDomains = settings.pendingDomains ?? {};
    pendingDomains[domain] = { token, createdAt: new Date().toISOString() };

    await db.organization.update({
      where: { id: orgId },
      data: { settings: { ...settings, pendingDomains } },
    });

    return reply.status(201).send({
      domain,
      verificationToken: token,
      instructions: `Add a TXT record for _sentinel-verify.${domain} with value: ${token}`,
    });
  });

  // POST /v1/domains/:domain/verify — verify domain via DNS TXT lookup
  app.post("/v1/domains/:domain/verify", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { resolve } = await import("node:dns/promises");
    const domain = (request.params as any).domain;
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const org = await db.organization.findUnique({ where: { id: orgId } });
    if (!org) return reply.status(404).send({ error: "Organization not found" });

    const settings = (org.settings as any) ?? {};
    const pending = settings.pendingDomains?.[domain];
    if (!pending) return reply.status(404).send({ error: "Domain not found in pending list" });

    try {
      const records = await resolve(`_sentinel-verify.${domain}`, "TXT");
      const flat = records.flat();
      if (!flat.includes(pending.token)) {
        return reply.status(422).send({ error: "TXT record not found", expected: pending.token });
      }
    } catch {
      return reply.status(422).send({ error: "DNS lookup failed. Ensure TXT record exists." });
    }

    const verifiedDomains: string[] = settings.verifiedDomains ?? [];
    if (!verifiedDomains.includes(domain)) verifiedDomains.push(domain);
    const updatedPending = { ...settings.pendingDomains };
    delete updatedPending[domain];

    await db.organization.update({
      where: { id: orgId },
      data: { settings: { ...settings, verifiedDomains, pendingDomains: updatedPending } },
    });

    return reply.send({ domain, verified: true });
  });

  // DELETE /v1/domains/:domain — remove verified domain
  app.delete("/v1/domains/:domain", { preHandler: authHook }, async (request: FastifyRequest, reply: FastifyReply) => {
    const domain = (request.params as any).domain;
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const org = await db.organization.findUnique({ where: { id: orgId } });
    if (!org) return reply.status(404).send({ error: "Organization not found" });

    const settings = (org.settings as any) ?? {};
    settings.verifiedDomains = (settings.verifiedDomains ?? []).filter((d: string) => d !== domain);
    if (settings.pendingDomains) delete settings.pendingDomains[domain];

    await db.organization.update({ where: { id: orgId }, data: { settings } });
    return reply.status(204).send();
  });
}
