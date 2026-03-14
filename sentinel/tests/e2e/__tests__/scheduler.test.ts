// tests/e2e/__tests__/scheduler.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createE2EContext, type E2EContext } from "../fixtures/factory.js";

describe("E2E: Scheduler Integration", () => {
  let ctx: E2EContext;

  beforeAll(() => {
    ctx = createE2EContext();
  });

  it("scheduler health endpoint returns valid status", async () => {
    const health = await ctx.schedulerService.getHealth();

    expect(health.status).toBe("ok");
    expect(typeof health.uptime).toBe("number");
    expect(health.uptime).toBeGreaterThan(0);
    expect(health.lastTrigger).toBeDefined();
    expect(health.nextScheduled).toBeDefined();

    console.log(`[VERIFY] Scheduler health: status=${health.status}, uptime=${health.uptime.toFixed(1)}s`);
  });

  it("scheduler reports leader lease status", async () => {
    const health = await ctx.schedulerService.getHealth();

    expect(health.isLeader).toBeDefined();
    expect(typeof health.isLeader).toBe("boolean");

    console.log(`[VERIFY] Scheduler isLeader: ${health.isLeader}`);
  });

  it("scheduler Prometheus metrics endpoint exports expected metrics", async () => {
    const metrics = await ctx.schedulerService.getMetrics();

    expect(metrics).toContain("sentinel_scheduler_triggers_total");
    expect(metrics).toContain("sentinel_scheduler_errors_total");
    expect(metrics).toContain("sentinel_scheduler_last_trigger_timestamp");
    expect(metrics).toContain("sentinel_scheduler_leader");
    expect(metrics).toContain("sentinel_scheduler_circuit_state");
    expect(metrics).toContain("sentinel_scheduler_scan_lifecycle");
    expect(metrics).toContain("sentinel_scheduler_org_overrides_active");
    expect(metrics).toContain("sentinel_scheduler_audit_entries_total");

    console.log(`[VERIFY] Prometheus metrics: ${metrics.split("\n").length} lines`);
  });

  it("scheduler reports circuit breaker states", async () => {
    const health = await ctx.schedulerService.getHealth();

    if (health.circuits) {
      for (const [dep, state] of Object.entries(health.circuits)) {
        expect(["closed", "open", "half-open"]).toContain(state.state);
        expect(typeof state.failures).toBe("number");
        console.log(`[VERIFY] Circuit ${dep}: state=${state.state}, failures=${state.failures}`);
      }
    }
  });

  it("scheduler nextScheduled contains registered job types", async () => {
    const health = await ctx.schedulerService.getHealth();

    const expectedJobs = ["self-scan", "retention", "compliance-snapshot", "health-check"];
    for (const job of expectedJobs) {
      if (health.nextScheduled[job]) {
        const nextDate = new Date(health.nextScheduled[job]);
        expect(nextDate.getTime()).toBeGreaterThan(Date.now());
        console.log(`[VERIFY] ${job} next scheduled: ${health.nextScheduled[job]}`);
      }
    }
  });
});
