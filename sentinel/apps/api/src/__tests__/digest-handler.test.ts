import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentinel/compliance", () => ({
  buildDigestEmailHtml: vi.fn().mockReturnValue("<html>digest</html>"),
}));

import { handleDigestEvent } from "../notification-worker.js";

describe("handleDigestEvent", () => {
  let deps: any;
  const mockSnapshot = {
    metrics: {
      scanVolume: { total: 10, weekOverWeek: 2 },
      findingSummary: { critical: 1, high: 2, medium: 3, low: 4, weekOverWeek: { critical: 0, high: 0, medium: 0, low: 0 } },
      frameworkScores: [],
      attestationSummary: { total: 10, attested: 5, expired: 1, expiringSoon: 1 },
      remediationSummary: { open: 3, inProgress: 2, completed: 5, avgResolutionHours: 24 },
      aiMetrics: { aiRatio: 0.1, avgProbability: 0.5, weekOverWeek: 0 },
      topFindings: [],
    },
  };

  beforeEach(() => {
    deps = {
      db: {
        digestSnapshot: { findFirst: vi.fn().mockResolvedValue(mockSnapshot) },
        reportSchedule: { update: vi.fn().mockResolvedValue({}) },
      },
      registry: {
        get: vi.fn().mockReturnValue({
          deliver: vi.fn().mockResolvedValue({ success: true, durationMs: 50 }),
        }),
      },
      redisPub: null,
      dashboardUrl: "https://sentinel.example.com",
    };
  });

  it("sends email to each recipient", async () => {
    const event = {
      id: "evt-1", orgId: "org-1", topic: "compliance.digest_ready",
      payload: { scheduleId: "sched-1", recipients: ["a@b.com", "c@d.com"], parameters: { orgName: "Acme" } },
      timestamp: new Date().toISOString(),
    };
    await handleDigestEvent(event as any, deps);
    const emailAdapter = deps.registry.get("email");
    expect(emailAdapter.deliver).toHaveBeenCalledTimes(2);
  });

  it("updates schedule status to delivered", async () => {
    const event = {
      id: "evt-1", orgId: "org-1", topic: "compliance.digest_ready",
      payload: { scheduleId: "sched-1", recipients: ["a@b.com"], parameters: {} },
      timestamp: new Date().toISOString(),
    };
    await handleDigestEvent(event as any, deps);
    expect(deps.db.reportSchedule.update).toHaveBeenCalledWith({
      where: { id: "sched-1" },
      data: { lastStatus: "delivered" },
    });
  });

  it("skips when no recipients", async () => {
    const event = {
      id: "evt-1", orgId: "org-1", topic: "compliance.digest_ready",
      payload: { scheduleId: "sched-1", recipients: [], parameters: {} },
      timestamp: new Date().toISOString(),
    };
    await handleDigestEvent(event as any, deps);
    expect(deps.registry.get).not.toHaveBeenCalled();
  });

  it("skips when no email adapter available", async () => {
    deps.registry.get.mockReturnValue(null);
    const event = {
      id: "evt-1", orgId: "org-1", topic: "compliance.digest_ready",
      payload: { scheduleId: "sched-1", recipients: ["a@b.com"], parameters: {} },
      timestamp: new Date().toISOString(),
    };
    await handleDigestEvent(event as any, deps);
    // Should not throw
  });

  it("falls back to yesterday snapshot if today missing", async () => {
    deps.db.digestSnapshot.findFirst
      .mockResolvedValueOnce(null) // today
      .mockResolvedValueOnce(mockSnapshot); // yesterday
    const event = {
      id: "evt-1", orgId: "org-1", topic: "compliance.digest_ready",
      payload: { scheduleId: "sched-1", recipients: ["a@b.com"], parameters: {} },
      timestamp: new Date().toISOString(),
    };
    await handleDigestEvent(event as any, deps);
    expect(deps.db.digestSnapshot.findFirst).toHaveBeenCalledTimes(2);
  });
});
