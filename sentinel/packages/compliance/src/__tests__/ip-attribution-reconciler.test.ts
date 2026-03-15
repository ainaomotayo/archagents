import { describe, it, expect } from "vitest";
import { reconcile } from "../ip-attribution/reconciler.js";
import type { SourceEvidence } from "../ip-attribution/types.js";

const aiDetectorHigh: SourceEvidence = {
  source: "ai-detector", classification: "ai-generated", confidence: 0.88,
  toolName: "copilot", toolModel: null, rawEvidence: {},
};
const declaredCopilot: SourceEvidence = {
  source: "declared", classification: "ai-generated", confidence: 0.85,
  toolName: "copilot", toolModel: "gpt-4-turbo", rawEvidence: {},
};
const gitHuman: SourceEvidence = {
  source: "git", classification: "human", confidence: 0.60,
  toolName: null, toolModel: null, rawEvidence: {},
};
const gitCoAuthor: SourceEvidence = {
  source: "git", classification: "ai-assisted", confidence: 0.90,
  toolName: "copilot", toolModel: null, rawEvidence: {},
};
const licenseHuman: SourceEvidence = {
  source: "license", classification: "human", confidence: 0.92,
  toolName: null, toolModel: null, rawEvidence: {},
};
const aiDetectorLow: SourceEvidence = {
  source: "ai-detector", classification: "human", confidence: 0.90,
  toolName: null, toolModel: null, rawEvidence: {},
};
const aiDetectorMid: SourceEvidence = {
  source: "ai-detector", classification: "ai-assisted", confidence: 0.55,
  toolName: null, toolModel: null, rawEvidence: {},
};

describe("reconcile — rule-based fast paths", () => {
  it("Rule 1: two sources agree on AI with high confidence", () => {
    const result = reconcile("src/foo.ts", [aiDetectorHigh, declaredCopilot], 0.30);
    expect(result.classification).toBe("ai-generated");
    expect(result.confidence).toBe(0.88);
    expect(result.fusionMethod).toBe("rule-override");
    expect(result.toolName).toBe("copilot");
  });

  it("Rule 2: clear human — low AI + no declarations + no git AI", () => {
    const result = reconcile("src/foo.ts", [aiDetectorLow, gitHuman], 0.30);
    expect(result.classification).toBe("human");
    expect(result.fusionMethod).toBe("rule-override");
  });

  it("Rule 3: no evidence → unknown", () => {
    const result = reconcile("src/foo.ts", [], 0.30);
    expect(result.classification).toBe("unknown");
    expect(result.confidence).toBe(0);
    expect(result.fusionMethod).toBe("rule-override");
  });
});

describe("reconcile — Bayesian fusion", () => {
  it("fuses ambiguous signals toward AI with high prior", () => {
    const result = reconcile("src/foo.ts", [aiDetectorMid, gitHuman], 0.60);
    expect(result.fusionMethod).toBe("bayesian");
    expect(["ai-generated", "ai-assisted"]).toContain(result.classification);
  });

  it("fuses ambiguous signals toward human with low prior", () => {
    const result = reconcile("src/foo.ts", [aiDetectorMid, gitHuman], 0.10);
    expect(result.fusionMethod).toBe("bayesian");
    expect(result.classification).toBe("human");
  });

  it("respects classification thresholds at 0.70 boundary", () => {
    const result = reconcile("src/foo.ts", [
      { ...aiDetectorMid, confidence: 0.65, classification: "ai-assisted" },
      gitCoAuthor,
    ], 0.30);
    expect(result.classification).toBe("ai-generated");
  });
});

describe("reconcile — conflict detection", () => {
  it("marks conflicting sources when close confidence disagrees", () => {
    const aiSaysGenerated: SourceEvidence = {
      source: "ai-detector", classification: "ai-generated", confidence: 0.82,
      toolName: "copilot", toolModel: null, rawEvidence: {},
    };
    const result = reconcile("src/foo.ts", [aiSaysGenerated, licenseHuman], 0.30);
    expect(result.conflictingSources).toBe(true);
  });

  it("does not mark conflict when confidence gap is large", () => {
    const result = reconcile("src/foo.ts", [aiDetectorHigh, gitHuman], 0.30);
    expect(result.conflictingSources).toBe(false);
  });
});

describe("reconcile — tool attribution", () => {
  it("picks toolName from highest confidence source", () => {
    const result = reconcile("src/foo.ts", [
      { ...gitCoAuthor, toolName: "copilot", confidence: 0.90 },
      { ...declaredCopilot, toolName: "cursor", confidence: 0.85 },
    ], 0.30);
    expect(result.toolName).toBe("copilot");
  });

  it("picks toolModel from highest confidence source", () => {
    const result = reconcile("src/foo.ts", [
      { ...declaredCopilot, toolModel: "gpt-4-turbo", confidence: 0.85 },
      { ...gitCoAuthor, toolModel: null, confidence: 0.90 },
    ], 0.30);
    expect(result.toolModel).toBe("gpt-4-turbo");
  });
});

describe("reconcile — edge cases", () => {
  it("single evidence source uses bayesian fusion", () => {
    const result = reconcile("src/bar.ts", [aiDetectorMid], 0.50);
    expect(result.fusionMethod).toBe("bayesian");
    expect(result.conflictingSources).toBe(false);
  });

  it("skips unknown/mixed classifications in bayesian update", () => {
    const unknownEvidence: SourceEvidence = {
      source: "license", classification: "unknown", confidence: 0.99,
      toolName: null, toolModel: null, rawEvidence: {},
    };
    const result = reconcile("src/baz.ts", [unknownEvidence, aiDetectorMid], 0.50);
    expect(result.fusionMethod).toBe("bayesian");
    // The unknown evidence should be skipped; only aiDetectorMid (0.55 ai-assisted) updates the prior
    expect(["ai-assisted", "ai-generated"]).toContain(result.classification);
  });
});
