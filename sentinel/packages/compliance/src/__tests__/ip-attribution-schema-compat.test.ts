import { describe, it, expect } from "vitest";
import { generateIPAttributionCertificate } from "../ip-attribution/certificate.js";
import { generateSpdxExport } from "../ip-attribution/spdx-export.js";
import { generateCycloneDxExport } from "../ip-attribution/cyclonedx-export.js";
import type { ReconciledAttribution, IPAttributionDocument } from "../ip-attribution/types.js";

const subject = {
  scanId: "scan-1",
  projectId: "proj-1",
  repository: "org/repo",
  commitHash: "abc123",
  branch: "main",
  author: "dev",
  timestamp: "2026-03-14T00:00:00Z",
};

const makeAttribution = (file: string, classification: "human" | "ai-generated"): ReconciledAttribution => ({
  file,
  classification,
  confidence: 0.85,
  primarySource: "ai-detector",
  toolName: classification === "ai-generated" ? "copilot" : null,
  toolModel: null,
  conflictingSources: false,
  evidence: [{ source: "ai-detector", classification, confidence: 0.85, toolName: null, toolModel: null, rawEvidence: {} }],
  fusionMethod: "bayesian",
});

const attributions = [
  makeAttribution("src/a.ts", "ai-generated"),
  makeAttribution("src/b.ts", "human"),
];

const fileLocs = [
  { path: "src/a.ts", loc: 100 },
  { path: "src/b.ts", loc: 200 },
];

function getDocument(): IPAttributionDocument {
  return generateIPAttributionCertificate(
    subject, attributions, fileLocs, 0.30, { "ai-detector": "1.0" }, "hash123", "test-secret",
  );
}

describe("IPAttributionDocument schema", () => {
  it("has all required top-level keys", () => {
    const doc = getDocument();
    const requiredKeys = [
      "id", "version", "subject", "summary", "toolBreakdown",
      "files", "methodology", "provenance", "signature",
    ];
    for (const key of requiredKeys) {
      expect(doc).toHaveProperty(key);
    }
  });

  it("summary has all classification keys", () => {
    const doc = getDocument();
    const classKeys = ["human", "aiGenerated", "aiAssisted", "mixed", "unknown"];
    for (const key of classKeys) {
      expect(doc.summary.classifications).toHaveProperty(key);
      expect(doc.summary.classifications[key as keyof typeof doc.summary.classifications]).toHaveProperty("files");
      expect(doc.summary.classifications[key as keyof typeof doc.summary.classifications]).toHaveProperty("loc");
      expect(doc.summary.classifications[key as keyof typeof doc.summary.classifications]).toHaveProperty("percentage");
    }
  });

  it("methodology has correct algorithm identifier", () => {
    const doc = getDocument();
    expect(doc.methodology.algorithm).toBe("bayesian-fusion-with-rule-overrides");
    expect(doc.methodology.algorithmVersion).toBe("1.0");
  });
});

describe("SPDX export schema", () => {
  it("starts with SPDXVersion: SPDX-2.3", () => {
    const doc = getDocument();
    const spdx = generateSpdxExport(doc);
    expect(spdx.startsWith("SPDXVersion: SPDX-2.3")).toBe(true);
  });
});

describe("CycloneDX export schema", () => {
  it("parses with bomFormat CycloneDX and specVersion 1.5", () => {
    const doc = getDocument();
    const cdx = generateCycloneDxExport(doc);
    const parsed = JSON.parse(cdx);
    expect(parsed.bomFormat).toBe("CycloneDX");
    expect(parsed.specVersion).toBe("1.5");
  });
});
