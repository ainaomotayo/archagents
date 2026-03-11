import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SseListener } from "../sse-listener.js";
import type { EventSourceLike, EventSourceConstructor } from "../sse-listener.js";
import type { SentinelEvent } from "../types.js";

function createMockEventSourceClass() {
  const instances: MockEventSource[] = [];

  class MockEventSource implements EventSourceLike {
    url: string;
    onopen: ((evt: unknown) => void) | null = null;
    onmessage: ((evt: { data: string }) => void) | null = null;
    onerror: ((evt: unknown) => void) | null = null;
    close = vi.fn();

    constructor(url: string) {
      this.url = url;
      instances.push(this);
    }
  }

  return { MockEventSource: MockEventSource as unknown as EventSourceConstructor, instances };
}

describe("SseListener", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects with correct URL including topics", () => {
    const { MockEventSource, instances } = createMockEventSourceClass();
    const listener = new SseListener(
      "https://api.sentinel.dev",
      "tok-123",
      "org-1",
      ["scan.*", "finding.*"],
      () => {},
      MockEventSource,
    );

    listener.connect();

    expect(instances).toHaveLength(1);
    const url = (instances[0] as unknown as { url: string }).url;
    expect(url).toContain("/v1/events/stream");
    expect(url).toContain("topics=");
    expect(url).toContain("orgId=org-1");
  });

  it("parses events and calls onEvent", () => {
    const { MockEventSource, instances } = createMockEventSourceClass();
    const onEvent = vi.fn();
    const listener = new SseListener(
      "https://api.sentinel.dev",
      "tok-123",
      "org-1",
      ["scan.*"],
      onEvent,
      MockEventSource,
    );

    listener.connect();

    const event: SentinelEvent = {
      id: "evt-1",
      orgId: "org-1",
      topic: "scan.completed",
      payload: { scanId: "s-1" },
      timestamp: "2026-03-11T00:00:00Z",
    };

    instances[0].onmessage!({ data: JSON.stringify(event) });

    expect(onEvent).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith(event);
  });

  it("reconnects with exponential backoff on error", () => {
    const { MockEventSource, instances } = createMockEventSourceClass();
    const listener = new SseListener(
      "https://api.sentinel.dev",
      "tok-123",
      "org-1",
      ["scan.*"],
      () => {},
      MockEventSource,
    );

    listener.connect();
    expect(instances).toHaveLength(1);

    // First error -> delay 1000ms (2^0 * 1000)
    instances[0].onerror!({});
    expect(instances[0].close).toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(instances).toHaveLength(2);

    // Second error -> delay 2000ms (2^1 * 1000)
    instances[1].onerror!({});
    vi.advanceTimersByTime(1999);
    expect(instances).toHaveLength(2); // not yet
    vi.advanceTimersByTime(1);
    expect(instances).toHaveLength(3);
  });

  it("caps reconnect delay at 30 seconds", () => {
    const { MockEventSource, instances } = createMockEventSourceClass();
    const listener = new SseListener(
      "https://api.sentinel.dev",
      "tok-123",
      "org-1",
      ["scan.*"],
      () => {},
      MockEventSource,
    );

    listener.connect();

    // Trigger many errors to ramp up the backoff
    for (let i = 0; i < 20; i++) {
      const current = instances[instances.length - 1];
      current.onerror!({});
      vi.advanceTimersByTime(30_000);
    }

    // After 20 reconnections, delay should still be capped at 30000
    expect(listener.getReconnectDelay()).toBeLessThanOrEqual(30_000);
  });

  it("disconnect closes event source", () => {
    const { MockEventSource, instances } = createMockEventSourceClass();
    const listener = new SseListener(
      "https://api.sentinel.dev",
      "tok-123",
      "org-1",
      ["scan.*"],
      () => {},
      MockEventSource,
    );

    listener.connect();
    const es = instances[0];

    listener.disconnect();

    expect(es.close).toHaveBeenCalled();
  });
});
