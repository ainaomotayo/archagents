import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentinel/github", () => ({
  configureGitHubApp: vi.fn(),
  verifyWebhookSignature: vi.fn(),
  parseWebhookEvent: vi.fn(),
  getInstallationOctokit: vi.fn(),
  buildCheckRunComplete: vi.fn(),
  findingsToAnnotations: vi.fn(),
}));

import {
  configureGitHubApp,
  verifyWebhookSignature,
  parseWebhookEvent,
  getInstallationOctokit,
  buildCheckRunComplete,
  findingsToAnnotations,
} from "@sentinel/github";
import { GitHubProvider } from "../providers/github.js";
import type { VcsWebhookEvent, VcsScanTrigger, VcsStatusReport } from "../types.js";

const mockedConfigureGitHubApp = vi.mocked(configureGitHubApp);
const mockedVerifyWebhookSignature = vi.mocked(verifyWebhookSignature);
const mockedParseWebhookEvent = vi.mocked(parseWebhookEvent);
const mockedGetInstallationOctokit = vi.mocked(getInstallationOctokit);
const mockedBuildCheckRunComplete = vi.mocked(buildCheckRunComplete);
const mockedFindingsToAnnotations = vi.mocked(findingsToAnnotations);

describe("GitHubProvider", () => {
  let provider: GitHubProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GitHubProvider({ appId: "12345", privateKey: "fake-key" });
  });

  it("has correct type and name", () => {
    expect(provider.type).toBe("github");
    expect(provider.name).toBe("GitHub");
  });

  it("exposes GitHub-specific capabilities", () => {
    expect(provider.capabilities).toEqual({
      checkRuns: true,
      commitStatus: true,
      prComments: true,
      prAnnotations: true,
      webhookSignatureVerification: true,
      appInstallations: true,
    });
  });

  it("calls configureGitHubApp on construction", () => {
    expect(mockedConfigureGitHubApp).toHaveBeenCalledWith({
      appId: "12345",
      privateKey: "fake-key",
    });
  });

  describe("verifyWebhook", () => {
    it("delegates to verifyWebhookSignature from @sentinel/github", async () => {
      mockedVerifyWebhookSignature.mockReturnValue(true);

      const event: VcsWebhookEvent = {
        provider: "github",
        headers: { "x-hub-signature-256": "sha256=abc123" },
        body: {},
        rawBody: '{"action":"opened"}',
      };

      const result = await provider.verifyWebhook(event, "webhook-secret");

      expect(result).toBe(true);
      expect(mockedVerifyWebhookSignature).toHaveBeenCalledWith(
        '{"action":"opened"}',
        "sha256=abc123",
        "webhook-secret",
      );
    });

    it("returns false when x-hub-signature-256 header is missing", async () => {
      const event: VcsWebhookEvent = {
        provider: "github",
        headers: {},
        body: {},
        rawBody: "{}",
      };

      const result = await provider.verifyWebhook(event, "secret");

      expect(result).toBe(false);
      expect(mockedVerifyWebhookSignature).not.toHaveBeenCalled();
    });
  });

  describe("parseWebhook", () => {
    it("delegates to parseWebhookEvent and converts installationId to string", async () => {
      mockedParseWebhookEvent.mockReturnValue({
        type: "push",
        installationId: 42,
        repo: "acme/repo",
        owner: "acme",
        commitHash: "abc123",
        branch: "main",
        author: "dev@acme.com",
      });

      const event: VcsWebhookEvent = {
        provider: "github",
        headers: { "x-github-event": "push" },
        body: { some: "payload" },
        rawBody: '{"some":"payload"}',
      };

      const result = await provider.parseWebhook(event);

      expect(result).toEqual({
        provider: "github",
        type: "push",
        installationId: "42", // number converted to string
        repo: "acme/repo",
        owner: "acme",
        commitHash: "abc123",
        branch: "main",
        author: "dev@acme.com",
        prNumber: undefined,
      });
      expect(mockedParseWebhookEvent).toHaveBeenCalledWith("push", { some: "payload" });
    });

    it("returns null when x-github-event header is missing", async () => {
      const event: VcsWebhookEvent = {
        provider: "github",
        headers: {},
        body: {},
        rawBody: "{}",
      };

      const result = await provider.parseWebhook(event);

      expect(result).toBeNull();
      expect(mockedParseWebhookEvent).not.toHaveBeenCalled();
    });

    it("returns null when parseWebhookEvent returns null", async () => {
      mockedParseWebhookEvent.mockReturnValue(null);

      const event: VcsWebhookEvent = {
        provider: "github",
        headers: { "x-github-event": "issues" },
        body: {},
        rawBody: "{}",
      };

      const result = await provider.parseWebhook(event);

      expect(result).toBeNull();
    });
  });

  describe("fetchDiff", () => {
    it("fetches PR diff and populates files", async () => {
      const mockOctokit = {
        rest: {
          pulls: {
            get: vi.fn().mockResolvedValue({
              data: "diff --git a/src/new.ts b/src/new.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1,5 @@\n+const x = 1;\n",
            }),
          },
        },
      };
      mockedGetInstallationOctokit.mockReturnValue(mockOctokit as any);

      const trigger: VcsScanTrigger = {
        provider: "github",
        type: "pull_request",
        installationId: "123",
        repo: "acme/repo",
        owner: "acme",
        commitHash: "abc123",
        branch: "feature",
        author: "dev",
        prNumber: 7,
      };

      const result = await provider.fetchDiff(trigger);

      expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith({
        owner: "acme",
        repo: "repo",
        pull_number: 7,
        mediaType: { format: "diff" },
      });
      expect(result.rawDiff).toContain("diff --git");
      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toEqual({ path: "src/new.ts", status: "added" });
    });

    it("fetches push diff with files populated from compare response", async () => {
      const mockOctokit = {
        rest: {
          repos: {
            compareCommitsWithBasehead: vi.fn().mockResolvedValue({
              data: {
                files: [
                  { filename: "src/app.ts", status: "modified", patch: "@@ -1,3 +1,5 @@\n+line" },
                  { filename: "src/old.ts", status: "removed", patch: "@@ -1,3 +0,0 @@\n-line" },
                ],
              },
            }),
          },
        },
      };
      mockedGetInstallationOctokit.mockReturnValue(mockOctokit as any);

      const trigger: VcsScanTrigger = {
        provider: "github",
        type: "push",
        installationId: "123",
        repo: "acme/repo",
        owner: "acme",
        commitHash: "def456",
        branch: "main",
        author: "dev",
      };

      const result = await provider.fetchDiff(trigger);

      expect(result.files).toHaveLength(2);
      expect(result.files[0]).toEqual({ path: "src/app.ts", status: "modified" });
      expect(result.files[1]).toEqual({ path: "src/old.ts", status: "deleted" });
      expect(result.rawDiff).toContain("diff --git a/src/app.ts b/src/app.ts");
    });
  });

  describe("reportStatus", () => {
    it("creates check run when no checkRunId in metadata", async () => {
      const mockCreate = vi.fn().mockResolvedValue({});
      const mockOctokit = {
        rest: {
          checks: {
            create: mockCreate,
            update: vi.fn(),
          },
        },
      };
      mockedGetInstallationOctokit.mockReturnValue(mockOctokit as any);
      mockedBuildCheckRunComplete.mockReturnValue({
        status: "completed",
        conclusion: "success",
        output: { title: "Passed", summary: "ok" },
      } as any);
      mockedFindingsToAnnotations.mockReturnValue([]);

      const trigger: VcsScanTrigger = {
        provider: "github",
        type: "push",
        installationId: "123",
        repo: "acme/repo",
        owner: "acme",
        commitHash: "abc123",
        branch: "main",
        author: "dev",
      };

      const report: VcsStatusReport = {
        scanId: "scan-1",
        commitHash: "abc123",
        status: "full_pass",
        riskScore: 5,
        summary: "All clear",
        annotations: [],
      };

      await provider.reportStatus(trigger, report);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: "acme",
          repo: "repo",
          name: "Sentinel Security Scan",
          head_sha: "abc123",
        }),
      );
    });

    it("updates check run when checkRunId present in metadata", async () => {
      const mockUpdate = vi.fn().mockResolvedValue({});
      const mockOctokit = {
        rest: {
          checks: {
            create: vi.fn(),
            update: mockUpdate,
          },
        },
      };
      mockedGetInstallationOctokit.mockReturnValue(mockOctokit as any);
      mockedBuildCheckRunComplete.mockReturnValue({
        status: "completed",
        conclusion: "success",
        output: { title: "Passed", summary: "ok" },
      } as any);
      mockedFindingsToAnnotations.mockReturnValue([]);

      const trigger: VcsScanTrigger = {
        provider: "github",
        type: "push",
        installationId: "123",
        repo: "acme/repo",
        owner: "acme",
        commitHash: "abc123",
        branch: "main",
        author: "dev",
        metadata: { checkRunId: 42 },
      };

      const report: VcsStatusReport = {
        scanId: "scan-1",
        commitHash: "abc123",
        status: "full_pass",
        riskScore: 5,
        summary: "All clear",
        annotations: [],
      };

      await provider.reportStatus(trigger, report);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          check_run_id: 42,
        }),
      );
    });
  });

  describe("getInstallationToken", () => {
    it("returns installation-prefixed token", async () => {
      const token = await provider.getInstallationToken("12345");
      expect(token).toBe("github-installation-12345");
    });
  });
});
