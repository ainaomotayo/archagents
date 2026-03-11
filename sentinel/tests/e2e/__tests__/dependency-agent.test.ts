// tests/e2e/__tests__/dependency-agent.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createE2EContext, type E2EContext } from "../fixtures/factory.js";
import { dependencyVulnDiff, cleanDiff } from "../fixtures/diffs.js";

describe("E2E: Dependency Agent", () => {
  let ctx: E2EContext;

  beforeAll(() => { ctx = createE2EContext(); });

  it("detects known vulnerable dependencies", async () => {
    const { scanId } = await ctx.scanService.submitDiff(dependencyVulnDiff(ctx.projectId));
    await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);

    const { findings } = await ctx.findingService.getFindings({ scanId });
    const depFindings = findings.filter((f) => f.agentName === "dependency");
    console.log(`[VERIFY] Dependency findings: ${depFindings.length}`);
    expect(depFindings.length).toBeGreaterThan(0);

    // Should detect vulnerabilities in lodash 4.17.20
    const hasCVE = depFindings.some(
      (f) => f.type === "dependency" || f.category?.includes("vuln"),
    );
    expect(hasCVE).toBe(true);
  });

  it("produces zero dependency findings for clean manifest", async () => {
    const { scanId } = await ctx.scanService.submitDiff(cleanDiff(ctx.projectId));
    await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);

    const { findings } = await ctx.findingService.getFindings({ scanId });
    const depFindings = findings.filter((f) => f.agentName === "dependency");
    console.log(`[VERIFY] Dependency findings for clean code: ${depFindings.length}`);
    expect(depFindings.length).toBe(0);
  });
});
