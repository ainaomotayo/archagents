import { describe, it, expect } from "vitest";
import { generateCertificate, verifyCertificate } from "./certificate.js";
import type { ComplianceAssessment, ComplianceCertificate } from "@sentinel/shared";

function makeAssessment(
  overrides: Partial<ComplianceAssessment> = {},
): ComplianceAssessment {
  return {
    id: "assess-001",
    commitHash: "abc123",
    projectId: "proj-1",
    timestamp: "2026-03-09T00:00:00.000Z",
    status: "full_pass",
    riskScore: 10,
    categories: {
      security: { score: 5, status: "pass", findings: { critical: 0, high: 0, medium: 1, low: 0 } },
      license: { score: 0, status: "pass", findings: { critical: 0, high: 0, medium: 0, low: 0 } },
      quality: { score: 0, status: "pass", findings: { critical: 0, high: 0, medium: 0, low: 0 } },
      policy: { score: 0, status: "pass", findings: { critical: 0, high: 0, medium: 0, low: 0 } },
      dependency: { score: 0, status: "pass", findings: { critical: 0, high: 0, medium: 0, low: 0 } },
    },
    findings: [],
    agentResults: [
      {
        agentName: "security-agent",
        agentVersion: "1.0.0",
        rulesetVersion: "1.0.0",
        rulesetHash: "hash1",
        status: "completed",
        findingCount: 1,
        durationMs: 500,
      },
    ],
    drift: {
      aiComposition: {
        thisCommit: 0,
        projectBaseline: 0,
        deviationFactor: 0,
        riskFlag: false,
        trend: "stable",
      },
      dependencyDrift: { newDeps: [], categoryConflicts: [] },
    },
    ...overrides,
  };
}

describe("generateCertificate", () => {
  it("produces valid JSON with expected fields", () => {
    const json = generateCertificate(makeAssessment(), "test-secret");
    const cert: ComplianceCertificate = JSON.parse(json);

    expect(cert.id).toBe("cert-assess-001");
    expect(cert.version).toBe("1.0");
    expect(cert.verdict.status).toBe("pass");
    expect(cert.verdict.riskScore).toBe(10);
    expect(cert.signature).toBeTruthy();
    expect(cert.scanMetadata.agents).toHaveLength(1);
  });

  it("maps provisional_pass to provisional verdict", () => {
    const json = generateCertificate(
      makeAssessment({ status: "provisional_pass" }),
      "secret",
    );
    const cert: ComplianceCertificate = JSON.parse(json);
    expect(cert.verdict.status).toBe("provisional");
  });

  it("maps fail status to fail verdict", () => {
    const json = generateCertificate(
      makeAssessment({ status: "fail" }),
      "secret",
    );
    const cert: ComplianceCertificate = JSON.parse(json);
    expect(cert.verdict.status).toBe("fail");
  });
});

describe("verifyCertificate", () => {
  it("returns true for unmodified certificate", () => {
    const json = generateCertificate(makeAssessment(), "my-secret");
    expect(verifyCertificate(json, "my-secret")).toBe(true);
  });

  it("returns false for tampered certificate", () => {
    const json = generateCertificate(makeAssessment(), "my-secret");
    const cert = JSON.parse(json);
    cert.verdict.riskScore = 0;
    expect(verifyCertificate(JSON.stringify(cert), "my-secret")).toBe(false);
  });

  it("returns false for wrong secret", () => {
    const json = generateCertificate(makeAssessment(), "correct-secret");
    expect(verifyCertificate(json, "wrong-secret")).toBe(false);
  });

  it("returns false for invalid JSON", () => {
    expect(verifyCertificate("not-json", "secret")).toBe(false);
  });
});
