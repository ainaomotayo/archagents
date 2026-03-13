import type {
  VcsProvider,
  VcsCapabilities,
  VcsScanTrigger,
  VcsWebhookEvent,
  VcsDiffResult,
  VcsStatusReport,
  VcsAnnotation,
  VcsProviderType,
} from "./types.js";

export class VcsApiError extends Error {
  constructor(
    public readonly provider: VcsProviderType,
    public readonly statusCode: number,
    public readonly statusText: string,
    public readonly operation: string,
  ) {
    super(`${provider} ${operation} failed: ${statusCode} ${statusText}`);
    this.name = "VcsApiError";
  }
}

const ANNOTATION_CAP = 50;

export interface FindingInput {
  file: string;
  lineStart: number;
  lineEnd: number;
  severity: string;
  title: string;
  description: string;
}

export abstract class VcsProviderBase implements VcsProvider {
  abstract readonly name: string;
  abstract readonly type: VcsProviderType;
  abstract readonly capabilities: VcsCapabilities;

  abstract verifyWebhook(event: VcsWebhookEvent, secret: string): Promise<boolean>;
  abstract parseWebhook(event: VcsWebhookEvent): Promise<VcsScanTrigger | null>;
  abstract fetchDiff(trigger: VcsScanTrigger): Promise<VcsDiffResult>;
  abstract reportStatus(trigger: VcsScanTrigger, report: VcsStatusReport): Promise<void>;
  abstract getInstallationToken(installationId: string): Promise<string>;

  rateLimitKey(installationId: string): string {
    return `vcs:ratelimit:${this.type}:${installationId}`;
  }

  correlationKey(scanId: string): string {
    return `scan:vcs:${this.type}:${scanId}`;
  }

  severityToLevel(severity: string): "notice" | "warning" | "failure" {
    switch (severity) {
      case "critical":
      case "high":
        return "failure";
      case "medium":
        return "warning";
      default:
        return "notice";
    }
  }

  formatAnnotations(findings: FindingInput[]): VcsAnnotation[] {
    return findings.slice(0, ANNOTATION_CAP).map((f) => ({
      file: f.file,
      lineStart: f.lineStart,
      lineEnd: f.lineEnd,
      level: this.severityToLevel(f.severity),
      title: f.title,
      message: f.description,
    }));
  }

  formatPrComment(report: VcsStatusReport): string {
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
