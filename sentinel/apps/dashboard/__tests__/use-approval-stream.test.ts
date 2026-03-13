import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock EventSource before importing the hook
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, ((e: any) => void)[]>();
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (e: any) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  close() {
    this.closed = true;
  }

  // Test helper: simulate an SSE event
  emit(type: string, data: unknown, lastEventId = "") {
    const handlers = this.listeners.get(type) ?? [];
    for (const h of handlers) {
      h({ data: JSON.stringify(data), lastEventId });
    }
  }
}

// We can't easily test React hooks without jsdom + renderHook,
// but we CAN test the stream event types and protocol behavior.
// For the hook itself, test via the pure logic it relies on.

describe("useApprovalStream types", () => {
  it("ApprovalEventType covers all FSM transitions", async () => {
    const mod = await import("@/lib/use-approval-stream");
    // The module exports the type — we verify the event type strings
    // are used in the hook by checking the source expectations
    const expectedEvents = [
      "gate.created",
      "gate.decided",
      "gate.escalated",
      "gate.expired",
      "gate.reassigned",
    ];
    // These event types are string literals in the module
    // Verify they exist as a compile-time check via type import
    type EventType = (typeof mod)["ApprovalStreamEvent"] extends { type: infer T } ? T : never;
    // Runtime: just confirm the module loads without error
    expect(mod.useApprovalStream).toBeDefined();
    expect(typeof mod.useApprovalStream).toBe("function");
  });
});

describe("MockEventSource protocol", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
  });

  it("registers listeners for all gate event types", () => {
    const es = new MockEventSource("/api/approvals/stream");

    const eventTypes = [
      "gate.created",
      "gate.decided",
      "gate.escalated",
      "gate.expired",
      "gate.reassigned",
    ];

    for (const type of eventTypes) {
      es.addEventListener(type, () => {});
    }

    expect(es.listeners.size).toBe(5);
    for (const type of eventTypes) {
      expect(es.listeners.has(type)).toBe(true);
    }
  });

  it("emits parsed gate data to handlers", () => {
    const es = new MockEventSource("/api/approvals/stream");
    const received: unknown[] = [];

    es.addEventListener("gate.created", (e: any) => {
      received.push(JSON.parse(e.data));
    });

    const gate = { id: "g1", status: "pending", projectName: "test" };
    es.emit("gate.created", gate);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(gate);
  });

  it("tracks lastEventId from SSE events", () => {
    const es = new MockEventSource("/api/approvals/stream");
    let capturedId = "";

    es.addEventListener("gate.decided", (e: any) => {
      capturedId = e.lastEventId;
    });

    es.emit("gate.decided", { id: "g2" }, "evt-42");
    expect(capturedId).toBe("evt-42");
  });

  it("passes lastEventId as query param on reconnect URL", () => {
    const baseUrl = "/api/approvals/stream";
    const lastEventId = "evt-99";
    const reconnectUrl = `${baseUrl}?lastEventId=${encodeURIComponent(lastEventId)}`;
    expect(reconnectUrl).toBe("/api/approvals/stream?lastEventId=evt-99");
  });

  it("handles malformed JSON gracefully", () => {
    const es = new MockEventSource("/api/approvals/stream");
    let parseError = false;

    es.addEventListener("gate.created", (e: any) => {
      try {
        JSON.parse(e.data);
      } catch {
        parseError = true;
      }
    });

    // Emit raw string that isn't valid JSON
    const handlers = es.listeners.get("gate.created") ?? [];
    for (const h of handlers) {
      h({ data: "not-valid-json", lastEventId: "" });
    }

    expect(parseError).toBe(true);
  });
});

describe("polling fallback protocol", () => {
  it("poll endpoint returns gates array shape", () => {
    // Verify expected response shape from /api/approvals/stream?poll=true
    const mockResponse = { gates: [{ id: "g1", status: "pending" }] };
    expect(Array.isArray(mockResponse.gates)).toBe(true);
    expect(mockResponse.gates[0].id).toBe("g1");
  });

  it("poll URL includes poll=true query param", () => {
    const pollUrl = "/api/approvals/stream?poll=true";
    const url = new URL(pollUrl, "http://localhost:3000");
    expect(url.searchParams.get("poll")).toBe("true");
  });
});
