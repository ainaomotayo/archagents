import { describe, it, expect } from "vitest";
import { HIPAA } from "../frameworks/hipaa.js";

describe("HIPAA Security Rule framework", () => {
  it("has correct slug and metadata", () => {
    expect(HIPAA.slug).toBe("hipaa");
    expect(HIPAA.name).toBe("HIPAA Security Rule");
    expect(HIPAA.version).toBe("2013");
    expect(HIPAA.category).toBe("regulatory");
  });

  it("has 3 safeguard groups", () => {
    const prefixes = new Set(
      HIPAA.controls.map((c) => c.code.split("-")[0]),
    );
    expect(prefixes).toEqual(new Set(["AS", "PS", "TS"]));
  });

  it("has at least 50 controls", () => {
    expect(HIPAA.controls.length).toBeGreaterThanOrEqual(50);
  });

  it("every control has a requirementType", () => {
    for (const c of HIPAA.controls) {
      expect(["automated", "attestation", "hybrid"]).toContain(c.requirementType);
    }
  });

  it("every control has a regulatoryStatus", () => {
    for (const c of HIPAA.controls) {
      expect(["required", "addressable"]).toContain(c.regulatoryStatus);
    }
  });

  it("required controls have weight >= 2.0", () => {
    for (const c of HIPAA.controls) {
      if (c.regulatoryStatus === "required") {
        expect(c.weight).toBeGreaterThanOrEqual(2.0);
      }
    }
  });

  it("technical safeguard automated controls reference security agent", () => {
    const techAutoControls = HIPAA.controls.filter(
      (c) => c.code.startsWith("TS-") && c.requirementType === "automated",
    );
    expect(techAutoControls.length).toBeGreaterThanOrEqual(5);
    for (const c of techAutoControls) {
      const hasSecurityRule = c.matchRules.some(
        (r) => r.agent === "security" || r.category?.startsWith("vulnerability/"),
      );
      expect(hasSecurityRule).toBe(true);
    }
  });

  it("physical safeguards are all attestation", () => {
    const physical = HIPAA.controls.filter((c) => c.code.startsWith("PS-"));
    for (const c of physical) {
      expect(c.requirementType).toBe("attestation");
    }
  });

  it("has no duplicate control codes", () => {
    const codes = HIPAA.controls.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
