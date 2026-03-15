// tests/e2e/scenarios/pipeline.ts
import type { E2EContext } from "../fixtures/factory.js";
import type { DiffPayload, Scan } from "../services/scan-service.js";
import type { Finding } from "../services/finding-service.js";
import type { Certificate } from "../services/certificate-service.js";

export interface PipelineResult {
  scanId: string;
  scan: Scan;
  findings: Finding[];
  certificate: Certificate | null;
}

export async function submitAndComplete(
  ctx: E2EContext,
  diff: DiffPayload,
  timeoutMs = 45_000,
): Promise<PipelineResult> {
  const { scanId } = await ctx.scanService.submitDiff(diff);
  const scan = await ctx.scanService.pollUntilStatus(scanId, "completed", timeoutMs);
  const { findings } = await ctx.findingService.getFindings({ scanId });
  const certificate = await ctx.certificateService.getCertificate(scanId);
  return { scanId, scan, findings, certificate };
}

export async function submitConcurrent(
  ctx: E2EContext,
  diffs: DiffPayload[],
  timeoutMs = 60_000,
): Promise<PipelineResult[]> {
  const submissions = await Promise.all(
    diffs.map((diff) => ctx.scanService.submitDiff(diff)),
  );
  const results = await Promise.all(
    submissions.map(async ({ scanId }) => {
      const scan = await ctx.scanService.pollUntilStatus(scanId, "completed", timeoutMs);
      const { findings } = await ctx.findingService.getFindings({ scanId });
      const certificate = await ctx.certificateService.getCertificate(scanId);
      return { scanId, scan, findings, certificate };
    }),
  );
  return results;
}
