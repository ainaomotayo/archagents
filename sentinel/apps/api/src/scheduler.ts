import cron from "node-cron";
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

// --- Main entrypoint (when run as standalone process) ---
if (process.env.NODE_ENV !== "test") {
  const config = buildSchedulerConfig();

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
    } catch (err) {
      logger.error({ err }, "Failed to trigger self-scan");
    }
  });

  if (config.cveRescanEnabled) {
    logger.info({ schedule: config.cveRescanSchedule }, "Starting CVE rescan scheduler");
    cron.schedule(config.cveRescanSchedule, async () => {
      try {
        await triggerSelfScan(eventBus, { ...config, targets: config.targets });
        logger.info("CVE rescan triggered");
      } catch (err) {
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
      logger.info(result, "Data retention cleanup completed");
    } catch (err) {
      logger.error({ err }, "Data retention cleanup failed");
    }
  });

  const shutdown = async () => {
    logger.info("Scheduler shutting down...");
    await eventBus.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Self-scan scheduler running");
}
