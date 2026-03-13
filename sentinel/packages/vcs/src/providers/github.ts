import {
  verifyWebhookSignature,
  parseWebhookEvent,
  getInstallationOctokit,
  buildCheckRunComplete,
  findingsToAnnotations,
  configureGitHubApp,
} from "@sentinel/github";
import { VcsProviderBase, VcsApiError } from "../base.js";
import type {
  VcsCapabilities,
  VcsScanTrigger,
  VcsWebhookEvent,
  VcsDiffResult,
  VcsStatusReport,
  VcsProviderType,
} from "../types.js";

export interface GitHubProviderOpts {
  appId: string;
  privateKey: string;
}

export class GitHubProvider extends VcsProviderBase {
  readonly name = "GitHub";
  readonly type: VcsProviderType = "github";
  readonly capabilities: VcsCapabilities = {
    checkRuns: true,
    commitStatus: true,
    prComments: true,
    prAnnotations: true,
    webhookSignatureVerification: true,
    appInstallations: true,
  };

  constructor(opts: GitHubProviderOpts) {
    super();
    configureGitHubApp({ appId: opts.appId, privateKey: opts.privateKey });
  }

  async verifyWebhook(event: VcsWebhookEvent, secret: string): Promise<boolean> {
    const sig = event.headers["x-hub-signature-256"];
    if (!sig) return false;
    return verifyWebhookSignature(event.rawBody, sig, secret);
  }

  async parseWebhook(event: VcsWebhookEvent): Promise<VcsScanTrigger | null> {
    const eventType = event.headers["x-github-event"];
    if (!eventType) return null;
    const trigger = parseWebhookEvent(eventType, event.body as any);
    if (!trigger) return null;
    // Convert from GitHub's ScanTrigger to VcsScanTrigger
    return {
      provider: "github",
      type: trigger.type,
      installationId: String(trigger.installationId), // number -> string
      repo: trigger.repo,
      owner: trigger.owner,
      commitHash: trigger.commitHash,
      branch: trigger.branch,
      author: trigger.author,
      prNumber: trigger.prNumber,
    };
  }

  async fetchDiff(trigger: VcsScanTrigger): Promise<VcsDiffResult> {
    try {
      const octokit = getInstallationOctokit(Number(trigger.installationId));
      const repoName = trigger.repo.includes("/") ? trigger.repo.split("/")[1] : trigger.repo;

      if (trigger.type === "pull_request" && trigger.prNumber) {
        const res = await octokit.rest.pulls.get({
          owner: trigger.owner,
          repo: repoName,
          pull_number: trigger.prNumber,
          mediaType: { format: "diff" },
        });
        const rawDiff = res.data as unknown as string;
        return { rawDiff, files: this.parseDiffFiles(rawDiff) };
      }

      const res = await octokit.rest.repos.compareCommitsWithBasehead({
        owner: trigger.owner,
        repo: repoName,
        basehead: `${trigger.commitHash}~1...${trigger.commitHash}`,
      });
      const ghFiles = (res.data as any).files ?? [];
      const parts: string[] = [];
      const files: Array<{ path: string; status: "added" | "modified" | "deleted" | "renamed" }> = [];
      for (const file of ghFiles) {
        files.push({
          path: file.filename,
          status: this.mapGitHubStatus(file.status),
        });
        if (file.patch) {
          parts.push(`diff --git a/${file.filename} b/${file.filename}\n${file.patch}`);
        }
      }
      return { rawDiff: parts.join("\n"), files };
    } catch (err: any) {
      if (err instanceof VcsApiError) throw err;
      throw new VcsApiError("github", err.status ?? 500, err.message ?? "Unknown error", "fetchDiff");
    }
  }

  async reportStatus(trigger: VcsScanTrigger, report: VcsStatusReport): Promise<void> {
    try {
    const octokit = getInstallationOctokit(Number(trigger.installationId));
    const repoName = trigger.repo.includes("/") ? trigger.repo.split("/")[1] : trigger.repo;

    // Convert VcsAnnotations back to GitHub Finding format for findingsToAnnotations
    const annotations = report.annotations.map((a) => ({
      file: a.file,
      lineStart: a.lineStart,
      lineEnd: a.lineEnd,
      severity: a.level === "failure" ? "high" : a.level === "warning" ? "medium" : "low",
      title: a.title,
      description: a.message,
      type: "security",
      confidence: "high" as const,
      remediation: "",
    }));

    const checkRunPayload = buildCheckRunComplete(
      report.scanId,
      report.status,
      report.riskScore,
      findingsToAnnotations(annotations as any),
    );

    const checkRunId = trigger.metadata?.checkRunId as number | undefined;
    if (checkRunId) {
      await octokit.rest.checks.update({
        owner: trigger.owner,
        repo: repoName,
        check_run_id: checkRunId,
        status: checkRunPayload.status,
        conclusion: checkRunPayload.conclusion,
        output: checkRunPayload.output,
      });
    } else {
      await octokit.rest.checks.create({
        owner: trigger.owner,
        repo: repoName,
        name: "Sentinel Security Scan",
        head_sha: trigger.commitHash,
        status: checkRunPayload.status,
        conclusion: checkRunPayload.conclusion,
        output: checkRunPayload.output,
      });
    }

    // Post PR comment for visibility (like other providers)
    if (trigger.prNumber && report.annotations.length > 0) {
      const commentBody = this.formatPrComment(report);
      await octokit.rest.issues.createComment({
        owner: trigger.owner,
        repo: repoName,
        issue_number: trigger.prNumber,
        body: commentBody,
      });
    }
    } catch (err: any) {
      if (err instanceof VcsApiError) throw err;
      throw new VcsApiError("github", err.status ?? 500, err.message ?? "Unknown error", "reportStatus");
    }
  }

  async getInstallationToken(installationId: string): Promise<string> {
    try {
      const octokit = getInstallationOctokit(Number(installationId));
      const { data } = await octokit.rest.apps.createInstallationAccessToken({
        installation_id: Number(installationId),
      });
      return data.token;
    } catch (err: any) {
      throw new VcsApiError("github", err.status ?? 500, err.message ?? "Unknown error", "getInstallationToken");
    }
  }

  private mapGitHubStatus(status: string): "added" | "modified" | "deleted" | "renamed" {
    switch (status) {
      case "added": return "added";
      case "removed": return "deleted";
      case "renamed": return "renamed";
      default: return "modified";
    }
  }

  private parseDiffFiles(rawDiff: string): Array<{ path: string; status: "added" | "modified" | "deleted" | "renamed" }> {
    const files: Array<{ path: string; status: "added" | "modified" | "deleted" | "renamed" }> = [];
    const diffHeaders = rawDiff.match(/^diff --git a\/.+ b\/(.+)$/gm);
    if (!diffHeaders) return files;

    for (const header of diffHeaders) {
      const match = header.match(/^diff --git a\/(.+) b\/(.+)$/);
      if (!match) continue;
      const oldPath = match[1];
      const newPath = match[2];

      const idx = rawDiff.indexOf(header);
      const nextDiff = rawDiff.indexOf("diff --git", idx + header.length);
      const section = rawDiff.slice(idx, nextDiff === -1 ? undefined : nextDiff);

      let status: "added" | "modified" | "deleted" | "renamed" = "modified";
      if (section.includes("new file mode")) status = "added";
      else if (section.includes("deleted file mode")) status = "deleted";
      else if (oldPath !== newPath) status = "renamed";

      files.push({ path: newPath, status });
    }
    return files;
  }
}
