import { describe, it, expect } from "vitest";
import { EU_AI_ACT_CONTROLS, EU_AI_ACT_CONTROL_MAP } from "../wizard/eu-ai-act-controls.js";

describe("EU AI Act Controls", () => {
  it("defines exactly 12 controls", () => {
    expect(EU_AI_ACT_CONTROLS).toHaveLength(12);
  });

  it("has phase distribution [3, 4, 3, 2]", () => {
    const phases: Record<number, number> = {};
    for (const c of EU_AI_ACT_CONTROLS) {
      phases[c.phase] = (phases[c.phase] ?? 0) + 1;
    }
    expect(phases).toEqual({ 1: 3, 2: 4, 3: 3, 4: 2 });
  });

  it("all dependency codes exist in the map", () => {
    for (const c of EU_AI_ACT_CONTROLS) {
      for (const dep of c.dependencies) {
        expect(EU_AI_ACT_CONTROL_MAP.has(dep)).toBe(true);
      }
    }
  });

  it("each control has at least 3 requirements", () => {
    for (const c of EU_AI_ACT_CONTROLS) {
      expect(c.requirements.length).toBeGreaterThanOrEqual(3);
    }
  });
});
