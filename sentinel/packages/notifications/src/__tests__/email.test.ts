import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailAdapter } from "../adapters/email.js";
import type { NotificationEvent, NotificationRuleConfig } from "../types.js";

const rule: NotificationRuleConfig = {
  id: "rule-1",
  orgId: "org-1",
  name: "Email Alerts",
  topics: ["scan.completed"],
  condition: null,
  channelType: "email",
  channelConfig: {
    to: ["admin@example.com", "dev@example.com"],
    from: "sentinel@example.com",
    subject: "SENTINEL Alert: {{topic}}",
  },
  enabled: true,
};

const event: NotificationEvent = {
  id: "evt-1",
  orgId: "org-1",
  topic: "scan.completed",
  payload: { scanId: "scan-123", riskScore: 42, verdict: "pass" },
  timestamp: "2026-03-10T12:00:00Z",
};

describe("EmailAdapter", () => {
  let sendMailSpy: ReturnType<typeof vi.fn>;
  let adapter: EmailAdapter;

  beforeEach(() => {
    sendMailSpy = vi.fn().mockResolvedValue({ messageId: "msg-1" });
    const mockTransport = { sendMail: sendMailSpy };
    adapter = new EmailAdapter(mockTransport as any);
  });

  it("sends email with HTML body", async () => {
    const result = await adapter.deliver(rule, event);
    expect(result.success).toBe(true);
    expect(sendMailSpy).toHaveBeenCalledTimes(1);
    const mailOpts = sendMailSpy.mock.calls[0][0];
    expect(mailOpts.to).toBe("admin@example.com, dev@example.com");
    expect(mailOpts.from).toBe("sentinel@example.com");
    expect(mailOpts.html).toContain("scan.completed");
  });

  it("substitutes topic in subject line", async () => {
    const result = await adapter.deliver(rule, event);
    expect(result.success).toBe(true);
    const mailOpts = sendMailSpy.mock.calls[0][0];
    expect(mailOpts.subject).toBe("SENTINEL Alert: scan.completed");
  });

  it("includes payload data in HTML body", async () => {
    await adapter.deliver(rule, event);
    const mailOpts = sendMailSpy.mock.calls[0][0];
    expect(mailOpts.html).toContain("scan-123");
    expect(mailOpts.html).toContain("42");
  });

  it("returns failure on SMTP error", async () => {
    sendMailSpy.mockRejectedValue(new Error("SMTP connection refused"));
    const result = await adapter.deliver(rule, event);
    expect(result.success).toBe(false);
    expect(result.error).toContain("SMTP connection refused");
  });
});
