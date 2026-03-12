import { createHmac, timingSafeEqual } from "node:crypto";
import { VcsProviderBase, VcsApiError } from "../base.js";
import type {
  VcsCapabilities,
  VcsScanTrigger,
  VcsWebhookEvent,
  VcsDiffResult,
  VcsStatusReport,
  VcsProviderType,
} from "../types.js";

interface AzureDevOpsProviderOptions {
  organizationUrl: string;
  project: string;
  pat: string;
}

export class AzureDevOpsProvider extends VcsProviderBase {
  readonly name = "Azure DevOps";
  readonly type: VcsProviderType = "azure_devops";
  readonly capabilities: VcsCapabilities = {
    checkRuns: false,
    commitStatus: true,
    prComments: true,
    prAnnotations: false,
    webhookSignatureVerification: true,
    appInstallations: false,
  };

  private organizationUrl: string;
  private project: string;
  private pat: string;

  constructor(options: AzureDevOpsProviderOptions) {
    super();
    // Strip trailing slash from org URL
    this.organizationUrl = options.organizationUrl.replace(/\/+$/, "");
    this.project = options.project;
    this.pat = options.pat;
  }

  private get authHeader(): string {
    const encoded = Buffer.from(`:${this.pat}`).toString("base64");
    return `Basic ${encoded}`;
  }

  async verifyWebhook(event: VcsWebhookEvent, secret: string): Promise<boolean> {
    const signature = event.headers["x-azure-signature"];
    if (!signature) {
      // No signature header — reject unless no secret is configured
      return !secret;
    }

    const expected = createHmac("sha256", secret).update(event.rawBody).digest("hex");

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length !== expectedBuf.length) return false;

