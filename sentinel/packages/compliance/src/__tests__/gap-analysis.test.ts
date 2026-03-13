import { describe, it, expect } from "vitest";
import { computeGapAnalysis } from "../gap-analysis/service.js";
import type { FrameworkDefinition, FindingInput } from "../types.js";
import type { AttestationInput } from "../scoring/engine.js";

const miniFramework: FrameworkDefinition = {
  slug: "test-fw",
  name: "Test Framework",
  version: "1.0",
  category: "regulatory",
  controls: [
    { code: "C-1", name: "Automated Control", weight: 3.0, matchRules: [{ agent: "security" }], requirementType: "automated" },
    { code: "C-2", name: "Attestation Control", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required" },
    { code: "C-3", name: "Hybrid Control", weight: 2.5, matchRules: [{ agent: "quality" }], requirementType: "hybrid" },
    { code: "C-4", name: "Low Weight Control", weight: 1.0, matchRules: [], requirementType: "attestation" },
  ],
};

const noFindings: FindingInput[] = [];
const securityFinding: FindingInput[] = [
  { id: "f1", agentName: "security", severity: "high", category: "vulnerability/xss", suppressed: false },
];

describe("computeGapAnalysis", () => {
  it("returns empty gaps when all controls are compliant", () => {
    const attestations: Record<string, AttestationInput> = {
      "C-2": { attestationType: "compliant", expiresAt: new Date(Date.now() + 86400000), revokedAt: null },
      "C-3": { attestationType: "compliant", expiresAt: new Date(Date.now() + 86400000), revokedAt: null },
      "C-4": { attestationType: "compliant", expiresAt: new Date(Date.now() + 86400000), revokedAt: null },
    };
    const result = computeGapAnalysis(miniFramework, noFindings, attestations, {});
    expect(result.gaps.length).toBe(0);
    expect(result.summary.compliant).toBe(4);
  });

  it("missing attestation creates a gap", () => {
    const result = computeGapAnalysis(miniFramework, noFindings, {}, {});
    const attestationGaps = result.gaps.filter((g) => g.gapType === "missing_attestation");
    expect(attestationGaps.length).toBeGreaterThanOrEqual(2);
  });

  it("expired attestation creates a gap", () => {
    const attestations: Record<string, AttestationInput> = {
      "C-2": { attestationType: "compliant", expiresAt: new Date(Date.now() - 86400000), revokedAt: null },
    };
    const result = computeGapAnalysis(miniFramework, noFindings, attestations, {});
    const expiredGaps = result.gaps.filter((g) => g.gapType === "expired_attestation");
    expect(expiredGaps.length).toBeGreaterThanOrEqual(1);
  });

  it("automated failure creates a gap", () => {
    const result = computeGapAnalysis(miniFramework, securityFinding, {}, {});
    const autoGaps = result.gaps.filter((g) => g.gapType === "automated_failure");
    expect(autoGaps.length).toBeGreaterThanOrEqual(1);
  });

  it("gaps are sorted by severity (critical first)", () => {
    const result = computeGapAnalysis(miniFramework, securityFinding, {}, {});
    if (result.gaps.length > 1) {
      const severityOrder = ["critical", "high", "medium", "low"];
      for (let i = 1; i < result.gaps.length; i++) {
        expect(severityOrder.indexOf(result.gaps[i].severity)).toBeGreaterThanOrEqual(
          severityOrder.indexOf(result.gaps[i - 1].severity),
        );
      }
    }
  });

  it("not_applicable controls are excluded from gaps", () => {
    const attestations: Record<string, AttestationInput> = {
      "C-2": { attestationType: "not_applicable", expiresAt: new Date(Date.now() + 86400000), revokedAt: null },
      "C-3": { attestationType: "compliant", expiresAt: new Date(Date.now() + 86400000), revokedAt: null },
      "C-4": { attestationType: "not_applicable", expiresAt: new Date(Date.now() + 86400000), revokedAt: null },
    };
    const result = computeGapAnalysis(miniFramework, noFindings, attestations, {});
    expect(result.summary.notApplicable).toBe(2);
    const naGaps = result.gaps.filter((g) => g.controlCode === "C-2" || g.controlCode === "C-4");
    expect(naGaps.length).toBe(0);
  });

  it("summary counts are correct", () => {
    const attestations: Record<string, AttestationInput> = {
      "C-2": { attestationType: "compliant", expiresAt: new Date(Date.now() + 86400000), revokedAt: null },
    };
    const result = computeGapAnalysis(miniFramework, noFindings, attestations, {});
    expect(result.summary.compliant + result.summary.partiallyCompliant + result.summary.nonCompliant + result.summary.notApplicable + result.summary.unattested).toBe(miniFramework.controls.length);
  });

  it("includes remediation plan stats", () => {
    const remediations: Record<string, any> = {
      "C-2": { status: "in_progress", dueDate: new Date(Date.now() + 86400000) },
    };
    const result = computeGapAnalysis(miniFramework, noFindings, {}, remediations);
    expect(result.remediationPlan).toHaveProperty("totalItems");
    expect(result.remediationPlan).toHaveProperty("inProgress");
  });
});
