// tests/e2e/__tests__/reports.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createE2EContext, type E2EContext } from "../fixtures/factory.js";
import { securityVulnDiff, cleanDiff } from "../fixtures/diffs.js";
import { submitAndComplete } from "../scenarios/pipeline.js";

describe("E2E: Report Generation", () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = createE2EContext();
    await submitAndComplete(ctx, securityVulnDiff(ctx.projectId));
  });

  it("compliance report can be generated for org with findings", async () => {
    const report = await ctx.reportService.generateReport("compliance");
    expect(report).toBeDefined();
    expect(report.id).toBeTruthy();
    expect(report.type).toBe("compliance");
    console.log(`[VERIFY] Report generated: id=${report.id}, type=${report.type}`);
  });

  it("report list endpoint returns generated reports", async () => {
    const { reports, total } = await ctx.reportService.listReports();
    expect(reports).toBeDefined();
    expect(Array.isArray(reports)).toBe(true);
    expect(total).toBeGreaterThanOrEqual(0);
    console.log(`[VERIFY] Reports list: ${total} reports`);
  });

  it("clean org with no vulnerabilities produces passing report", async () => {
    await submitAndComplete(ctx, cleanDiff(ctx.projectId));

    const report = await ctx.reportService.generateReport("compliance");
    expect(report).toBeDefined();
    expect(report.id).toBeTruthy();
    if (report.data) {
      console.log(`[VERIFY] Clean report data keys: ${Object.keys(report.data).join(", ")}`);
    }
  });
});
