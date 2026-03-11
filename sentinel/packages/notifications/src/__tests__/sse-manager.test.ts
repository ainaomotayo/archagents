import { describe, it, expect, vi, beforeEach } from "vitest";
import { SseManager } from "../sse-manager.js";
import type { SseClient, NotificationEvent } from "../types.js";

function mockClient(overrides: Partial<SseClient> = {}): SseClient {
  return {
    id: `client-${Math.random().toString(36).slice(2, 8)}`,
    orgId: "org-1",
    topics: ["scan.*"],
    write: vi.fn().mockReturnValue(true),
    close: vi.fn(),
    ...overrides,
  };
}

const event: NotificationEvent = {
  id: "evt-1", orgId: "org-1", topic: "scan.completed",
  payload: { scanId: "scan-123" }, timestamp: "2026-03-10T12:00:00Z",
};

describe("SseManager", () => {
  let manager: SseManager;

  beforeEach(() => { manager = new SseManager(); });

  it("registers client and broadcasts matching events", () => {
    const client = mockClient();
    manager.register(client);
    manager.broadcast(event);
    expect(client.write).toHaveBeenCalledTimes(1);
    const written = (client.write as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(written).toContain("event: scan.completed");
    expect(written).toContain('"scanId":"scan-123"');
  });

  it("does not send to clients with non-matching topics", () => {
    const client = mockClient({ topics: ["finding.*"] });
    manager.register(client);
    manager.broadcast(event);
    expect(client.write).not.toHaveBeenCalled();
  });

  it("isolates events by orgId", () => {
    const client1 = mockClient({ orgId: "org-1" });
    const client2 = mockClient({ orgId: "org-2" });
    manager.register(client1);
    manager.register(client2);
    manager.broadcast(event);
    expect(client1.write).toHaveBeenCalled();
    expect(client2.write).not.toHaveBeenCalled();
  });

  it("removes disconnected clients", () => {
    const client = mockClient();
    manager.register(client);
    manager.unregister(client.id, client.orgId);
    manager.broadcast(event);
    expect(client.write).not.toHaveBeenCalled();
  });

  it("returns connection count per org", () => {
    manager.register(mockClient({ orgId: "org-1" }));
    manager.register(mockClient({ orgId: "org-1" }));
    manager.register(mockClient({ orgId: "org-2" }));
    expect(manager.connectionCount("org-1")).toBe(2);
    expect(manager.connectionCount("org-2")).toBe(1);
    expect(manager.connectionCount("org-3")).toBe(0);
  });

  it("cleans up clients that fail to write", () => {
    const client = mockClient();
    (client.write as ReturnType<typeof vi.fn>).mockReturnValue(false);
    manager.register(client);
    manager.broadcast(event);
    expect(manager.connectionCount("org-1")).toBe(0);
    expect(client.close).toHaveBeenCalled();
  });
});
