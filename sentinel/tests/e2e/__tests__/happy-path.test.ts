// tests/e2e/__tests__/happy-path.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createE2EContext, type E2EContext } from "../fixtures/factory.js";
import { combinedVulnDiff, cleanDiff } from "../fixtures/diffs.js";
import { RedisInspector } from "../helpers/redis-inspector.js";
import { verifyDag, HAPPY_PATH_DAG } from "../helpers/dag-verifier.js";
import { assertAllInvariantsHold } from "../helpers/invariant-checker.js";

describe("E2E: Happy Path — Full Pipeline", () => {
  let ctx: E2EContext;
  let redis: RedisInspector;

  beforeAll(() => {
    ctx = createE2EContext();
    redis = new RedisInspector();
  });

  afterAll(async () => {
    await redis.disconnect();
  });

  it("submits a vulnerable diff and receives findings + certificate", async () => {
    // EXECUTE
    console.log("[EXECUTE] Submitting combined vuln diff...");
    const { scanId } = await ctx.scanService.submitDiff(
      combinedVulnDiff(ctx.projectId),
    );
    expect(scanId).toBeTruthy();
    console.log(`[EXECUTE] scanId=${scanId}`);

    // WAIT
    console.log("[WAIT] Polling for scan completion...");
    const scan = await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);
    console.log(`[WAIT] Scan completed in status=${scan.status}`);

    // VERIFY: Findings exist
    const { findings } = await ctx.findingService.getFindings({ scanId });
    console.log(`[VERIFY] ${findings.length} findings`);
    expect(findings.length).toBeGreaterThan(0);

    // VERIFY: Both agents produced findings
    const agents = new Set(findings.map((f) => f.agentName));
    console.log(`[VERIFY] Agents: ${[...agents].join(", ")}`);
    expect(agents.has("security")).toBe(true);
    expect(agents.has("dependency")).toBe(true);

    // VERIFY: Severity values are valid
    const validSeverities = new Set(["critical", "high", "medium", "low", "info"]);
    for (const f of findings) {
      expect(validSeverities.has(f.severity)).toBe(true);
    }

    // VERIFY: Certificate issued
    const certificate = await ctx.certificateService.getCertificate(scanId);
    console.log(`[VERIFY] Certificate: status=${certificate?.status}, riskScore=${certificate?.riskScore}`);
    expect(certificate).not.toBeNull();
    expect(certificate!.riskScore).toBeGreaterThan(0);

    // VERIFY: All pipeline invariants hold
    assertAllInvariantsHold({ scan, findings, certificate });
    console.log("[VERIFY] All invariants passed");
  });

  it("submits a clean diff and receives a passing certificate", async () => {
    console.log("[EXECUTE] Submitting clean diff...");
    const { scanId } = await ctx.scanService.submitDiff(
      cleanDiff(ctx.projectId),
    );

    console.log("[WAIT] Polling for scan completion...");
    const scan = await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);

    const { findings } = await ctx.findingService.getFindings({ scanId });
    console.log(`[VERIFY] ${findings.length} findings (expected 0)`);
    expect(findings.length).toBe(0);

    const certificate = await ctx.certificateService.getCertificate(scanId);
    console.log(`[VERIFY] Certificate: status=${certificate?.status}`);
    if (certificate) {
      expect(certificate.status).toBe("full_pass");
      expect(certificate.riskScore).toBe(0);
    }

    assertAllInvariantsHold({ scan, findings, certificate });
    console.log("[VERIFY] All invariants passed");
  });

  it("verifies Redis streams have correct entries and DAG ordering", async () => {
    // Submit a diff and wait
    const { scanId } = await ctx.scanService.submitDiff(
      combinedVulnDiff(ctx.projectId),
    );
    await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);

    // VERIFY: sentinel.diffs stream has entries
    const diffsLen = await redis.getStreamLength("sentinel.diffs");
    console.log(`[VERIFY] sentinel.diffs stream length: ${diffsLen}`);
    expect(diffsLen).toBeGreaterThan(0);

    // VERIFY: sentinel.findings stream has entries
    const findingsLen = await redis.getStreamLength("sentinel.findings");
    console.log(`[VERIFY] sentinel.findings stream length: ${findingsLen}`);
    expect(findingsLen).toBeGreaterThan(0);

    // VERIFY: DAG ordering — collect event types from all streams
    const allStreams = ["sentinel.diffs", "sentinel.findings", "sentinel.results", "sentinel.notifications"];
    const events: string[] = [];
    for (const stream of allStreams) {
      const entries = await redis.getStreamEntries(stream, 100);
      for (const entry of entries) {
        const type = (entry.data as any).type ?? (entry.data as any).topic ?? "";
        if (type) events.push(type);
      }
    }
    console.log(`[VERIFY] Collected ${events.length} events for DAG verification`);

    if (events.length > 0) {
      const dagResult = verifyDag(HAPPY_PATH_DAG, events);
      console.log(`[VERIFY] DAG: valid=${dagResult.valid}, matched=${dagResult.matched.join(",")}, missing=${dagResult.missing.join(",")}, violations=${dagResult.orderViolations.join(",")}`);
      expect(dagResult.orderViolations).toHaveLength(0);
    }
  });
});
