import { createHmac } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BitbucketProvider } from "../providers/bitbucket.js";
import type { VcsWebhookEvent, VcsScanTrigger, VcsStatusReport } from "../types.js";

const SECRET = "test-webhook-secret";
const provider = new BitbucketProvider({
  workspace: "my-workspace",
  username: "testuser",
  appPassword: "testpass",
});

function sign(body: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

function makePushEvent(overrides: Partial<VcsWebhookEvent> = {}): VcsWebhookEvent {
  const body = {
    push: {
      changes: [
        {
          new: {
            type: "branch",
            name: "main",
            target: { hash: "abc123def456" },
          },
        },
      ],
    },
    repository: { full_name: "my-workspace/my-repo", uuid: "{repo-uuid}" },
    actor: { display_name: "Alice" },
  };
  const rawBody = JSON.stringify(body);
  return {
    provider: "bitbucket",
    headers: {
      "x-event-key": "repo:push",
      "x-hub-signature": sign(rawBody, SECRET),
      ...overrides.headers,
    },
    body,
    rawBody,
    ...overrides,
  };
}

function makePrEvent(eventKey = "pullrequest:created"): VcsWebhookEvent {
  const body = {
    pullrequest: {
      id: 42,
      source: {
        branch: { name: "feature/cool" },
        commit: { hash: "pr-commit-hash" },
      },
      author: { display_name: "Bob" },
    },
    repository: { full_name: "my-workspace/my-repo", uuid: "{repo-uuid}" },
    actor: { display_name: "Bob" },
  };
  const rawBody = JSON.stringify(body);
  return {
    provider: "bitbucket",
    headers: {
      "x-event-key": eventKey,
      "x-hub-signature": sign(rawBody, SECRET),
    },
    body,
    rawBody,
  };
}

describe("BitbucketProvider", () => {
  describe("type and capabilities", () => {
    it("has correct type and name", () => {
      expect(provider.type).toBe("bitbucket");
      expect(provider.name).toBe("Bitbucket Cloud");
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

    it("returns false for invalid HMAC signature", async () => {
      const event = makePushEvent({
        headers: {
          "x-event-key": "repo:push",
          "x-hub-signature": "sha256=invalid",
        },
      });
      const result = await provider.verifyWebhook(event, SECRET);
      expect(result).toBe(false);
    });

    it("returns false when signature header is missing", async () => {
      const event = makePushEvent({
        headers: { "x-event-key": "repo:push" },
      });
      const result = await provider.verifyWebhook(event, SECRET);
      expect(result).toBe(false);
    });
  });

  describe("parseWebhook", () => {
    it("parses repo:push event", async () => {
      const event = makePushEvent();
      const trigger = await provider.parseWebhook(event);
      expect(trigger).toEqual({
        provider: "bitbucket",
        type: "push",
        installationId: "{repo-uuid}",
        repo: "my-workspace/my-repo",
        owner: "my-workspace",
        commitHash: "abc123def456",
        branch: "main",
        author: "Alice",
      });
    });

    it("parses pullrequest:created event", async () => {
      const event = makePrEvent("pullrequest:created");
      const trigger = await provider.parseWebhook(event);
      expect(trigger).toEqual({
        provider: "bitbucket",
        type: "pull_request",
        installationId: "{repo-uuid}",
        repo: "my-workspace/my-repo",
        owner: "my-workspace",
        commitHash: "pr-commit-hash",
        branch: "feature/cool",
        author: "Bob",
        prNumber: 42,
      });
    });

    it("parses pullrequest:updated event", async () => {
      const event = makePrEvent("pullrequest:updated");
      const trigger = await provider.parseWebhook(event);
      expect(trigger).not.toBeNull();
      expect(trigger!.type).toBe("pull_request");
      expect(trigger!.prNumber).toBe(42);
    });

    it("returns null for irrelevant events", async () => {
      const body = { something: "unrelated" };
      const rawBody = JSON.stringify(body);
      const event: VcsWebhookEvent = {
        provider: "bitbucket",
        headers: { "x-event-key": "repo:fork" },
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

    it("fetches PR diff from correct URL", async () => {
      const diffText = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
+new line
 existing`;
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(diffText),
        status: 200,
      });

      const trigger: VcsScanTrigger = {
        provider: "bitbucket",
        type: "pull_request",
        installationId: "{repo-uuid}",
        repo: "my-workspace/my-repo",
        owner: "my-workspace",
        commitHash: "abc123",
        branch: "feature",
        author: "Alice",
        prNumber: 42,
      };

      const result = await provider.fetchDiff(trigger);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.bitbucket.org/2.0/repositories/my-workspace/my-repo/pullrequests/42/diff",
        expect.objectContaining({
          headers: { Authorization: expect.stringMatching(/^Basic /) },
        }),
      );
      expect(result.rawDiff).toBe(diffText);
      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toEqual({ path: "file.ts", status: "modified" });
    });

    it("fetches push diff from correct URL", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(""),
        status: 200,
      });

      const trigger: VcsScanTrigger = {
        provider: "bitbucket",
        type: "push",
        installationId: "{repo-uuid}",
        repo: "my-workspace/my-repo",
        owner: "my-workspace",
        commitHash: "abc123",
        branch: "main",
        author: "Alice",
      };

      await provider.fetchDiff(trigger);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.bitbucket.org/2.0/repositories/my-workspace/my-repo/diff/abc123",
        expect.any(Object),
      );
    });
  });

  describe("reportStatus", () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", mockFetch);
    });

    it("posts build status to correct endpoint", async () => {
      const trigger: VcsScanTrigger = {
        provider: "bitbucket",
        type: "push",
        installationId: "{repo-uuid}",
        repo: "my-workspace/my-repo",
        owner: "my-workspace",
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
        "https://api.bitbucket.org/2.0/repositories/my-workspace/my-repo/commit/abc123/statuses/build",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        }),
      );

      const bodyArg = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(bodyArg.state).toBe("SUCCESSFUL");
      expect(bodyArg.key).toBe("sentinel-scan");
    });

    it("posts PR comment when there are annotations", async () => {
      const trigger: VcsScanTrigger = {
        provider: "bitbucket",
        type: "pull_request",
        installationId: "{repo-uuid}",
        repo: "my-workspace/my-repo",
        owner: "my-workspace",
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

      // Should post both build status and PR comment
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[1][0]).toBe(
        "https://api.bitbucket.org/2.0/repositories/my-workspace/my-repo/pullrequests/42/comments",
      );
    });
  });

  describe("getInstallationToken", () => {
    it("returns base64 encoded credentials", async () => {
      const token = await provider.getInstallationToken("any");
      const decoded = Buffer.from(token, "base64").toString();
      expect(decoded).toBe("testuser:testpass");
    });
  });
});
