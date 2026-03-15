import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

interface DiscoveryProvider {
  id: string;
  name: string;
  enforced: boolean;
}

interface DiscoveryResult {
  orgId?: string;
  orgName?: string;
  enforced?: boolean;
  providers: DiscoveryProvider[];
}

type DomainLookup = (domain: string) => Promise<{
  orgId: string;
  orgName: string;
  providers: DiscoveryProvider[];
} | null>;

const DEFAULT_PROVIDERS: DiscoveryProvider[] = [
  { id: "github", name: "GitHub", enforced: false },
];

export async function resolveProviders(
  email: string,
  lookup: DomainLookup,
): Promise<DiscoveryResult> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return { providers: DEFAULT_PROVIDERS };

  const org = await lookup(domain);
  if (!org || org.providers.length === 0) {
    return { providers: DEFAULT_PROVIDERS };
  }

  const enforced = org.providers.some((p) => p.enforced);
  return {
    orgId: org.orgId,
    orgName: org.orgName,
    enforced,
    providers: enforced
      ? org.providers.filter((p) => p.enforced)
      : [...org.providers, ...DEFAULT_PROVIDERS],
  };
}

export function registerDiscoveryRoutes(app: FastifyInstance) {
  app.get("/v1/auth/discovery", async (request: FastifyRequest, reply: FastifyReply) => {
    const { email } = request.query as { email?: string };
    if (!email || !email.includes("@") || email.length > 254) {
      return reply.status(400).send({ error: "valid email query parameter required" });
    }

    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const result = await resolveProviders(email, async (domain) => {
      const org = await db.organization.findFirst({
        where: { settings: { path: ["verifiedDomains"], array_contains: domain } },
        include: { ssoConfigs: { where: { enabled: true }, select: { provider: true, displayName: true, enforced: true } } },
      });
      if (!org) return null;
      return {
        orgId: org.id,
        orgName: org.name,
        providers: org.ssoConfigs.map((c: any) => ({
          id: c.provider,
          name: c.displayName,
          enforced: c.enforced,
        })),
      };
    });

    return reply.send(result);
  });
}
