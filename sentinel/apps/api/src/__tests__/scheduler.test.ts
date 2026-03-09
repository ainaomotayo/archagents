import { describe, test, expect } from "vitest";
import { buildSchedulerConfig, shouldTriggerScan, RETENTION_SCHEDULE, SchedulerMetrics } from "../scheduler.js";

describe("scheduler", () => {
  test("buildSchedulerConfig returns valid config from SELF_SCAN_CONFIG", () => {
    const config = buildSchedulerConfig();
    expect(config.schedule).toBe("0 2 * * *");
    expect(config.targets.length).toBeGreaterThan(0);
    expect(config.enabled).toBe(true);
  });

  test("buildSchedulerConfig can be disabled via env var", () => {
    const original = process.env.SELF_SCAN_ENABLED;
    process.env.SELF_SCAN_ENABLED = "false";
    const config = buildSchedulerConfig();
    expect(config.enabled).toBe(false);
    if (original !== undefined) {
      process.env.SELF_SCAN_ENABLED = original;
    } else {
      delete process.env.SELF_SCAN_ENABLED;
    }
  });

  test("shouldTriggerScan returns true when config is valid and enabled", () => {
    const config = buildSchedulerConfig();
    expect(shouldTriggerScan(config)).toBe(true);
  });

  test("shouldTriggerScan returns false when disabled", () => {
    const config = buildSchedulerConfig();
    config.enabled = false;
    expect(shouldTriggerScan(config)).toBe(false);
  });

  test("RETENTION_SCHEDULE is a valid daily cron expression", () => {
    expect(RETENTION_SCHEDULE).toBe("0 4 * * *");
  });
});

describe("SchedulerMetrics", () => {
  test("tracks trigger counts", () => {
    const metrics = new SchedulerMetrics();
    metrics.recordTrigger("self_scan");
    metrics.recordTrigger("self_scan");
    metrics.recordTrigger("retention");
    expect(metrics.getTriggerCount("self_scan")).toBe(2);
    expect(metrics.getTriggerCount("retention")).toBe(1);
  });

  test("tracks errors", () => {
    const metrics = new SchedulerMetrics();
    metrics.recordError("self_scan");
    expect(metrics.getErrorCount("self_scan")).toBe(1);
  });

  test("formats Prometheus output", () => {
    const metrics = new SchedulerMetrics();
    metrics.recordTrigger("self_scan");
    const output = metrics.toPrometheus();
    expect(output).toContain("sentinel_scheduler_triggers_total");
    expect(output).toContain('type="self_scan"');
  });
});
