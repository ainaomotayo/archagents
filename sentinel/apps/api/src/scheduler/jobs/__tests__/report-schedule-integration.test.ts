import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReportScheduleJob } from "../report-schedule.js";

describe("ReportScheduleJob integration", () => {
  it("full flow: PDF schedule triggers report pipeline", async () => {
    const job = new ReportScheduleJob();
    const events: Array<{ stream: string; data: any }> = [];
    const ctx: any = {
      db: {
        reportSchedule: {
          findMany: vi.fn().mockResolvedValue([{
            id: "sched-1", orgId: "org-1", reportType: "nist_profile",
            frameworkId: "nist-ai-rmf", cronExpression: "0 8 * * 1", timezone: "UTC",
            recipients: ["admin@acme.com"], parameters: { orgName: "Acme" },
          }]),
          update: vi.fn().mockResolvedValue({}),
        },
        report: { create: vi.fn().mockResolvedValue({ id: "report-42" }) },
      },
      eventBus: { publish: vi.fn(async (stream: string, data: any) => { events.push({ stream, data }); }) },
      logger: { info: vi.fn(), error: vi.fn() },
      metrics: { recordTrigger: vi.fn(), recordError: vi.fn() },
      audit: { log: vi.fn() },
      redis: {},
    };

    await job.execute(ctx);

    expect(ctx.db.report.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orgId: "org-1", type: "nist_profile", requestedBy: "scheduler" }),
    });
    expect(events).toHaveLength(1);
    expect(events[0].stream).toBe("sentinel.reports");
    expect(events[0].data.reportId).toBe("report-42");
    expect(ctx.db.reportSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastStatus: "triggered", nextRunAt: expect.any(Date) }) }),
    );
  });

  it("full flow: digest schedule bypasses report pipeline", async () => {
    const job = new ReportScheduleJob();
    const events: Array<{ stream: string; data: any }> = [];
    const ctx: any = {
      db: {
        reportSchedule: {
          findMany: vi.fn().mockResolvedValue([{
            id: "sched-2", orgId: "org-1", reportType: "digest",
            frameworkId: null, cronExpression: "0 8 * * 1", timezone: "UTC",
            recipients: ["team@acme.com"], parameters: {},
          }]),
          update: vi.fn().mockResolvedValue({}),
        },
        report: { create: vi.fn() },
      },
      eventBus: { publish: vi.fn(async (stream: string, data: any) => { events.push({ stream, data }); }) },
      logger: { info: vi.fn(), error: vi.fn() },
      metrics: { recordTrigger: vi.fn(), recordError: vi.fn() },
      audit: { log: vi.fn() },
      redis: {},
    };

    await job.execute(ctx);

    expect(ctx.db.report.create).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
    expect(events[0].stream).toBe("sentinel.notifications");
    expect(events[0].data.topic).toBe("compliance.digest_ready");
    expect(events[0].data.payload.recipients).toEqual(["team@acme.com"]);
  });
});
