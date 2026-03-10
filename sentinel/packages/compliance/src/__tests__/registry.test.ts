import { describe, it, expect } from "vitest";
import { BUILT_IN_FRAMEWORKS, FRAMEWORK_MAP } from "../frameworks/index.js";

describe("framework registry", () => {
  it("loads all built-in frameworks into FRAMEWORK_MAP", () => {
    expect(FRAMEWORK_MAP.size).toBe(BUILT_IN_FRAMEWORKS.length);
  });

  it("looks up built-in framework by slug in O(1)", () => {
    const soc2 = FRAMEWORK_MAP.get("soc2");
    expect(soc2).toBeDefined();
    expect(soc2!.name).toBe("SOC 2 Type II");
  });

  it("returns undefined for unknown slug", () => {
    expect(FRAMEWORK_MAP.get("nonexistent")).toBeUndefined();
  });

  it("built-in frameworks are immutable references", () => {
    const fw1 = FRAMEWORK_MAP.get("soc2");
    const fw2 = BUILT_IN_FRAMEWORKS.find((f) => f.slug === "soc2");
    expect(fw1).toBe(fw2); // same reference
  });

  it("all frameworks have valid categories", () => {
    const validCategories = ["supply-chain", "governance", "regulatory"];
    for (const fw of BUILT_IN_FRAMEWORKS) {
      expect(validCategories).toContain(fw.category);
    }
  });

  it("framework slugs match FRAMEWORK_MAP keys", () => {
    for (const fw of BUILT_IN_FRAMEWORKS) {
      expect(FRAMEWORK_MAP.get(fw.slug)).toBe(fw);
    }
  });
});
