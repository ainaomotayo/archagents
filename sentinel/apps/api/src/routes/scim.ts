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

export function parseScimListParams(query: Record<string, string | undefined>): {
  startIndex: number; count: number; skip: number; take: number;
} {
  const startIndex = Math.max(1, parseInt(query.startIndex ?? "1", 10) || 1);
  const count = Math.min(200, Math.max(1, parseInt(query.count ?? "100", 10) || 100));
  return { startIndex, count, skip: startIndex - 1, take: count };
}

export function parseScimFilter(filter: string | undefined): { field: string; value: string } | null {
  if (!filter) return null;
  const match = filter.match(/^(\w+)\s+eq\s+"([^"]+)"$/);
  if (!match) return null;
  const fieldMap: Record<string, string> = { userName: "email", externalId: "externalId" };
  const field = fieldMap[match[1]];
  return field ? { field, value: match[2] } : null;
}

export function applyScimPatchOps(operations: any[]): { name?: string; externalId?: string; deactivate?: boolean } {
  const parts: { givenName?: string; familyName?: string; externalId?: string; deactivate?: boolean } = {};
  for (const op of operations) {
    const opType = (op.op ?? "").toLowerCase();
    if (opType === "replace") {
      if (op.path === "active" && (op.value === false || op.value === "false")) {
        parts.deactivate = true;
      } else if (op.path === "name.givenName") {
        parts.givenName = op.value;
      } else if (op.path === "name.familyName") {
        parts.familyName = op.value;
      } else if (op.path === "externalId") {
        parts.externalId = op.value;
      }
    }
  }
  const result: any = {};
  if (parts.givenName || parts.familyName) {
    result.name = `${parts.givenName ?? ""} ${parts.familyName ?? ""}`.trim();
  }
  if (parts.externalId) result.externalId = parts.externalId;
  if (parts.deactivate) result.deactivate = true;
  return result;
}

export function buildScimGroupResource(
  id: string,
  displayName: string,
  members: Array<{ value: string; display?: string }>,
) {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
    id,
    displayName,
    members,
    meta: { resourceType: "Group" },
  };
}

export function parseGroupPatchOps(operations: any[]): {
  addMembers: string[];
  removeMembers: string[];
  displayName?: string;
} {
  const addMembers: string[] = [];
  const removeMembers: string[] = [];
  let displayName: string | undefined;

  for (const op of operations) {
    const opType = (op.op ?? "").toLowerCase();
    if (opType === "add" && op.path === "members" && Array.isArray(op.value)) {
      addMembers.push(...op.value.map((m: any) => m.value));
    } else if (opType === "remove" && typeof op.path === "string" && op.path.startsWith("members")) {
      const match = op.path.match(/members\[value\s+eq\s+"([^"]+)"\]/);
      if (match) removeMembers.push(match[1]);
    } else if (opType === "replace" && op.path === "displayName") {
      displayName = op.value;
    }
  }

  return { addMembers, removeMembers, displayName };
}

