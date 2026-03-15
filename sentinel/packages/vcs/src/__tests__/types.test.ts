import { describe, expect, it } from "vitest";
import type {
  VcsProviderType,
  VcsScanTrigger,
  VcsCapabilities,
  VcsStatusReport,
  VcsProvider,
} from "../types.js";

describe("VCS Provider Types", () => {
  it("VcsProviderType has exactly 4 providers", () => {
    const providers: VcsProviderType[] = [
      "github",
      "gitlab",
      "bitbucket",
      "azure_devops",
    ];
    expect(providers).toHaveLength(4);
    // Verify each is a valid VcsProviderType by assignment
    const set = new Set(providers);
    expect(set.size).toBe(4);
  });

  it("VcsScanTrigger includes a provider discriminant field", () => {
    const trigger: VcsScanTrigger = {
      provider: "github",
      type: "push",
      installationId: "12345",
      repo: "sentinel",
      owner: "acme",
      commitHash: "abc123",
      branch: "main",
      author: "dev@acme.com",
    };
    expect(trigger.provider).toBe("github");
    expect(trigger).toHaveProperty("provider");
    expect(trigger).toHaveProperty("type");
    expect(trigger).toHaveProperty("installationId");
    expect(trigger).toHaveProperty("repo");
    expect(trigger).toHaveProperty("owner");
    expect(trigger).toHaveProperty("commitHash");
    expect(trigger).toHaveProperty("branch");
    expect(trigger).toHaveProperty("author");
  });

  it("VcsCapabilities describes provider feature matrix", () => {
    const githubCaps: VcsCapabilities = {
      checkRuns: true,
      commitStatus: true,
      prComments: true,
      prAnnotations: true,
      webhookSignatureVerification: true,
      appInstallations: true,
    };
    const gitlabCaps: VcsCapabilities = {
      checkRuns: false,
      commitStatus: true,
      prComments: true,
      prAnnotations: false,
      webhookSignatureVerification: true,
      appInstallations: false,
    };
    expect(Object.keys(githubCaps)).toHaveLength(6);
    // GitHub supports all capabilities
    expect(Object.values(githubCaps).every(Boolean)).toBe(true);
    // GitLab does not support all capabilities
    expect(Object.values(gitlabCaps).every(Boolean)).toBe(false);
  });

  it("VcsStatusReport supports multiple reporting strategies", () => {
    const report: VcsStatusReport = {
      scanId: "scan-001",
      commitHash: "abc123",
      status: "full_pass",
      riskScore: 0,
      summary: "All checks passed",
      annotations: [],
      detailsUrl: "https://sentinel.dev/scans/scan-001",
    };
    expect(report.status).toBe("full_pass");
    expect(report.annotations).toEqual([]);
    expect(report.detailsUrl).toBeDefined();

    // Report without detailsUrl (optional)
    const minimalReport: VcsStatusReport = {
      scanId: "scan-002",
      commitHash: "def456",
      status: "fail",
      riskScore: 85,
      summary: "Critical vulnerabilities found",
      annotations: [
        {
          file: "src/auth.ts",
          lineStart: 10,
          lineEnd: 15,
          level: "failure",
          title: "SQL Injection",
          message: "Unsanitized input in query",
        },
      ],
    };
    expect(minimalReport.detailsUrl).toBeUndefined();
    expect(minimalReport.annotations).toHaveLength(1);
    expect(minimalReport.annotations[0].level).toBe("failure");
  });

  it("VcsProvider interface has 8 required keys", () => {
    // Validate the shape by creating a mock that satisfies the interface
    const mockProvider: VcsProvider = {
      name: "GitHub",
      type: "github",
      capabilities: {
        checkRuns: true,
        commitStatus: true,
        prComments: true,
        prAnnotations: true,
        webhookSignatureVerification: true,
        appInstallations: true,
      },
      verifyWebhook: async () => true,
      parseWebhook: async () => null,
      fetchDiff: async () => ({ rawDiff: "", files: [] }),
      reportStatus: async () => {},
      getInstallationToken: async () => "token",
    };

    const keys = Object.keys(mockProvider);
    expect(keys).toHaveLength(8);
    expect(keys).toContain("name");
    expect(keys).toContain("type");
    expect(keys).toContain("capabilities");
    expect(keys).toContain("verifyWebhook");
    expect(keys).toContain("parseWebhook");
    expect(keys).toContain("fetchDiff");
    expect(keys).toContain("reportStatus");
    expect(keys).toContain("getInstallationToken");
  });
});
