import { createHmac, timingSafeEqual } from "node:crypto";
import { VcsProviderBase } from "../base.js";
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
      // Azure DevOps service hooks without secret — allow through
      return true;
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

    // Use commit diff endpoint: compare commit to its parent
    const url = `${baseUrl}/diffs/commits?baseVersion=${trigger.commitHash}~1&targetVersion=${trigger.commitHash}&api-version=7.0`;

    const response = await fetch(url, {
      headers: { Authorization: this.authHeader },
    });

    if (!response.ok) {
      throw new Error(
        `Azure DevOps diff fetch failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as AzureCommitDiff;
    const files = (data.changes ?? []).map((c) => ({
      path: c.item?.path?.replace(/^\//, "") ?? "",
      status: this.mapChangeType(c.changeType),
    }));

    // Azure DevOps commit diff API doesn't return raw unified diff,
    // so we construct a minimal representation
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

    await fetch(statusUrl, {
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

    // Post PR comment thread if applicable
    if (trigger.prNumber && report.annotations.length > 0) {
      const threadUrl = `${baseUrl}/pullRequests/${trigger.prNumber}/threads?api-version=7.0`;
      const commentBody = this.formatPrComment(report);

      await fetch(threadUrl, {
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

  private formatPrComment(report: VcsStatusReport): string {
    const icon =
      report.status === "full_pass" || report.status === "provisional_pass"
        ? "✅"
        : "❌";
    const lines = [
      `## ${icon} Sentinel Scan Results`,
      "",
      `**Status:** ${report.status} | **Risk Score:** ${report.riskScore}`,
      "",
      report.summary,
    ];

    if (report.annotations.length > 0) {
      lines.push("", "### Findings", "");
      for (const a of report.annotations.slice(0, 10)) {
        lines.push(
          `- **${a.title}** (${a.level}) — \`${a.file}:${a.lineStart}\`: ${a.message}`,
        );
      }
      if (report.annotations.length > 10) {
        lines.push(`- _...and ${report.annotations.length - 10} more_`);
      }
    }

    if (report.detailsUrl) {
      lines.push("", `[View full report](${report.detailsUrl})`);
    }

    return lines.join("\n");
  }
}

interface AzureCommitDiff {
  changes?: Array<{
    item?: { path?: string };
    changeType: string;
  }>;
}
