import { createHmac } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AzureDevOpsProvider } from "../providers/azure-devops.js";
import type { VcsWebhookEvent, VcsScanTrigger, VcsStatusReport } from "../types.js";

const SECRET = "test-webhook-secret";
const provider = new AzureDevOpsProvider({
  organizationUrl: "https://dev.azure.com/my-org",
  project: "my-project",
  pat: "test-pat-token",
});

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function makePushEvent(overrides: Partial<VcsWebhookEvent> = {}): VcsWebhookEvent {
  const body = {
    eventType: "git.push",
    resource: {
      refUpdates: [
        {
          name: "refs/heads/main",
          newObjectId: "abc123def456",
        },
      ],
      pushedBy: { displayName: "Alice" },
      repository: { id: "repo-guid-1", name: "my-repo" },
    },
  };
  const rawBody = JSON.stringify(body);
  return {
    provider: "azure_devops",
    headers: {
      "x-azure-signature": sign(rawBody, SECRET),
      ...overrides.headers,
    },
    body,
    rawBody,
    ...overrides,
  };
}

function makePrEvent(
  eventType = "git.pullrequest.created",
): VcsWebhookEvent {
  const body = {
    eventType,
    resource: {
      pullRequestId: 42,
      sourceRefName: "refs/heads/feature/cool",
      lastMergeSourceCommit: { commitId: "pr-commit-hash" },
      createdBy: { displayName: "Bob" },
      repository: { id: "repo-guid-1", name: "my-repo" },
    },
  };
  const rawBody = JSON.stringify(body);
  return {
    provider: "azure_devops",
    headers: {
      "x-azure-signature": sign(rawBody, SECRET),
    },
    body,
    rawBody,
  };
}

