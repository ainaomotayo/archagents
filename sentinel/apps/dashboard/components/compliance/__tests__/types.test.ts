import { describe, it, expect } from "vitest";
import { scoreToColor, scoreToVerdict, confidenceIndicator } from "../types";

describe("scoreToColor", () => {
  it("returns green for >= 0.95", () => {
    expect(scoreToColor(0.95)).toBe("green");
    expect(scoreToColor(1.0)).toBe("green");
  });

  it("returns amber for 0.80–0.94", () => {
    expect(scoreToColor(0.80)).toBe("amber");
    expect(scoreToColor(0.94)).toBe("amber");
  });

  it("returns orange for 0.60–0.79", () => {
    expect(scoreToColor(0.60)).toBe("orange");
    expect(scoreToColor(0.79)).toBe("orange");
  });

  it("returns red for < 0.60", () => {
    expect(scoreToColor(0.59)).toBe("red");
    expect(scoreToColor(0.0)).toBe("red");
  });
});

describe("scoreToVerdict", () => {
  it("maps scores to verdict strings", () => {
    expect(scoreToVerdict(0.95)).toBe("Compliant");
    expect(scoreToVerdict(0.85)).toBe("Partially compliant");
    expect(scoreToVerdict(0.70)).toBe("Needs remediation");
    expect(scoreToVerdict(0.40)).toBe("Non-compliant");
  });
});

describe("confidenceIndicator", () => {
  it("returns 0 for total=0", () => {
    expect(confidenceIndicator(0)).toBe(0);
  });

  it("returns low confidence for sparse data", () => {
    const conf = confidenceIndicator(3);
    expect(conf).toBeLessThan(0.6);
    expect(conf).toBeGreaterThan(0);
  });

  it("returns high confidence for abundant data", () => {
    const conf = confidenceIndicator(100);
    expect(conf).toBeGreaterThan(0.9);
  });

  it("increases monotonically", () => {
    const c1 = confidenceIndicator(1);
    const c5 = confidenceIndicator(5);
    const c20 = confidenceIndicator(20);
    expect(c5).toBeGreaterThan(c1);
    expect(c20).toBeGreaterThan(c5);
  });
});
