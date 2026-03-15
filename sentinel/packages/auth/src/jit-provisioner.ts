import type { StandardClaims } from "./providers/types.js";

const ROLE_PRIORITY: Record<string, number> = {
  admin: 4,
  manager: 3,
  developer: 2,
  viewer: 1,
  service: 0,
};

export interface JitConfig {
  provider: string;
  defaultRole: string;
  roleMapping: Record<string, string>;
  jitEnabled: boolean;
}

export interface JitResult {
  action: "created" | "updated" | "skipped";
  userId?: string;
  role?: string;
}

export class JitProvisioner {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  async provisionOrUpdate(
    claims: StandardClaims,
    orgId: string,
    config: JitConfig,
  ): Promise<JitResult> {
    if (!config.jitEnabled) {
      return { action: "skipped" };
    }

    const existing = await this.db.user.findFirst({
      where: { email: claims.email, orgId },
    });
    const role = this.resolveRole(
      claims.groups,
      config.roleMapping,
      config.defaultRole,
    );

    const user = await this.db.user.upsert({
      where: { email: claims.email },
      create: {
        orgId,
        email: claims.email,
        name: claims.name,
        authProvider: config.provider,
        emailVerified: true,
        externalId: claims.sub,
      },
      update: {
        name: claims.name,
        externalId: claims.sub,
        lastLoginAt: new Date(),
      },
    });

    await this.db.orgMembership.upsert({
      where: { orgId_userId: { orgId, userId: user.id } },
      create: { orgId, userId: user.id, role, source: "jit" },
      update: { role, source: "jit" },
    });

    return {
      action: existing ? "updated" : "created",
      userId: user.id,
      role,
    };
  }

  private resolveRole(
    groups: string[] | undefined,
    mapping: Record<string, string>,
    defaultRole: string,
  ): string {
    if (!groups || groups.length === 0) return defaultRole;

    let best = defaultRole;
    let bestPriority = ROLE_PRIORITY[defaultRole] ?? 0;

    for (const group of groups) {
      const role = mapping[group];
      if (role && (ROLE_PRIORITY[role] ?? 0) > bestPriority) {
        best = role;
        bestPriority = ROLE_PRIORITY[role] ?? 0;
      }
    }

    return best;
  }
}
