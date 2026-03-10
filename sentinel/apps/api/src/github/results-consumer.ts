import type { Redis } from "ioredis";
import type { Octokit } from "@octokit/rest";
import type { PrismaClient } from "@sentinel/db";
import type { AssessmentStatus, Finding } from "@sentinel/shared";
import { buildCheckRunComplete, findingsToAnnotations } from "@sentinel/github";
import { createLogger } from "@sentinel/telemetry";

const logger = createLogger({ name: "github-bridge:results" });

export interface ScanResultEvent {
  scanId: string;
  status: string;
  riskScore: number;
  certificateId?: string;
}

export interface ResultsDeps {
  redis: Redis;
  db: PrismaClient;
  getOctokit: (installationId: number) => Octokit;
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function correlationKey(scanId: string): string {
  return `scan:github:${scanId}`;
}

export async function handleScanResult(
  event: ScanResultEvent,
  deps: ResultsDeps,
): Promise<void> {
  const { redis, db, getOctokit } = deps;
  const { scanId, status, riskScore } = event;

  // 1. Try Redis for GitHub context (fast path)
  const correlation = await redis.hgetall(correlationKey(scanId));
  let checkRunId: number | undefined;
  let installationId: number | undefined;
  let owner: string | undefined;
  let repo: string | undefined;
  let commitHash: string | undefined;

  if (correlation?.checkRunId) {
    checkRunId = parseInt(correlation.checkRunId, 10);
    installationId = parseInt(correlation.installationId, 10);
    owner = correlation.owner;
    repo = correlation.repo;
    commitHash = correlation.commitHash;
  } else {
    // Fallback: check scan.triggerMeta in DB
    const scan = await db.scan.findUnique({ where: { id: scanId } });
    const meta = (scan?.triggerMeta ?? {}) as Record<string, unknown>;
    if (meta.checkRunId) {
      checkRunId = meta.checkRunId as number;
      installationId = meta.installationId as number;
      owner = meta.owner as string;
      repo = meta.repo as string;
      commitHash = scan!.commitHash;
    }
  }

  // No GitHub context — this was a CLI/API scan, skip
  if (!checkRunId || !installationId || !owner || !repo) {
    logger.debug({ scanId }, "No GitHub context, skipping Check Run update");
    return;
  }

  // 2. Load findings, sorted by severity (critical first)
  const findings = await db.finding.findMany({
    where: { scanId },
    orderBy: { createdAt: "asc" },
  });

  // Sort by severity rank for annotation priority
  findings.sort(
    (a: any, b: any) =>
      (SEVERITY_RANK[a.severity] ?? 5) - (SEVERITY_RANK[b.severity] ?? 5),
  );

  // 3. Build annotations (handles 50-annotation cap)
  // rawData contains the full original agent Finding (type-specific fields included).
  // Overlay DB columns only when non-null to avoid clobbering rawData values.
  const sharedFindings: Finding[] = findings.map((f: any) => {
    const base = { ...(f.rawData ?? {}) };
    // Always overlay core fields from DB (authoritative)
    base.type = f.type;
    base.file = f.file;
    base.lineStart = f.lineStart;
    base.lineEnd = f.lineEnd;
    base.severity = f.severity;
    // Preserve original string confidence from rawData (DB stores as float)
    if (!base.confidence) base.confidence = f.severity === "critical" ? "high" : "medium";
    // Overlay nullable fields only when DB has a value
    if (f.title != null) base.title = f.title;
    if (f.description != null) base.description = f.description;
    if (f.remediation != null) base.remediation = f.remediation;
    return base as Finding;
  });

  const annotations = findingsToAnnotations(sharedFindings);

  // 4. Build and post completed Check Run
  const checkRunPayload = buildCheckRunComplete(
    scanId,
    status as AssessmentStatus,
    riskScore,
    annotations,
  );

  const octokit = getOctokit(installationId);
  await octokit.rest.checks.update({
    owner,
    repo,
    check_run_id: checkRunId,
    status: checkRunPayload.status,
    conclusion: checkRunPayload.conclusion,
    output: checkRunPayload.output,
  });

  // 5. Cleanup
  await redis.del(correlationKey(scanId));

  logger.info({
    scanId,
    checkRunId,
    status,
    riskScore,
    annotationCount: annotations.length,
    findingCount: findings.length,
  }, "Check Run updated with scan results");
}
