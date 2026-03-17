import { describe, it, expect } from "vitest";
import { generateCycloneDxExport } from "../ip-attribution/cyclonedx-export.js";
import type { IPAttributionDocument } from "../ip-attribution/types.js";

function makeDocument(overrides?: Partial<IPAttributionDocument>): IPAttributionDocument {
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
    toolBreakdown: [],
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
      agentVersions: {},
      evidenceChainHash: "hash123",
    },
    signature: "sig-abc",
    ...overrides,
  };
}

describe("generateCycloneDxExport", () => {
  it("produces valid JSON with correct format fields", () => {
    const output = generateCycloneDxExport(makeDocument());
    const parsed = JSON.parse(output);
    expect(parsed.bomFormat).toBe("CycloneDX");
    expect(parsed.specVersion).toBe("1.5");
    expect(parsed.version).toBe(1);
  });

  it("includes components with type file", () => {
    const output = generateCycloneDxExport(makeDocument());
    const parsed = JSON.parse(output);
    expect(parsed.components).toHaveLength(2);
    expect(parsed.components[0].type).toBe("file");
    expect(parsed.components[0].name).toBe("src/a.ts");
  });

  it("includes evidence.identity with confidence", () => {
    const output = generateCycloneDxExport(makeDocument());
    const parsed = JSON.parse(output);
    expect(parsed.components[0].evidence.identity.confidence).toBe(0.88);
    expect(parsed.components[0].evidence.identity.methods).toHaveLength(1);
  });

  it("includes metadata properties with sentinel fields", () => {
    const output = generateCycloneDxExport(makeDocument());
    const parsed = JSON.parse(output);
    const props = parsed.metadata.properties;
    const certIdProp = props.find((p: any) => p.name === "sentinel:certificateId");
    const sigProp = props.find((p: any) => p.name === "sentinel:signature");
    expect(certIdProp.value).toBe("ip-cert-123");
    expect(sigProp.value).toBe("sig-abc");
  });

  it("produces valid minimal BOM for empty files", () => {
    const output = generateCycloneDxExport(makeDocument({ files: [] }));
    const parsed = JSON.parse(output);
    expect(parsed.bomFormat).toBe("CycloneDX");
    expect(parsed.components).toHaveLength(0);
  });
});
