import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReportScheduleJob } from "../report-schedule.js";

describe("ReportScheduleJob", () => {
  let job: ReportScheduleJob;
  let ctx: any;

  beforeEach(() => {
    job = new ReportScheduleJob();
    ctx = {
      db: {
        reportSchedule: {
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn().mockResolvedValue({}),
        },
        report: {
          create: vi.fn().mockResolvedValue({ id: "report-1" }),
        },
      },
      eventBus: { publish: vi.fn() },
      logger: { info: vi.fn(), error: vi.fn() },
      metrics: { recordTrigger: vi.fn(), recordError: vi.fn() },
      audit: { log: vi.fn() },
      redis: {},
    };
  });

  it("has correct metadata", () => {
    expect(job.name).toBe("report-schedule");
    expect(job.schedule).toBe("* * * * *");
    expect(job.tier).toBe("non-critical");
    expect(job.dependencies).toContain("redis");
    expect(job.dependencies).toContain("postgres");
  });

  it("does nothing when no schedules are due", async () => {
    await job.execute(ctx);
    expect(ctx.db.report.create).not.toHaveBeenCalled();
    expect(ctx.eventBus.publish).not.toHaveBeenCalled();
  });

  it("triggers PDF report type through sentinel.reports", async () => {
    ctx.db.reportSchedule.findMany.mockResolvedValue([
      {
        id: "sched-1",
        orgId: "org-1",
        reportType: "nist_profile",
        frameworkId: "fw-1",
        cronExpression: "0 8 * * 1",
        timezone: "UTC",
        recipients: ["a@b.com"],
        parameters: {},
      },
    ]);

    await job.execute(ctx);

    expect(ctx.db.report.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org-1",
        type: "nist_profile",
        frameworkId: "fw-1",
        requestedBy: "scheduler",
      }),
    });
    expect(ctx.eventBus.publish).toHaveBeenCalledWith(
      "sentinel.reports",
      expect.objectContaining({
        reportId: "report-1",
        orgId: "org-1",
        type: "nist_profile",
      }),
    );
  });

  it("triggers digest type directly to sentinel.notifications", async () => {
    ctx.db.reportSchedule.findMany.mockResolvedValue([
      {
        id: "sched-2",
        orgId: "org-1",
        reportType: "digest",
        frameworkId: null,
        cronExpression: "0 8 * * 1",
        timezone: "UTC",
        recipients: ["a@b.com"],
        parameters: {},
      },
    ]);

    await job.execute(ctx);

    expect(ctx.db.report.create).not.toHaveBeenCalled();
    expect(ctx.eventBus.publish).toHaveBeenCalledWith(
      "sentinel.notifications",
      expect.objectContaining({
        orgId: "org-1",
        topic: "compliance.digest_ready",
        payload: expect.objectContaining({
          scheduleId: "sched-2",
          recipients: ["a@b.com"],
        }),
      }),
    );
  });

  it("advances nextRunAt after triggering", async () => {
    ctx.db.reportSchedule.findMany.mockResolvedValue([
      {
        id: "sched-1",
        orgId: "org-1",
        reportType: "executive",
        frameworkId: null,
        cronExpression: "0 8 * * 1",
        timezone: "UTC",
        recipients: ["a@b.com"],
        parameters: {},
      },
    ]);

    await job.execute(ctx);

    expect(ctx.db.reportSchedule.update).toHaveBeenCalledWith({
      where: { id: "sched-1" },
      data: expect.objectContaining({
        lastStatus: "triggered",
        nextRunAt: expect.any(Date),
      }),
    });
  });

  it("handles multiple due schedules", async () => {
    ctx.db.reportSchedule.findMany.mockResolvedValue([
      {
        id: "s1",
        orgId: "org-1",
        reportType: "digest",
        cronExpression: "0 8 * * 1",
        timezone: "UTC",
        recipients: ["a@b.com"],
        parameters: {},
      },
      {
        id: "s2",
        orgId: "org-2",
        reportType: "executive",
        cronExpression: "0 8 1 * *",
        timezone: "UTC",
        recipients: ["c@d.com"],
        parameters: {},
      },
    ]);

    await job.execute(ctx);

    expect(ctx.eventBus.publish).toHaveBeenCalledTimes(2);
  });

  it("logs count when schedules triggered", async () => {
    ctx.db.reportSchedule.findMany.mockResolvedValue([
      {
        id: "s1",
        orgId: "org-1",
        reportType: "digest",
        cronExpression: "0 8 * * 1",
        timezone: "UTC",
        recipients: [],
        parameters: {},
      },
    ]);

    await job.execute(ctx);
    expect(ctx.logger.info).toHaveBeenCalledWith(
      { count: 1 },
      "Report schedules triggered",
    );
  });
});
