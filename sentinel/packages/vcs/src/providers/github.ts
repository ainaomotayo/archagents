import {
  verifyWebhookSignature,
  parseWebhookEvent,
  getInstallationOctokit,
  buildCheckRunComplete,
  findingsToAnnotations,
  configureGitHubApp,
} from "@sentinel/github";
import { VcsProviderBase } from "../base.js";
import type {
  VcsCapabilities,
  VcsScanTrigger,
  VcsWebhookEvent,
  VcsDiffResult,
  VcsStatusReport,
  VcsProviderType,
} from "../types.js";

interface GitHubProviderOpts {
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
      return { rawDiff, files: [] }; // files parsed downstream by parseDiff
    }

    const res = await octokit.rest.repos.compareCommitsWithBasehead({
      owner: trigger.owner,
      repo: repoName,
      basehead: `${trigger.commitHash}~1...${trigger.commitHash}`,
    });
    const files = (res.data as any).files ?? [];
    const parts: string[] = [];
    for (const file of files) {
      if (file.patch) {
        parts.push(`diff --git a/${file.filename} b/${file.filename}\n${file.patch}`);
      }
    }
    return { rawDiff: parts.join("\n"), files: [] };
  }

  async reportStatus(trigger: VcsScanTrigger, report: VcsStatusReport): Promise<void> {
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

    await octokit.rest.checks.update({
      owner: trigger.owner,
      repo: repoName,
      check_run_id: 0, // caller should set this via correlation
      status: checkRunPayload.status,
      conclusion: checkRunPayload.conclusion,
      output: checkRunPayload.output,
    });
  }

  async getInstallationToken(installationId: string): Promise<string> {
    // GitHub App generates tokens per-installation via Octokit
    return `github-installation-${installationId}`;
  }
}