describe("AzureDevOpsProvider", () => {
  describe("type and capabilities", () => {
    it("has correct type and name", () => {
      expect(provider.type).toBe("azure_devops");
      expect(provider.name).toBe("Azure DevOps");
    });

    it("reports correct capabilities", () => {
      expect(provider.capabilities).toEqual({
        checkRuns: false,
        commitStatus: true,
        prComments: true,
        prAnnotations: false,
        webhookSignatureVerification: true,
        appInstallations: false,
      });
    });
  });

  describe("verifyWebhook", () => {
    it("returns true for valid HMAC signature", async () => {
      const event = makePushEvent();
      const result = await provider.verifyWebhook(event, SECRET);
      expect(result).toBe(true);
    });

    it("returns false when signature header is missing and secret is configured", async () => {
      const event = makePushEvent({ headers: {} });
      const result = await provider.verifyWebhook(event, SECRET);
      expect(result).toBe(false);
    });

    it("returns true when no signature header and no secret configured", async () => {
      const event = makePushEvent({ headers: {} });
      const result = await provider.verifyWebhook(event, "");
      expect(result).toBe(true);
    });

    it("returns false for invalid HMAC signature", async () => {
      const event = makePushEvent({
        headers: { "x-azure-signature": "invalid-hex-sig" },
      });
      const result = await provider.verifyWebhook(event, SECRET);
      expect(result).toBe(false);
    });
  });

  describe("parseWebhook", () => {
    it("parses git.push event", async () => {
      const event = makePushEvent();
      const trigger = await provider.parseWebhook(event);
      expect(trigger).toEqual({
        provider: "azure_devops",
        type: "push",
        installationId: "repo-guid-1",
        repo: "my-repo",
        owner: "my-project",
        commitHash: "abc123def456",
        branch: "main",
        author: "Alice",
      });
    });

    it("parses git.pullrequest.created event", async () => {
      const event = makePrEvent("git.pullrequest.created");
      const trigger = await provider.parseWebhook(event);
      expect(trigger).toEqual({
        provider: "azure_devops",
        type: "pull_request",
        installationId: "repo-guid-1",
        repo: "my-repo",
        owner: "my-project",
        commitHash: "pr-commit-hash",
        branch: "feature/cool",
        author: "Bob",
        prNumber: 42,
      });
    });

    it("parses git.pullrequest.updated event", async () => {
      const event = makePrEvent("git.pullrequest.updated");
      const trigger = await provider.parseWebhook(event);
      expect(trigger).not.toBeNull();
      expect(trigger!.type).toBe("pull_request");
      expect(trigger!.prNumber).toBe(42);
    });

    it("returns null for irrelevant events", async () => {
      const body = { eventType: "build.complete", resource: {} };
      const rawBody = JSON.stringify(body);
      const event: VcsWebhookEvent = {
        provider: "azure_devops",
        headers: {},
        body,
        rawBody,
      };
      const trigger = await provider.parseWebhook(event);
      expect(trigger).toBeNull();
    });
  });

  describe("fetchDiff", () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);
    });

    it("fetches commit diff with parent lookup for push", async () => {
      // First call: get commit to find parent
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ parents: ["parent-sha-123"] }),
        status: 200,
      });
      // Second call: diff between parent and commit
      const diffResponse = {
        changes: [
          { item: { path: "/src/main.ts" }, changeType: "edit" },
          { item: { path: "/src/new.ts" }, changeType: "add" },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(diffResponse),
        status: 200,
      });

      const trigger: VcsScanTrigger = {
        provider: "azure_devops",
        type: "push",
        installationId: "repo-guid-1",
        repo: "my-repo",
        owner: "my-project",
        commitHash: "abc123",
        branch: "main",
        author: "Alice",
      };

      const result = await provider.fetchDiff(trigger);

      // First call: commit details
      expect(mockFetch.mock.calls[0][0]).toContain("/commits/abc123?api-version=7.0");
      // Second call: diff with proper SHAs
      expect(mockFetch.mock.calls[1][0]).toContain("baseVersion=parent-sha-123&baseVersionType=commit&targetVersion=abc123&targetVersionType=commit");
      expect(result.files).toHaveLength(2);
      expect(result.files[0]).toEqual({ path: "src/main.ts", status: "modified" });
      expect(result.files[1]).toEqual({ path: "src/new.ts", status: "added" });
    });

    it("fetches PR diff using iterations API", async () => {
      // First call: get PR iterations
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ value: [{ id: 1 }, { id: 2 }] }),
        status: 200,
      });
      // Second call: get last iteration changes
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          changeEntries: [
            { item: { path: "/src/changed.ts" }, changeType: "edit" },
          ],
        }),
        status: 200,
      });

      const trigger: VcsScanTrigger = {
        provider: "azure_devops",
        type: "pull_request",
        installationId: "repo-guid-1",
        repo: "my-repo",
        owner: "my-project",
        commitHash: "abc123",
        branch: "feature",
        author: "Alice",
        prNumber: 42,
      };

      const result = await provider.fetchDiff(trigger);

      expect(mockFetch.mock.calls[0][0]).toContain("/pullRequests/42/iterations");
      expect(mockFetch.mock.calls[1][0]).toContain("/pullRequests/42/iterations/2/changes");
      expect(result.files).toHaveLength(1);
    });

    it("throws VcsApiError on non-ok response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      const trigger: VcsScanTrigger = {
        provider: "azure_devops",
        type: "push",
        installationId: "repo-guid-1",
        repo: "my-repo",
        owner: "my-project",
        commitHash: "abc123",
        branch: "main",
        author: "Alice",
      };

      await expect(provider.fetchDiff(trigger)).rejects.toThrow(
        "azure_devops fetchCommit failed: 404 Not Found",
      );
    });
  });

  describe("reportStatus", () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", mockFetch);
    });

    it("posts commit status to correct endpoint", async () => {
      const trigger: VcsScanTrigger = {
        provider: "azure_devops",
        type: "push",
        installationId: "repo-guid-1",
        repo: "my-repo",
        owner: "my-project",
        commitHash: "abc123",
        branch: "main",
        author: "Alice",
      };

      const report: VcsStatusReport = {
        scanId: "scan-1",
        commitHash: "abc123",
        status: "full_pass",
        riskScore: 10,
        summary: "All checks passed",
        annotations: [],
        detailsUrl: "https://sentinel.example.com/scans/scan-1",
      };

      await provider.reportStatus(trigger, report);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://dev.azure.com/my-org/my-project/_apis/git/repositories/my-repo/commits/abc123/statuses?api-version=7.0",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        }),
      );

      const bodyArg = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(bodyArg.state).toBe("succeeded");
      expect(bodyArg.context.name).toBe("sentinel-scan");
    });

    it("posts PR thread when there are annotations", async () => {
      const trigger: VcsScanTrigger = {
        provider: "azure_devops",
        type: "pull_request",
        installationId: "repo-guid-1",
        repo: "my-repo",
        owner: "my-project",
        commitHash: "abc123",
        branch: "feature",
        author: "Alice",
        prNumber: 42,
      };

      const report: VcsStatusReport = {
        scanId: "scan-2",
        commitHash: "abc123",
        status: "fail",
        riskScore: 85,
        summary: "Found issues",
        annotations: [
          {
            file: "src/main.ts",
            lineStart: 10,
            lineEnd: 10,
            level: "failure",
            title: "SQL Injection",
            message: "Unsanitized input",
          },
        ],
        detailsUrl: "https://sentinel.example.com/scans/scan-2",
      };

      await provider.reportStatus(trigger, report);

      // Should post both commit status and PR thread
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[1][0]).toBe(
        "https://dev.azure.com/my-org/my-project/_apis/git/repositories/my-repo/pullRequests/42/threads?api-version=7.0",
      );

      const threadBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(threadBody.comments).toHaveLength(1);
      expect(threadBody.comments[0].content).toContain("SQL Injection");
    });
  });

  describe("getInstallationToken", () => {
    it("returns base64 encoded PAT with empty username", async () => {
      const token = await provider.getInstallationToken("any");
      const decoded = Buffer.from(token, "base64").toString();
      expect(decoded).toBe(":test-pat-token");
    });
  });
});
