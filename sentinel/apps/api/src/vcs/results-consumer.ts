import type { Redis } from "ioredis";
import type { PrismaClient } from "@sentinel/db";
import type { AssessmentStatus } from "@sentinel/shared";
import type { VcsProviderRegistry, VcsScanTrigger, VcsProviderType } from "@sentinel/vcs";
import { createLogger } from "@sentinel/telemetry";

const logger = createLogger({ name: "vcs-bridge:results" });

export interface VcsResultEvent {
  scanId: string;
  status: string;
  riskScore: number;
  certificateId?: string;
}

export interface VcsResultsDeps {
  redis: Redis;
  db: PrismaClient;
  registry: VcsProviderRegistry;
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export async function handleVcsResult(
  event: VcsResultEvent,
  deps: VcsResultsDeps,
): Promise<void> {
  const { redis, db, registry } = deps;
  const { scanId, status, riskScore } = event;

  // Try each registered provider's correlation key
  let provider: VcsProviderType | undefined;
  let correlation: Record<string, string> | undefined;

  for (const type of registry.list()) {
    const key = `scan:vcs:${type}:${scanId}`;
    const data = await redis.hgetall(key);
    if (data?.provider) {
      provider = type;
      correlation = data;
      break;
    }
  }

  // Fallback: check scan.triggerMeta in DB
  if (!provider || !correlation) {
    const scan = await db.scan.findUnique({ where: { id: scanId } });
    const meta = (scan?.triggerMeta ?? {}) as Record<string, unknown>;
    if (meta.provider && registry.has(meta.provider as VcsProviderType)) {
      provider = meta.provider as VcsProviderType;
      correlation = {
        provider: provider,
        installationId: String(meta.installationId ?? ""),
        owner: String(meta.owner ?? ""),
        repo: String(meta.repo ?? ""),
        commitHash: scan!.commitHash,
        prNumber: String(meta.prNumber ?? ""),
        projectId: String(meta.projectId ?? ""),
      };
    }
  }

  if (!provider || !correlation) {
    logger.debug({ scanId }, "No VCS context, skipping status report");
    return;
  }

  const providerInstance = registry.get(provider);
  if (!providerInstance) return;

  // Load findings sorted by severity
  const findings = await db.finding.findMany({
    where: { scanId },
    orderBy: { createdAt: "asc" },
  });
  findings.sort(
    (a: any, b: any) =>
      (SEVERITY_RANK[a.severity] ?? 5) - (SEVERITY_RANK[b.severity] ?? 5),
  );

  // Build annotations using provider base formatAnnotations if available
  const annotations =
    typeof (providerInstance as any).formatAnnotations === "function"
      ? (providerInstance as any).formatAnnotations(
          findings.map((f: any) => ({
            file: f.file,
            lineStart: f.lineStart,
            lineEnd: f.lineEnd,
            severity: f.severity,
            title: f.title ?? f.type,
            description: f.description ?? "",
          })),
        )
      : [];

  // Build trigger for reportStatus
  const trigger: VcsScanTrigger = {
    provider,
    type: correlation.prNumber ? "pull_request" : "push",
    installationId: correlation.installationId,
    repo: correlation.repo,
    owner: correlation.owner,
    commitHash: correlation.commitHash,
    branch: "",
    author: "",
    prNumber: correlation.prNumber
      ? Number(correlation.prNumber)
      : undefined,
    projectId: correlation.projectId
      ? Number(correlation.projectId)
      : undefined,
  };

  await providerInstance.reportStatus(trigger, {
    scanId,
    commitHash: correlation.commitHash,
    status: status as AssessmentStatus,
    riskScore,
    summary: `Scan ${scanId}: ${status.replace(/_/g, " ")} (risk ${riskScore}/100), ${findings.length} findings`,
    annotations,
  });

  // Cleanup correlation
  const key = `scan:vcs:${provider}:${scanId}`;
  await redis.del(key);

  logger.info(
    { scanId, provider, status, riskScore, findings: findings.length },
    "VCS status reported",
  );
}
