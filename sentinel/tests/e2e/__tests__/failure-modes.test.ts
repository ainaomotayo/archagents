// tests/e2e/__tests__/failure-modes.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createE2EContext, type E2EContext } from "../fixtures/factory.js";
import { createHmac } from "node:crypto";

describe("E2E: Failure Modes", () => {
  let ctx: E2EContext;

  beforeAll(() => { ctx = createE2EContext(); });

  it("rejects submission with invalid HMAC signature", async () => {
    const apiUrl = process.env.E2E_API_URL ?? "http://localhost:8081";
    const body = JSON.stringify({ projectId: "test" });
    const badSig = `t=${Math.floor(Date.now() / 1000)},sig=${"a".repeat(64)}`;

    const res = await fetch(`${apiUrl}/v1/scans`, {
      method: "POST",
      headers: {
        "x-sentinel-signature": badSig,
        "x-sentinel-api-key": "test",
        "x-sentinel-role": "admin",
        "content-type": "application/json",
      },
      body,
    });

    console.log(`[VERIFY] Bad signature response: ${res.status}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("rejects submission with missing required fields", async () => {
    try {
      await ctx.scanService.submitDiff({
        projectId: ctx.projectId,
        commitHash: "",
        branch: "",
        author: "",
        timestamp: "",
        files: [],
        scanConfig: { securityLevel: "standard", licensePolicy: "default", qualityThreshold: 80 },
      } as any);
      expect.fail("Should have thrown");
    } catch (err) {
      console.log(`[VERIFY] Malformed request rejected: ${(err as Error).message}`);
      expect((err as Error).message).toContain("400");
    }
  });

  it("handles empty diff (no files) gracefully", async () => {
    const payload = {
      projectId: ctx.projectId,
      commitHash: `e2e-empty-${Date.now()}`,
      branch: "e2e-test",
      author: "e2e-bot",
      timestamp: new Date().toISOString(),
      files: [],
      scanConfig: { securityLevel: "standard" as const, licensePolicy: "default", qualityThreshold: 80 },
    };

    const { scanId } = await ctx.scanService.submitDiff(payload);
    const scan = await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);

    const { findings } = await ctx.findingService.getFindings({ scanId });
    console.log(`[VERIFY] Empty diff: ${findings.length} findings, status=${scan.status}`);
    expect(findings.length).toBe(0);
  });

  it("handles duplicate scan submission with same commit hash", async () => {
    const fixedHash = `e2e-dup-${Date.now()}`;
    const payload = {
      projectId: ctx.projectId,
      commitHash: fixedHash,
      branch: "e2e-test",
      author: "e2e-bot",
      timestamp: new Date().toISOString(),
      files: [{
        path: "src/app.ts",
        language: "typescript",
        hunks: [{ oldStart: 1, oldCount: 0, newStart: 1, newCount: 1, content: "+const x = 1;" }],
        aiScore: 0,
      }],
      scanConfig: { securityLevel: "standard" as const, licensePolicy: "default", qualityThreshold: 80 },
    };

    // First submission should succeed
    const { scanId } = await ctx.scanService.submitDiff(payload as any);
    expect(scanId).toBeTruthy();
    console.log(`[VERIFY] First submission: scanId=${scanId}`);

    // Second submission with same commit hash — API may reject or create new scan
    try {
      const result2 = await ctx.scanService.submitDiff(payload as any);
      // If accepted, the two scans must have distinct IDs (no silent overwrite)
      console.log(`[VERIFY] Duplicate accepted: scanId=${result2.scanId}`);
      expect(result2.scanId).toBeTruthy();
      expect(result2.scanId).not.toBe(scanId);
    } catch (err) {
      // If rejected, must be a 4xx error (duplicate detected)
      console.log(`[VERIFY] Duplicate rejected: ${(err as Error).message}`);
      expect((err as Error).message).toMatch(/4\d\d/);
    }
  });

  it("returns 401/403 for requests without signature", async () => {
    const apiUrl = process.env.E2E_API_URL ?? "http://localhost:8081";
    const res = await fetch(`${apiUrl}/v1/scans`, {
      method: "GET",
      headers: { "content-type": "application/json" },
    });

    console.log(`[VERIFY] No-auth response: ${res.status}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
