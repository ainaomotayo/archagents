// tests/e2e/__tests__/multi-agent.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createE2EContext, type E2EContext } from "../fixtures/factory.js";
import { combinedVulnDiff, securityVulnDiff } from "../fixtures/diffs.js";
import { assertAllInvariantsHold } from "../helpers/invariant-checker.js";

describe("E2E: Multi-Agent Coordination", () => {
  let ctx: E2EContext;

  beforeAll(() => { ctx = createE2EContext(); });

  it("both agents produce findings and assessor merges them", async () => {
    const { scanId } = await ctx.scanService.submitDiff(combinedVulnDiff(ctx.projectId));
    const scan = await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);

    const { findings } = await ctx.findingService.getFindings({ scanId });
    const agents = new Set(findings.map((f) => f.agentName));

    console.log(`[VERIFY] Agents that produced findings: ${[...agents].join(", ")}`);
    expect(agents.size).toBeGreaterThanOrEqual(2);

    // No duplicate findings (same file + line + agent should be unique)
    const keys = findings.map((f) => `${f.agentName}:${f.file}:${f.lineStart}:${f.title}`);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);

    assertAllInvariantsHold({ scan, findings, certificate: null });
  });

  it("handles concurrent scan submissions without interference", async () => {
    const [result1, result2] = await Promise.all([
      ctx.scanService.submitDiff(combinedVulnDiff(ctx.projectId)),
      ctx.scanService.submitDiff(combinedVulnDiff(ctx.projectId)),
    ]);

    const [scan1, scan2] = await Promise.all([
      ctx.scanService.pollUntilStatus(result1.scanId, "completed", 60_000),
      ctx.scanService.pollUntilStatus(result2.scanId, "completed", 60_000),
    ]);

    expect(scan1.id).not.toBe(scan2.id);

    const [findings1, findings2] = await Promise.all([
      ctx.findingService.getFindings({ scanId: result1.scanId }),
      ctx.findingService.getFindings({ scanId: result2.scanId }),
    ]);

    // Each scan should have its own findings
    expect(findings1.findings.length).toBeGreaterThan(0);
    expect(findings2.findings.length).toBeGreaterThan(0);
    console.log(`[VERIFY] Concurrent scans: ${findings1.findings.length} + ${findings2.findings.length} findings`);
  });

  it("only security-relevant findings when diff has no manifests", async () => {
    const { scanId } = await ctx.scanService.submitDiff(securityVulnDiff(ctx.projectId));
    const scan = await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);

    const { findings } = await ctx.findingService.getFindings({ scanId });
    const depFindings = findings.filter((f) => f.agentName === "dependency");

    // Dependency agent should produce 0 findings (no manifest in diff)
    console.log(`[VERIFY] Dependency findings for security-only diff: ${depFindings.length}`);
    expect(depFindings.length).toBe(0);

    assertAllInvariantsHold({ scan, findings, certificate: null });
  });
});
