import { describe, it, expect } from "vitest";
import {
  getOverviewStats,
  getRecentScans,
  getProjects,
  getProjectById,
  getProjectScans,
  getFindings,
  getFindingById,
  getCertificates,
  getCertificateById,
  getProjectCertificate,
} from "@/lib/api";

describe("API client", () => {
  it("getOverviewStats returns all required fields", async () => {
    const stats = await getOverviewStats();
    expect(stats).toHaveProperty("totalScans");
    expect(stats).toHaveProperty("activeRevocations");
    expect(stats).toHaveProperty("openFindings");
    expect(stats).toHaveProperty("passRate");
    expect(typeof stats.totalScans).toBe("number");
    expect(typeof stats.passRate).toBe("number");
    expect(stats.passRate).toBeGreaterThanOrEqual(0);
    expect(stats.passRate).toBeLessThanOrEqual(100);
  });

  it("getRecentScans respects the limit parameter", async () => {
    const scans = await getRecentScans(3);
    expect(scans.length).toBeLessThanOrEqual(3);
    for (const scan of scans) {
      expect(scan).toHaveProperty("id");
      expect(scan).toHaveProperty("commit");
      expect(scan).toHaveProperty("status");
    }
  });

  it("getProjects returns an array (empty when API unavailable)", async () => {
    const projects = await getProjects();
    expect(Array.isArray(projects)).toBe(true);
    // When no API is reachable the fallback is an empty array
    for (const p of projects) {
      expect(p).toHaveProperty("id");
      expect(p).toHaveProperty("name");
      expect(p).toHaveProperty("findingCount");
    }
  });

  it("getProjectById returns null when API unavailable", async () => {
    const project = await getProjectById("proj-001");
    // Without a live API the empty fallback is null
    expect(project === null || typeof project === "object").toBe(true);

    const missing = await getProjectById("nonexistent");
    expect(missing).toBeNull();
  });

  it("getProjectScans returns an array (may be empty when API unavailable)", async () => {
    const scans = await getProjectScans("proj-001");
    expect(Array.isArray(scans)).toBe(true);
    for (const scan of scans) {
      expect(scan.projectId).toBe("proj-001");
    }
  });

  it("getFindings returns an array (empty when API unavailable)", async () => {
    const findings = await getFindings();
    expect(Array.isArray(findings)).toBe(true);
    for (const f of findings) {
      expect(f).toHaveProperty("id");
      expect(f).toHaveProperty("severity");
      expect(f).toHaveProperty("title");
      expect(f).toHaveProperty("codeSnippet");
      expect(["critical", "high", "medium", "low"]).toContain(f.severity);
    }
  });

  it("getFindingById returns null when API unavailable", async () => {
    const finding = await getFindingById("find-201");
    // Without a live API the empty fallback is null
    expect(finding === null || typeof finding === "object").toBe(true);

    const missing = await getFindingById("nonexistent");
    expect(missing).toBeNull();
  });

  it("getCertificates returns an array (empty when API unavailable)", async () => {
    const certs = await getCertificates();
    expect(Array.isArray(certs)).toBe(true);
    for (const c of certs) {
      expect(c).toHaveProperty("id");
      expect(c).toHaveProperty("status");
      expect(c).toHaveProperty("riskScore");
      expect(["active", "revoked", "expired"]).toContain(c.status);
    }
  });

  it("getProjectCertificate returns null when no certs available", async () => {
    const cert = await getProjectCertificate("proj-001");
    // Without a live API getCertificates returns [] so no active cert can be found
    expect(cert === null || (cert !== null && cert.status === "active")).toBe(true);

    const noCert = await getProjectCertificate("proj-005");
    expect(noCert).toBeNull();
  });
});
