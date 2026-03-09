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

  it("getProjects returns an array of projects", async () => {
    const projects = await getProjects();
    expect(Array.isArray(projects)).toBe(true);
    expect(projects.length).toBeGreaterThan(0);
    for (const p of projects) {
      expect(p).toHaveProperty("id");
      expect(p).toHaveProperty("name");
      expect(p).toHaveProperty("findingCount");
    }
  });

  it("getProjectById returns a project or null", async () => {
    const project = await getProjectById("proj-001");
    expect(project).not.toBeNull();
    expect(project!.id).toBe("proj-001");

    const missing = await getProjectById("nonexistent");
    expect(missing).toBeNull();
  });

  it("getProjectScans filters by projectId", async () => {
    const scans = await getProjectScans("proj-001");
    for (const scan of scans) {
      expect(scan.projectId).toBe("proj-001");
    }
  });

  it("getFindings returns findings with required shape", async () => {
    const findings = await getFindings();
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f).toHaveProperty("id");
      expect(f).toHaveProperty("severity");
      expect(f).toHaveProperty("title");
      expect(f).toHaveProperty("codeSnippet");
      expect(["critical", "high", "medium", "low"]).toContain(f.severity);
    }
  });

  it("getFindingById returns a finding or null", async () => {
    const finding = await getFindingById("find-201");
    expect(finding).not.toBeNull();
    expect(finding!.id).toBe("find-201");

    const missing = await getFindingById("nonexistent");
    expect(missing).toBeNull();
  });

  it("getCertificates returns certificates with required shape", async () => {
    const certs = await getCertificates();
    expect(certs.length).toBeGreaterThan(0);
    for (const c of certs) {
      expect(c).toHaveProperty("id");
      expect(c).toHaveProperty("status");
      expect(c).toHaveProperty("riskScore");
      expect(["active", "revoked", "expired"]).toContain(c.status);
    }
  });

  it("getProjectCertificate returns an active cert or null", async () => {
    const cert = await getProjectCertificate("proj-001");
    expect(cert).not.toBeNull();
    expect(cert!.status).toBe("active");
    expect(cert!.projectId).toBe("proj-001");

    const noCert = await getProjectCertificate("proj-005");
    expect(noCert).toBeNull();
  });
});
