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
