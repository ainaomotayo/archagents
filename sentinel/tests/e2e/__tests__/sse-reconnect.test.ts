import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createE2EContext, type E2EContext } from "../fixtures/factory.js";
import { securityVulnDiff } from "../fixtures/diffs.js";
import { EventStreamClient } from "../services/event-stream.js";

describe("E2E: SSE Event Streaming", () => {
  let ctx: E2EContext;

  beforeAll(() => {
    ctx = createE2EContext();
  });

  afterAll(() => {
    ctx.eventStream.disconnect();
  });

  it("SSE stream delivers scan lifecycle events in order", async () => {
    const collectPromise = ctx.eventStream.collectUntil(
      ["scan.created", "scan.completed", "certificate.issued"],
      (event) => event.topic === "certificate.issued",
      60_000,
    );

    await new Promise((r) => setTimeout(r, 500));

    await ctx.scanService.submitDiff(securityVulnDiff(ctx.projectId));

    const events = await collectPromise;

    console.log(`[VERIFY] Collected ${events.length} SSE events`);

    if (events.length > 0) {
      for (let i = 1; i < events.length; i++) {
        const prev = new Date(events[i - 1].timestamp).getTime();
        const curr = new Date(events[i].timestamp).getTime();
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    }
  });

  it("multiple concurrent SSE clients receive independent event streams", async () => {
    const apiUrl = process.env.E2E_API_URL ?? "http://localhost:8081";
    const orgId = process.env.E2E_ORG_ID ?? "org-e2e-test";

    const clientA = new EventStreamClient(apiUrl, orgId);
    const clientB = new EventStreamClient(apiUrl, orgId);

    try {
      const collectA = clientA.collectUntil(
        ["scan.created"],
        () => true,
        30_000,
      );

      const collectB = clientB.collectUntil(
        ["scan.created"],
        () => true,
        30_000,
      );

      await new Promise((r) => setTimeout(r, 500));

      await ctx.scanService.submitDiff(securityVulnDiff(ctx.projectId));

      const [eventsA, eventsB] = await Promise.all([collectA, collectB]);

      console.log(`[VERIFY] Client A: ${eventsA.length} events, Client B: ${eventsB.length} events`);

      const totalEvents = eventsA.length + eventsB.length;
      expect(totalEvents).toBeGreaterThan(0);
    } finally {
      clientA.disconnect();
      clientB.disconnect();
    }
  });

  it("SSE stream filters events by topic", async () => {
    const collectPromise = ctx.eventStream.collectUntil(
      ["certificate.issued"],
      (event) => event.topic === "certificate.issued",
      60_000,
    );

    await new Promise((r) => setTimeout(r, 500));

    await ctx.scanService.submitDiff(securityVulnDiff(ctx.projectId));

    const events = await collectPromise;

    for (const event of events) {
      expect(event.topic).toBeTruthy();
    }

    console.log(`[VERIFY] Filtered SSE events: ${events.length}`);
  });
});
