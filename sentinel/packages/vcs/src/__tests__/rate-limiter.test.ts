import { describe, it, expect, vi, beforeEach } from "vitest";
import { VcsRateLimiter } from "../rate-limiter.js";

const mockRedis = {
  incr: vi.fn(),
  expire: vi.fn(),
};

describe("VcsRateLimiter", () => {
  let limiter: VcsRateLimiter;

  beforeEach(() => {
    vi.clearAllMocks();
    limiter = new VcsRateLimiter(mockRedis as any);
  });

  it("allows request under limit", async () => {
    mockRedis.incr.mockResolvedValue(1);
    expect(await limiter.check("github", "inst-1")).toBe(true);
    expect(mockRedis.expire).toHaveBeenCalled();
  });

  it("rejects request over GitHub limit (4500)", async () => {
    mockRedis.incr.mockResolvedValue(4501);
    expect(await limiter.check("github", "inst-1")).toBe(false);
  });

  it("uses correct key format", async () => {
    mockRedis.incr.mockResolvedValue(1);
    await limiter.check("gitlab", "proj-42");
    expect(mockRedis.incr).toHaveBeenCalledWith(
      "vcs:ratelimit:gitlab:proj-42",
    );
  });

  it("uses GitLab limit (600)", async () => {
    mockRedis.incr.mockResolvedValue(601);
    expect(await limiter.check("gitlab", "proj-1")).toBe(false);
  });

  it("uses Bitbucket limit (1000)", async () => {
    mockRedis.incr.mockResolvedValue(999);
    expect(await limiter.check("bitbucket", "ws-1")).toBe(true);
    mockRedis.incr.mockResolvedValue(1001);
    expect(await limiter.check("bitbucket", "ws-1")).toBe(false);
  });
});
