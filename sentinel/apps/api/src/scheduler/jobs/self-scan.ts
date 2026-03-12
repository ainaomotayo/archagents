import { SELF_SCAN_CONFIG } from "@sentinel/security";
import type { SchedulerJob, JobContext } from "../types.js";

export class SelfScanJob implements SchedulerJob {
  name = "self-scan" as const;
  schedule = SELF_SCAN_CONFIG.schedule;
  tier = "critical" as const;
  dependencies = ["redis"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const scanId = `self-scan-${Date.now()}`;
    await ctx.eventBus.publish("sentinel.diffs", {
      scanId,
      payload: {
        projectId: "self-scan",
        commitHash: `scheduled-${Date.now()}`,
        branch: "main",
        author: "sentinel-scheduler",
        timestamp: new Date().toISOString(),
        files: [],
        toolHints: { tool: "sentinel-self-scan", markers: [] },
        scanConfig: {
          securityLevel: "strict" as const,
          licensePolicy: "default",
          qualityThreshold: 80,
        },
        selfScan: true,
        targets: SELF_SCAN_CONFIG.targets,
        policyPath: SELF_SCAN_CONFIG.policyPath,
      },
      submittedAt: new Date().toISOString(),
      triggeredBy: "scheduler",
    });
    ctx.logger.info(
      { scanId, targets: SELF_SCAN_CONFIG.targets },
      "Self-scan triggered",
    );
  }
}
