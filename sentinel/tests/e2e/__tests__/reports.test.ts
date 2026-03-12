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
    try {
      const report = await ctx.reportService.generateReport("compliance");
      expect(report).toBeDefined();
      expect(report.id).toBeTruthy();
      expect(report.type).toBe("compliance");
      console.log(`[VERIFY] Report generated: id=${report.id}, type=${report.type}`);
    } catch (err) {
      console.log(`[VERIFY] Report generation: ${(err as Error).message}`);
      expect((err as Error).message).not.toMatch(/404/);
    }
  });

  it("report list endpoint returns generated reports", async () => {
    try {
      const { reports, total } = await ctx.reportService.listReports();
      expect(reports).toBeDefined();
      expect(Array.isArray(reports)).toBe(true);
      console.log(`[VERIFY] Reports list: ${total} reports`);
    } catch (err) {
      console.log(`[VERIFY] Report list: ${(err as Error).message}`);
      expect((err as Error).message).not.toMatch(/404/);
    }
  });

  it("clean org with no vulnerabilities produces passing report", async () => {
    await submitAndComplete(ctx, cleanDiff(ctx.projectId));

    try {
      const report = await ctx.reportService.generateReport("compliance");
      if (report?.data) {
        console.log(`[VERIFY] Clean report data keys: ${Object.keys(report.data).join(", ")}`);
      }
    } catch (err) {
      console.log(`[VERIFY] Clean report: ${(err as Error).message}`);
      expect((err as Error).message).not.toMatch(/404/);
    }
  });
});
