import { describe, it, expect } from "vitest";
import { VcsProviderBase, VcsApiError } from "../base.js";
import type {
  VcsCapabilities,
  VcsScanTrigger,
  VcsWebhookEvent,
  VcsDiffResult,
  VcsStatusReport,
  VcsProviderType,
} from "../types.js";

class TestProvider extends VcsProviderBase {
  readonly name = "Test Provider";
  readonly type: VcsProviderType = "github";
  readonly capabilities: VcsCapabilities = {
    checkRuns: true,
    commitStatus: true,
    prComments: true,
    prAnnotations: true,
    webhookSignatureVerification: true,
    appInstallations: true,
  };

  async verifyWebhook(_event: VcsWebhookEvent, _secret: string): Promise<boolean> {
    return true;
  }

  async parseWebhook(_event: VcsWebhookEvent): Promise<VcsScanTrigger | null> {
    return null;
  }

  async fetchDiff(_trigger: VcsScanTrigger): Promise<VcsDiffResult> {
    return { rawDiff: "", files: [] };
  }

  async reportStatus(_trigger: VcsScanTrigger, _report: VcsStatusReport): Promise<void> {}

  async getInstallationToken(_installationId: string): Promise<string> {
    return "token";
  }
}

describe("VcsProviderBase", () => {
  const provider = new TestProvider();

  it("generates correct rate limit key", () => {
    expect(provider.rateLimitKey("12345")).toBe("vcs:ratelimit:github:12345");
    expect(provider.rateLimitKey("abc-def")).toBe("vcs:ratelimit:github:abc-def");
  });

  it("generates correct correlation key", () => {
    expect(provider.correlationKey("scan-001")).toBe("scan:vcs:github:scan-001");
    expect(provider.correlationKey("xyz")).toBe("scan:vcs:github:xyz");
  });

  it("formats annotations with severity mapping", () => {
    const findings = [
      {
        file: "src/app.ts",
        lineStart: 10,
        lineEnd: 15,
        severity: "high",
        title: "SQL Injection",
        description: "Unsanitized input in query",
      },
      {
        file: "src/utils.ts",
        lineStart: 5,
        lineEnd: 5,
        severity: "low",
        title: "Unused variable",
        description: "Variable x is never used",
      },
    ];

    const annotations = provider.formatAnnotations(findings);

    expect(annotations).toHaveLength(2);
    expect(annotations[0]).toEqual({
      file: "src/app.ts",
      lineStart: 10,
      lineEnd: 15,
      level: "failure",
      title: "SQL Injection",
      message: "Unsanitized input in query",
    });
    expect(annotations[1]).toEqual({
      file: "src/utils.ts",
      lineStart: 5,
      lineEnd: 5,
      level: "notice",
      title: "Unused variable",
      message: "Variable x is never used",
    });
  });

  it("caps annotations at 50", () => {
    const findings = Array.from({ length: 75 }, (_, i) => ({
      file: `file-${i}.ts`,
      lineStart: 1,
      lineEnd: 1,
      severity: "medium",
      title: `Finding ${i}`,
      description: `Description ${i}`,
    }));

    const annotations = provider.formatAnnotations(findings);
    expect(annotations).toHaveLength(50);
    expect(annotations[0].title).toBe("Finding 0");
    expect(annotations[49].title).toBe("Finding 49");
  });

  it("maps severity to annotation level correctly", () => {
    expect(provider.severityToLevel("critical")).toBe("failure");
    expect(provider.severityToLevel("high")).toBe("failure");
    expect(provider.severityToLevel("medium")).toBe("warning");
    expect(provider.severityToLevel("low")).toBe("notice");
    expect(provider.severityToLevel("info")).toBe("notice");
    expect(provider.severityToLevel("unknown")).toBe("notice");
  });

  it("formats PR comment with findings", () => {
    const report = {
      scanId: "scan-1",
      commitHash: "abc123",
      status: "fail" as const,
      riskScore: 85,
      summary: "Found security issues",
      annotations: [
        {
          file: "src/app.ts",
          lineStart: 10,
          lineEnd: 15,
          level: "failure" as const,
          title: "SQL Injection",
          message: "Unsanitized input",
        },
      ],
      detailsUrl: "https://example.com/scan-1",
    };
    const comment = provider.formatPrComment(report);
    expect(comment).toContain("❌ Sentinel Scan Results");
    expect(comment).toContain("**Status:** fail");
    expect(comment).toContain("SQL Injection");
    expect(comment).toContain("[View full report]");
  });

  it("formats PR comment with pass status", () => {
    const report = {
      scanId: "scan-2",
      commitHash: "def456",
      status: "full_pass" as const,
      riskScore: 5,
      summary: "All clear",
      annotations: [],
    };
    const comment = provider.formatPrComment(report);
    expect(comment).toContain("✅ Sentinel Scan Results");
    expect(comment).not.toContain("### Findings");
  });
});

describe("VcsApiError", () => {
  it("creates structured error with correct fields", () => {
    const err = new VcsApiError("github", 404, "Not Found", "fetchDiff");
    expect(err.name).toBe("VcsApiError");
    expect(err.provider).toBe("github");
    expect(err.statusCode).toBe(404);
    expect(err.statusText).toBe("Not Found");
    expect(err.operation).toBe("fetchDiff");
    expect(err.message).toBe("github fetchDiff failed: 404 Not Found");
    expect(err).toBeInstanceOf(Error);
  });
});
