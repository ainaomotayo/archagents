import { describe, it, expect } from "vitest";
import {
  THRESHOLD_PRESETS,
  validateThreshold,
} from "@/components/ai-metrics/ai-metrics-config-modal";

describe("THRESHOLD_PRESETS", () => {
  it("has 3 presets", () => {
    expect(THRESHOLD_PRESETS).toHaveLength(3);
  });

  it("has Balanced, Conservative, Strict", () => {
    const labels = THRESHOLD_PRESETS.map((p) => p.label);
    expect(labels).toEqual(["Balanced", "Conservative", "Strict"]);
  });

  it("has correct values", () => {
    expect(THRESHOLD_PRESETS[0].value).toBe(0.5);
    expect(THRESHOLD_PRESETS[1].value).toBe(0.65);
    expect(THRESHOLD_PRESETS[2].value).toBe(0.75);
  });

  it("has descriptions", () => {
    for (const preset of THRESHOLD_PRESETS) {
      expect(preset.description).toBeTruthy();
    }
  });
});

describe("validateThreshold", () => {
  it("accepts 0", () => {
    expect(validateThreshold(0)).toBe(true);
  });

  it("accepts 1", () => {
    expect(validateThreshold(1)).toBe(true);
  });

  it("accepts 0.5", () => {
    expect(validateThreshold(0.5)).toBe(true);
  });

  it("rejects negative values", () => {
    expect(validateThreshold(-0.1)).toBe(false);
  });

  it("rejects values above 1", () => {
    expect(validateThreshold(1.1)).toBe(false);
  });

  it("rejects NaN", () => {
    expect(validateThreshold(NaN)).toBe(false);
  });
});
