import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatTimeRemaining, GATE_TYPE_LABEL, STATUS_STYLES } from "@/components/approvals/approval-card";

describe("formatTimeRemaining", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'Expired' with urgency 'expired' when expiresAt is in the past", () => {
    const result = formatTimeRemaining("2026-03-13T11:00:00Z");
    expect(result.text).toBe("Expired");
    expect(result.urgency).toBe("expired");
  });

  it("returns minutes with urgency 'critical' when less than 1 hour remaining", () => {
    const result = formatTimeRemaining("2026-03-13T12:30:00Z");
    expect(result.text).toBe("30m left");
    expect(result.urgency).toBe("critical");
  });

  it("returns hours with urgency 'critical' when 1-4 hours remaining", () => {
    const result = formatTimeRemaining("2026-03-13T14:00:00Z");
    expect(result.text).toBe("2.0h left");
    expect(result.urgency).toBe("critical");
  });

  it("returns hours with urgency 'warn' when 4-8 hours remaining", () => {
    const result = formatTimeRemaining("2026-03-13T18:00:00Z");
    expect(result.text).toBe("6.0h left");
    expect(result.urgency).toBe("warn");
  });

  it("returns hours with urgency 'ok' when more than 8 hours remaining", () => {
    const result = formatTimeRemaining("2026-03-14T00:00:00Z");
    expect(result.text).toBe("12h left");
    expect(result.urgency).toBe("ok");
  });
});

describe("GATE_TYPE_LABEL", () => {
  it("maps risk_threshold to 'Risk Threshold'", () => {
    expect(GATE_TYPE_LABEL["risk_threshold"]).toBe("Risk Threshold");
  });

  it("maps category_block to 'Category Block'", () => {
    expect(GATE_TYPE_LABEL["category_block"]).toBe("Category Block");
  });

  it("maps license_review to 'License Review'", () => {
    expect(GATE_TYPE_LABEL["license_review"]).toBe("License Review");
  });

  it("maps always_review to 'Always Review'", () => {
    expect(GATE_TYPE_LABEL["always_review"]).toBe("Always Review");
  });
});

describe("STATUS_STYLES", () => {
  it("has styles for all 5 statuses", () => {
    const statuses = ["pending", "escalated", "approved", "rejected", "expired"];
    for (const s of statuses) {
      const style = STATUS_STYLES[s as keyof typeof STATUS_STYLES];
      expect(style).toBeDefined();
      expect(style.bg).toBeTruthy();
      expect(style.text).toBeTruthy();
      expect(style.dot).toBeTruthy();
      expect(style.border).toBeTruthy();
    }
  });

  it("pending uses warn colors", () => {
    expect(STATUS_STYLES.pending.text).toContain("status-warn");
  });

  it("escalated uses fail colors", () => {
    expect(STATUS_STYLES.escalated.text).toContain("status-fail");
  });

  it("approved uses pass colors", () => {
    expect(STATUS_STYLES.approved.text).toContain("status-pass");
  });
});
