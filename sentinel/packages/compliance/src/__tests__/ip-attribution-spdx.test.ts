import { describe, it, expect } from "vitest";
import { generateSpdxExport } from "../ip-attribution/spdx-export.js";
import type { IPAttributionDocument } from "../ip-attribution/types.js";

function makeDocument(fileOverrides?: Partial<IPAttributionDocument>): IPAttributionDocument {
  return {
    id: "ip-cert-123",
    version: "1.0",
    subject: {
      scanId: "scan-1",
      projectId: "proj-1",
      repository: "org/repo",
      commitHash: "abc123",
      branch: "main",
      author: "dev",
      timestamp: "2026-03-14T00:00:00Z",
    },
    summary: {
      totalFiles: 2,
      totalLoc: 300,
      classifications: {
        human: { files: 1, loc: 200, percentage: 0.5 },
        aiGenerated: { files: 1, loc: 100, percentage: 0.5 },
        aiAssisted: { files: 0, loc: 0, percentage: 0 },
        mixed: { files: 0, loc: 0, percentage: 0 },
        unknown: { files: 0, loc: 0, percentage: 0 },
      },
      overallAiRatio: 0.333,
      avgConfidence: 0.85,
      conflictingFiles: 0,
    },
    toolBreakdown: [
      { tool: "copilot", model: "gpt-4", files: 1, loc: 100, percentage: 0.5, confirmedCount: 1, estimatedCount: 0 },
    ],
    files: [
      {
        path: "src/a.ts",
        classification: "ai-generated",
        confidence: 0.88,
        primarySource: "ai-detector",
        toolName: "copilot",
        toolModel: "gpt-4",
        loc: 100,
        fusionMethod: "rule-override",
        conflicting: false,
        evidence: [{ source: "ai-detector", classification: "ai-generated", confidence: 0.88 }],
      },
      {
        path: "src/b.ts",
        classification: "human",
        confidence: 0.92,
        primarySource: "git",
        toolName: null,
        toolModel: null,
        loc: 200,
        fusionMethod: "bayesian",
        conflicting: false,
        evidence: [{ source: "git", classification: "human", confidence: 0.92 }],
      },
    ],
    methodology: {
      algorithm: "bayesian-fusion-with-rule-overrides",
      algorithmVersion: "1.0",
      orgBaseRate: 0.30,
      sources: ["ai-detector", "git"],
      classificationThresholds: { aiGenerated: 0.70, aiAssisted: 0.30 },
    },
    provenance: {
      generatedBy: "sentinel",
      generatedAt: "2026-03-14T00:00:00Z",
      agentVersions: { "ai-detector": "1.0" },
      evidenceChainHash: "hash123",
    },
    signature: "sig-abc",
    ...fileOverrides,
  };
}

describe("generateSpdxExport", () => {
  it("contains required SPDX header fields", () => {
    const output = generateSpdxExport(makeDocument());
    expect(output).toContain("SPDXVersion: SPDX-2.3");
    expect(output).toContain("DataLicense: CC0-1.0");
    expect(output).toContain("SPDXID: SPDXRef-DOCUMENT");
    expect(output).toContain("DocumentName: ip-attribution-scan-1");
    expect(output).toContain("Creator: Tool: Sentinel");
  });

  it("contains file entries with classification comments", () => {
    const output = generateSpdxExport(makeDocument());
    expect(output).toContain("FileName: ./src/a.ts");
    expect(output).toContain("Classification: ai-generated");
    expect(output).toContain("tool: copilot");
    expect(output).toContain("FileName: ./src/b.ts");
    expect(output).toContain("Classification: human");
  });

  it("contains annotations with REVIEW type", () => {
    const output = generateSpdxExport(makeDocument());
    expect(output).toContain("AnnotationType: REVIEW");
    expect(output).toContain("IP Attribution: ai-generated (copilot)");
  });

  it("includes signature in document comment", () => {
    const output = generateSpdxExport(makeDocument());
    expect(output).toContain("Signature: sig-abc");
  });

  it("produces valid output for empty files array", () => {
    const output = generateSpdxExport(makeDocument({ files: [] }));
    expect(output).toContain("SPDXVersion: SPDX-2.3");
    expect(output).toContain("PackageName:");
    // No file entries
    expect(output).not.toContain("FileName:");
  });
});
