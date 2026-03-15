// Thin entrypoint — delegates to scheduler/ module
import { startScheduler } from "./scheduler/index.js";

if (process.env.NODE_ENV !== "test") {
  startScheduler().catch((err) => {
    console.error("Scheduler failed to start:", err);
    process.exit(1);
  });
}

// Re-export for backwards compatibility with existing tests
export {
  buildSchedulerConfig,
  shouldTriggerScan,
  SchedulerMetrics,
  createHealthServer,
  RETENTION_SCHEDULE,
  COMPLIANCE_SNAPSHOT_SCHEDULE,
  HEALTH_CHECK_SCHEDULE,
} from "./scheduler/index.js";
export type { SchedulerConfig } from "./scheduler/index.js";
