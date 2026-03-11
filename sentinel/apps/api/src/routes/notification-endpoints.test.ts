import { describe, it, expect, vi } from "vitest";
import { buildWebhookRoutes } from "./notification-endpoints.js";

function makeDeps() {
  const db = {
    webhookEndpoint: {
      create: vi.fn().mockResolvedValue({
        id: "ep-1", orgId: "org-1", name: "Test", url: "https://example.com/hook",
        channelType: "http", secret: "generated-secret", topics: ["scan.completed"],
        headers: {}, enabled: true, createdAt: new Date(),
      }),
      findMany: vi.fn().mockResolvedValue([
        { id: "ep-1", name: "Test", channelType: "http", topics: ["scan.completed"], enabled: true },
      ]),
      findUnique: vi.fn().mockResolvedValue({
        id: "ep-1", orgId: "org-1", name: "Test", url: "https://example.com/hook",
        channelType: "http", secret: "secret", topics: ["scan.completed"], headers: {}, enabled: true,
      }),
      update: vi.fn().mockResolvedValue({ id: "ep-1", name: "Updated" }),
      delete: vi.fn().mockResolvedValue({ id: "ep-1" }),
      count: vi.fn().mockResolvedValue(1),
    },
    webhookDelivery: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  return { db };
}

describe("buildWebhookRoutes", () => {
  it("createEndpoint generates a secret and stores endpoint", async () => {
    const { db } = makeDeps();
    const routes = buildWebhookRoutes({ db: db as any });
    const result = await routes.createEndpoint({
      orgId: "org-1",
      body: { name: "Test", url: "https://example.com/hook", channelType: "http", topics: ["scan.completed"] },
      createdBy: "admin",
    });
    expect(db.webhookEndpoint.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org-1", name: "Test", url: "https://example.com/hook",
        channelType: "http", topics: ["scan.completed"],
        secret: expect.stringMatching(/^whsec_/),
      }),
    });
    expect(result.id).toBe("ep-1");
  });

  it("listEndpoints returns paginated results", async () => {
    const { db } = makeDeps();
    const routes = buildWebhookRoutes({ db: db as any });
    const result = await routes.listEndpoints({ orgId: "org-1", limit: 50, offset: 0 });
    expect(db.webhookEndpoint.findMany).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it("getEndpoint returns single endpoint", async () => {
    const { db } = makeDeps();
    const routes = buildWebhookRoutes({ db: db as any });
    const result = await routes.getEndpoint("ep-1");
    expect(db.webhookEndpoint.findUnique).toHaveBeenCalledWith({ where: { id: "ep-1" } });
    expect(result?.id).toBe("ep-1");
  });

  it("updateEndpoint modifies endpoint", async () => {
    const { db } = makeDeps();
    const routes = buildWebhookRoutes({ db: db as any });
    const result = await routes.updateEndpoint("ep-1", { name: "Updated" });
    expect(db.webhookEndpoint.update).toHaveBeenCalledWith({
      where: { id: "ep-1" }, data: expect.objectContaining({ name: "Updated" }),
    });
    expect(result.name).toBe("Updated");
  });

  it("deleteEndpoint removes endpoint", async () => {
    const { db } = makeDeps();
    const routes = buildWebhookRoutes({ db: db as any });
    await routes.deleteEndpoint("ep-1");
    expect(db.webhookEndpoint.delete).toHaveBeenCalledWith({ where: { id: "ep-1" } });
  });

  it("getDeliveries returns paginated delivery log", async () => {
    const { db } = makeDeps();
    const routes = buildWebhookRoutes({ db: db as any });
    const result = await routes.getDeliveries({ endpointId: "ep-1", limit: 50, offset: 0 });
    expect(db.webhookDelivery.findMany).toHaveBeenCalled();
    expect(result.deliveries).toEqual([]);
  });
});
