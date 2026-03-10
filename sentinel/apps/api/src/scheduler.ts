import cron from "node-cron";
import http from "node:http";
import { Redis } from "ioredis";
import { EventBus } from "@sentinel/events";
import { SELF_SCAN_CONFIG, validateSelfScanConfig, runRetentionCleanup, DEFAULT_RETENTION_DAYS } from "@sentinel/security";
import { getDb } from "@sentinel/db";
import { createLogger } from "@sentinel/telemetry";
import { BUILT_IN_FRAMEWORKS, scoreFramework, type FindingInput } from "@sentinel/compliance";
import { CronExpressionParser } from "cron-parser";

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
export const COMPLIANCE_SNAPSHOT_SCHEDULE = "0 5 * * *";

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
  private schedules = new Map<string, string>();

  registerSchedule(type: string, cronExpr: string) {
    this.schedules.set(type, cronExpr);
  }

  getHealthStatus(): { status: string; uptime: number; lastTrigger: Record<string, string>; nextScheduled: Record<string, string> } {
    const lastTrigger: Record<string, string> = {};
    const nextScheduled: Record<string, string> = {};
    for (const [type, ts] of this.lastTrigger) {
      lastTrigger[type] = new Date(ts).toISOString();
    }
    for (const [type, expr] of this.schedules) {
      try {
        nextScheduled[type] = CronExpressionParser.parse(expr).next().toDate().toISOString();
      } catch { /* skip invalid */ }
    }
    return { status: "ok", uptime: process.uptime(), lastTrigger, nextScheduled };
  }

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
      res.end(JSON.stringify(metrics.getHealthStatus()));
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

async function generateComplianceSnapshots(db: any) {
  const orgs = await db.organization.findMany({ select: { id: true } });
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let generated = 0;

  for (const org of orgs) {
    const findings = await db.finding.findMany({
      where: { orgId: org.id, suppressed: false },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    const inputs: FindingInput[] = findings.map((f: any) => ({
      id: f.id, agentName: f.agentName, severity: f.severity, category: f.category, suppressed: f.suppressed,
    }));

    for (const fw of BUILT_IN_FRAMEWORKS) {
      const result = scoreFramework(fw.controls, inputs);
      await db.complianceSnapshot.upsert({
        where: { orgId_frameworkId_date: { orgId: org.id, frameworkId: fw.slug, date: today } },
        update: { score: result.score, controlBreakdown: result.controlScores },
        create: { orgId: org.id, frameworkId: fw.slug, date: today, score: result.score, controlBreakdown: result.controlScores },
      });
      await db.complianceAssessment.create({
        data: { orgId: org.id, frameworkId: fw.slug, score: result.score, verdict: result.verdict, controlScores: result.controlScores },
      });
      generated++;
    }
  }
  logger.info({ generated }, "Compliance snapshots generated");
}

// --- Main entrypoint (when run as standalone process) ---
if (process.env.NODE_ENV !== "test") {
  const config = buildSchedulerConfig();
  const metrics = new SchedulerMetrics();
  metrics.registerSchedule("self_scan", config.schedule);
  metrics.registerSchedule("retention", RETENTION_SCHEDULE);
  if (config.cveRescanEnabled) metrics.registerSchedule("cve_rescan", config.cveRescanSchedule);
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
      const orgs = await db.organization.findMany({ select: { id: true, settings: true } });
      for (const org of orgs) {
        const retentionDays = (org.settings as any)?.retentionDays ?? DEFAULT_RETENTION_DAYS;
        const result = await runRetentionCleanup(db, retentionDays, org.id);
        if (result.deletedFindings + result.deletedAgentResults + result.deletedScans > 0) {
          logger.info({ orgId: org.id, retentionDays, ...result }, "Org retention cleanup completed");
        }
      }
      metrics.recordTrigger("retention");
      logger.info("Data retention cleanup completed for all orgs");
    } catch (err) {
      metrics.recordError("retention");
      logger.error({ err }, "Data retention cleanup failed");
    }
  });

  // Compliance snapshot generation — daily at 5 AM
  cron.schedule(COMPLIANCE_SNAPSHOT_SCHEDULE, async () => {
    logger.info("Running daily compliance snapshot generation...");
    try {
      const db = getDb();
      await generateComplianceSnapshots(db);
    } catch (err) {
      logger.error({ err }, "Compliance snapshot generation failed");
    }
  });
  logger.info({ schedule: COMPLIANCE_SNAPSHOT_SCHEDULE }, "Compliance snapshot cron registered");

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
