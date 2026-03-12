import { describe, it, expect, beforeAll } from "vitest";
import { createE2EContext, type E2EContext } from "../fixtures/factory.js";
import { combinedVulnDiff, cleanDiff } from "../fixtures/diffs.js";
import { submitAndComplete } from "../scenarios/pipeline.js";
import { RedisInspector } from "../helpers/redis-inspector.js";

describe("E2E: Agent Timeout & Recovery", () => {
  let ctx: E2EContext;
  let redis: RedisInspector;

  beforeAll(() => {
    ctx = createE2EContext();
    redis = new RedisInspector();
  });

  it("scan completes within configured timeout period", async () => {
    const start = Date.now();
    const result = await submitAndComplete(ctx, combinedVulnDiff(ctx.projectId), 60_000);
    const elapsed = Date.now() - start;

    expect(result.scan.status).toBe("completed");

    console.log(`[VERIFY] Scan completed in ${elapsed}ms`);
    expect(elapsed).toBeLessThan(60_000);
  });

  it("subsequent scans are not affected by previous scan state", async () => {
    const result1 = await submitAndComplete(ctx, combinedVulnDiff(ctx.projectId));
    const result2 = await submitAndComplete(ctx, combinedVulnDiff(ctx.projectId));

    expect(result1.scan.status).toBe("completed");
    expect(result2.scan.status).toBe("completed");

    const agents1 = new Set(result1.findings.map((f) => f.agentName));
    const agents2 = new Set(result2.findings.map((f) => f.agentName));

    console.log(`[VERIFY] Scan 1 agents: ${[...agents1].join(",")}, Scan 2 agents: ${[...agents2].join(",")}`);

    expect(result1.findings.length).toBeGreaterThan(0);
    expect(result2.findings.length).toBeGreaterThan(0);
  });

  it("Redis streams remain healthy across multiple scan cycles", async () => {
    await submitAndComplete(ctx, cleanDiff(ctx.projectId));

    const diffsLen = await redis.getStreamLength("sentinel.diffs");
    const findingsLen = await redis.getStreamLength("sentinel.findings");

    expect(diffsLen).toBeGreaterThan(0);
    console.log(`[VERIFY] Redis streams: diffs=${diffsLen}, findings=${findingsLen}`);

    try {
      const groups = await redis.getConsumerGroupInfo("sentinel.diffs");
      console.log(`[VERIFY] sentinel.diffs consumer groups: ${groups.length}`);
    } catch {
      console.log("[VERIFY] Consumer group info not available");
    }

    await redis.disconnect();
  });
});
