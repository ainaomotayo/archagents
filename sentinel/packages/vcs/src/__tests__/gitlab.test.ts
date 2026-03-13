import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VcsWebhookEvent, VcsScanTrigger } from "../types.js";

// Mock @gitbeaker/rest before importing the provider
const mockAllDiffs = vi.fn();
const mockCompare = vi.fn();
const mockEditStatus = vi.fn();
const mockCreateNote = vi.fn();

vi.mock("@gitbeaker/rest", () => ({
  Gitlab: class MockGitlab {
    MergeRequests = { allDiffs: mockAllDiffs };
    Repositories = { compare: mockCompare };
    Commits = { editStatus: mockEditStatus };
    MergeRequestNotes = { create: mockCreateNote };
    constructor(_opts: any) {}
  },
}));

import { GitLabProvider } from "../providers/gitlab.js";

function makeEvent(
  headers: Record<string, string>,
  body: unknown,
): VcsWebhookEvent {
  return {
    provider: "gitlab",
    headers,
    body,
    rawBody: JSON.stringify(body),
  };
}

describe("GitLabProvider", () => {
  let provider: GitLabProvider;

  beforeEach(() => {
    provider = new GitLabProvider({ token: "glpat-test-token" });
    vi.clearAllMocks();
  });

  it("has correct type and name", () => {
    expect(provider.type).toBe("gitlab");
    expect(provider.name).toBe("GitLab");
  });

  it("has correct capabilities", () => {
    expect(provider.capabilities).toEqual({
      checkRuns: false,
      commitStatus: true,
      prComments: true,
      prAnnotations: false,
      webhookSignatureVerification: true,
      appInstallations: false,
    });
  });

  // --- verifyWebhook ---

  it("verifyWebhook: accepts matching token", async () => {
    const event = makeEvent({ "x-gitlab-token": "my-secret" }, {});
    expect(await provider.verifyWebhook(event, "my-secret")).toBe(true);
  });

  it("verifyWebhook: rejects wrong token", async () => {
    const event = makeEvent({ "x-gitlab-token": "wrong-token" }, {});
    expect(await provider.verifyWebhook(event, "my-secret")).toBe(false);
  });

  it("verifyWebhook: rejects missing header", async () => {
    const event = makeEvent({}, {});
    expect(await provider.verifyWebhook(event, "my-secret")).toBe(false);
  });

  // --- parseWebhook ---

  it("parseWebhook: parses push hook", async () => {
    const body = {
      ref: "refs/heads/main",
      checkout_sha: "abc123def456",
      user_name: "Jane Dev",
      project: {
        id: 42,
        path_with_namespace: "acme/backend",
      },
    };
    const event = makeEvent({ "x-gitlab-event": "Push Hook" }, body);
    const trigger = await provider.parseWebhook(event);

    expect(trigger).not.toBeNull();
    expect(trigger!.provider).toBe("gitlab");
    expect(trigger!.type).toBe("push");
    expect(trigger!.repo).toBe("acme/backend");
    expect(trigger!.owner).toBe("acme");
    expect(trigger!.commitHash).toBe("abc123def456");
    expect(trigger!.branch).toBe("main");
    expect(trigger!.author).toBe("Jane Dev");
    expect(trigger!.projectId).toBe(42);
  });

  it("parseWebhook: parses merge request (opened)", async () => {
    const body = {
      user: { name: "Jane Dev" },
      project: {
        id: 42,
        path_with_namespace: "acme/backend",
      },
      object_attributes: {
        iid: 7,
        action: "open",
        source_branch: "feature/auth",
        last_commit: {
          id: "deadbeef1234",
          author: { name: "Jane Dev" },
        },
      },
    };
    const event = makeEvent({ "x-gitlab-event": "Merge Request Hook" }, body);
    const trigger = await provider.parseWebhook(event);

    expect(trigger).not.toBeNull();
    expect(trigger!.type).toBe("merge_request");
    expect(trigger!.prNumber).toBe(7);
    expect(trigger!.branch).toBe("feature/auth");
    expect(trigger!.commitHash).toBe("deadbeef1234");
  });

  it("parseWebhook: ignores MR close action", async () => {
    const body = {
      project: { id: 42, path_with_namespace: "acme/backend" },
      object_attributes: {
        iid: 7,
        action: "close",
        source_branch: "feature/auth",
        last_commit: { id: "deadbeef1234" },
      },
    };
    const event = makeEvent({ "x-gitlab-event": "Merge Request Hook" }, body);
    expect(await provider.parseWebhook(event)).toBeNull();
  });

  it("parseWebhook: ignores unknown event types", async () => {
    const event = makeEvent({ "x-gitlab-event": "Tag Push Hook" }, { project: {} });
    expect(await provider.parseWebhook(event)).toBeNull();
  });

  // --- fetchDiff ---

  it("fetchDiff: fetches MR diffs", async () => {
    mockAllDiffs.mockResolvedValue([
      {
        old_path: "src/app.ts",
        new_path: "src/app.ts",
        diff: "@@ -1,3 +1,4 @@\n+import foo;\n",
        new_file: false,
        deleted_file: false,
        renamed_file: false,
      },
      {
        old_path: "src/new.ts",
        new_path: "src/new.ts",
        diff: "@@ -0,0 +1,5 @@\n+console.log('new');\n",
        new_file: true,
        deleted_file: false,
        renamed_file: false,
      },
    ]);

    const trigger: VcsScanTrigger = {
      provider: "gitlab",
      type: "merge_request",
      installationId: "42",
      repo: "acme/backend",
      owner: "acme",
      commitHash: "deadbeef",
      branch: "feature/auth",
      author: "Jane",
      prNumber: 7,
      projectId: 42,
    };

    const result = await provider.fetchDiff(trigger);

    expect(mockAllDiffs).toHaveBeenCalledWith(42, 7);
    expect(result.files).toHaveLength(2);
    expect(result.files[0]).toEqual({ path: "src/app.ts", status: "modified" });
    expect(result.files[1]).toEqual({ path: "src/new.ts", status: "added" });
    expect(result.rawDiff).toContain("diff --git");
  });

  it("fetchDiff: fetches push diffs via compare", async () => {
    mockCompare.mockResolvedValue({
      diffs: [
        {
          old_path: "README.md",
          new_path: "README.md",
          diff: "@@ -1 +1,2 @@\n+Updated\n",
          new_file: false,
          deleted_file: false,
          renamed_file: false,
        },
      ],
    });

    const trigger: VcsScanTrigger = {
      provider: "gitlab",
      type: "push",
      installationId: "42",
      repo: "acme/backend",
      owner: "acme",
      commitHash: "abc123",
      branch: "main",
      author: "Jane",
      projectId: 42,
    };

    const result = await provider.fetchDiff(trigger);

    expect(mockCompare).toHaveBeenCalledWith(42, "abc123~1", "abc123");
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toEqual({ path: "README.md", status: "modified" });
  });

  it("getInstallationToken returns configured-at-init", async () => {
    expect(await provider.getInstallationToken("any")).toBe("configured-at-init");
  });

  // --- reportStatus ---

  describe("reportStatus", () => {
    const baseReport = {
      scanId: "scan-1",
      commitHash: "abc123",
      status: "full_pass" as const,
      summary: "All checks passed",
      riskScore: 0,
      detailsUrl: "https://sentinel.example.com/reports/1",
      annotations: [
        {
          file: "src/app.ts",
          lineStart: 10,
          lineEnd: 10,
          level: "warning" as const,
          title: "Hardcoded secret",
          message: "Possible API key detected",
        },
      ],
    };

    const mrTrigger: VcsScanTrigger = {
      provider: "gitlab",
      type: "merge_request",
      installationId: "42",
      repo: "acme/backend",
      owner: "acme",
      commitHash: "abc123",
      branch: "feature/auth",
      author: "Jane",
      prNumber: 7,
      projectId: 42,
    };

    const pushTrigger: VcsScanTrigger = {
      provider: "gitlab",
      type: "push",
      installationId: "42",
      repo: "acme/backend",
      owner: "acme",
      commitHash: "abc123",
      branch: "main",
      author: "Jane",
      projectId: 42,
    };

    it("calls Commits.editStatus with correct positional args", async () => {
      mockEditStatus.mockResolvedValue({});
      mockCreateNote.mockResolvedValue({});

      await provider.reportStatus(mrTrigger, baseReport);

      expect(mockEditStatus).toHaveBeenCalledWith(42, "abc123", "success", {
        name: "Sentinel Security",
        description: "All checks passed",
        targetUrl: "https://sentinel.example.com/reports/1",
      });
    });

    it("creates MR note when prNumber is set and annotations exist", async () => {
      mockEditStatus.mockResolvedValue({});
      mockCreateNote.mockResolvedValue({});

      await provider.reportStatus(mrTrigger, baseReport);

      expect(mockCreateNote).toHaveBeenCalledWith(42, 7, expect.stringContaining("Sentinel Scan Results"));
    });

    it("does NOT create MR note for push triggers", async () => {
      mockEditStatus.mockResolvedValue({});

      await provider.reportStatus(pushTrigger, baseReport);

      expect(mockCreateNote).not.toHaveBeenCalled();
    });
  });
});
