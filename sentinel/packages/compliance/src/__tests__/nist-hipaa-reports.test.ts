import { describe, it, expect, vi } from "vitest";

// Mock @react-pdf/renderer to avoid slow PDF rendering in unit tests
vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: vi.fn(async () => Buffer.from("%PDF-1.4 mock")),
  Document: ({ children }: any) => children,
  Page: ({ children }: any) => children,
  View: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  StyleSheet: { create: (s: any) => s },
  Svg: ({ children }: any) => children,
  Circle: () => null,
}));

// Mock react's createElement since generator.ts uses it
vi.mock("react", () => ({
  createElement: vi.fn((_component: any, _props: any) => ({})),
}));

import { generateNistProfilePdf, generateHipaaAssessmentPdf } from "../reports/generator.js";

describe("NIST CSF Profile Report", () => {
  it("generates a PDF buffer", async () => {
    const data = {
      orgName: "Test Corp",
      generatedAt: new Date().toISOString(),
      frameworkVersion: "1.0",
      overallScore: 0.72,
      functionScores: [
        { function: "GOVERN", score: 0.65, categoryCount: 6 },
        { function: "MAP", score: 0.80, categoryCount: 5 },
        { function: "MEASURE", score: 0.70, categoryCount: 4 },
        { function: "MANAGE", score: 0.75, categoryCount: 4 },
      ],
      gaps: [
        { controlCode: "GV-1.1", controlName: "Legal Requirements", severity: "high", gapType: "missing_attestation" },
      ],
      attestationSummary: { total: 72, attested: 35, expired: 3, unattested: 34 },
    };

    const buf = await generateNistProfilePdf(data);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("handles empty function scores and gaps", async () => {
    const data = {
      orgName: "Empty Corp",
      generatedAt: new Date().toISOString(),
      frameworkVersion: "1.0",
      overallScore: 0,
      functionScores: [],
      gaps: [],
      attestationSummary: { total: 0, attested: 0, expired: 0, unattested: 0 },
    };

    const buf = await generateNistProfilePdf(data);
    expect(buf).toBeInstanceOf(Buffer);
  });
});

describe("HIPAA Assessment Report", () => {
  it("generates a PDF buffer", async () => {
    const data = {
      orgName: "Healthcare Inc",
      generatedAt: new Date().toISOString(),
      frameworkVersion: "2013",
      overallScore: 0.68,
      safeguardScores: [
        { safeguard: "Administrative", score: 0.70, specCount: 30 },
        { safeguard: "Physical", score: 0.60, specCount: 10 },
        { safeguard: "Technical", score: 0.75, specCount: 15 },
      ],
      gaps: [
        { controlCode: "TS-1.4", controlName: "Encryption", severity: "critical", gapType: "automated_failure", regulatoryStatus: "addressable" },
      ],
      attestationSummary: { total: 75, attested: 40, expired: 5, unattested: 30 },
      baaCount: 12,
    };

    const buf = await generateHipaaAssessmentPdf(data);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("handles empty safeguard scores and gaps", async () => {
    const data = {
      orgName: "Empty Health",
      generatedAt: new Date().toISOString(),
      frameworkVersion: "2013",
      overallScore: 0,
      safeguardScores: [],
      gaps: [],
      attestationSummary: { total: 0, attested: 0, expired: 0, unattested: 0 },
      baaCount: 0,
    };

    const buf = await generateHipaaAssessmentPdf(data);
    expect(buf).toBeInstanceOf(Buffer);
  });
});
