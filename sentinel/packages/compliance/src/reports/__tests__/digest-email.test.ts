import { describe, it, expect } from "vitest";
import { buildDigestEmailHtml } from "../digest-email.js";
import type { DigestMetrics } from "../../types.js";

const mockMetrics: DigestMetrics = {
  scanVolume: { total: 42, weekOverWeek: 12 },
  findingSummary: {
    critical: 2, high: 5, medium: 10, low: 20,
    weekOverWeek: { critical: 1, high: -2, medium: 3, low: 0 },
  },
  frameworkScores: [
    { slug: "slsa", name: "SLSA", score: 0.85, previousScore: 0.80, delta: 0.05 },
    { slug: "nist-ai-rmf", name: "NIST AI RMF", score: 0.72, previousScore: 0.75, delta: -0.03 },
  ],
  attestationSummary: { total: 50, attested: 30, expired: 5, expiringSoon: 3 },
  remediationSummary: { open: 10, inProgress: 5, completed: 25, avgResolutionHours: 48 },
  aiMetrics: { aiRatio: 0.15, avgProbability: 0.65, weekOverWeek: 0.02 },
  topFindings: [
    { title: "SQL Injection", severity: "critical", count: 5 },
    { title: "Hardcoded Secret", severity: "high", count: 3 },
  ],
};

describe("buildDigestEmailHtml", () => {
  it("returns valid HTML", () => {
    const html = buildDigestEmailHtml("Acme Corp", mockMetrics, "https://sentinel.example.com");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("includes org name", () => {
    const html = buildDigestEmailHtml("Acme Corp", mockMetrics, "https://sentinel.example.com");
    expect(html).toContain("Acme Corp");
  });

  it("includes scan volume and delta", () => {
    const html = buildDigestEmailHtml("Acme Corp", mockMetrics, "https://sentinel.example.com");
    expect(html).toContain("42");
    expect(html).toContain("+12");
  });

  it("includes finding severity counts", () => {
    const html = buildDigestEmailHtml("Acme Corp", mockMetrics, "https://sentinel.example.com");
    expect(html).toContain("Critical");
    expect(html).toContain("2");
  });

  it("includes framework scores", () => {
    const html = buildDigestEmailHtml("Acme Corp", mockMetrics, "https://sentinel.example.com");
    expect(html).toContain("SLSA");
    expect(html).toContain("85%");
  });

  it("includes dashboard link", () => {
    const html = buildDigestEmailHtml("Acme Corp", mockMetrics, "https://sentinel.example.com");
    expect(html).toContain("https://sentinel.example.com/compliance");
  });

  it("includes top findings", () => {
    const html = buildDigestEmailHtml("Acme Corp", mockMetrics, "https://sentinel.example.com");
    expect(html).toContain("SQL Injection");
  });

  it("has no external image references", () => {
    const html = buildDigestEmailHtml("Acme Corp", mockMetrics, "https://sentinel.example.com");
    expect(html).not.toMatch(/<img[^>]+src="http/);
  });
});
