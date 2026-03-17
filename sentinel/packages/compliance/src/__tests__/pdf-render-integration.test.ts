import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { ComplianceSummaryReport, type ComplianceSummaryData } from "../reports/ComplianceSummaryReport.js";
import { AuditEvidenceReport, type AuditEvidenceData } from "../reports/AuditEvidenceReport.js";
import { ExecutiveReport, type ExecutiveReportData } from "../reports/ExecutiveReport.js";
import { NistProfileReport, type NistProfileData } from "../reports/NistProfileReport.js";
import { HipaaAssessmentReport, type HipaaAssessmentData } from "../reports/HipaaAssessmentReport.js";
import { IPAttributionReport } from "../reports/IPAttributionReport.js";
import type { IPAttributionReportData } from "../ip-attribution/types.js";

describe("PDF render integration", () => {
  it("renders ComplianceSummaryReport", async () => {
    const data: ComplianceSummaryData = {
      frameworkName: "SLSA",
      frameworkVersion: "1.0",
      assessment: {
        frameworkSlug: "slsa",
        score: 0.85,
        verdict: "partially_compliant",
        controlScores: [{ controlCode: "SL-1", score: 0.9, passing: 9, failing: 1, total: 10 }],
      },
      orgName: "Test Org",
      generatedAt: "2026-03-15",
    };
    const buf = await renderToBuffer(createElement(ComplianceSummaryReport, { data }) as any);
    expect(buf.slice(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(100);
  });

  it("renders AuditEvidenceReport", async () => {
    const data: AuditEvidenceData = {
      frameworkName: "SLSA",
      assessment: { frameworkSlug: "slsa", score: 0.8, verdict: "partially_compliant", controlScores: [] },
      orgName: "Test Org",
      evidenceRecords: [{ type: "scan_completed", hash: "abc123", prevHash: null, data: {}, createdAt: "2026-03-15" }],
      chainVerification: { valid: true, checkedCount: 1 },
      generatedAt: "2026-03-15",
    };
    const buf = await renderToBuffer(createElement(AuditEvidenceReport, { data }) as any);
    expect(buf.slice(0, 5).toString()).toBe("%PDF-");
  });

  it("renders ExecutiveReport", async () => {
    const data: ExecutiveReportData = {
      orgName: "Test Org",
      assessments: [{
        frameworkName: "SLSA",
        assessment: { frameworkSlug: "slsa", score: 0.75, verdict: "needs_remediation", controlScores: [] },
      }],
      generatedAt: "2026-03-15",
    };
    const buf = await renderToBuffer(createElement(ExecutiveReport, { data }) as any);
    expect(buf.slice(0, 5).toString()).toBe("%PDF-");
  });

  it("renders NistProfileReport", async () => {
    const data: NistProfileData = {
      orgName: "Test Org",
      generatedAt: "2026-03-15",
      frameworkVersion: "1.0",
      overallScore: 0.7,
      functionScores: [{ function: "Govern", score: 0.8, categoryCount: 5 }],
      gaps: [{ controlCode: "GV-1", controlName: "Test", severity: "high", gapType: "missing_evidence" }],
      attestationSummary: { total: 10, attested: 7, expired: 1, unattested: 2 },
    };
    const buf = await renderToBuffer(createElement(NistProfileReport, { data }) as any);
    expect(buf.slice(0, 5).toString()).toBe("%PDF-");
  });

  it("renders HipaaAssessmentReport", async () => {
    const data: HipaaAssessmentData = {
      orgName: "Test Org",
      generatedAt: "2026-03-15",
      frameworkVersion: "Security Rule",
      overallScore: 0.6,
      safeguardScores: [{ safeguard: "Administrative", score: 0.7, specCount: 10 }],
      gaps: [{ controlCode: "AS-1", controlName: "Test", severity: "medium", gapType: "partial_implementation" }],
      attestationSummary: { total: 20, attested: 12, expired: 3, unattested: 5 },
      baaCount: 3,
    };
    const buf = await renderToBuffer(createElement(HipaaAssessmentReport, { data }) as any);
    expect(buf.slice(0, 5).toString()).toBe("%PDF-");
  });

  it("renders IPAttributionReport", async () => {
    const data: IPAttributionReportData = {
      certificateId: "cert-123",
      generatedAt: "2026-03-15",
      signature: "abc123def456abc123def456",
      evidenceChainHash: "chain-hash-abc123",
      subject: {
        repository: "org/repo",
        branch: "main",
        commitHash: "abc123def456",
        scanId: "scan-1",
        projectId: "proj-1",
        author: "test-author",
        timestamp: "2026-03-15T00:00:00Z",
      },
      summary: {
        totalFiles: 100,
        totalLoc: 5000,
        overallAiRatio: 0.15,
        avgConfidence: 0.9,
        conflictingFiles: 2,
        classifications: {
          human: { files: 80, loc: 4000, percentage: 0.8 },
          aiGenerated: { files: 5, loc: 200, percentage: 0.05 },
          aiAssisted: { files: 10, loc: 500, percentage: 0.1 },
          mixed: { files: 3, loc: 200, percentage: 0.03 },
          unknown: { files: 2, loc: 100, percentage: 0.02 },
        },
      },
      toolBreakdown: [{
        tool: "Copilot",
        model: "GPT-4",
        files: 10,
        loc: 500,
        percentage: 0.1,
        confirmedCount: 8,
        estimatedCount: 2,
      }],
      files: [{
        path: "src/index.ts",
        classification: "human",
        confidence: 0.95,
        toolName: null,
        toolModel: null,
        primarySource: "git",
        loc: 100,
        fusionMethod: "rule-override",
        conflicting: false,
        evidence: [{ source: "git", classification: "human", confidence: 0.95 }],
      }],
      methodology: {
        algorithm: "bayesian-fusion-with-rule-overrides",
        algorithmVersion: "1.0",
        orgBaseRate: 0.15,
        classificationThresholds: { aiGenerated: 0.8, aiAssisted: 0.3 },
        sources: ["git", "ai-detector"],
      },
    };
    const buf = await renderToBuffer(createElement(IPAttributionReport, { data }) as any);
    expect(buf.slice(0, 5).toString()).toBe("%PDF-");
  });
});
