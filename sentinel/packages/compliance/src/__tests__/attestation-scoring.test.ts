import { describe, it, expect } from "vitest";
import { scoreControlWithAttestation } from "../scoring/engine.js";
import type { ControlDefinition, FindingInput } from "../types.js";

const findings: FindingInput[] = [
  { id: "f1", agentName: "security", severity: "high", category: "vulnerability/xss", suppressed: false },
];

describe("scoreControlWithAttestation", () => {
  it("automated control scored from findings only", () => {
    const control: ControlDefinition = {
      code: "MS-2.5", name: "Security", weight: 3.0,
      matchRules: [{ agent: "security" }], requirementType: "automated",
    };
    const result = scoreControlWithAttestation(control, findings, null);
    expect(result.score).toBeLessThan(1.0);
    expect(result.attestationStatus).toBe("not_required");
  });

  it("attestation control with no attestation scores 0", () => {
    const control: ControlDefinition = {
      code: "GV-1.1", name: "Legal", weight: 2.0,
      matchRules: [], requirementType: "attestation",
    };
    const result = scoreControlWithAttestation(control, findings, null);
    expect(result.score).toBe(0);
    expect(result.attestationStatus).toBe("unattested");
  });

  it("attestation control with valid attestation scores by type", () => {
    const control: ControlDefinition = {
      code: "GV-1.1", name: "Legal", weight: 2.0,
      matchRules: [], requirementType: "attestation",
    };
    const attestation = {
      attestationType: "compliant",
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
    };
    const result = scoreControlWithAttestation(control, findings, attestation);
    expect(result.score).toBe(1.0);
    expect(result.attestationStatus).toBe("valid");
  });

  it("attestation control with expired attestation scores 0", () => {
    const control: ControlDefinition = {
      code: "GV-1.1", name: "Legal", weight: 2.0,
      matchRules: [], requirementType: "attestation",
    };
    const attestation = {
      attestationType: "compliant",
      expiresAt: new Date(Date.now() - 86400000),
      revokedAt: null,
    };
    const result = scoreControlWithAttestation(control, findings, attestation);
    expect(result.score).toBe(0);
    expect(result.attestationStatus).toBe("expired");
  });

  it("compensating_control attestation scores 0.8", () => {
    const control: ControlDefinition = {
      code: "GV-1.1", name: "Legal", weight: 2.0,
      matchRules: [], requirementType: "attestation",
    };
    const attestation = {
      attestationType: "compensating_control",
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
    };
    const result = scoreControlWithAttestation(control, findings, attestation);
    expect(result.score).toBe(0.8);
  });

  it("planned_remediation attestation scores 0.3", () => {
    const control: ControlDefinition = {
      code: "GV-1.1", name: "Legal", weight: 2.0,
      matchRules: [], requirementType: "attestation",
    };
    const attestation = {
      attestationType: "planned_remediation",
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
    };
    const result = scoreControlWithAttestation(control, findings, attestation);
    expect(result.score).toBe(0.3);
  });

  it("not_applicable attestation excludes from scoring", () => {
    const control: ControlDefinition = {
      code: "PS-1.1", name: "Facility", weight: 1.5,
      matchRules: [], requirementType: "attestation",
    };
    const attestation = {
      attestationType: "not_applicable",
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
    };
    const result = scoreControlWithAttestation(control, findings, attestation);
    expect(result.score).toBe(1.0);
    expect(result.attestationStatus).toBe("not_applicable");
  });

  it("hybrid control requires both automated and attestation", () => {
    const control: ControlDefinition = {
      code: "GV-1.2", name: "Trustworthy AI", weight: 2.5,
      matchRules: [{ agent: "quality" }], requirementType: "hybrid",
    };
    const result = scoreControlWithAttestation(control, findings, null);
    expect(result.score).toBe(0);
    expect(result.attestationStatus).toBe("unattested");
  });

  it("hybrid control with both passing returns min", () => {
    const control: ControlDefinition = {
      code: "GV-1.2", name: "Trustworthy AI", weight: 2.5,
      matchRules: [{ agent: "quality" }], requirementType: "hybrid",
    };
    const attestation = {
      attestationType: "compensating_control",
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
    };
    // No quality findings -> automated = 1.0, attestation = 0.8, min = 0.8
    const result = scoreControlWithAttestation(control, findings, attestation);
    expect(result.score).toBe(0.8);
  });

  it("revoked attestation scores 0", () => {
    const control: ControlDefinition = {
      code: "GV-1.1", name: "Legal", weight: 2.0,
      matchRules: [], requirementType: "attestation",
    };
    const attestation = {
      attestationType: "compliant",
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: new Date(),
    };
    const result = scoreControlWithAttestation(control, findings, attestation);
    expect(result.score).toBe(0);
    expect(result.attestationStatus).toBe("revoked");
  });
});
