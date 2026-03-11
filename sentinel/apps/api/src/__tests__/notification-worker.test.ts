import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  processNotificationEvent,
  processRetryQueue,
} from "../notification-worker.js";

function makeDeps() {
  const db = {
    webhookEndpoint: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "ep-1", orgId: "org-1", url: "https://example.com/hook",
          channelType: "http", secret: "secret", topics: ["scan.completed"],
          headers: {}, enabled: true, name: "Test",
        },
      ]),
    },
    notificationRule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    webhookDelivery: {
      create: vi.fn().mockResolvedValue({ id: "del-1" }),
      update: vi.fn().mockResolvedValue({ id: "del-1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };

  const adapter = {
    type: "http" as const,
    deliver: vi.fn().mockResolvedValue({ success: true, httpStatus: 200, durationMs: 50 }),
  };

  const registry = { get: vi.fn().mockReturnValue(adapter), has: vi.fn().mockReturnValue(true) };
  const redisPub = { publish: vi.fn().mockResolvedValue(1) };

  return { db, adapter, registry, redisPub };
}

describe("processNotificationEvent", () => {
  it("matches endpoints by topic and creates delivery records", async () => {
    const { db, registry, redisPub } = makeDeps();
    await processNotificationEvent(
      { id: "evt-1", orgId: "org-1", topic: "scan.completed", payload: { scanId: "s-1" }, timestamp: "2026-03-10T12:00:00Z" },
      { db: db as any, registry: registry as any, redisPub: redisPub as any },
    );
    expect(db.webhookDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ endpointId: "ep-1", orgId: "org-1", topic: "scan.completed", status: "delivered" }),
    });
  });

  it("publishes event to Redis for SSE fan-out", async () => {
    const { db, registry, redisPub } = makeDeps();
    await processNotificationEvent(
      { id: "evt-1", orgId: "org-1", topic: "scan.completed", payload: { scanId: "s-1" }, timestamp: "2026-03-10T12:00:00Z" },
      { db: db as any, registry: registry as any, redisPub: redisPub as any },
    );
    expect(redisPub.publish).toHaveBeenCalledWith("sentinel.events.fanout", expect.any(String));
  });

  it("marks delivery as failed with next retry on adapter failure", async () => {
    const { db, registry, redisPub } = makeDeps();
    const adapter = registry.get("http");
    adapter.deliver.mockResolvedValue({ success: false, httpStatus: 500, error: "Server Error", durationMs: 100 });
    await processNotificationEvent(
      { id: "evt-2", orgId: "org-1", topic: "scan.completed", payload: {}, timestamp: "2026-03-10T12:00:00Z" },
      { db: db as any, registry: registry as any, redisPub: redisPub as any },
    );
    expect(db.webhookDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "pending", lastError: "Server Error", nextRetryAt: expect.any(Date) }),
    });
  });

  it("skips disabled endpoints", async () => {
    const { db, registry, redisPub } = makeDeps();
    db.webhookEndpoint.findMany.mockResolvedValue([
      { id: "ep-1", orgId: "org-1", channelType: "http", topics: ["scan.completed"], enabled: false },
    ]);
    await processNotificationEvent(
      { id: "evt-3", orgId: "org-1", topic: "scan.completed", payload: {}, timestamp: "2026-03-10T12:00:00Z" },
      { db: db as any, registry: registry as any, redisPub: redisPub as any },
    );
    expect(db.webhookDelivery.create).not.toHaveBeenCalled();
  });
});

describe("processRetryQueue", () => {
  it("retries pending deliveries whose nextRetryAt has passed", async () => {
    const { db, registry } = makeDeps();
    db.webhookDelivery.findMany.mockResolvedValue([
      { id: "del-1", endpointId: "ep-1", orgId: "org-1", topic: "scan.completed", payload: { scanId: "s-1" }, status: "pending", attempt: 1, maxAttempts: 5, nextRetryAt: new Date(Date.now() - 60_000), lastError: "500" },
    ]);
    db.webhookEndpoint.findMany.mockResolvedValue([
      { id: "ep-1", orgId: "org-1", url: "https://example.com/hook", channelType: "http", secret: "secret", topics: ["scan.completed"], headers: {}, enabled: true, name: "Test" },
    ]);
    await processRetryQueue({ db: db as any, registry: registry as any });
    expect(db.webhookDelivery.update).toHaveBeenCalledWith({ where: { id: "del-1" }, data: expect.objectContaining({ status: "delivered" }) });
  });

  it("moves delivery to DLQ after max attempts", async () => {
    const { db, registry } = makeDeps();
    const adapter = registry.get("http");
    adapter.deliver.mockResolvedValue({ success: false, error: "Still failing", durationMs: 50 });
    db.webhookDelivery.findMany.mockResolvedValue([
      { id: "del-2", endpointId: "ep-1", orgId: "org-1", topic: "scan.completed", payload: {}, status: "pending", attempt: 5, maxAttempts: 5, nextRetryAt: new Date(Date.now() - 1000), lastError: "500" },
    ]);
    db.webhookEndpoint.findMany.mockResolvedValue([
      { id: "ep-1", orgId: "org-1", url: "https://example.com/hook", channelType: "http", secret: "s", topics: [], headers: {}, enabled: true, name: "T" },
    ]);
    await processRetryQueue({ db: db as any, registry: registry as any });
    expect(db.webhookDelivery.update).toHaveBeenCalledWith({ where: { id: "del-2" }, data: expect.objectContaining({ status: "dlq" }) });
  });
});
