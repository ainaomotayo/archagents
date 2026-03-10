import type { Octokit } from "@octokit/rest";

export interface TriggerContext {
  type: "push" | "pull_request";
  owner: string;
  repo: string; // "owner/repo" format
  commitHash: string;
  branch: string;
  prNumber?: number;
}

/**
 * Fetch a raw unified diff from GitHub.
 *
 * - PR triggers use the pulls.get endpoint with diff media type.
 * - Push triggers use compareCommitsWithBasehead and reconstruct diff from patches.
 */
export async function fetchDiff(
  octokit: Octokit,
  ctx: TriggerContext,
): Promise<string> {
  const repoName = ctx.repo.includes("/") ? ctx.repo.split("/")[1] : ctx.repo;

  if (ctx.type === "pull_request") {
    if (!ctx.prNumber) {
      throw new Error("prNumber required for pull_request trigger");
    }
    const res = await octokit.rest.pulls.get({
      owner: ctx.owner,
      repo: repoName,
      pull_number: ctx.prNumber,
      mediaType: { format: "diff" },
    });
    // When using diff media type, data is the raw diff string
    return res.data as unknown as string;
  }

  // Push — compare parent commit to HEAD
  const res = await octokit.rest.repos.compareCommitsWithBasehead({
    owner: ctx.owner,
    repo: repoName,
    basehead: `${ctx.commitHash}~1...${ctx.commitHash}`,
  });

  // Reconstruct unified diff from file patches
  const files = (res.data as any).files ?? [];
  const parts: string[] = [];
  for (const file of files) {
    if (file.patch) {
      parts.push(
        `diff --git a/${file.filename} b/${file.filename}\n${file.patch}`,
      );
    }
  }
  return parts.join("\n");
}
