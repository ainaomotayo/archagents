// tests/e2e/__tests__/rbac.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createE2EContext, type E2EContext } from "../fixtures/factory.js";
import { securityVulnDiff } from "../fixtures/diffs.js";
import { expectRBACDenied } from "../helpers/assertions.js";
import { E2EApiClient } from "../services/api-client.js";

describe("E2E: RBAC Enforcement", () => {
  let ctx: E2EContext;
  let viewerClient: E2EApiClient;

  beforeAll(() => {
    ctx = createE2EContext();
    const apiUrl = process.env.E2E_API_URL ?? "http://localhost:8081";
    const secret = process.env.E2E_SECRET ?? "e2e-test-secret";
    const orgId = process.env.E2E_ORG_ID ?? "org-e2e-test";
    viewerClient = new E2EApiClient(apiUrl, secret, orgId);
  });

  it("admin role can submit scans, read findings, and read certificates", async () => {
    const { scanId } = await ctx.scanService.submitDiff(
      securityVulnDiff(ctx.projectId),
    );
    expect(scanId).toBeTruthy();

    const scan = await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);
    expect(scan.status).toBe("completed");

    const { findings } = await ctx.findingService.getFindings({ scanId });
    expect(findings.length).toBeGreaterThan(0);

    const cert = await ctx.certificateService.getCertificate(scanId);
    expect(cert).not.toBeNull();
  });

  it("viewer role can read scans but cannot submit new scans", async () => {
    // Viewer CAN read scans
    const scans = await viewerClient.request<{ scans: unknown[]; total: number }>(
      "GET", "/v1/scans", undefined, "viewer",
    );
    expect(scans).toBeDefined();

    // Viewer CANNOT submit scans
    await expectRBACDenied(() =>
      viewerClient.request("POST", "/v1/scans", securityVulnDiff("proj-e2e-test"), "viewer"),
    );
  });

  it("viewer role cannot suppress findings", async () => {
    // First create a scan with admin role to get a finding
    const { scanId } = await ctx.scanService.submitDiff(
      securityVulnDiff(ctx.projectId),
    );
    await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);
    const { findings } = await ctx.findingService.getFindings({ scanId });

    if (findings.length === 0) return;

    await expectRBACDenied(() =>
      viewerClient.request(
        "PATCH",
        `/v1/findings/${findings[0].id}`,
        { suppressed: true },
        "viewer",
      ),
    );
  });

  it("viewer role cannot generate reports", async () => {
    await expectRBACDenied(() =>
      viewerClient.request("POST", "/v1/reports", { type: "compliance" }, "viewer"),
    );
  });
});
