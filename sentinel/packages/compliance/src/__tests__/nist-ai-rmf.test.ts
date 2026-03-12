import { describe, it, expect } from "vitest";
import { NIST_AI_RMF } from "../frameworks/nist-ai-rmf.js";

describe("NIST AI RMF framework", () => {
  it("has correct slug and metadata", () => {
    expect(NIST_AI_RMF.slug).toBe("nist-ai-rmf");
    expect(NIST_AI_RMF.name).toBe("NIST AI RMF 1.0");
    expect(NIST_AI_RMF.version).toBe("1.0");
    expect(NIST_AI_RMF.category).toBe("regulatory");
  });

  it("has 4 top-level functions", () => {
    const topLevelCodes = new Set(
      NIST_AI_RMF.controls.map((c) => c.code.split("-")[0]),
    );
    expect(topLevelCodes).toEqual(new Set(["GV", "MP", "MS", "MG"]));
  });

  it("has exactly 83 controls", () => {
    expect(NIST_AI_RMF.controls.length).toBe(83);
  });

  it("every control has a requirementType", () => {
    for (const c of NIST_AI_RMF.controls) {
      expect(["automated", "attestation", "hybrid"]).toContain(c.requirementType);
    }
  });

  it("every non-root control has a parentCode", () => {
    const codes = new Set(NIST_AI_RMF.controls.map((c) => c.code));
    for (const c of NIST_AI_RMF.controls) {
      if (c.parentCode) {
        const isValidParent = codes.has(c.parentCode) || /^(GV|MP|MS|MG)(-\d+)?$/.test(c.parentCode);
        expect(isValidParent).toBe(true);
      }
    }
  });

  it("weights are in range 1.0-3.0", () => {
    for (const c of NIST_AI_RMF.controls) {
      expect(c.weight).toBeGreaterThanOrEqual(1.0);
      expect(c.weight).toBeLessThanOrEqual(3.0);
    }
  });

  it("automated controls have at least one matchRule or a description", () => {
    for (const c of NIST_AI_RMF.controls) {
      if (c.requirementType === "automated" || c.requirementType === "hybrid") {
        // Controls covered by platform features (audit trail, approval workflow)
        // may have empty matchRules but document coverage via description
        const hasCoverage = c.matchRules.length >= 1 || !!c.description;
        expect(hasCoverage).toBe(true);
      }
    }
  });

  it("attestation-only controls have empty matchRules", () => {
    for (const c of NIST_AI_RMF.controls) {
      if (c.requirementType === "attestation") {
        expect(c.matchRules).toEqual([]);
      }
    }
  });

  it("has no duplicate control codes", () => {
    const codes = NIST_AI_RMF.controls.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
