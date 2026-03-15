import { describe, it, expect } from "vitest";
import { SOC2 } from "../frameworks/soc2.js";
import { SLSA } from "../frameworks/slsa.js";
import { NIST_AI_RMF } from "../frameworks/nist-ai-rmf.js";

describe("Formal verification match rules", () => {
  it("SOC 2 has a control referencing formal-verification agent", () => {
    const fvControls = SOC2.controls.filter((c) =>
      c.matchRules.some((r) => r.agent === "formal-verification"),
    );
    expect(fvControls.length).toBeGreaterThanOrEqual(1);
  });

  it("SLSA has a control referencing formal-verification agent", () => {
    const fvControls = SLSA.controls.filter((c) =>
      c.matchRules.some((r) => r.agent === "formal-verification"),
    );
    expect(fvControls.length).toBeGreaterThanOrEqual(1);
  });

  it("NIST AI RMF has a control referencing formal-verification agent", () => {
    const fvControls = NIST_AI_RMF.controls.filter((c) =>
      c.matchRules.some((r) => r.agent === "formal-verification"),
    );
    expect(fvControls.length).toBeGreaterThanOrEqual(1);
  });

  it("match rules use correct category pattern", () => {
    const allFrameworks = [SOC2, SLSA, NIST_AI_RMF];
    for (const fw of allFrameworks) {
      const fvRules = fw.controls.flatMap((c) =>
        c.matchRules.filter((r) => r.agent === "formal-verification"),
      );
      for (const rule of fvRules) {
        if (rule.category) {
          expect(rule.category).toMatch(/^formal-verification\//);
        }
      }
    }
  });
});
