import { describe, it, expect } from "vitest";
import { BUILT_IN_FRAMEWORKS } from "../frameworks/index.js";

describe("built-in frameworks", () => {
  it("ships 7 frameworks", () => {
    expect(BUILT_IN_FRAMEWORKS.length).toBe(7);
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

  it("all controls have at least one match rule", () => {
    for (const fw of BUILT_IN_FRAMEWORKS) {
      for (const c of fw.controls) {
        expect(c.matchRules.length).toBeGreaterThan(0);
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
  });
});
