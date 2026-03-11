import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

const ROLE_PRIORITY: Record<string, number> = {
  admin: 4, manager: 3, developer: 2, viewer: 1, service: 0,
};

export function mapScimUserToSentinel(scimUser: any): { email: string; name: string; externalId?: string } {
  const email = scimUser.emails?.[0]?.value ?? scimUser.userName;
  const name = scimUser.name
    ? `${scimUser.name.givenName ?? ""} ${scimUser.name.familyName ?? ""}`.trim()
    : scimUser.userName;
  return { email, name, externalId: scimUser.id ?? scimUser.externalId };
}

export function mapScimGroupsToRole(
  groups: string[],
  mapping: Record<string, string>,
  defaultRole: string,
): string {
  let bestRole = defaultRole;
  let bestPriority = ROLE_PRIORITY[defaultRole] ?? 0;
  for (const group of groups) {
    const role = mapping[group];
    if (role && (ROLE_PRIORITY[role] ?? 0) > bestPriority) {
      bestRole = role;
      bestPriority = ROLE_PRIORITY[role] ?? 0;
    }
  }
  return bestRole;
}

export function registerScimRoutes(app: FastifyInstance) {
  // SCIM auth middleware — validates Bearer token against SsoConfig.scimToken
  async function scimAuth(request: FastifyRequest, reply: FastifyReply) {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return reply.status(401).header("WWW-Authenticate", "Bearer").send({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Unauthorized",
        status: "401",
      });
    }
    const token = auth.slice(7);
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const config = await db.ssoConfig.findFirst({ where: { scimToken: token, enabled: true } });
    if (!config) {
      return reply.status(401).header("WWW-Authenticate", "Bearer").send({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Invalid token",
        status: "401",
      });
    }
    (request as any).orgId = config.orgId;
    (request as any).ssoConfig = config;
  }

  // GET /v1/scim/v2/ServiceProviderConfig
  app.get("/v1/scim/v2/ServiceProviderConfig", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
      patch: { supported: true },
      bulk: { supported: false },
      filter: { supported: true, maxResults: 100 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [{ type: "oauthbearertoken", name: "OAuth Bearer Token", description: "SCIM bearer token" }],
    });
  });

  // POST /v1/scim/v2/Users — create user
  app.post("/v1/scim/v2/Users", { preHandler: scimAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const mapped = mapScimUserToSentinel(request.body);
    const settings = (request as any).ssoConfig.settings as any;
    const groups = ((request.body as any).groups ?? []).map((g: any) => g.display ?? g.value);
    const role = mapScimGroupsToRole(groups, settings.roleMapping ?? {}, settings.defaultRole ?? "viewer");

    const user = await db.user.upsert({
      where: { email: mapped.email },
      create: { orgId: (request as any).orgId, email: mapped.email, name: mapped.name, externalId: mapped.externalId, authProvider: "scim", emailVerified: true },
      update: { name: mapped.name, externalId: mapped.externalId },
    });

    await db.orgMembership.upsert({
      where: { orgId_userId: { orgId: (request as any).orgId, userId: user.id } },
      create: { orgId: (request as any).orgId, userId: user.id, role, source: "scim" },
      update: { role, source: "scim" },
    });

    return reply.status(201).send({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      id: user.id,
      userName: mapped.email,
      name: { formatted: mapped.name },
      emails: [{ value: mapped.email, primary: true }],
      active: true,
    });
  });

  // GET /v1/scim/v2/Users — list/filter
  app.get("/v1/scim/v2/Users", { preHandler: scimAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const users = await db.user.findMany({ where: { orgId: (request as any).orgId }, take: 100 });
    return reply.send({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: users.length,
      Resources: users.map((u: any) => ({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        id: u.id,
        userName: u.email,
        name: { formatted: u.name },
        active: true,
      })),
    });
  });

  // GET /v1/scim/v2/Users/:id
  app.get("/v1/scim/v2/Users/:id", { preHandler: scimAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const user = await db.user.findFirst({
      where: { id: (request.params as any).id, orgId: (request as any).orgId },
    });
    if (!user) {
      return reply.status(404).send({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "User not found",
        status: "404",
      });
    }
    return reply.send({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      id: user.id,
      userName: user.email,
      name: { formatted: user.name },
      active: true,
    });
  });

  // PATCH /v1/scim/v2/Users/:id — partial update (activate/deactivate)
  app.patch("/v1/scim/v2/Users/:id", { preHandler: scimAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const ops = ((request.body as any).Operations ?? []) as any[];
    for (const op of ops) {
      if (op.path === "active" && op.value === false) {
        await db.orgMembership.deleteMany({
          where: { orgId: (request as any).orgId, userId: (request.params as any).id },
        });
      }
    }
    return reply.status(204).send();
  });

  // PUT /v1/scim/v2/Users/:id — full replace
  app.put("/v1/scim/v2/Users/:id", { preHandler: scimAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const existing = await db.user.findFirst({
      where: { id: (request.params as any).id, orgId: (request as any).orgId },
    });
    if (!existing) {
      return reply.status(404).send({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "User not found",
        status: "404",
      });
    }
    const mapped = mapScimUserToSentinel(request.body);
    const user = await db.user.update({
      where: { id: existing.id },
      data: { name: mapped.name, externalId: mapped.externalId },
    });
    return reply.send({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      id: user.id,
      userName: user.email,
      name: { formatted: user.name },
      active: true,
    });
  });
}
