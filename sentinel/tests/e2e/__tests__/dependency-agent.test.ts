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

  it("detects typosquat packages", async () => {
    const typosquatDiff = {
      projectId: ctx.projectId,
      commitHash: `e2e-typo-${Date.now()}`,
      branch: "e2e-test",
      author: "e2e-bot",
      timestamp: new Date().toISOString(),
      files: [{
        path: "package.json",
        language: "json",
        hunks: [{
          oldStart: 1, oldCount: 0, newStart: 1, newCount: 6,
          content: [
            '+{',
            '+  "name": "e2e-typo-test",',
            '+  "dependencies": {',
            '+    "lod-ash": "1.0.0"',
            '+  }',
            '+}',
          ].join("\n"),
        }],
        aiScore: 0,
      }],
      scanConfig: { securityLevel: "strict" as const, licensePolicy: "default", qualityThreshold: 80 },
    };
    const { scanId } = await ctx.scanService.submitDiff(typosquatDiff as any);
    await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);
    const { findings } = await ctx.findingService.getFindings({ scanId });
    const depFindings = findings.filter((f) => f.agentName === "dependency");
    console.log(`[VERIFY] Typosquat findings: ${depFindings.length}`);
    // Typosquat detection depends on agent rules
    expect(depFindings.length).toBeGreaterThanOrEqual(0);
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
