import { timingSafeEqual } from "node:crypto";
import { Gitlab } from "@gitbeaker/rest";
import { VcsProviderBase, VcsApiError } from "../base.js";
import type {
  VcsCapabilities,
  VcsScanTrigger,
  VcsWebhookEvent,
  VcsDiffResult,
  VcsStatusReport,
  VcsProviderType,
} from "../types.js";

export interface GitLabProviderOptions {
  host?: string;
  token: string;
}

export class GitLabProvider extends VcsProviderBase {
  readonly name = "GitLab";
  readonly type: VcsProviderType = "gitlab";
  readonly capabilities: VcsCapabilities = {
    checkRuns: false,
    commitStatus: true,
    prComments: true,
    prAnnotations: false,
    webhookSignatureVerification: true,
    appInstallations: false,
  };

  private client: InstanceType<typeof Gitlab>;

  constructor(options: GitLabProviderOptions) {
    super();
    this.client = new Gitlab({
      host: options.host ?? "https://gitlab.com",
      token: options.token,
    });
  }

  async verifyWebhook(event: VcsWebhookEvent, secret: string): Promise<boolean> {
    const token = event.headers["x-gitlab-token"];
    if (!token) return false;

    const a = Buffer.from(token);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;

    return timingSafeEqual(a, b);
  }

  async parseWebhook(event: VcsWebhookEvent): Promise<VcsScanTrigger | null> {
    const eventType = event.headers["x-gitlab-event"];
    const body = event.body as Record<string, any>;

    if (eventType === "Push Hook") {
      const project = body.project ?? {};
      const repo = project.path_with_namespace ?? "";
      const owner = repo.split("/").slice(0, -1).join("/") || repo;
      const commitHash = body.checkout_sha;
      const ref = (body.ref ?? "") as string;
      const branch = ref.replace(/^refs\/heads\//, "");
      const userName = body.user_name ?? "unknown";

      if (!commitHash) return null;

      return {
        provider: "gitlab",
        type: "push",
        installationId: String(project.id ?? ""),
        repo,
        owner,
        commitHash,
        branch,
        author: userName,
        projectId: project.id,
      };
    }

    if (eventType === "Merge Request Hook") {
      const attrs = body.object_attributes ?? {};
      const action = attrs.action;

      if (!["open", "reopen", "update"].includes(action)) {
        return null;
      }

      const project = body.project ?? {};
      const repo = project.path_with_namespace ?? "";
      const owner = repo.split("/").slice(0, -1).join("/") || repo;
      const lastCommit = attrs.last_commit ?? {};

      return {
        provider: "gitlab",
        type: "merge_request",
        installationId: String(project.id ?? ""),
        repo,
        owner,
        commitHash: lastCommit.id ?? attrs.last_commit?.id ?? "",
        branch: attrs.source_branch ?? "",
        author: lastCommit.author?.name ?? body.user?.name ?? "unknown",
        prNumber: attrs.iid,
        projectId: project.id,
      };
    }

    return null;
  }

  async fetchDiff(trigger: VcsScanTrigger): Promise<VcsDiffResult> {
    try {
      const projectId = trigger.projectId!;

      if (trigger.type === "merge_request" && trigger.prNumber) {
        const diffs = await this.client.MergeRequests.allDiffs(projectId, trigger.prNumber);

        return this.buildDiffResult(diffs as GitLabDiff[]);
      }

      // Push: compare parent commit to current
      const comparison = await this.client.Repositories.compare(
        projectId,
        `${trigger.commitHash}~1`,
        trigger.commitHash,
      );

      return this.buildDiffResult((comparison as any).diffs ?? []);
    } catch (err: any) {
      if (err instanceof VcsApiError) throw err;
      throw new VcsApiError("gitlab", err.cause?.response?.status ?? 500, err.message ?? "Unknown error", "fetchDiff");
    }
  }

  async reportStatus(trigger: VcsScanTrigger, report: VcsStatusReport): Promise<void> {
    try {
      const projectId = trigger.projectId!;

      const state = this.mapStatus(report.status);

      await this.client.Commits.editStatus(projectId, report.commitHash, state, {
        name: "Sentinel Security",
        description: report.summary.slice(0, 255),
        targetUrl: report.detailsUrl,
      });

      if (trigger.prNumber && report.annotations.length > 0) {
        const body = this.formatPrComment(report);
        await this.client.MergeRequestNotes.create(projectId, trigger.prNumber, body);
      }
    } catch (err: any) {
      if (err instanceof VcsApiError) throw err;
      throw new VcsApiError("gitlab", err.cause?.response?.status ?? 500, err.message ?? "Unknown error", "reportStatus");
    }
  }

  async getInstallationToken(_installationId: string): Promise<string> {
    return "configured-at-init";
  }

  // --- private helpers ---

  private mapStatus(status: string): "pending" | "running" | "success" | "failed" | "canceled" {
    switch (status) {
      case "full_pass":
      case "provisional_pass":
        return "success";
      case "fail":
      case "revoked":
        return "failed";
      default:
        return "pending";
    }
  }

  private buildDiffResult(diffs: GitLabDiff[]): VcsDiffResult {
    const files = diffs.map((d) => ({
      path: d.new_path || d.old_path,
      status: this.mapDiffStatus(d),
    }));

    const rawDiff = diffs
      .map((d) => {
        const header = `diff --git a/${d.old_path} b/${d.new_path}`;
        return `${header}\n${d.diff ?? ""}`;
      })
      .join("\n");

    return { rawDiff, files };
  }

  private mapDiffStatus(
    diff: GitLabDiff,
  ): "added" | "modified" | "deleted" | "renamed" {
    if (diff.new_file) return "added";
    if (diff.deleted_file) return "deleted";
    if (diff.renamed_file) return "renamed";
    return "modified";
  }
}

interface GitLabDiff {
  old_path: string;
  new_path: string;
  diff?: string;
  new_file?: boolean;
  deleted_file?: boolean;
  renamed_file?: boolean;
}