export const SCIM_USER_SCHEMA = {
  id: "urn:ietf:params:scim:schemas:core:2.0:User",
  name: "User",
  description: "SCIM User resource",
  attributes: [
    { name: "userName", type: "string", multiValued: false, required: true, mutability: "readWrite", uniqueness: "server" },
    { name: "name", type: "complex", multiValued: false, required: false, subAttributes: [
      { name: "formatted", type: "string" }, { name: "givenName", type: "string" }, { name: "familyName", type: "string" },
    ]},
    { name: "emails", type: "complex", multiValued: true, required: false },
    { name: "active", type: "boolean", multiValued: false, required: false, mutability: "readWrite" },
    { name: "externalId", type: "string", multiValued: false, required: false, mutability: "readWrite" },
  ],
};

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
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [{ type: "oauthbearertoken", name: "OAuth Bearer Token", description: "SCIM bearer token" }],
    });
  });

  // GET /v1/scim/v2/Schemas — SCIM schema discovery
  app.get("/v1/scim/v2/Schemas", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: 1,
      Resources: [SCIM_USER_SCHEMA],
    });
  });

  // GET /v1/scim/v2/ResourceTypes — SCIM resource type discovery
  app.get("/v1/scim/v2/ResourceTypes", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: 2,
      Resources: [{
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
        id: "User",
        name: "User",
        endpoint: "/v1/scim/v2/Users",
        schema: "urn:ietf:params:scim:schemas:core:2.0:User",
      }, {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
        id: "Group",
        name: "Group",
        endpoint: "/v1/scim/v2/Groups",
        schema: "urn:ietf:params:scim:schemas:core:2.0:Group",
      }],
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

  // GET /v1/scim/v2/Users — list/filter with RFC 7644 pagination
  app.get("/v1/scim/v2/Users", { preHandler: scimAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const query = request.query as Record<string, string | undefined>;
    const { startIndex, count, skip, take } = parseScimListParams(query);
    const parsedFilter = parseScimFilter(query.filter);

    const where: any = { orgId: (request as any).orgId };
    if (parsedFilter) {
      where[parsedFilter.field] = parsedFilter.value;
    }

    const [users, totalResults] = await Promise.all([
      db.user.findMany({ where, skip, take }),
      db.user.count({ where }),
    ]);

    return reply.send({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults,
      startIndex,
      itemsPerPage: users.length,
      Resources: users.map((u: any) => ({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        id: u.id,
        userName: u.email,
        externalId: u.externalId ?? undefined,
        name: { formatted: u.name },
        emails: [{ value: u.email, primary: true }],
        active: true,
        meta: {
          resourceType: "User",
          created: u.createdAt,
          lastModified: u.updatedAt,
        },
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

  // PATCH /v1/scim/v2/Users/:id — partial update (name, externalId, deactivate)
  app.patch("/v1/scim/v2/Users/:id", { preHandler: scimAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const userId = (request.params as any).id;
    const orgId = (request as any).orgId;
    const ops = ((request.body as any).Operations ?? []) as any[];
    const updates = applyScimPatchOps(ops);

    if (updates.deactivate) {
      await db.orgMembership.deleteMany({ where: { orgId, userId } });
      return reply.status(204).send();
    }

    const data: any = {};
    if (updates.name) data.name = updates.name;
    if (updates.externalId) data.externalId = updates.externalId;

    if (Object.keys(data).length > 0) {
      const user = await db.user.update({ where: { id: userId }, data });
      return reply.send({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        id: user.id, userName: user.email, name: { formatted: user.name }, active: true,
      });
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

  // DELETE /v1/scim/v2/Users/:id — deprovision user
  app.delete("/v1/scim/v2/Users/:id", { preHandler: scimAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const userId = (request.params as any).id;
    const orgId = (request as any).orgId;
    await db.orgMembership.deleteMany({ where: { orgId, userId } });
    return reply.status(204).send();
  });

  // ── SCIM Groups endpoints ──────────────────────────────────────────

  // GET /v1/scim/v2/Groups — list groups (each distinct role = a group)
  app.get("/v1/scim/v2/Groups", { preHandler: scimAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const query = request.query as Record<string, string | undefined>;
    const { startIndex, skip, take } = parseScimListParams(query);

    const memberships = await db.orgMembership.findMany({ where: { orgId }, include: { user: true } });

    // Group memberships by role
    const roleMap = new Map<string, Array<{ value: string; display?: string }>>();
    for (const m of memberships) {
      if (!roleMap.has(m.role)) roleMap.set(m.role, []);
      roleMap.get(m.role)!.push({ value: m.userId, display: (m as any).user?.email });
    }

    const allRoles = Array.from(roleMap.keys()).sort();
    const totalResults = allRoles.length;
    const pagedRoles = allRoles.slice(skip, skip + take);

    return reply.send({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults,
      startIndex,
      itemsPerPage: pagedRoles.length,
      Resources: pagedRoles.map((role) =>
        buildScimGroupResource(role, role, roleMap.get(role) ?? []),
      ),
    });
  });

  // GET /v1/scim/v2/Groups/:id — get single group by role name
  app.get("/v1/scim/v2/Groups/:id", { preHandler: scimAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const role = (request.params as any).id;

    const memberships = await db.orgMembership.findMany({
      where: { orgId, role },
      include: { user: true },
    });

    if (memberships.length === 0) {
      return reply.status(404).send({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Group not found",
        status: "404",
      });
    }

    const members = memberships.map((m: any) => ({ value: m.userId, display: m.user?.email }));
    return reply.send(buildScimGroupResource(role, role, members));
  });

  // PATCH /v1/scim/v2/Groups/:id — add/remove members via SCIM PatchOp
  app.patch("/v1/scim/v2/Groups/:id", { preHandler: scimAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const role = (request.params as any).id;
    const ops = ((request.body as any).Operations ?? []) as any[];
    const { addMembers, removeMembers } = parseGroupPatchOps(ops);

    // Remove members from this role
    for (const userId of removeMembers) {
      await db.orgMembership.deleteMany({ where: { orgId, userId, role } });
    }

    // Add members to this role
    for (const userId of addMembers) {
      await db.orgMembership.upsert({
        where: { orgId_userId: { orgId, userId } },
        create: { orgId, userId, role, source: "scim" },
        update: { role, source: "scim" },
      });
    }

    // Return updated group
    const memberships = await db.orgMembership.findMany({
      where: { orgId, role },
      include: { user: true },
    });
    const members = memberships.map((m: any) => ({ value: m.userId, display: m.user?.email }));
    return reply.send(buildScimGroupResource(role, role, members));
  });

  // PUT /v1/scim/v2/Groups/:id — full replace
  app.put("/v1/scim/v2/Groups/:id", { preHandler: scimAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const role = (request.params as any).id;
    const body = request.body as any;
    const newMembers: Array<{ value: string }> = body.members ?? [];

    // Delete all existing memberships for this role
    await db.orgMembership.deleteMany({ where: { orgId, role } });

    // Create new memberships
    for (const member of newMembers) {
      await db.orgMembership.upsert({
        where: { orgId_userId: { orgId, userId: member.value } },
        create: { orgId, userId: member.value, role, source: "scim" },
        update: { role, source: "scim" },
      });
    }

    const memberships = await db.orgMembership.findMany({
      where: { orgId, role },
      include: { user: true },
    });
    const members = memberships.map((m: any) => ({ value: m.userId, display: m.user?.email }));
    return reply.send(buildScimGroupResource(role, role, members));
  });

  // DELETE /v1/scim/v2/Groups/:id — delete all memberships for this role
  app.delete("/v1/scim/v2/Groups/:id", { preHandler: scimAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { getDb } = await import("@sentinel/db");
    const db = getDb();
    const orgId = (request as any).orgId;
    const role = (request.params as any).id;
    await db.orgMembership.deleteMany({ where: { orgId, role } });
    return reply.status(204).send();
  });
}
