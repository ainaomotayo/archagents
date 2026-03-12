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

const ANNOTATION_CAP = 50;

interface FindingInput {
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
}
