import type { SchedulerJob, JobContext } from "../types.js";

const SERVICE_HEALTH_ENDPOINTS = [
  { name: "assessor-worker", url: `http://localhost:${process.env.WORKER_HEALTH_PORT ?? "9092"}/health` },
  { name: "report-worker", url: `http://localhost:${process.env.REPORT_WORKER_PORT ?? "9094"}/health` },
  { name: "notification-worker", url: `http://localhost:${process.env.NOTIFICATION_WORKER_PORT ?? "9095"}/health` },
];

export class HealthCheckJob implements SchedulerJob {
  name = "health-check" as const;
  schedule = "*/5 * * * *";
  tier = "non-critical" as const;
  dependencies = ["redis"] as const;

  async execute(ctx: JobContext): Promise<void> {
    // Check for timed-out scans
    if (ctx.lifecycleTracker) {
      const timeoutMs = parseInt(process.env.SCAN_TIMEOUT_MS ?? "300000", 10);
      const timedOut = await ctx.lifecycleTracker.checkTimeouts(timeoutMs);
      for (const scanId of timedOut) {
        await ctx.eventBus.publish("sentinel.notifications", {
          id: `evt-timeout-${scanId}`,
          orgId: "system",
          topic: "system.scan_timeout",
          payload: { scanId, timeoutMs },
          timestamp: new Date().toISOString(),
        });
        ctx.logger.warn({ scanId, timeoutMs }, "Scan timed out");
      }
    }

    // Check service health endpoints
    for (const svc of SERVICE_HEALTH_ENDPOINTS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(svc.url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) {
          ctx.logger.warn({ service: svc.name, status: res.status }, "Service health check returned non-OK");
          await ctx.eventBus.publish("sentinel.notifications", {
            id: `evt-health-${svc.name}-${Date.now()}`,
            orgId: "system",
            topic: "system.health_degraded",
            payload: { service: svc.name, status: res.status, reason: "non-ok response" },
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        ctx.logger.warn({ service: svc.name, err }, "Service health check failed");
        await ctx.eventBus.publish("sentinel.notifications", {
          id: `evt-health-${svc.name}-${Date.now()}`,
          orgId: "system",
          topic: "system.health_degraded",
          payload: { service: svc.name, reason: String(err) },
          timestamp: new Date().toISOString(),
        });
      }
    }
  }
}
