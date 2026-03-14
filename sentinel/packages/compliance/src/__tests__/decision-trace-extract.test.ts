import { describe, it, expect } from "vitest";
import { extractTrace, dominantSignal, type TraceSignals } from "../decision-trace/extract.js";

describe("extractTrace", () => {
  const validRawData = {
    trace: {
      toolName: "copilot",
      promptHash: "abc123",
      promptCategory: "code-completion",
      overallScore: 0.72,
      signals: {
        entropy: { weight: 0.25, rawValue: 3.5, probability: 0.8, contribution: 0.20, detail: { tokenEntropy: 3.2 } },
        markers: { weight: 0.35, rawValue: 2, probability: 0.8, contribution: 0.28, detail: { tools: ["copilot"], matchCount: 2 } },
        timing: { weight: 0.20, rawValue: 50, probability: 0.7, contribution: 0.14, detail: { linesChanged: 50, isBurst: false, sizeUniformity: 0.3 } },
        uniformity: { weight: 0.20, rawValue: 0.55, probability: 0.55, contribution: 0.11, detail: {} },
      },
    },
  };

  it("extracts a valid trace from rawData", () => {
    const result = extractTrace(validRawData);
    expect(result).not.toBeNull();
    expect(result!.toolName).toBe("copilot");
    expect(result!.promptHash).toBe("abc123");
    expect(result!.promptCategory).toBe("code-completion");
    expect(result!.overallScore).toBe(0.72);
    expect(result!.signals.entropy!.contribution).toBe(0.20);
  });

  it("returns null for null rawData", () => {
    expect(extractTrace(null)).toBeNull();
  });

  it("returns null for rawData without trace key", () => {
    expect(extractTrace({ ai_probability: 0.8 })).toBeNull();
  });

  it("returns null for non-object rawData", () => {
    expect(extractTrace("hello")).toBeNull();
  });

  it("handles missing optional fields with null defaults", () => {
    const minimal = {
      trace: {
        overallScore: 0.5,
        signals: {},
      },
    };
    const result = extractTrace(minimal);
    expect(result).not.toBeNull();
    expect(result!.toolName).toBeNull();
    expect(result!.promptHash).toBeNull();
    expect(result!.promptCategory).toBeNull();
    expect(result!.overallScore).toBe(0.5);
  });

  it("returns null when trace is not an object", () => {
    expect(extractTrace({ trace: "not-an-object" })).toBeNull();
  });
});

describe("dominantSignal", () => {
  it("returns the signal with highest contribution", () => {
    const signals: TraceSignals = {
      entropy: { weight: 0.25, rawValue: 3.5, probability: 0.8, contribution: 0.20, detail: {} },
      markers: { weight: 0.35, rawValue: 2, probability: 0.8, contribution: 0.28, detail: {} },
    };
    expect(dominantSignal(signals)).toBe("markers");
  });

  it("returns 'unknown' for empty signals", () => {
    expect(dominantSignal({})).toBe("unknown");
  });
});
