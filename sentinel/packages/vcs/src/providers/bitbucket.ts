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

export interface BitbucketProviderOptions {
  workspace: string;
  username: string;
  appPassword: string;
}

const API_BASE = "https://api.bitbucket.org/2.0";

export class BitbucketProvider extends VcsProviderBase {
  readonly name = "Bitbucket Cloud";
  readonly type: VcsProviderType = "bitbucket";
  readonly capabilities: VcsCapabilities = {
    checkRuns: false,
    commitStatus: true,
    prComments: true,
    prAnnotations: false,
    webhookSignatureVerification: true,
    appInstallations: false,
  };

  private workspace: string;
  private username: string;
  private appPassword: string;

  constructor(options: BitbucketProviderOptions) {
    super();
    this.workspace = options.workspace;
    this.username = options.username;
    this.appPassword = options.appPassword;
  }

  private get authHeader(): string {
    const encoded = Buffer.from(`${this.username}:${this.appPassword}`).toString("base64");
    return `Basic ${encoded}`;
  }

  async verifyWebhook(event: VcsWebhookEvent, secret: string): Promise<boolean> {
    const signature = event.headers["x-hub-signature"];
    if (!signature) return false;

    const expected = "sha256=" + createHmac("sha256", secret).update(event.rawBody).digest("hex");

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length !== expectedBuf.length) return false;

    return timingSafeEqual(sigBuf, expectedBuf);
  }

  async parseWebhook(event: VcsWebhookEvent): Promise<VcsScanTrigger | null> {
    const eventKey = event.headers["x-event-key"];
    const body = event.body as Record<string, any>;

    if (eventKey === "repo:push") {
      const change = body.push?.changes?.[0];
      if (!change?.new?.target?.hash) return null;

      const repoData = body.repository ?? {};
      const fullName = repoData.full_name ?? "";
      const owner = fullName.split("/")[0] ?? "";

      return {
        provider: "bitbucket",
        type: "push",
        installationId: repoData.uuid ?? "",
        repo: fullName,
        owner,
        commitHash: change.new.target.hash,
        branch: change.new.name ?? "",
        author: body.actor?.display_name ?? "unknown",
      };
    }

    if (eventKey === "pullrequest:created" || eventKey === "pullrequest:updated") {
      const pr = body.pullrequest;
      if (!pr) return null;

      const repoData = body.repository ?? {};
      const fullName = repoData.full_name ?? "";
      const owner = fullName.split("/")[0] ?? "";

      return {
        provider: "bitbucket",
        type: "pull_request",
        installationId: repoData.uuid ?? "",
        repo: fullName,
        owner,
        commitHash: pr.source?.commit?.hash ?? "",
        branch: pr.source?.branch?.name ?? "",
        author: pr.author?.display_name ?? body.actor?.display_name ?? "unknown",
        prNumber: pr.id,
      };
    }

    return null;
  }

  async fetchDiff(trigger: VcsScanTrigger): Promise<VcsDiffResult> {
    const repo = trigger.repo;
    let url: string;

    if (trigger.type === "pull_request" && trigger.prNumber) {
      url = `${API_BASE}/repositories/${repo}/pullrequests/${trigger.prNumber}/diff`;
    } else {
      url = `${API_BASE}/repositories/${repo}/diff/${trigger.commitHash}`;
    }

    const response = await fetch(url, {
      headers: { Authorization: this.authHeader },
    });

    if (!response.ok) {
      throw new VcsApiError("bitbucket", response.status, response.statusText, "fetchDiff");
    }

    const rawDiff = await response.text();
    const files = this.parseDiffFiles(rawDiff);

    return { rawDiff, files };
  }

  async reportStatus(trigger: VcsScanTrigger, report: VcsStatusReport): Promise<void> {
    try {
      const repo = trigger.repo;

      // Post build status
      const statusUrl = `${API_BASE}/repositories/${repo}/commit/${report.commitHash}/statuses/build`;
      const state = this.mapStatus(report.status);

      const statusResp = await fetch(statusUrl, {
        method: "POST",
        headers: {
          Authorization: this.authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          state,
          key: "sentinel-scan",
          name: "Sentinel Security",
          description: report.summary.slice(0, 255),
          url: report.detailsUrl ?? "",
        }),
      });
      if (!statusResp.ok) {
        throw new VcsApiError("bitbucket", statusResp.status, statusResp.statusText, "reportStatus");
      }

      // Post PR comment if applicable
      if (trigger.prNumber && report.annotations.length > 0) {
        const commentUrl = `${API_BASE}/repositories/${repo}/pullrequests/${trigger.prNumber}/comments`;
        const commentBody = this.formatPrComment(report);

        const commentResp = await fetch(commentUrl, {
          method: "POST",
          headers: {
            Authorization: this.authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: { raw: commentBody },
          }),
        });
        if (!commentResp.ok) {
          throw new VcsApiError("bitbucket", commentResp.status, commentResp.statusText, "reportPrComment");
        }
      }
    } catch (err: any) {
      if (err instanceof VcsApiError) throw err;
      throw new VcsApiError("bitbucket", err.status ?? 500, err.message ?? "Unknown error", "reportStatus");
    }
  }

  async getInstallationToken(_installationId: string): Promise<string> {
    return Buffer.from(`${this.username}:${this.appPassword}`).toString("base64");
  }

  // --- private helpers ---

  private mapStatus(status: string): "SUCCESSFUL" | "FAILED" | "INPROGRESS" | "STOPPED" {
    switch (status) {
      case "full_pass":
      case "provisional_pass":
        return "SUCCESSFUL";
      case "fail":
      case "revoked":
        return "FAILED";
      default:
        return "INPROGRESS";
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

      // Determine status from surrounding context
      const idx = rawDiff.indexOf(header);
      const nextDiff = rawDiff.indexOf("diff --git", idx + header.length);
      const section = rawDiff.slice(idx, nextDiff === -1 ? undefined : nextDiff);

      let status: "added" | "modified" | "deleted" | "renamed" = "modified";
      if (section.includes("new file mode")) {
        status = "added";
      } else if (section.includes("deleted file mode")) {
        status = "deleted";
      } else if (oldPath !== newPath) {
        status = "renamed";
      }

      files.push({ path: newPath, status });
    }

    return files;
  }
}
