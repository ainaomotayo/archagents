import cron from "node-cron";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { EventBus } from "@sentinel/events";
import { getDb } from "@sentinel/db";
import { AuditLog } from "@sentinel/audit";
import { createLogger } from "@sentinel/telemetry";
import { SELF_SCAN_CONFIG, validateSelfScanConfig } from "@sentinel/security";
import { CronExpressionParser } from "cron-parser";

import type { SchedulerJob, JobContext, SchedulerMetrics as ISchedulerMetrics } from "./types.js";
import { RedisLeaderLease } from "./leader-lease.js";
import { CircuitBreakerManager } from "./circuit-breaker.js";
import { DualAuditLayer } from "./audit-layer.js";
import { ScanLifecycleTracker } from "./lifecycle-tracker.js";
import { OrgScheduleManager } from "./org-schedule-manager.js";
import { JobRegistry } from "./job-registry.js";

import { SelfScanJob } from "./jobs/self-scan.js";
import { CVERescanJob } from "./jobs/cve-rescan.js";
import { RetentionJob } from "./jobs/retention.js";
import { ComplianceSnapshotJob } from "./jobs/compliance-snapshot.js";
import { TrendsRefreshJob } from "./jobs/trends-refresh.js";
import { EvidenceCheckJob } from "./jobs/evidence-check.js";
import { HealthCheckJob } from "./jobs/health-check.js";

import { createAuditEventStore } from "../stores.js";

const logger = createLogger({ name: "sentinel-scheduler" });

// Re-export all components for external use
export type { SchedulerJob, JobContext } from "./types.js";
export { RedisLeaderLease } from "./leader-lease.js";
export { CircuitBreakerManager } from "./circuit-breaker.js";
export { DualAuditLayer } from "./audit-layer.js";
export { ScanLifecycleTracker } from "./lifecycle-tracker.js";
export { OrgScheduleManager } from "./org-schedule-manager.js";
export { JobRegistry } from "./job-registry.js";

// --- SchedulerMetrics ---

export class SchedulerMetrics implements ISchedulerMetrics {
  private triggers = new Map<string, number>();
  private errors = new Map<string, number>();
  private lastTrigger = new Map<string, number>();
  private schedules = new Map<string, string>();

  // Enterprise metrics state (set externally by startScheduler)
  public isLeader = 0;
  public instanceId = "";
  public circuitBreaker: CircuitBreakerManager | null = null;
  public lifecycleCounts = { pending: 0, running: 0, completed: 0, timeout: 0 };
  public orgOverridesActive = 0;
  public auditEntriesTotal = 0;

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
    // Enterprise metrics per design spec
    lines.push("# HELP sentinel_scheduler_leader Whether this instance is the leader");
    lines.push("# TYPE sentinel_scheduler_leader gauge");
    lines.push(`sentinel_scheduler_leader{instance="${this.instanceId}"} ${this.isLeader}`);
    lines.push("# HELP sentinel_scheduler_circuit_state Circuit breaker state per dependency");
    lines.push("# TYPE sentinel_scheduler_circuit_state gauge");
    if (this.circuitBreaker) {
      const states = this.circuitBreaker.getAllStates();
      for (const [dep, st] of Object.entries(states)) {
        const val = st.state === "closed" ? 0 : st.state === "open" ? 1 : 2;
        lines.push(`sentinel_scheduler_circuit_state{dep="${dep}"} ${val}`);
      }
    }
    lines.push("# HELP sentinel_scheduler_scan_lifecycle Scan lifecycle counts by status");
    lines.push("# TYPE sentinel_scheduler_scan_lifecycle counter");
    for (const [status, count] of Object.entries(this.lifecycleCounts)) {
      lines.push(`sentinel_scheduler_scan_lifecycle{status="${status}"} ${count}`);
    }
    lines.push("# HELP sentinel_scheduler_org_overrides_active Active per-org schedule overrides");
    lines.push("# TYPE sentinel_scheduler_org_overrides_active gauge");
    lines.push(`sentinel_scheduler_org_overrides_active ${this.orgOverridesActive}`);
    lines.push("# HELP sentinel_scheduler_audit_entries_total Total dual-write audit entries");
    lines.push("# TYPE sentinel_scheduler_audit_entries_total counter");
    lines.push(`sentinel_scheduler_audit_entries_total ${this.auditEntriesTotal}`);
    return lines.join("\n") + "\n";
  }
}

// --- Health Server ---

export function createHealthServer(
  metrics: SchedulerMetrics,
  port: number,
  extras?: { circuitBreaker?: CircuitBreakerManager; lease?: RedisLeaderLease },
): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      const health = metrics.getHealthStatus();
      const body: Record<string, unknown> = { ...health };
      if (extras?.lease) body.isLeader = extras.lease.isLeader();
      if (extras?.circuitBreaker) body.circuits = extras.circuitBreaker.getAllStates();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
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

// --- Config ---

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
export const HEALTH_CHECK_SCHEDULE = "*/5 * * * *";

