import cron from "node-cron";
import { createLogger } from "@sentinel/telemetry";

const logger = createLogger({ name: "org-schedule-manager" });

export class OrgScheduleManager {
  private overrides = new Map<string, string>();
  private orgTasks = new Map<string, cron.ScheduledTask>();
  private jobExecutor: ((orgId: string) => Promise<void>) | null = null;

  constructor(private db: any, private defaultSchedule: string) {}

  /** Set the callback that fires per-org scans. */
  setJobExecutor(executor: (orgId: string) => Promise<void>): void {
    this.jobExecutor = executor;
  }

  async loadOverrides(): Promise<void> {
    try {
      const orgs = await this.db.organization.findMany({
        select: { id: true, settings: true },
      });
      const newOverrides = new Map<string, string>();
      for (const org of orgs) {
        const schedule = (org.settings as any)?.scanSchedule;
        if (schedule && typeof schedule === "string" && schedule.trim()) {
          newOverrides.set(org.id, schedule);
        }
      }

      // Reconcile per-org cron tasks
      this._reconcileTasks(newOverrides);
      this.overrides = newOverrides;
      logger.info({ count: newOverrides.size }, "Org schedule overrides loaded");
    } catch (err) {
      logger.warn({ err }, "Failed to load org schedule overrides");
    }
  }

  /** Create/update/remove per-org cron tasks to match current overrides. */
  private _reconcileTasks(newOverrides: Map<string, string>): void {
    if (!this.jobExecutor) return;
    const executor = this.jobExecutor;

    // Remove tasks for orgs no longer having overrides
    for (const [orgId, task] of this.orgTasks) {
      if (!newOverrides.has(orgId)) {
        task.stop();
        this.orgTasks.delete(orgId);
        logger.info({ orgId }, "Removed per-org scan schedule");
      }
    }

    // Create or update tasks
    for (const [orgId, schedule] of newOverrides) {
      const existing = this.orgTasks.get(orgId);
      const currentSchedule = this.overrides.get(orgId);

      if (existing && currentSchedule === schedule) {
        continue; // No change
      }

      // Schedule changed or new org — (re)create
      if (existing) existing.stop();

      if (!cron.validate(schedule)) {
        logger.warn({ orgId, schedule }, "Invalid per-org cron expression, skipping");
        continue;
      }

      const task = cron.schedule(schedule, async () => {
        try {
          await executor(orgId);
        } catch (err) {
          logger.error({ err, orgId }, "Per-org scan execution failed");
        }
      });
      this.orgTasks.set(orgId, task);
      logger.info({ orgId, schedule }, "Created per-org scan schedule");
    }
  }

  /** Stop all per-org tasks on shutdown. */
  stopAll(): void {
    for (const [, task] of this.orgTasks) {
      task.stop();
    }
    this.orgTasks.clear();
  }

  getSchedule(orgId: string): string {
    return this.overrides.get(orgId) ?? this.defaultSchedule;
  }

  getActiveOverrides(): Record<string, string> {
    return Object.fromEntries(this.overrides);
  }
}
