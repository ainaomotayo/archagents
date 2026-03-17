import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionLifecycle } from "@sentinel/auth";

vi.mock("@sentinel/db", () => ({
  getDb: () => mockDb,
}));

const mockDb = {
  organization: {
    findFirst: vi.fn(),
  },
  userSession: {
    count: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
};

describe("SessionLifecycle integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a session and enforces concurrent limit", async () => {
    const lifecycle = new SessionLifecycle(mockDb);
    mockDb.userSession.count.mockResolvedValue(0);
    mockDb.userSession.create.mockResolvedValue({ id: "sess-new" });

    const result = await lifecycle.createSession({
      userId: "user-1",
      orgId: "org-1",
      provider: "github",
      policy: {
        maxSessionDurationMinutes: 480,
        idleTimeoutMinutes: 60,
        maxConcurrentSessions: 3,
      },
    });

    expect(result.sessionId).toBe("sess-new");
    expect(result.evicted).toBe(false);
    expect(mockDb.userSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          orgId: "org-1",
          provider: "github",
        }),
      }),
    );
  });

  it("evicts oldest session when at concurrent limit", async () => {
    const lifecycle = new SessionLifecycle(mockDb);
    mockDb.userSession.count.mockResolvedValue(3);
    mockDb.userSession.findMany.mockResolvedValue([{ id: "sess-old" }]);
    mockDb.userSession.update.mockResolvedValue({});
    mockDb.userSession.create.mockResolvedValue({ id: "sess-new" });

    const result = await lifecycle.createSession({
      userId: "user-1",
      orgId: "org-1",
      provider: "github",
      policy: {
        maxSessionDurationMinutes: 480,
        idleTimeoutMinutes: 60,
        maxConcurrentSessions: 3,
      },
    });

    expect(result.evicted).toBe(true);
    expect(result.evictedSessionId).toBe("sess-old");
    expect(mockDb.userSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sess-old" },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  it("validates session and detects idle timeout", async () => {
    const lifecycle = new SessionLifecycle(mockDb);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000);
    mockDb.userSession.findFirst.mockResolvedValue({
      id: "sess-1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 6 * 60 * 60_000), // 6h from now
      lastActivity: twoHoursAgo,
    });

    const result = await lifecycle.isSessionValid("sess-1", {
      maxSessionDurationMinutes: 480,
      idleTimeoutMinutes: 60,
      maxConcurrentSessions: 3,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("idle_timeout");
  });

  it("validates session as valid when active", async () => {
    const lifecycle = new SessionLifecycle(mockDb);
    mockDb.userSession.findFirst.mockResolvedValue({
      id: "sess-1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 6 * 60 * 60_000),
      lastActivity: new Date(), // just now
    });

    const result = await lifecycle.isSessionValid("sess-1", {
      maxSessionDurationMinutes: 480,
      idleTimeoutMinutes: 60,
      maxConcurrentSessions: 3,
    });

    expect(result.valid).toBe(true);
  });

  it("detects revoked session", async () => {
    const lifecycle = new SessionLifecycle(mockDb);
    mockDb.userSession.findFirst.mockResolvedValue({
      id: "sess-1",
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 6 * 60 * 60_000),
      lastActivity: new Date(),
    });

    const result = await lifecycle.isSessionValid("sess-1", {
      maxSessionDurationMinutes: 480,
      idleTimeoutMinutes: 60,
      maxConcurrentSessions: 3,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("revoked");
  });
});
