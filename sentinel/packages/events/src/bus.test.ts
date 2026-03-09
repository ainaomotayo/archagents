import { describe, it, expect, vi } from "vitest";
import { EventBus } from "./bus.js";
import type { Redis } from "ioredis";

function createMockRedis(): Redis {
  return {
    xadd: vi.fn().mockResolvedValue("1234567890-0"),
    disconnect: vi.fn(),
  } as unknown as Redis;
}

describe("EventBus", () => {
  it("publishes an event to a stream", async () => {
    const redis = createMockRedis();
    const bus = new EventBus(redis);

    const id = await bus.publish("test-stream", { action: "deploy" });

    expect(id).toBe("1234567890-0");
    expect(redis.xadd).toHaveBeenCalledWith(
      "test-stream",
      "*",
      "data",
      expect.any(String),
    );
  });

  it("serializes event data as JSON", async () => {
    const redis = createMockRedis();
    const bus = new EventBus(redis);

    await bus.publish("test-stream", { action: "deploy", count: 42 });

    const serialized = (redis.xadd as ReturnType<typeof vi.fn>).mock
      .calls[0][3] as string;
    const parsed = JSON.parse(serialized);

    expect(parsed).toEqual({ action: "deploy", count: 42 });
  });
});
