import { describe, it, expect, vi, beforeEach } from "vitest";
import { withRetry, getDlqDepth } from "../dlq.js";

function createMockRedis() {
  const streams = new Map<string, any[]>();
  return {
    xadd: vi.fn(async (stream: string) => {
      if (!streams.has(stream)) streams.set(stream, []);
      const id = `${Date.now()}-0`;
      streams.get(stream)!.push(id);
      return id;
    }),
    xlen: vi.fn(async (stream: string) => streams.get(stream)?.length ?? 0),
    xrevrange: vi.fn(async () => []),
  } as any;
}

describe("withRetry", () => {
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    redis = createMockRedis();
  });

  it("calls handler normally on success", async () => {
    const handler = vi.fn(async () => {});
    const wrapped = withRetry(redis, "test-stream", handler);
    await wrapped("msg-1", { foo: "bar" });
    expect(handler).toHaveBeenCalledWith("msg-1", { foo: "bar" });
    expect(redis.xadd).not.toHaveBeenCalled();
  });

  it("moves to DLQ after maxRetries failures", async () => {
    const handler = vi.fn(async () => {
      throw new Error("fail");
    });
    const wrapped = withRetry(redis, "test-stream", handler, {
      maxRetries: 2,
      baseDelayMs: 10, // fast for tests
    });

    // First attempt — retries (throws)
    await expect(wrapped("msg-2", { scanId: "s1" })).rejects.toThrow("fail");
    // Second attempt — moves to DLQ (doesn't throw)
    await wrapped("msg-2", { scanId: "s1" });

    expect(redis.xadd).toHaveBeenCalledTimes(1);
    expect(redis.xadd.mock.calls[0][0]).toBe("test-stream.dlq");
  });

  it("clears retry state on success after retries", async () => {
    let callCount = 0;
    const handler = vi.fn(async () => {
      callCount++;
      if (callCount === 1) throw new Error("transient");
    });
    const wrapped = withRetry(redis, "test-stream", handler, {
      maxRetries: 3,
      baseDelayMs: 10,
    });

    // First call fails
    await expect(wrapped("msg-3", {})).rejects.toThrow("transient");
    // Second call succeeds
    await wrapped("msg-3", {});
    expect(redis.xadd).not.toHaveBeenCalled();
  });
});

describe("getDlqDepth", () => {
  it("returns stream length", async () => {
    const redis = createMockRedis();
    redis.xlen.mockResolvedValue(5);
    const depth = await getDlqDepth(redis, "test.dlq");
    expect(depth).toBe(5);
  });
});
