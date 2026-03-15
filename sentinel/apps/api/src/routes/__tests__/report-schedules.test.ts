import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildReportScheduleRoutes } from "../report-schedules.js";

describe("Report Schedule Routes", () => {
  let routes: ReturnType<typeof buildReportScheduleRoutes>;
  let db: any;
  let eventBus: any;

  beforeEach(() => {
    db = {
      reportSchedule: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "sched-1", name: "Weekly NIST" }),
        update: vi.fn().mockResolvedValue({ id: "sched-1" }),
        delete: vi.fn().mockResolvedValue({ id: "sched-1" }),
        count: vi.fn().mockResolvedValue(0),
      },
      report: { create: vi.fn().mockResolvedValue({ id: "report-1" }) },
    };
    eventBus = { publish: vi.fn() };
    routes = buildReportScheduleRoutes({ db, eventBus });
  });

  describe("list", () => {
    it("returns schedules for org", async () => {
      db.reportSchedule.findMany.mockResolvedValue([{ id: "sched-1" }]);
      db.reportSchedule.count.mockResolvedValue(1);
      const result = await routes.list("org-1", { limit: 50, offset: 0 });
      expect(result.schedules).toHaveLength(1);
      expect(db.reportSchedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { orgId: "org-1" } }),
      );
    });
  });

  describe("create", () => {
    it("creates schedule with computed nextRunAt", async () => {
      await routes.create("org-1", {
        name: "Weekly NIST",
        reportType: "nist_profile",
        cronExpression: "0 8 * * 1",
        recipients: ["a@b.com"],
        timezone: "UTC",
      }, "user-1");
      expect(db.reportSchedule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: "org-1",
          name: "Weekly NIST",
          reportType: "nist_profile",
          cronExpression: "0 8 * * 1",
          nextRunAt: expect.any(Date),
          createdBy: "user-1",
        }),
      });
    });

    it("rejects invalid cron expression", async () => {
      await expect(routes.create("org-1", {
        name: "Bad",
        reportType: "digest",
        cronExpression: "not-valid",
        recipients: ["a@b.com"],
        timezone: "UTC",
      }, "user-1")).rejects.toThrow(/invalid cron/i);
    });

    it("rejects invalid report type", async () => {
      await expect(routes.create("org-1", {
        name: "Bad",
        reportType: "unknown_type",
        cronExpression: "0 8 * * 1",
        recipients: ["a@b.com"],
        timezone: "UTC",
      }, "user-1")).rejects.toThrow(/invalid report type/i);
    });
  });

  describe("get", () => {
    it("returns schedule by id", async () => {
      db.reportSchedule.findFirst.mockResolvedValue({ id: "sched-1", orgId: "org-1" });
      const result = await routes.get("org-1", "sched-1");
      expect(result).toBeDefined();
    });

    it("returns null for wrong org", async () => {
      db.reportSchedule.findFirst.mockResolvedValue(null);
      const result = await routes.get("org-1", "sched-1");
      expect(result).toBeNull();
    });
  });

  describe("update", () => {
    it("recomputes nextRunAt when cron changes", async () => {
      db.reportSchedule.findFirst.mockResolvedValue({ id: "sched-1", orgId: "org-1", cronExpression: "0 8 * * 1", timezone: "UTC" });
      await routes.update("org-1", "sched-1", { cronExpression: "0 9 * * 1" });
      expect(db.reportSchedule.update).toHaveBeenCalledWith({
        where: { id: "sched-1" },
        data: expect.objectContaining({ cronExpression: "0 9 * * 1", nextRunAt: expect.any(Date) }),
      });
    });
  });

  describe("delete", () => {
    it("deletes schedule for org", async () => {
      db.reportSchedule.findFirst.mockResolvedValue({ id: "sched-1", orgId: "org-1" });
      await routes.remove("org-1", "sched-1");
      expect(db.reportSchedule.delete).toHaveBeenCalledWith({ where: { id: "sched-1" } });
    });

    it("throws if not found", async () => {
      db.reportSchedule.findFirst.mockResolvedValue(null);
      await expect(routes.remove("org-1", "sched-1")).rejects.toThrow();
    });
  });

  describe("trigger", () => {
    it("triggers digest schedule", async () => {
      db.reportSchedule.findFirst.mockResolvedValue({
        id: "sched-1", orgId: "org-1", reportType: "digest",
        recipients: ["a@b.com"], frameworkId: null, parameters: {},
        cronExpression: "0 8 * * 1", timezone: "UTC",
      });
      await routes.trigger("org-1", "sched-1");
      expect(eventBus.publish).toHaveBeenCalledWith(
        "sentinel.notifications",
        expect.objectContaining({ topic: "compliance.digest_ready" }),
      );
    });

    it("triggers PDF schedule through reports stream", async () => {
      db.reportSchedule.findFirst.mockResolvedValue({
        id: "sched-1", orgId: "org-1", reportType: "nist_profile",
        frameworkId: "fw-1", recipients: ["a@b.com"], parameters: {},
        cronExpression: "0 8 * * 1", timezone: "UTC",
      });
      await routes.trigger("org-1", "sched-1");
      expect(db.report.create).toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalledWith("sentinel.reports", expect.any(Object));
    });
  });
});
