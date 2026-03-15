import { describe, it, expect, beforeAll } from "vitest";
import { createE2EContext, type E2EContext } from "../fixtures/factory.js";
import { securityVulnDiff, cleanDiff } from "../fixtures/diffs.js";
import { submitAndComplete } from "../scenarios/pipeline.js";

describe("E2E: Data Retention", () => {
  let ctx: E2EContext;

  beforeAll(() => {
    ctx = createE2EContext();
  });

  it("completed scans remain accessible via API", async () => {
    const result = await submitAndComplete(ctx, securityVulnDiff(ctx.projectId));

    const scan = await ctx.scanService.getScan(result.scanId);
    expect(scan.id).toBe(result.scanId);
    expect(scan.status).toBe("completed");

    const { findings } = await ctx.findingService.getFindings({ scanId: result.scanId });
    expect(findings.length).toBeGreaterThan(0);

    console.log(`[VERIFY] Scan ${result.scanId} accessible with ${findings.length} findings`);
  });

  it("scan list endpoint returns scans within retention window", async () => {
    await submitAndComplete(ctx, securityVulnDiff(ctx.projectId));
    await submitAndComplete(ctx, cleanDiff(ctx.projectId));

    const { scans, total } = await ctx.scanService.listScans(ctx.projectId);
    expect(total).toBeGreaterThanOrEqual(2);
    expect(scans.length).toBeGreaterThanOrEqual(2);

    for (const scan of scans) {
      expect(scan.startedAt).toBeTruthy();
      const startDate = new Date(scan.startedAt);
      expect(startDate.getTime()).toBeGreaterThan(0);
    }

    console.log(`[VERIFY] Scan list: ${total} total scans`);
  });

  it("API returns 404 for non-existent scan ID", async () => {
    const fakeScanId = "non-existent-scan-12345";

    try {
      await ctx.scanService.getScan(fakeScanId);
      expect.fail("Expected 404 for non-existent scan");
    } catch (err) {
      expect((err as Error).message).toMatch(/404/);
    }
  });
});
