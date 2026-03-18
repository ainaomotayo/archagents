import { describe, it, expect } from "vitest";
import {
  RETENTION_PRESETS,
  validateTierValues,
  getPresetByName,
  detectPreset,
} from "./policy.js";

describe("RETENTION_PRESETS", () => {
  it("has 3 named presets", () => {
    expect(RETENTION_PRESETS).toHaveLength(3);
    expect(RETENTION_PRESETS.map((p) => p.name)).toEqual(["minimal", "standard", "compliance"]);
  });

  it("all presets have monotonically decreasing tiers", () => {
    for (const p of RETENTION_PRESETS) {
      expect(p.tiers.critical).toBeGreaterThanOrEqual(p.tiers.high);
      expect(p.tiers.high).toBeGreaterThanOrEqual(p.tiers.medium);
      expect(p.tiers.medium).toBeGreaterThanOrEqual(p.tiers.low);
    }
  });
});

describe("validateTierValues", () => {
  it("accepts valid tiers", () => {
    const result = validateTierValues({ critical: 365, high: 180, medium: 90, low: 30 });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("rejects tier below minimum (7)", () => {
    const result = validateTierValues({ critical: 365, high: 180, medium: 90, low: 3 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("low must be at least 7 days");
  });

  it("rejects tier above maximum (2555)", () => {
    const result = validateTierValues({ critical: 3000, high: 180, medium: 90, low: 30 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("critical must be at most 2555 days");
  });

  it("rejects non-monotonic tiers", () => {
    const result = validateTierValues({ critical: 90, high: 180, medium: 90, low: 30 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("critical must be >= high");
  });
});

describe("getPresetByName", () => {
  it("returns standard preset", () => {
    const preset = getPresetByName("standard");
    expect(preset).toBeDefined();
    expect(preset!.tiers.critical).toBe(365);
  });

  it("returns undefined for unknown name", () => {
    expect(getPresetByName("unknown")).toBeUndefined();
  });
});

describe("detectPreset", () => {
  it("detects standard preset from tier values", () => {
    expect(detectPreset({ critical: 365, high: 180, medium: 90, low: 30 })).toBe("standard");
  });

  it("returns custom for non-preset values", () => {
    expect(detectPreset({ critical: 400, high: 200, medium: 100, low: 50 })).toBe("custom");
  });
});