export function buildSchedulerConfig(): SchedulerConfig {
  const enabled = process.env.SELF_SCAN_ENABLED !== "false";
  return { ...SELF_SCAN_CONFIG, enabled };
}

export function shouldTriggerScan(config: SchedulerConfig): boolean {
  if (!config.enabled) return false;
  return validateSelfScanConfig(config).valid;
}

// --- Main Entrypoint ---

export async function startScheduler(): Promise<void> {
  const config = buildSchedulerConfig();
  const instanceId = `scheduler-${randomUUID().slice(0, 8)}`;

  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const eventBus = new EventBus(redis);
  const db = getDb();
  const metrics = new SchedulerMetrics();
  const circuitBreaker = new CircuitBreakerManager();
  const lifecycleTracker = new ScanLifecycleTracker(redis);
  const orgManager = new OrgScheduleManager(db, config.schedule);

  let auditLog: AuditLog | null = null;
  try {
    auditLog = new AuditLog(createAuditEventStore(db));
  } catch {
    logger.warn("AuditLog store not available, using Redis-only audit");
  }
  const audit = new DualAuditLayer(redis, auditLog);

  const leaseTtl = parseInt(process.env.SCHEDULER_LEASE_TTL ?? "15000", 10);
  const lease = new RedisLeaderLease(redis, {
    key: "sentinel.scheduler.leader",
    ttlMs: leaseTtl,
    instanceId,
  });

  const healthPort = parseInt(process.env.SCHEDULER_PORT ?? "9091", 10);
  const healthServer = createHealthServer(metrics, healthPort, { circuitBreaker, lease });
  logger.info({ port: healthPort, instanceId }, "Scheduler health server listening");

  const registry = new JobRegistry();
  const allJobs: SchedulerJob[] = [
    new SelfScanJob(),
    new RetentionJob(),
    new ComplianceSnapshotJob(),
    new TrendsRefreshJob(),
    new EvidenceCheckJob(),
    new HealthCheckJob(),
  ];
  if (config.cveRescanEnabled) {
    allJobs.push(new CVERescanJob());
  }
  for (const job of allJobs) {
    registry.register(job);
    metrics.registerSchedule(job.name, job.schedule);
  }

  // Wire enterprise metrics state
  metrics.instanceId = instanceId;
  metrics.circuitBreaker = circuitBreaker;

  const ctx: JobContext = { eventBus, db, redis, metrics, audit, logger, lifecycleTracker };

  function wrapJobExecution(job: SchedulerJob) {
    return async () => {
      if (!lease.isLeader()) return;
      for (const dep of job.dependencies) {
        if (!circuitBreaker.canExecute(dep, job.tier)) {
          await audit.log({
            jobName: job.name,
            action: "skipped",
            timestamp: new Date().toISOString(),
            detail: { reason: `circuit open for ${dep}` },
          });
          metrics.auditEntriesTotal++;
          logger.warn({ job: job.name, dep }, "Job skipped: circuit breaker open");
          return;
        }
      }
      try {
        await registry.executeJob(job.name, ctx);
        metrics.auditEntriesTotal += 2; // triggered + completed
        for (const dep of job.dependencies) circuitBreaker.recordSuccess(dep);
      } catch (err) {
        metrics.auditEntriesTotal += 2; // triggered + failed
        for (const dep of job.dependencies) circuitBreaker.recordFailure(dep);
        logger.error({ err, job: job.name }, "Scheduled job failed");
      }
    };
  }

  for (const job of registry.getJobs()) {
    cron.schedule(job.schedule, wrapJobExecution(job));
    logger.info({ job: job.name, schedule: job.schedule }, "Cron job registered");
  }

  // Leader heartbeat at ttl/3
  const heartbeatInterval = Math.floor(leaseTtl / 3);
  const heartbeatTimer = setInterval(async () => {
    if (lease.isLeader()) {
      const renewed = await lease.renew();
      if (!renewed) logger.warn("Leader lease renewal failed, lost leadership");
    } else {
      const acquired = await lease.acquire();
      if (acquired) logger.info({ instanceId }, "Acquired leader lease");
    }
    metrics.isLeader = lease.isLeader() ? 1 : 0;
  }, heartbeatInterval);

  const acquired = await lease.acquire();
  logger.info({ instanceId, isLeader: acquired }, "Initial leader lease attempt");

  // Org schedule override poll every 5 minutes
  await orgManager.loadOverrides();
  metrics.orgOverridesActive = Object.keys(orgManager.getActiveOverrides()).length;
  const overrideTimer = setInterval(async () => {
    await orgManager.loadOverrides();
    metrics.orgOverridesActive = Object.keys(orgManager.getActiveOverrides()).length;
  }, 300_000);

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Scheduler shutting down...");
    clearInterval(heartbeatTimer);
    clearInterval(overrideTimer);
    healthServer.close();
    await lease.release();
    await eventBus.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info({ instanceId, jobs: registry.getJobs().map((j) => j.name) }, "Scheduler running");
}
