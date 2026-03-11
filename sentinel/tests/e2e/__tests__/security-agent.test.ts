// tests/e2e/__tests__/security-agent.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createE2EContext, type E2EContext } from "../fixtures/factory.js";
import { securityVulnDiff, cleanDiff } from "../fixtures/diffs.js";

describe("E2E: Security Agent", () => {
  let ctx: E2EContext;

  beforeAll(() => { ctx = createE2EContext(); });

  it("detects SQL injection pattern", async () => {
    const { scanId } = await ctx.scanService.submitDiff(securityVulnDiff(ctx.projectId));
    await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);

    const { findings } = await ctx.findingService.getFindings({ scanId });
    const secFindings = findings.filter((f) => f.agentName === "security");
    expect(secFindings.length).toBeGreaterThan(0);

    // At least one finding should be SQL injection related
    const sqlFindings = secFindings.filter(
      (f) => f.cweId === "CWE-89" || f.category?.toLowerCase().includes("sql") || f.title?.toLowerCase().includes("sql"),
    );
    console.log(`[VERIFY] SQL injection findings: ${sqlFindings.length}`);
    expect(sqlFindings.length).toBeGreaterThan(0);
  });

  it("detects hardcoded secrets", async () => {
    const { scanId } = await ctx.scanService.submitDiff(securityVulnDiff(ctx.projectId));
    await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);

    const { findings } = await ctx.findingService.getFindings({ scanId });
    const secFindings = findings.filter((f) => f.agentName === "security");
    const secretFindings = secFindings.filter(
      (f) => f.cweId === "CWE-798" || f.category?.toLowerCase().includes("secret") || f.title?.toLowerCase().includes("secret") || f.title?.toLowerCase().includes("hardcoded"),
    );
    console.log(`[VERIFY] Hardcoded secret findings: ${secretFindings.length}`);
    expect(secretFindings.length).toBeGreaterThan(0);
  });

  it("produces zero security findings for clean code", async () => {
    const { scanId } = await ctx.scanService.submitDiff(cleanDiff(ctx.projectId));
    await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);

    const { findings } = await ctx.findingService.getFindings({ scanId });
    const secFindings = findings.filter((f) => f.agentName === "security");
    console.log(`[VERIFY] Security findings for clean code: ${secFindings.length}`);
    expect(secFindings.length).toBe(0);
  });
});
