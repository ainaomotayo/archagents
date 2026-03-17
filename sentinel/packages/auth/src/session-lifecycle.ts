export interface SessionPolicy {
  maxSessionDurationMinutes: number;
  idleTimeoutMinutes: number;
  maxConcurrentSessions: number;
}

export interface CreateSessionInput {
  userId: string;
  orgId: string;
  provider: string;
  ipAddress?: string;
  deviceInfo?: string;
  policy: SessionPolicy;
}

export interface CreateSessionResult {
  sessionId: string;
  evicted: boolean;
  evictedSessionId?: string;
}

export interface SessionValidation {
  valid: boolean;
  reason?: "revoked" | "expired" | "idle_timeout" | "not_found";
}

export class SessionLifecycle {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    let evicted = false;
    let evictedSessionId: string | undefined;

    const activeCount = await this.db.userSession.count({
      where: { userId: input.userId, orgId: input.orgId, revokedAt: null },
    });

    if (activeCount >= input.policy.maxConcurrentSessions) {
      const oldest = await this.db.userSession.findMany({
        where: { userId: input.userId, orgId: input.orgId, revokedAt: null },
        orderBy: { createdAt: "asc" },
        take: 1,
      });
      if (oldest.length > 0) {
        await this.db.userSession.update({
          where: { id: oldest[0].id },
          data: { revokedAt: new Date() },
        });
        evicted = true;
        evictedSessionId = oldest[0].id;
      }
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + input.policy.maxSessionDurationMinutes * 60_000,
    );

    const session = await this.db.userSession.create({
      data: {
        userId: input.userId,
        orgId: input.orgId,
        provider: input.provider,
        ipAddress: input.ipAddress ?? null,
        deviceInfo: input.deviceInfo ?? null,
        lastActivity: now,
        expiresAt,
      },
    });

    return { sessionId: session.id, evicted, evictedSessionId };
  }

  async isSessionValid(
    sessionId: string,
    policy: SessionPolicy,
  ): Promise<SessionValidation> {
    const session = await this.db.userSession.findFirst({
      where: { id: sessionId },
    });
    if (!session) return { valid: false, reason: "not_found" };
    if (session.revokedAt) return { valid: false, reason: "revoked" };
    const now = new Date();
    if (now > session.expiresAt) return { valid: false, reason: "expired" };
    const idleMs =
      now.getTime() - new Date(session.lastActivity).getTime();
    if (idleMs > policy.idleTimeoutMinutes * 60_000) {
      return { valid: false, reason: "idle_timeout" };
    }
    return { valid: true };
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.db.userSession.update({
      where: { id: sessionId },
      data: { lastActivity: new Date() },
    });
  }

  async revokeAllForUser(userId: string, orgId: string): Promise<number> {
    const result = await this.db.userSession.updateMany({
      where: { userId, orgId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }
}
