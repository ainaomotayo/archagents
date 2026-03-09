import cron from "node-cron";
import http from "node:http";
import { Redis } from "ioredis";
import { EventBus } from "@sentinel/events";
import { SELF_SCAN_CONFIG, validateSelfScanConfig, runRetentionCleanup } from "@sentinel/security";
import { getDb } from "@sentinel/db";
import { createLogger } from "@sentinel/telemetry";

const logger = createLogger({ name: "sentinel-scheduler" });

export interface SchedulerConfig {
  schedule: string;
  cveRescanSchedule: string;
  targets: string[];
  policyPath: string;
  notifyOnFailure: boolean;
  cveRescanEnabled: boolean;
  enabled: boolean;
}

export const RETENTION_SCHEDULE = "0 4 * * *";

export function buildSchedulerConfig(): SchedulerConfig {
  const enabled = process.env.SELF_SCAN_ENABLED !== "false";
  return {
    ...SELF_SCAN_CONFIG,
    enabled,
  };
}

export function shouldTriggerScan(config: SchedulerConfig): boolean {
  if (!config.enabled) return false;
  const validation = validateSelfScanConfig(config);
  return validation.valid;
}

async function triggerSelfScan(eventBus: EventBus, config: SchedulerConfig) {
  const scanPayload = {
    projectId: "self-scan",
    commitHash: `scheduled-${Date.now()}`,
    branch: "main",
    author: "sentinel-scheduler",
    timestamp: new Date().toISOString(),
    files: [],
    toolHints: { tool: "sentinel-self-scan", markers: [] },
    scanConfig: {
      securityLevel: "strict" as const,
      licensePolicy: "default",
      qualityThreshold: 80,
    },
    selfScan: true,
    targets: config.targets,
    policyPath: config.policyPath,
  };

  await eventBus.publish("sentinel.diffs", {
    scanId: `self-scan-${Date.now()}`,
    payload: scanPayload,
    submittedAt: new Date().toISOString(),
    triggeredBy: "scheduler",
  });

  logger.info({ targets: config.targets }, "Self-scan triggered");
}

export class SchedulerMetrics {
  private triggers = new Map<string, number>();
  private errors = new Map<string, number>();
  private lastTrigger = new Map<string, number>();

  recordTrigger(type: string) {
    this.triggers.set(type, (this.triggers.get(type) ?? 0) + 1);
    this.lastTrigger.set(type, Date.now());
  }

  recordError(type: string) {
    this.errors.set(type, (this.errors.get(type) ?? 0) + 1);
  }

  getTriggerCount(type: string): number {
    return this.triggers.get(type) ?? 0;
  }

  getErrorCount(type: string): number {
    return this.errors.get(type) ?? 0;
  }

  toPrometheus(): string {
    const lines: string[] = [];
    lines.push("# HELP sentinel_scheduler_triggers_total Total scheduler triggers");
    lines.push("# TYPE sentinel_scheduler_triggers_total counter");
    for (const [type, count] of this.triggers) {
      lines.push(`sentinel_scheduler_triggers_total{type="${type}"} ${count}`);
    }
    lines.push("# HELP sentinel_scheduler_errors_total Total scheduler errors");
    lines.push("# TYPE sentinel_scheduler_errors_total counter");
    for (const [type, count] of this.errors) {
      lines.push(`sentinel_scheduler_errors_total{type="${type}"} ${count}`);
    }
    lines.push("# HELP sentinel_scheduler_last_trigger_timestamp Last trigger time");
    lines.push("# TYPE sentinel_scheduler_last_trigger_timestamp gauge");
    for (const [type, ts] of this.lastTrigger) {
      lines.push(`sentinel_scheduler_last_trigger_timestamp{type="${type}"} ${ts / 1000}`);
    }
    return lines.join("\n") + "\n";
  }
}

export function createHealthServer(metrics: SchedulerMetrics, port: number): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    } else if (req.url === "/metrics") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(metrics.toPrometheus());
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(port);
  return server;
}

// --- Main entrypoint (when run as standalone process) ---
if (process.env.NODE_ENV !== "test") {
  const config = buildSchedulerConfig();
  const metrics = new SchedulerMetrics();
  const healthPort = parseInt(process.env.SCHEDULER_PORT ?? "9091", 10);
  const healthServer = createHealthServer(metrics, healthPort);
  logger.info({ port: healthPort }, "Scheduler health server listening");

  if (!shouldTriggerScan(config)) {
    logger.warn("Self-scan scheduler disabled or config invalid, exiting");
    process.exit(0);
  }

  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const eventBus = new EventBus(redis);

  logger.info({ schedule: config.schedule }, "Starting self-scan scheduler");

  cron.schedule(config.schedule, async () => {
    try {
      await triggerSelfScan(eventBus, config);
      metrics.recordTrigger("self_scan");
    } catch (err) {
      metrics.recordError("self_scan");
      logger.error({ err }, "Failed to trigger self-scan");
    }
  });

  if (config.cveRescanEnabled) {
    logger.info({ schedule: config.cveRescanSchedule }, "Starting CVE rescan scheduler");
    cron.schedule(config.cveRescanSchedule, async () => {
      try {
        await triggerSelfScan(eventBus, { ...config, targets: config.targets });
        metrics.recordTrigger("cve_rescan");
        logger.info("CVE rescan triggered");
      } catch (err) {
        metrics.recordError("cve_rescan");
        logger.error({ err }, "Failed to trigger CVE rescan");
      }
    });
  }

  // Data retention cleanup — daily at 4 AM
  logger.info({ schedule: RETENTION_SCHEDULE }, "Starting data retention scheduler");
  cron.schedule(RETENTION_SCHEDULE, async () => {
    try {
      const db = getDb();
      const result = await runRetentionCleanup(db);
      metrics.recordTrigger("retention");
      logger.info(result, "Data retention cleanup completed");
    } catch (err) {
      metrics.recordError("retention");
      logger.error({ err }, "Data retention cleanup failed");
    }
  });

  const shutdown = async () => {
    logger.info("Scheduler shutting down...");
    healthServer.close();
    await eventBus.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Self-scan scheduler running");
}
