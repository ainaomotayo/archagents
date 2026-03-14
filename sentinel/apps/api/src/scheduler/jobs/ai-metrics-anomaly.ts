import { AIMetricsService } from "@sentinel/compliance";
import type { SchedulerJob, JobContext } from "../types.js";

const ALERT_TOPIC_MAP: Record<string, string> = {
  threshold_exceeded: "ai-metrics.alert.threshold",
  spike_detected: "ai-metrics.alert.spike",
  new_tool: "ai-metrics.alert.new-tool",
};

export class AIMetricsAnomalyJob implements SchedulerJob {
  name = "ai-metrics-anomaly-check" as const;
  schedule = "0 * * * *"; // Hourly
  tier = "non-critical" as const;
  dependencies = ["postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const orgs = await ctx.db.organization.findMany({ select: { id: true } });
    const service = new AIMetricsService(ctx.db);
    let alertCount = 0;

    for (const org of orgs) {
      try {
        const alerts = await service.getActiveAlerts(org.id);

        for (const alert of alerts) {
          const topic = ALERT_TOPIC_MAP[alert.type] ?? "ai-metrics.alert.unknown";
          await ctx.eventBus.publish("sentinel.notifications", {
            id: `evt-ai-alert-${org.id}-${alert.type}-${Date.now()}`,
            orgId: org.id,
            topic,
            payload: alert,
            timestamp: new Date().toISOString(),
          });
          alertCount++;
        }
      } catch (err) {
        ctx.logger.error({ orgId: org.id, err }, "Failed to check AI metrics anomalies");
      }
    }

    ctx.logger.info({ alertCount }, "AI metrics anomaly check completed");
  }
}
