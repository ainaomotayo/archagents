import { describe, it, expect, vi, beforeEach } from "vitest";
import { VcsRateLimiter } from "../rate-limiter.js";

const mockRedis = {
  eval: vi.fn(),
};

describe("VcsRateLimiter", () => {
  let limiter: VcsRateLimiter;

  beforeEach(() => {
    vi.clearAllMocks();
    limiter = new VcsRateLimiter(mockRedis as any);
  });

  it("allows request under limit", async () => {
    mockRedis.eval.mockResolvedValue(1);
    expect(await limiter.check("github", "inst-1")).toBe(true);
  });

  it("rejects request over GitHub limit (4500)", async () => {
    mockRedis.eval.mockResolvedValue(4501);
    expect(await limiter.check("github", "inst-1")).toBe(false);
  });

  it("uses correct key format in Lua eval", async () => {
    mockRedis.eval.mockResolvedValue(1);
    await limiter.check("gitlab", "proj-42");
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining("INCR"),
      1,
      "vcs:ratelimit:gitlab:proj-42",
      3600,
    );
  });

  it("uses GitLab limit (600)", async () => {
    mockRedis.eval.mockResolvedValue(601);
    expect(await limiter.check("gitlab", "proj-1")).toBe(false);
  });

  it("uses Bitbucket limit (1000)", async () => {
    mockRedis.eval.mockResolvedValue(999);
    expect(await limiter.check("bitbucket", "ws-1")).toBe(true);
    mockRedis.eval.mockResolvedValue(1001);
    expect(await limiter.check("bitbucket", "ws-1")).toBe(false);
  });

  it("supports custom limits via options", async () => {
    const customLimiter = new VcsRateLimiter(mockRedis as any, {
      limits: { github: 100 },
    });
    mockRedis.eval.mockResolvedValue(101);
    expect(await customLimiter.check("github", "inst-1")).toBe(false);
  });
});