    return timingSafeEqual(sigBuf, expectedBuf);
  }

  async parseWebhook(event: VcsWebhookEvent): Promise<VcsScanTrigger | null> {
    const body = event.body as Record<string, any>;
    const eventType = body.eventType as string | undefined;

    if (eventType === "git.push") {
      const resource = body.resource ?? {};
      const refUpdates = resource.refUpdates ?? [];
      const firstRef = refUpdates[0];
      if (!firstRef?.newObjectId) return null;

      const repo = resource.repository ?? {};
      const repoName = repo.name ?? "";
      const ref = (firstRef.name ?? "") as string;
      const branch = ref.replace(/^refs\/heads\//, "");
      const pushedBy = resource.pushedBy?.displayName ?? "unknown";

      return {
        provider: "azure_devops",
        type: "push",
        installationId: repo.id ?? "",
        repo: repoName,
        owner: this.project,
        commitHash: firstRef.newObjectId,
        branch,
        author: pushedBy,
      };
    }

    if (
      eventType === "git.pullrequest.created" ||
      eventType === "git.pullrequest.updated"
    ) {
      const resource = body.resource ?? {};
      const repo = resource.repository ?? {};
      const repoName = repo.name ?? "";
      const sourceRef = (resource.sourceRefName ?? "") as string;
      const branch = sourceRef.replace(/^refs\/heads\//, "");
      const commitHash = resource.lastMergeSourceCommit?.commitId ?? "";
      const prId = resource.pullRequestId;
      const author = resource.createdBy?.displayName ?? "unknown";

      if (!prId) return null;

      return {
        provider: "azure_devops",
        type: "pull_request",
        installationId: repo.id ?? "",
        repo: repoName,
        owner: this.project,
        commitHash,
        branch,
        author,
        prNumber: prId,
      };
    }

    return null;
  }

  async fetchDiff(trigger: VcsScanTrigger): Promise<VcsDiffResult> {
    const repoName = trigger.repo;
    const baseUrl = `${this.organizationUrl}/${this.project}/_apis/git/repositories/${repoName}`;

    if (trigger.type === "pull_request" && trigger.prNumber) {
      return this.fetchPrDiff(baseUrl, trigger.prNumber);
    }

    return this.fetchCommitDiff(baseUrl, trigger.commitHash);
  }

  private async fetchPrDiff(baseUrl: string, prNumber: number): Promise<VcsDiffResult> {
    // Get PR iterations to find the latest iteration
    const iterUrl = `${baseUrl}/pullRequests/${prNumber}/iterations?api-version=7.0`;
    const iterResp = await fetch(iterUrl, {
      headers: { Authorization: this.authHeader },
    });
    if (!iterResp.ok) {
      throw new VcsApiError("azure_devops", iterResp.status, iterResp.statusText, "fetchPrIterations");
    }
    const iterData = (await iterResp.json()) as { value?: Array<{ id: number }> };
    const iterations = iterData.value ?? [];
    if (iterations.length === 0) {
      return { rawDiff: "", files: [] };
    }

    const lastIterId = iterations[iterations.length - 1].id;
    const changesUrl = `${baseUrl}/pullRequests/${prNumber}/iterations/${lastIterId}/changes?api-version=7.0`;
    const changesResp = await fetch(changesUrl, {
      headers: { Authorization: this.authHeader },
    });
    if (!changesResp.ok) {
      throw new VcsApiError("azure_devops", changesResp.status, changesResp.statusText, "fetchPrChanges");
    }
    const changesData = (await changesResp.json()) as { changeEntries?: Array<{ item?: { path?: string }; changeType: string }> };
    const entries = changesData.changeEntries ?? [];

    const files = entries.map((c) => ({
      path: c.item?.path?.replace(/^\//, "") ?? "",
      status: this.mapChangeType(c.changeType),
    }));

    const rawDiff = files
      .map((f) => `diff --git a/${f.path} b/${f.path}`)
      .join("\n");

    return { rawDiff, files };
  }

  private async fetchCommitDiff(baseUrl: string, commitHash: string): Promise<VcsDiffResult> {
    // First get the commit to find its parent SHA
    const commitUrl = `${baseUrl}/commits/${commitHash}?api-version=7.0`;
    const commitResp = await fetch(commitUrl, {
      headers: { Authorization: this.authHeader },
    });
    if (!commitResp.ok) {
      throw new VcsApiError("azure_devops", commitResp.status, commitResp.statusText, "fetchCommit");
    }
    const commitData = (await commitResp.json()) as { parents?: string[] };
    const parentHash = commitData.parents?.[0];
    if (!parentHash) {
      return { rawDiff: "", files: [] };
    }

    // Compare parent to current commit using proper SHAs
    const diffUrl = `${baseUrl}/diffs/commits?baseVersion=${parentHash}&baseVersionType=commit&targetVersion=${commitHash}&targetVersionType=commit&api-version=7.0`;
    const response = await fetch(diffUrl, {
      headers: { Authorization: this.authHeader },
    });
    if (!response.ok) {
      throw new VcsApiError("azure_devops", response.status, response.statusText, "fetchDiff");
    }

    const data = (await response.json()) as AzureCommitDiff;
    const files = (data.changes ?? []).map((c) => ({
      path: c.item?.path?.replace(/^\//, "") ?? "",
      status: this.mapChangeType(c.changeType),
    }));

    // Azure DevOps commit diff API returns file-level changes only,
    // not unified diff content. Build headers for downstream processing.
    const rawDiff = files
      .map((f) => `diff --git a/${f.path} b/${f.path}`)
      .join("\n");

    return { rawDiff, files };
  }

  async reportStatus(trigger: VcsScanTrigger, report: VcsStatusReport): Promise<void> {
    const repoName = trigger.repo;
    const baseUrl = `${this.organizationUrl}/${this.project}/_apis/git/repositories/${repoName}`;

    // Post commit status
    const statusUrl = `${baseUrl}/commits/${report.commitHash}/statuses?api-version=7.0`;
    const state = this.mapStatus(report.status);

    const statusResp = await fetch(statusUrl, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state,
        description: report.summary.slice(0, 255),
        context: {
          name: "sentinel-scan",
          genre: "security",
        },
        targetUrl: report.detailsUrl ?? "",
      }),
    });
    if (!statusResp.ok) {
      throw new VcsApiError("azure_devops", statusResp.status, statusResp.statusText, "reportStatus");
    }

    // Post PR comment thread if applicable
    if (trigger.prNumber && report.annotations.length > 0) {
      const threadUrl = `${baseUrl}/pullRequests/${trigger.prNumber}/threads?api-version=7.0`;
      const commentBody = this.formatPrComment(report);

      const threadResp = await fetch(threadUrl, {
        method: "POST",
        headers: {
          Authorization: this.authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comments: [
            {
              parentCommentId: 0,
              content: commentBody,
              commentType: 1, // text
            },
          ],
          status: 1, // active
        }),
      });
      if (!threadResp.ok) {
        throw new VcsApiError("azure_devops", threadResp.status, threadResp.statusText, "reportPrComment");
      }
    }
  }

  async getInstallationToken(_installationId: string): Promise<string> {
    return Buffer.from(`:${this.pat}`).toString("base64");
  }

  // --- private helpers ---

  private mapStatus(status: string): "succeeded" | "failed" | "pending" | "error" {
    switch (status) {
      case "full_pass":
      case "provisional_pass":
        return "succeeded";
      case "fail":
      case "revoked":
        return "failed";
      default:
        return "pending";
    }
  }

  private mapChangeType(
    changeType: string,
  ): "added" | "modified" | "deleted" | "renamed" {
    switch (changeType) {
      case "add":
        return "added";
      case "delete":
        return "deleted";
      case "rename":
        return "renamed";
      default:
        return "modified";
    }
  }

}

interface AzureCommitDiff {
  changes?: Array<{
    item?: { path?: string };
    changeType: string;
  }>;
}
