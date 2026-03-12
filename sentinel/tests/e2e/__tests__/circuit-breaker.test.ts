import { describe, it, expect, beforeAll } from "vitest";
import { createE2EContext, type E2EContext } from "../fixtures/factory.js";
import { combinedVulnDiff } from "../fixtures/diffs.js";
import { submitAndComplete } from "../scenarios/pipeline.js";

describe("E2E: Circuit Breaker & Resilience", () => {
  let ctx: E2EContext;

  beforeAll(() => {
    ctx = createE2EContext();
  });

  it("pipeline completes normally when all services healthy", async () => {
    const healthy = await ctx.healthService.allHealthy();
    expect(healthy).toBe(true);

    const result = await submitAndComplete(ctx, combinedVulnDiff(ctx.projectId));
    expect(result.scan.status).toBe("completed");
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.certificate).not.toBeNull();

    console.log(`[VERIFY] Healthy pipeline: ${result.findings.length} findings, cert=${result.certificate?.status}`);
  });

  it("scheduler circuit breakers report closed state when healthy", async () => {
    const health = await ctx.schedulerService.getHealth();

    if (health.circuits) {
      for (const [dep, state] of Object.entries(health.circuits)) {
        expect(state.state).toBe("closed");
        expect(state.failures).toBe(0);
        console.log(`[VERIFY] Circuit ${dep}: ${state.state}`);
      }
    } else {
      console.log("[VERIFY] No circuit breaker data in health response");
    }
  });

  it("pipeline produces findings from all healthy agents", async () => {
    const result = await submitAndComplete(ctx, combinedVulnDiff(ctx.projectId));

    const agents = new Set(result.findings.map((f) => f.agentName));
    console.log(`[VERIFY] Active agents: ${[...agents].join(", ")}`);

    expect(agents.has("security")).toBe(true);
    expect(agents.has("dependency")).toBe(true);
  });
});
