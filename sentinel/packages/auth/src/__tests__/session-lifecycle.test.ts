import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionLifecycle } from "../session-lifecycle.js";
import type { SessionPolicy } from "../session-lifecycle.js";

const makeMockDb = () => ({
  userSession: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
});

const defaultPolicy: SessionPolicy = {
  maxSessionDurationMinutes: 480,
  idleTimeoutMinutes: 30,
  maxConcurrentSessions: 5,
};

describe("SessionLifecycle", () => {
  let db: ReturnType<typeof makeMockDb>;
  let lifecycle: SessionLifecycle;

  beforeEach(() => {
    db = makeMockDb();
    lifecycle = new SessionLifecycle(db);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
  });

  it("creates a new session record without eviction", async () => {
    db.userSession.count.mockResolvedValue(0);
    db.userSession.create.mockResolvedValue({ id: "sess-1" });

    const result = await lifecycle.createSession({
      userId: "u-1",
      orgId: "org-1",
      provider: "okta",
      ipAddress: "10.0.0.1",
      deviceInfo: "Chrome/120",
      policy: defaultPolicy,
    });

    expect(result).toEqual({ sessionId: "sess-1", evicted: false });
    expect(db.userSession.count).toHaveBeenCalledWith({
      where: { userId: "u-1", orgId: "org-1", revokedAt: null },
    });
    expect(db.userSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u-1",
        orgId: "org-1",
        provider: "okta",
        ipAddress: "10.0.0.1",
        deviceInfo: "Chrome/120",
      }),
    });
  });

  it("evicts oldest session when at concurrent limit", async () => {
    db.userSession.count.mockResolvedValue(5);
    db.userSession.findMany.mockResolvedValue([{ id: "sess-old" }]);
    db.userSession.update.mockResolvedValue({});
    db.userSession.create.mockResolvedValue({ id: "sess-new" });

    const result = await lifecycle.createSession({
      userId: "u-1",
      orgId: "org-1",
      provider: "okta",
      policy: defaultPolicy,
    });

    expect(result).toEqual({
      sessionId: "sess-new",
      evicted: true,
      evictedSessionId: "sess-old",
    });
    expect(db.userSession.update).toHaveBeenCalledWith({
      where: { id: "sess-old" },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("returns valid for active session within limits", async () => {
    const now = new Date();
    db.userSession.findFirst.mockResolvedValue({
      id: "sess-1",
      revokedAt: null,
      expiresAt: new Date(now.getTime() + 60 * 60_000),
      lastActivity: new Date(now.getTime() - 10 * 60_000),
    });

    const result = await lifecycle.isSessionValid("sess-1", defaultPolicy);

    expect(result).toEqual({ valid: true });
  });

  it("returns idle_timeout for session idle beyond limit", async () => {
    const now = new Date();
    db.userSession.findFirst.mockResolvedValue({
      id: "sess-1",
      revokedAt: null,
      expiresAt: new Date(now.getTime() + 60 * 60_000),
      lastActivity: new Date(now.getTime() - 45 * 60_000),
    });

    const result = await lifecycle.isSessionValid("sess-1", defaultPolicy);

    expect(result).toEqual({ valid: false, reason: "idle_timeout" });
  });

  it("returns revoked for revoked session", async () => {
    db.userSession.findFirst.mockResolvedValue({
      id: "sess-1",
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60_000),
      lastActivity: new Date(),
    });

    const result = await lifecycle.isSessionValid("sess-1", defaultPolicy);

    expect(result).toEqual({ valid: false, reason: "revoked" });
  });

  it("returns expired for expired session", async () => {
    const now = new Date();
    db.userSession.findFirst.mockResolvedValue({
      id: "sess-1",
      revokedAt: null,
      expiresAt: new Date(now.getTime() - 10 * 60_000),
      lastActivity: new Date(now.getTime() - 5 * 60_000),
    });

    const result = await lifecycle.isSessionValid("sess-1", defaultPolicy);

    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  it("touchSession updates lastActivity", async () => {
    db.userSession.update.mockResolvedValue({});

    await lifecycle.touchSession("sess-1");

    expect(db.userSession.update).toHaveBeenCalledWith({
      where: { id: "sess-1" },
      data: { lastActivity: expect.any(Date) },
    });
  });

  it("revokeAllForUser revokes all active sessions", async () => {
    db.userSession.updateMany.mockResolvedValue({ count: 3 });

    const count = await lifecycle.revokeAllForUser("u-1", "org-1");

    expect(count).toBe(3);
    expect(db.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: "u-1", orgId: "org-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
