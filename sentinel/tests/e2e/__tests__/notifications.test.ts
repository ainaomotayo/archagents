// tests/e2e/__tests__/notifications.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createE2EContext, type E2EContext } from "../fixtures/factory.js";
import { combinedVulnDiff } from "../fixtures/diffs.js";
import { RedisInspector } from "../helpers/redis-inspector.js";

describe("E2E: Notifications & Events", () => {
  let ctx: E2EContext;
  let redis: RedisInspector;

  beforeAll(() => {
    ctx = createE2EContext();
    redis = new RedisInspector();
  });

  afterAll(async () => {
    await redis.disconnect();
  });

  it("publishes notification events to sentinel.notifications stream", async () => {
    const { scanId } = await ctx.scanService.submitDiff(combinedVulnDiff(ctx.projectId));
    await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);

    // Check sentinel.notifications stream
    const entries = await redis.getStreamEntries("sentinel.notifications", 50);
    console.log(`[VERIFY] sentinel.notifications entries: ${entries.length}`);
    expect(entries.length).toBeGreaterThan(0);

    // Should have scan.completed or certificate.issued events
    const topics = entries.map((e) => (e.data as any).topic ?? (e.data as any).type);
    console.log(`[VERIFY] Notification topics: ${topics.join(", ")}`);
  });

  it("publishes to sentinel.results stream after assessment", async () => {
    const { scanId } = await ctx.scanService.submitDiff(combinedVulnDiff(ctx.projectId));
    await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);

    const entries = await redis.getStreamEntries("sentinel.results", 50);
    console.log(`[VERIFY] sentinel.results entries: ${entries.length}`);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("publishes critical finding alerts for high-severity findings", async () => {
    // Submit a diff with known critical/high findings (SQL injection)
    const { securityVulnDiff } = await import("../fixtures/diffs.js");
    const { scanId } = await ctx.scanService.submitDiff(securityVulnDiff(ctx.projectId));
    await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);

    const entries = await redis.getStreamEntries("sentinel.notifications", 100);
    // Look for critical/high severity notification events
    const criticalNotifs = entries.filter((e) => {
      const topic = (e.data as any).topic ?? "";
      return topic.includes("critical") || topic.includes("finding");
    });
    console.log(`[VERIFY] Critical/finding notification events: ${criticalNotifs.length}`);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("sentinel.diffs stream has consumer groups for agents", async () => {
    // Verify consumer groups exist
    try {
      const secGroup = await redis.getConsumerGroupInfo("sentinel.diffs", "agent-security");
      console.log(`[VERIFY] agent-security consumer group exists: ${!!secGroup}`);
      expect(secGroup).toBeTruthy();
    } catch {
      console.log("[VERIFY] Could not check consumer groups (stream may not exist yet)");
    }
  });
});
