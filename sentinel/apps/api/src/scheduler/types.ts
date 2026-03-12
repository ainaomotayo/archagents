import type { Redis } from "ioredis";
import type { EventBus } from "@sentinel/events";
import type { Logger } from "pino";

export type JobTier = "critical" | "non-critical";
export type Dependency = "redis" | "postgres";

export interface JobContext {
  eventBus: EventBus;
  db: any; // Prisma client
  redis: Redis;
  metrics: SchedulerMetrics;
  audit: AuditLayer;
  logger: Logger;
  lifecycleTracker?: ScanLifecycleTracker;
}

export interface ScanLifecycleTracker {
  recordTrigger(scanId: string, jobName: string): Promise<void>;
  recordCompletion(scanId: string): Promise<void>;
  checkTimeouts(timeoutMs?: number): Promise<string[]>;
  getLifecycle(scanId: string): Promise<Record<string, string> | null>;
}

export interface SchedulerJob {
  name: string;
  schedule: string;
  tier: JobTier;
  dependencies: Dependency[];
  execute(ctx: JobContext): Promise<void>;
}

export interface SchedulerMetrics {
  registerSchedule(type: string, cronExpr: string): void;
  recordTrigger(type: string): void;
  recordError(type: string): void;
  getTriggerCount(type: string): number;
  getErrorCount(type: string): number;
  toPrometheus(): string;
  getHealthStatus(): {
    status: string;
    uptime: number;
    lastTrigger: Record<string, string>;
    nextScheduled: Record<string, string>;
  };
}

export interface AuditLayer {
  log(entry: SchedulerAuditEntry): Promise<void>;
  recent(limit?: number): Promise<SchedulerAuditEntry[]>;
}

export interface SchedulerAuditEntry {
  jobName: string;
  action: "triggered" | "completed" | "failed" | "skipped" | "circuit_open";
  timestamp: string;
  detail?: Record<string, unknown>;
}

export interface LeaderLease {
  acquire(): Promise<boolean>;
  renew(): Promise<boolean>;
  release(): Promise<void>;
  isLeader(): boolean;
}

export interface CircuitBreakerState {
  state: "closed" | "open" | "half-open";
  failures: number;
  lastFailure: number | null;
  lastSuccess: number | null;
}
