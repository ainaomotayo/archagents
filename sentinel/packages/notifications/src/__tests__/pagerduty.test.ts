import { describe, it, expect, vi, beforeEach } from "vitest";
import { PagerDutyAdapter } from "../adapters/pagerduty.js";
import type { NotificationEvent, NotificationRuleConfig } from "../types.js";

const rule: NotificationRuleConfig = {
  id: "rule-1", orgId: "org-1", name: "PD Critical", topics: ["finding.critical"],
  condition: null, channelType: "pagerduty",
  channelConfig: { routingKey: "R0123456789ABCDEF" }, enabled: true,
};

const event: NotificationEvent = {
  id: "evt-1", orgId: "org-1", topic: "finding.critical",
  payload: { findingId: "f-1", severity: "critical", category: "vulnerability/rce", file: "src/exec.ts" },
  timestamp: "2026-03-10T12:00:00Z",
};

describe("PagerDutyAdapter", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let adapter: PagerDutyAdapter;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    adapter = new PagerDutyAdapter(fetchSpy as typeof fetch);
  });

  it("sends PD Events API v2 payload with routing key", async () => {
    const result = await adapter.deliver(rule, event);
    expect(result.success).toBe(true);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://events.pagerduty.com/v2/enqueue");
    const body = JSON.parse(opts.body);
    expect(body.routing_key).toBe("R0123456789ABCDEF");
    expect(body.event_action).toBe("trigger");
  });

  it("maps SENTINEL severity to PD severity", async () => {
    await adapter.deliver(rule, event);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.payload.severity).toBe("critical");
  });

  it("includes dedup key from event ID", async () => {
    await adapter.deliver(rule, event);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.dedup_key).toBe("sentinel-evt-1");
  });

  it("returns failure on PD API error", async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 429, statusText: "Rate Limited" });
    const result = await adapter.deliver(rule, event);
    expect(result.success).toBe(false);
    expect(result.error).toContain("429");
  });
});
