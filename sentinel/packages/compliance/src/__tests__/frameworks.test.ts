import { describe, it, expect } from "vitest";
import { BUILT_IN_FRAMEWORKS } from "../frameworks/index.js";
import type { ControlDefinition } from "../types.js";

describe("built-in frameworks", () => {
  it("ships 8 frameworks", () => {
    expect(BUILT_IN_FRAMEWORKS.length).toBe(8);
  });

  it("all frameworks have unique slugs", () => {
    const slugs = BUILT_IN_FRAMEWORKS.map((f) => f.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("all frameworks have at least one control", () => {
    for (const fw of BUILT_IN_FRAMEWORKS) {
      expect(fw.controls.length).toBeGreaterThan(0);
    }
  });

  it("all controls have unique codes within their framework", () => {
    for (const fw of BUILT_IN_FRAMEWORKS) {
      const codes = fw.controls.map((c) => c.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it("all controls have positive weights", () => {
    for (const fw of BUILT_IN_FRAMEWORKS) {
      for (const c of fw.controls) {
        expect(c.weight).toBeGreaterThan(0);
      }
    }
  });

  it("all controls have match rules or are attestation/platform-covered", () => {
    for (const fw of BUILT_IN_FRAMEWORKS) {
      for (const c of fw.controls) {
        // Attestation controls may have empty matchRules (verified by human process)
        // Platform-covered automated controls document coverage via description
        const isAttestation = c.requirementType === "attestation";
        const isPlatformCovered = c.matchRules.length === 0 && !!c.description;
        if (!isAttestation && !isPlatformCovered) {
          expect(c.matchRules.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("includes all expected framework slugs", () => {
    const slugs = BUILT_IN_FRAMEWORKS.map((f) => f.slug);
    expect(slugs).toContain("soc2");
    expect(slugs).toContain("iso27001");
    expect(slugs).toContain("eu-ai-act");
    expect(slugs).toContain("slsa");
    expect(slugs).toContain("openssf");
    expect(slugs).toContain("cis-ssc");
    expect(slugs).toContain("gdpr");
    expect(slugs).toContain("nist-ai-rmf");
  });
});

describe("ControlDefinition extended fields", () => {
  it("accepts requirementType field", () => {
    const control: ControlDefinition = {
      code: "TEST-1",
      name: "Test",
      weight: 1.0,
      matchRules: [],
      requirementType: "automated",
    };
    expect(control.requirementType).toBe("automated");
  });

  it("accepts all requirementType values", () => {
    const types: ControlDefinition["requirementType"][] = ["automated", "attestation", "hybrid"];
    expect(types).toHaveLength(3);
  });

  it("accepts parentCode field", () => {
    const control: ControlDefinition = {
      code: "GV-1.1",
      name: "Test",
      weight: 1.0,
      matchRules: [],
      requirementType: "attestation",
      parentCode: "GV-1",
    };
    expect(control.parentCode).toBe("GV-1");
  });

  it("accepts regulatoryStatus field", () => {
    const control: ControlDefinition = {
      code: "AS-1.1",
      name: "Test",
      weight: 3.0,
      matchRules: [],
      requirementType: "hybrid",
      regulatoryStatus: "required",
    };
    expect(control.regulatoryStatus).toBe("required");
  });
});
