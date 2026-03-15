import { describe, it, expect, vi } from "vitest";
import { buildScanRoutes } from "./scans.js";
import type { ScanStore, RedisStreamClient } from "./scans.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStore(overrides?: Partial<ScanStore>): ScanStore {
  return {
    create: vi.fn().mockResolvedValue({ id: "scan-1", status: "pending" }),
    findUnique: vi.fn().mockResolvedValue({ id: "scan-1", status: "scanning", progress: 50, agentsCompleted: 2, agentsTotal: 5, updatedAt: "2026-03-11T00:00:00Z" }),
    update: vi.fn().mockResolvedValue({ id: "scan-1", status: "cancelled" }),
    ...overrides,
  };
}

function makeRedis(entries?: Array<[string, Array<[string, string[]]>]> | null): RedisStreamClient {
  return {
    xread: vi.fn().mockResolvedValueOnce(entries ?? null).mockResolvedValue(null),
    xadd: vi.fn().mockResolvedValue("1234-0"),
  };
}

function makeDeps(store?: ScanStore, redis?: RedisStreamClient) {
  return {
    scanStore: store ?? makeStore(),
    eventBus: { publish: vi.fn().mockResolvedValue("stream-id") },
    auditLog: { append: vi.fn().mockResolvedValue({}) },
    redis: redis ?? makeRedis(),
  } as unknown as Parameters<typeof buildScanRoutes>[0];
}

// ---------------------------------------------------------------------------
// streamScanEvents
// ---------------------------------------------------------------------------

describe("streamScanEvents", () => {
  it("yields events from Redis Stream", async () => {
    const entries: Array<[string, Array<[string, string[]]>]> = [
      ["sentinel.sse:scan-1", [
        ["1-0", ["event_type", "agent.started", "data", '{"agent":"security"}']],
        ["2-0", ["event_type", "finding.new", "data", '{"title":"SQLi"}']],
        ["3-0", ["event_type", "scan.completed", "data", '{"total":1}']],
      ]],
    ];
    const redis = makeRedis(entries);
    const deps = makeDeps(undefined, redis);
    const { streamScanEvents } = buildScanRoutes(deps);

    const events = [];
    for await (const event of streamScanEvents("scan-1")) {
      events.push(event);
    }

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({
      id: "1-0",
      event: "agent.started",
      data: '{"agent":"security"}',
    });
    expect(events[2].event).toBe("scan.completed");
  });

  it("stops after scan.completed event", async () => {
    const entries: Array<[string, Array<[string, string[]]>]> = [
      ["sentinel.sse:scan-1", [
        ["1-0", ["event_type", "scan.completed", "data", "{}"]],
        ["2-0", ["event_type", "finding.new", "data", '{"title":"extra"}']],
      ]],
    ];
    const redis = makeRedis(entries);
    const deps = makeDeps(undefined, redis);
    const { streamScanEvents } = buildScanRoutes(deps);

    const events = [];
    for await (const event of streamScanEvents("scan-1")) {
      events.push(event);
    }

    // Should stop at scan.completed, not yield the finding after it
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("scan.completed");
  });

  it("supports Last-Event-ID for reconnection", async () => {
    const redis = makeRedis(null);
    const deps = makeDeps(undefined, redis);
    const { streamScanEvents } = buildScanRoutes(deps);

    // Consume (no events returned)
    const events = [];
    for await (const event of streamScanEvents("scan-1", "5-0")) {
      events.push(event);
    }

    // Verify xread was called with the last event ID as cursor
    expect(redis.xread).toHaveBeenCalledWith(
      "COUNT", 100, "BLOCK", 1000, "STREAMS", "sentinel.sse:scan-1", "5-0",
    );
  });

  it("returns immediately when no Redis client", async () => {
    const deps = makeDeps();
    delete (deps as any).redis;
    const { streamScanEvents } = buildScanRoutes(deps);

    const events = [];
    for await (const event of streamScanEvents("scan-1")) {
      events.push(event);
    }

    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getScanProgress
// ---------------------------------------------------------------------------

describe("getScanProgress", () => {
  it("returns progress for existing scan", async () => {
    const deps = makeDeps();
    const { getScanProgress } = buildScanRoutes(deps);

    const result = await getScanProgress("scan-1");

    expect(result).toEqual({
      scanId: "scan-1",
      status: "scanning",
      progress: 50,
      agentsCompleted: 2,
      agentsTotal: 5,
      updatedAt: "2026-03-11T00:00:00Z",
    });
  });

  it("returns null for non-existent scan", async () => {
    const store = makeStore({ findUnique: vi.fn().mockResolvedValue(null) });
    const deps = makeDeps(store);
    const { getScanProgress } = buildScanRoutes(deps);

    const result = await getScanProgress("nonexistent");

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cancelScan
// ---------------------------------------------------------------------------

describe("cancelScan", () => {
  it("cancels an active scan", async () => {
    const deps = makeDeps();
    const { cancelScan } = buildScanRoutes(deps);

    const result = await cancelScan("scan-1", "org-1");

    expect(result).toEqual({
      scanId: "scan-1",
      status: "cancelled",
      message: "Scan cancellation requested",
    });

    // Should update store
    expect(deps.scanStore.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "scan-1" },
        data: expect.objectContaining({ status: "cancelled" }),
      }),
    );

    // Should publish cancel signal to Redis Stream
    expect(deps.redis!.xadd).toHaveBeenCalledWith(
      "sentinel.sse:scan-1", "*",
      "event_type", "scan.cancelled",
      "data", expect.stringContaining("scan-1"),
    );

    // Should publish to event bus
    expect(deps.eventBus.publish).toHaveBeenCalledWith(
      "sentinel.scan.cancel",
      expect.objectContaining({ scanId: "scan-1" }),
    );

    // Should append to audit log
    expect(deps.auditLog.append).toHaveBeenCalledWith("org-1", expect.objectContaining({
      action: "scan.cancelled",
    }));
  });

  it("returns null for non-existent scan", async () => {
    const store = makeStore({ findUnique: vi.fn().mockResolvedValue(null) });
    const deps = makeDeps(store);
    const { cancelScan } = buildScanRoutes(deps);

    const result = await cancelScan("nonexistent", "org-1");

    expect(result).toBeNull();
  });

  it("returns early for already-completed scan", async () => {
    const store = makeStore({
      findUnique: vi.fn().mockResolvedValue({ id: "scan-1", status: "completed" }),
    });
    const deps = makeDeps(store);
    const { cancelScan } = buildScanRoutes(deps);

    const result = await cancelScan("scan-1", "org-1");

    expect(result).toEqual({
      scanId: "scan-1",
      status: "completed",
      message: "Scan already finished",
    });
    // Should NOT call update or publish
    expect(deps.scanStore.update).not.toHaveBeenCalled();
  });

  it("returns early for already-cancelled scan", async () => {
    const store = makeStore({
      findUnique: vi.fn().mockResolvedValue({ id: "scan-1", status: "cancelled" }),
    });
    const deps = makeDeps(store);
    const { cancelScan } = buildScanRoutes(deps);

    const result = await cancelScan("scan-1", "org-1");

    expect(result).toEqual({
      scanId: "scan-1",
      status: "cancelled",
      message: "Scan already finished",
    });
  });
});
