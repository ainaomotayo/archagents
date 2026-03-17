import { describe, it, expect } from "vitest";
import {
  generateIPAttributionCertificate,
  verifyIPAttributionCertificate,
  buildIPAttributionSummary,
} from "../ip-attribution/certificate.js";
import type { ReconciledAttribution } from "../ip-attribution/types.js";

const subject = {
  scanId: "scan-1",
  projectId: "proj-1",
  repository: "org/repo",
  commitHash: "abc123",
  branch: "main",
  author: "dev",
  timestamp: new Date().toISOString(),
};

const makeAttribution = (
  file: string,
  classification: "human" | "ai-generated" | "ai-assisted",
  confidence: number,
  toolName: string | null = null,
): ReconciledAttribution => ({
  file,
  classification,
  confidence,
  primarySource: "ai-detector",
  toolName,
  toolModel: null,
  conflictingSources: false,
  evidence: [
    { source: "ai-detector", classification, confidence, toolName, toolModel: null, rawEvidence: {} },
  ],
  fusionMethod: "bayesian",
});

const fileLocs = [
  { path: "src/a.ts", loc: 100 },
  { path: "src/b.ts", loc: 200 },
  { path: "src/c.ts", loc: 50 },
];

const attributions: ReconciledAttribution[] = [
  makeAttribution("src/a.ts", "ai-generated", 0.88, "copilot"),
  makeAttribution("src/b.ts", "human", 0.92),
  makeAttribution("src/c.ts", "ai-assisted", 0.55, "cursor"),
];

describe("generateIPAttributionCertificate", () => {
  it("produces a valid document with correct summary stats", () => {
    const doc = generateIPAttributionCertificate(
      subject, attributions, fileLocs, 0.30, { "ai-detector": "1.0" }, "hash123", "secret",
    );
    expect(doc.version).toBe("1.0");
    expect(doc.id).toMatch(/^ip-cert-/);
    expect(doc.summary.totalFiles).toBe(3);
    expect(doc.summary.totalLoc).toBe(350);
    expect(doc.summary.classifications.aiGenerated.files).toBe(1);
    expect(doc.summary.classifications.human.files).toBe(1);
    expect(doc.summary.classifications.aiAssisted.files).toBe(1);
  });

  it("sorts files alphabetically", () => {
    const doc = generateIPAttributionCertificate(
      subject, attributions, fileLocs, 0.30, {}, "hash", "secret",
    );
    expect(doc.files[0].path).toBe("src/a.ts");
    expect(doc.files[1].path).toBe("src/b.ts");
    expect(doc.files[2].path).toBe("src/c.ts");
  });

  it("computes overall AI ratio correctly", () => {
    const doc = generateIPAttributionCertificate(
      subject, attributions, fileLocs, 0.30, {}, "hash", "secret",
    );
    // AI: src/a.ts (100 LOC) + src/c.ts (50 LOC) = 150 / 350
    expect(doc.summary.overallAiRatio).toBeCloseTo(150 / 350, 4);
  });

  it("includes methodology with correct thresholds", () => {
    const doc = generateIPAttributionCertificate(
      subject, attributions, fileLocs, 0.30, {}, "hash", "secret",
    );
    expect(doc.methodology.algorithm).toBe("bayesian-fusion-with-rule-overrides");
    expect(doc.methodology.classificationThresholds.aiGenerated).toBe(0.70);
    expect(doc.methodology.classificationThresholds.aiAssisted).toBe(0.30);
    expect(doc.methodology.orgBaseRate).toBe(0.30);
  });

  it("includes tool breakdown", () => {
    const doc = generateIPAttributionCertificate(
      subject, attributions, fileLocs, 0.30, {}, "hash", "secret",
    );
    expect(doc.toolBreakdown.length).toBeGreaterThanOrEqual(1);
    const copilotEntry = doc.toolBreakdown.find((t) => t.tool === "copilot");
    expect(copilotEntry).toBeDefined();
    expect(copilotEntry!.files).toBe(1);
  });

  it("produces valid HMAC signature", () => {
    const doc = generateIPAttributionCertificate(
      subject, attributions, fileLocs, 0.30, {}, "hash", "secret",
    );
    expect(doc.signature).toBeTruthy();
    expect(doc.signature.length).toBe(64); // SHA-256 hex
  });
});

describe("verifyIPAttributionCertificate", () => {
  it("verifies a valid certificate", () => {
    const doc = generateIPAttributionCertificate(
      subject, attributions, fileLocs, 0.30, {}, "hash", "secret",
    );
    const json = JSON.stringify(doc);
    expect(verifyIPAttributionCertificate(json, "secret")).toBe(true);
  });

  it("rejects certificate with wrong secret", () => {
    const doc = generateIPAttributionCertificate(
      subject, attributions, fileLocs, 0.30, {}, "hash", "secret",
    );
    const json = JSON.stringify(doc);
    expect(verifyIPAttributionCertificate(json, "wrong-secret")).toBe(false);
  });
});

describe("buildIPAttributionSummary", () => {
  it("builds summary for compliance certificate embedding", () => {
    const doc = generateIPAttributionCertificate(
      subject, attributions, fileLocs, 0.30, {}, "hash", "secret",
    );
    const summary = buildIPAttributionSummary(doc);
    expect(summary.certificateId).toBe(doc.id);
    expect(summary.totalFiles).toBe(3);
    expect(summary.overallAiRatio).toBeCloseTo(150 / 350, 4);
    expect(summary.topTools.length).toBeGreaterThan(0);
  });
});
