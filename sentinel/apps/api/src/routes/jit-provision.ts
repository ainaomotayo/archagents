import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { JitProvisioner, type JitConfig } from "@sentinel/auth";

export async function handleJitProvision(input: {
  claims: { sub: string; email: string; name?: string; groups?: string[] };
  provider: string;
  orgId: string;
}) {
  const { getDb } = await import("@sentinel/db");
  const db = getDb();

  const ssoConfig = await db.ssoConfig.findFirst({
    where: { orgId: input.orgId, enabled: true },
  });

  const settings = (ssoConfig?.settings as any) ?? {};
  const jitConfig: JitConfig = {
    provider: input.provider,
    defaultRole: settings.defaultRole ?? "viewer",
    roleMapping: settings.roleMapping ?? {},
    jitEnabled: settings.jitEnabled ?? false,
  };

  const jit = new JitProvisioner(db);
  return jit.provisionOrUpdate(
    {
      sub: input.claims.sub,
      email: input.claims.email,
      name: input.claims.name ?? input.claims.email,
      groups: input.claims.groups,
    },
    input.orgId,
    jitConfig,
  );
}

export function registerJitRoutes(app: FastifyInstance) {
  app.post("/v1/auth/jit-provision", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    if (!body?.claims?.email || !body?.provider || !body?.orgId) {
      return reply.status(400).send({ error: "claims.email, provider, and orgId are required" });
    }
    const result = await handleJitProvision(body);
    return reply.send(result);
  });
}
