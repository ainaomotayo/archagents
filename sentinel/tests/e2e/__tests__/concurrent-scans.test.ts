// tests/e2e/__tests__/concurrent-scans.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createE2EContext, type E2EContext } from "../fixtures/factory.js";
import { securityVulnDiff, dependencyVulnDiff, combinedVulnDiff } from "../fixtures/diffs.js";
import { submitConcurrent } from "../scenarios/pipeline.js";
import { expectScanIsolation, expectPipelineComplete } from "../helpers/assertions.js";

describe("E2E: Concurrent Scan Isolation", () => {
  let ctx: E2EContext;

  beforeAll(() => {
    ctx = createE2EContext();
  });

  it("two scans submitted simultaneously both complete independently", async () => {
    const diffs = [
      securityVulnDiff(ctx.projectId),
      dependencyVulnDiff(ctx.projectId),
    ];

    const results = await submitConcurrent(ctx, diffs, 60_000);
    expect(results).toHaveLength(2);

    for (const result of results) {
      expect(result.scan.status).toBe("completed");
      expect(result.scanId).toBeTruthy();
    }
  });

  it("findings from scan-A do not appear in scan-B results", async () => {
    const diffs = [
      securityVulnDiff(ctx.projectId),
      dependencyVulnDiff(ctx.projectId),
    ];

    const [resultA, resultB] = await submitConcurrent(ctx, diffs, 60_000);

    expectScanIsolation(
      { scanId: resultA.scanId, findings: resultA.findings },
      { scanId: resultB.scanId, findings: resultB.findings },
    );
  });

  it("certificates are issued independently with correct risk scores", async () => {
    const diffs = [
      combinedVulnDiff(ctx.projectId),
      combinedVulnDiff(ctx.projectId),
    ];

    const results = await submitConcurrent(ctx, diffs, 60_000);

    for (const result of results) {
      expect(result.certificate).not.toBeNull();
      expect(result.certificate!.scanId).toBe(result.scanId);
      expect(typeof result.certificate!.riskScore).toBe("number");
    }

    // Certificates must have different IDs
    expect(results[0].certificate!.id).not.toBe(results[1].certificate!.id);
  });

  it("pipeline invariants hold for both scans simultaneously", async () => {
    const diffs = [
      securityVulnDiff(ctx.projectId),
      combinedVulnDiff(ctx.projectId),
    ];

    const results = await submitConcurrent(ctx, diffs, 60_000);

    for (const result of results) {
      expectPipelineComplete(result.scan, result.findings, result.certificate);
    }
  });
});
