import { VALID_REPORT_TYPES } from "@sentinel/compliance";
import {
  computeNextRun,
  validateCronExpression,
} from "../scheduler/cron-utils.js";

interface ReportScheduleRouteDeps {
  db: any;
  eventBus: { publish: (stream: string, payload: any) => Promise<void> };
}

interface ListParams {
  limit: number;
  offset: number;
}

interface CreateBody {
  name: string;
  reportType: string;
  cronExpression: string;
  recipients: string[];
  timezone: string;
  frameworkId?: string;
  parameters?: Record<string, unknown>;
  enabled?: boolean;
}

interface UpdateBody {
  name?: string;
  reportType?: string;
  cronExpression?: string;
  recipients?: string[];
  timezone?: string;
  frameworkId?: string;
  parameters?: Record<string, unknown>;
  enabled?: boolean;
}

export function buildReportScheduleRoutes(deps: ReportScheduleRouteDeps) {
  const { db, eventBus } = deps;

  return {
    async list(orgId: string, params: ListParams) {
      const [schedules, total] = await Promise.all([
        db.reportSchedule.findMany({
          where: { orgId },
          take: params.limit,
          skip: params.offset,
          orderBy: { createdAt: "desc" },
        }),
        db.reportSchedule.count({ where: { orgId } }),
      ]);
      return { schedules, total };
    },

    async get(orgId: string, id: string) {
      return db.reportSchedule.findFirst({ where: { id, orgId } });
    },

    async create(orgId: string, body: CreateBody, userId: string) {
      // Validate report type
      if (
        !VALID_REPORT_TYPES.includes(
          body.reportType as (typeof VALID_REPORT_TYPES)[number],
        )
      ) {
        throw new Error(
          `Invalid report type: ${body.reportType}. Must be one of: ${VALID_REPORT_TYPES.join(", ")}`,
        );
      }

      // Validate cron expression
      const cronResult = validateCronExpression(body.cronExpression);
      if (!cronResult.valid) {
        throw new Error(`Invalid cron expression: ${cronResult.error}`);
      }

      const nextRunAt = computeNextRun(body.cronExpression, body.timezone);

      return db.reportSchedule.create({
        data: {
          orgId,
          name: body.name,
          reportType: body.reportType,
          cronExpression: body.cronExpression,
          recipients: body.recipients,
          timezone: body.timezone,
          frameworkId: body.frameworkId ?? null,
          parameters: body.parameters ?? {},
          enabled: body.enabled ?? true,
          nextRunAt,
          createdBy: userId,
        },
      });
    },

    async update(orgId: string, id: string, body: UpdateBody) {
      const existing = await db.reportSchedule.findFirst({
        where: { id, orgId },
      });
      if (!existing) {
        throw new Error(`Schedule not found: ${id}`);
      }

      if (body.reportType) {
        if (
          !VALID_REPORT_TYPES.includes(
            body.reportType as (typeof VALID_REPORT_TYPES)[number],
          )
        ) {
          throw new Error(
            `Invalid report type: ${body.reportType}. Must be one of: ${VALID_REPORT_TYPES.join(", ")}`,
          );
        }
      }

      if (body.cronExpression) {
        const cronResult = validateCronExpression(body.cronExpression);
        if (!cronResult.valid) {
          throw new Error(`Invalid cron expression: ${cronResult.error}`);
        }
      }

      const data: Record<string, unknown> = { ...body };

      // Recompute nextRunAt if cron or timezone changed
      if (body.cronExpression || body.timezone) {
        const cron = body.cronExpression ?? existing.cronExpression;
        const tz = body.timezone ?? existing.timezone;
        data.nextRunAt = computeNextRun(cron, tz);
      }

      return db.reportSchedule.update({ where: { id }, data });
    },

    async remove(orgId: string, id: string) {
      const existing = await db.reportSchedule.findFirst({
        where: { id, orgId },
      });
      if (!existing) {
        throw new Error(`Schedule not found: ${id}`);
      }
      return db.reportSchedule.delete({ where: { id } });
    },

    async trigger(orgId: string, id: string) {
      const sched = await db.reportSchedule.findFirst({
        where: { id, orgId },
      });
      if (!sched) {
        throw new Error(`Schedule not found: ${id}`);
      }

      const now = new Date();

      if (sched.reportType === "digest") {
        await eventBus.publish("sentinel.notifications", {
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
        const report = await db.report.create({
          data: {
            orgId: sched.orgId,
            type: sched.reportType,
            frameworkId: sched.frameworkId,
            parameters: sched.parameters ?? {},
            requestedBy: "manual",
          },
        });
        await eventBus.publish("sentinel.reports", {
          reportId: report.id,
          orgId: sched.orgId,
          type: sched.reportType,
          frameworkId: sched.frameworkId,
          parameters: sched.parameters,
        });
      }

      // Update next run
      const nextRunAt = computeNextRun(sched.cronExpression, sched.timezone);
      await db.reportSchedule.update({
        where: { id: sched.id },
        data: { lastRunAt: now, lastStatus: "triggered", nextRunAt },
      });
    },
  };
}
