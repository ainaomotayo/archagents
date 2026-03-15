import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlackAdapter } from "../adapters/slack.js";
import type { NotificationEvent, NotificationRuleConfig } from "../types.js";

const rule: NotificationRuleConfig = {
  id: "rule-1",
  orgId: "org-1",
  name: "Slack Critical",
  topics: ["finding.critical"],
  condition: null,
  channelType: "slack",
  channelConfig: {
    webhookUrl: "https://hooks.slack.com/services/T00/B00/xxx",
  },
  enabled: true,
};

const event: NotificationEvent = {
  id: "evt-1",
  orgId: "org-1",
  topic: "finding.critical",
  payload: {
    findingId: "f-1",
    severity: "critical",
    category: "vulnerability/sql-injection",
    file: "src/db.ts",
  },
  timestamp: "2026-03-10T12:00:00Z",
};

describe("SlackAdapter", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let adapter: SlackAdapter;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    adapter = new SlackAdapter(fetchSpy as typeof fetch);
  });

  it("sends Block Kit formatted message", async () => {
    const result = await adapter.deliver(rule, event);
    expect(result.success).toBe(true);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/services/T00/B00/xxx");
    const body = JSON.parse(opts.body);
    expect(body.blocks).toBeDefined();
    expect(body.blocks.length).toBeGreaterThan(0);
  });

  it("uses severity-based color coding", async () => {
    await adapter.deliver(rule, event);
    const [, opts] = fetchSpy.mock.calls[0];
    const body = JSON.parse(opts.body);
    const attachment = body.attachments?.[0];
    expect(attachment?.color).toBe("#dc2626");
  });

  it("returns failure on Slack API error", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    });
    const result = await adapter.deliver(rule, event);
    expect(result.success).toBe(false);
    expect(result.error).toContain("403");
  });

  it("returns failure on network error", async () => {
    fetchSpy.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await adapter.deliver(rule, event);
    expect(result.success).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("includes event details in message fields", async () => {
    await adapter.deliver(rule, event);
    const [, opts] = fetchSpy.mock.calls[0];
    const body = JSON.parse(opts.body);
    const text = JSON.stringify(body);
    expect(text).toContain("finding.critical");
    expect(text).toContain("evt-1");
  });
});
