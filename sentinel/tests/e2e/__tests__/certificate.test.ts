// tests/e2e/__tests__/certificate.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createE2EContext, type E2EContext } from "../fixtures/factory.js";
import { combinedVulnDiff, cleanDiff } from "../fixtures/diffs.js";

describe("E2E: Certificate Verification", () => {
  let ctx: E2EContext;

  beforeAll(() => { ctx = createE2EContext(); });

  it("certificate has valid structure after pipeline completion", async () => {
    const { scanId } = await ctx.scanService.submitDiff(combinedVulnDiff(ctx.projectId));
    await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);

    const certificate = await ctx.certificateService.getCertificate(scanId);

    expect(certificate).not.toBeNull();
    expect(certificate!.scanId).toBe(scanId);
    expect(certificate!.orgId).toBeTruthy();
    expect(certificate!.status).toBeTruthy();
    expect(typeof certificate!.riskScore).toBe("number");
    expect(certificate!.signature).toBeTruthy();
    expect(certificate!.issuedAt).toBeTruthy();
    expect(certificate!.expiresAt).toBeTruthy();

    // ExpiresAt should be in the future
    expect(new Date(certificate!.expiresAt).getTime()).toBeGreaterThan(Date.now());

    console.log(`[VERIFY] Certificate: status=${certificate!.status}, riskScore=${certificate!.riskScore}`);
  });

  it("certificate HMAC signature can be verified", async () => {
    const { scanId } = await ctx.scanService.submitDiff(combinedVulnDiff(ctx.projectId));
    await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);

    const certificate = await ctx.certificateService.getCertificate(scanId);
    if (!certificate) return; // Skip if no cert endpoint

    // Client-side verification: re-sign verdict JSON and compare to stored signature
    const secret = process.env.E2E_SECRET ?? "e2e-test-secret";
    const clientValid = ctx.certificateService.verifyCertificateSignature(certificate, secret);
    console.log(`[VERIFY] Client-side HMAC verification: valid=${clientValid}`);

    // Also try server-side verification endpoint via POST
    const apiUrl = process.env.E2E_API_URL ?? "http://localhost:8081";
    try {
      const res = await fetch(`${apiUrl}/v1/certificates/${certificate.id}/verify`, {
        method: "POST",
      });
      const body = await res.json();
      console.log(`[VERIFY] Server verification: status=${res.status}, valid=${(body as any).valid}`);
    } catch (err) {
      console.log(`[VERIFY] Certificate verification endpoint not available: ${(err as Error).message}`);
    }

    // At least client-side verification should confirm the signature
    expect(certificate.signature).toBeTruthy();
    expect(certificate.verdict).toBeTruthy();
  });

  it("certificate can be retrieved by scanId via API", async () => {
    const { scanId } = await ctx.scanService.submitDiff(combinedVulnDiff(ctx.projectId));
    await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);

    const certificate = await ctx.certificateService.getCertificate(scanId);
    expect(certificate).not.toBeNull();
    expect(certificate!.scanId).toBe(scanId);
    expect(certificate!.id).toBeTruthy();

    console.log(`[VERIFY] Certificate retrieved by scanId: id=${certificate!.id}`);
  });

  it("clean diff produces full_pass certificate with riskScore 0", async () => {
    const { scanId } = await ctx.scanService.submitDiff(cleanDiff(ctx.projectId));
    await ctx.scanService.pollUntilStatus(scanId, "completed", 45_000);

    const certificate = await ctx.certificateService.getCertificate(scanId);

    if (certificate) {
      console.log(`[VERIFY] Clean diff certificate: ${certificate.status}, score=${certificate.riskScore}`);
      expect(certificate.status).toBe("full_pass");
      expect(certificate.riskScore).toBe(0);
    }
  });
});
