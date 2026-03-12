import { createLogger } from "@sentinel/telemetry";

const logger = createLogger({ name: "org-schedule-manager" });

export class OrgScheduleManager {
  private overrides = new Map<string, string>();

  constructor(private db: any, private defaultSchedule: string) {}

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
      this.overrides = newOverrides;
      logger.info({ count: newOverrides.size }, "Org schedule overrides loaded");
    } catch (err) {
      logger.warn({ err }, "Failed to load org schedule overrides");
    }
  }

  getSchedule(orgId: string): string {
    return this.overrides.get(orgId) ?? this.defaultSchedule;
  }

  getActiveOverrides(): Record<string, string> {
    return Object.fromEntries(this.overrides);
  }
}
