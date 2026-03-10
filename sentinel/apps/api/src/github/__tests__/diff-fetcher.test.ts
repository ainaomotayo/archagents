import { describe, it, expect, vi } from "vitest";
import { fetchDiff } from "../diff-fetcher.js";

function mockOctokit(diffText: string) {
  return {
    rest: {
      pulls: {
        get: vi.fn().mockResolvedValue({ data: diffText }),
      },
      repos: {
        compareCommitsWithBasehead: vi.fn().mockResolvedValue({
          data: { files: [{ filename: "a.ts", patch: "@@ -1,1 +1,2 @@\n line\n+new" }] },
        }),
      },
    },
  };
}

describe("fetchDiff", () => {
  it("fetches PR diff for pull_request trigger", async () => {
    const diffText = "diff --git a/f.ts b/f.ts\n@@ -1,1 +1,2 @@\n line\n+new";
    const octokit = mockOctokit(diffText);
    const result = await fetchDiff(octokit as any, {
      type: "pull_request",
      owner: "acme",
      repo: "acme/app",
      commitHash: "abc123",
      branch: "feature",
      prNumber: 42,
    });
    expect(result).toContain("diff --git");
    expect(octokit.rest.pulls.get).toHaveBeenCalledWith({
      owner: "acme",
      repo: "app",
      pull_number: 42,
      mediaType: { format: "diff" },
    });
  });

  it("fetches compare diff for push trigger", async () => {
    const octokit = mockOctokit("");
    const result = await fetchDiff(octokit as any, {
      type: "push",
      owner: "acme",
      repo: "acme/app",
      commitHash: "abc123",
      branch: "main",
    });
    expect(result).toContain("@@");
    expect(octokit.rest.repos.compareCommitsWithBasehead).toHaveBeenCalled();
  });

  it("throws on missing prNumber for pull_request type", async () => {
    const octokit = mockOctokit("");
    await expect(
      fetchDiff(octokit as any, {
        type: "pull_request",
        owner: "acme",
        repo: "acme/app",
        commitHash: "abc123",
        branch: "feature",
      }),
    ).rejects.toThrow("prNumber");
  });
});
