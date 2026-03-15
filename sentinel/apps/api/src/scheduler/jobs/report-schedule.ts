import type { SchedulerJob, JobContext } from "../types.js";
import { computeNextRun } from "../cron-utils.js";

export class ReportScheduleJob implements SchedulerJob {
  name = "report-schedule" as const;
  schedule = "* * * * *";
  tier = "non-critical" as const;
  dependencies = ["redis", "postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const now = new Date();
    const dueSchedules = await ctx.db.reportSchedule.findMany({
      where: { enabled: true, nextRunAt: { lte: now } },
    });

    for (const sched of dueSchedules) {
      try {
        if (sched.reportType === "digest") {
          await ctx.eventBus.publish("sentinel.notifications", {
            id: `evt-digest-${sched.id}-${now.toISOString()}`,
            orgId: sched.orgId,
            topic: "compliance.digest_ready",
            payload: {
              scheduleId: sched.id,
              recipients: sched.recipients,
              frameworkId: sched.frameworkId,
              parameters: sched.parameters,
            },
            timestamp: now.toISOString(),
          });
        } else {
          const report = await ctx.db.report.create({
            data: {
              orgId: sched.orgId,
              type: sched.reportType,
              frameworkId: sched.frameworkId,
              parameters: sched.parameters ?? {},
              requestedBy: "scheduler",
            },
          });
          await ctx.eventBus.publish("sentinel.reports", {
            reportId: report.id,
            orgId: sched.orgId,
            type: sched.reportType,
            frameworkId: sched.frameworkId,
            parameters: sched.parameters,
          });
        }

        const nextRunAt = computeNextRun(sched.cronExpression, sched.timezone);
        await ctx.db.reportSchedule.update({
          where: { id: sched.id },
          data: { lastRunAt: now, lastStatus: "triggered", nextRunAt },
        });
      } catch (err) {
        ctx.logger.error(
          { scheduleId: sched.id, err },
          "Failed to trigger report schedule",
        );
        await ctx.db.reportSchedule
          .update({
            where: { id: sched.id },
            data: { lastStatus: "failed" },
          })
          .catch(() => {});
      }
    }

    if (dueSchedules.length > 0) {
      ctx.logger.info(
        { count: dueSchedules.length },
        "Report schedules triggered",
      );
    }
  }
}
