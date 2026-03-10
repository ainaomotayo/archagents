import { describe, test, expect } from "vitest";
import { buildSchedulerConfig, shouldTriggerScan, RETENTION_SCHEDULE, SchedulerMetrics, createHealthServer } from "../scheduler.js";
import type { AddressInfo } from "node:net";

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

describe("SchedulerMetrics health status", () => {
  test("getHealthStatus includes lastTrigger timestamps as ISO strings", () => {
    const metrics = new SchedulerMetrics();
    metrics.recordTrigger("self_scan");
    const health = metrics.getHealthStatus();
    expect(health.status).toBe("ok");
    expect(health.uptime).toBeGreaterThan(0);
    expect(health.lastTrigger).toBeDefined();
    expect(health.lastTrigger.self_scan).toBeDefined();
    expect(new Date(health.lastTrigger.self_scan).toISOString()).toBe(health.lastTrigger.self_scan);
  });

  test("getHealthStatus includes nextScheduled computed by cron-parser", () => {
    const metrics = new SchedulerMetrics();
    metrics.registerSchedule("self_scan", "0 2 * * *");
    const health = metrics.getHealthStatus();
    expect(health.nextScheduled).toBeDefined();
    expect(health.nextScheduled.self_scan).toBeDefined();
    const next = new Date(health.nextScheduled.self_scan);
    expect(next.getTime()).toBeGreaterThan(Date.now());
  });

  test("getHealthStatus skips invalid cron expressions gracefully", () => {
    const metrics = new SchedulerMetrics();
    metrics.registerSchedule("bad_schedule", "not-a-cron");
    const health = metrics.getHealthStatus();
    expect(health.nextScheduled.bad_schedule).toBeUndefined();
  });
});

describe("createHealthServer", () => {
  test("GET /health returns enriched status with lastTrigger and nextScheduled", async () => {
    const metrics = new SchedulerMetrics();
    metrics.registerSchedule("self_scan", "0 2 * * *");
    metrics.recordTrigger("self_scan");
    const server = createHealthServer(metrics, 0);
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
      expect(body.uptime).toBeGreaterThan(0);
      expect(body.lastTrigger.self_scan).toBeDefined();
      expect(body.nextScheduled.self_scan).toBeDefined();
    } finally {
      server.close();
    }
  });

  test("GET /metrics returns Prometheus text format", async () => {
    const metrics = new SchedulerMetrics();
    metrics.recordTrigger("self_scan");
    const server = createHealthServer(metrics, 0);
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://localhost:${port}/metrics`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("sentinel_scheduler_triggers_total");
    } finally {
      server.close();
    }
  });

  test("GET /unknown returns 404", async () => {
    const metrics = new SchedulerMetrics();
    const server = createHealthServer(metrics, 0);
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://localhost:${port}/unknown`);
      expect(res.status).toBe(404);
    } finally {
      server.close();
    }
  });
});
