import type { Redis } from "ioredis";
import type { Octokit } from "@octokit/rest";
import type { EventBus } from "@sentinel/events";
import type { PrismaClient } from "@sentinel/db";
import { buildCheckRunCreate } from "@sentinel/github";
import { parseDiff } from "@sentinel/shared";
import { createLogger } from "@sentinel/telemetry";
import { fetchDiff } from "./diff-fetcher.js";
import { checkRateLimit } from "./rate-limiter.js";

const logger = createLogger({ name: "github-bridge:triggers" });

const CORRELATION_TTL = 86400; // 24 hours

export interface ScanTriggerEvent {
  type: "push" | "pull_request";
  installationId: number;
  repo: string;
  owner: string;
  commitHash: string;
  branch: string;
  author: string;
  prNumber?: number;
  orgId: string;
}

export interface TriggerDeps {
  redis: Redis;
  db: PrismaClient;
  publishBus: EventBus;
  getOctokit: (installationId: number) => Octokit;
}

function correlationKey(scanId: string): string {
  return `scan:github:${scanId}`;
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const langMap: Record<string, string> = {
    py: "python", js: "javascript", ts: "typescript", tsx: "typescript",
    jsx: "javascript", go: "go", rs: "rust", java: "java", rb: "ruby",
    cs: "csharp", cpp: "cpp", c: "c", swift: "swift", kt: "kotlin",
  };
  return langMap[ext] ?? "unknown";
}

export async function handleScanTrigger(
  trigger: ScanTriggerEvent,
  deps: TriggerDeps,
): Promise<void> {
  const { redis, db, publishBus, getOctokit } = deps;
  const octokit = getOctokit(trigger.installationId);
  const repoName = trigger.repo.includes("/")
    ? trigger.repo.split("/")[1]
    : trigger.repo;

  // Rate limit check
  const allowed = await checkRateLimit(redis, trigger.installationId);
  if (!allowed) {
    throw new Error(`Rate limited for installation ${trigger.installationId}`);
  }

  // Resolve or auto-create project
  let project = await db.project.findFirst({
    where: { repoUrl: `https://github.com/${trigger.repo}`, orgId: trigger.orgId },
  });
  if (!project) {
    project = await db.project.create({
      data: {
        name: trigger.repo,
        repoUrl: `https://github.com/${trigger.repo}`,
        orgId: trigger.orgId,
      },
    });
    logger.info({ repo: trigger.repo, projectId: project.id }, "Auto-created project");
  }

  // Idempotency: check if this trigger was already processed
  const idempotencyKey = `scan:trigger:${trigger.commitHash}:${trigger.prNumber ?? "push"}`;
  const isNew = await redis.hsetnx(idempotencyKey, "status", "processing");

  let checkRunId: number | undefined;

  if (isNew) {
    // Create "in_progress" Check Run
    const checkRunPayload = buildCheckRunCreate("pending", trigger.commitHash);
    const checkRes = await octokit.rest.checks.create({
      owner: trigger.owner,
      repo: repoName,
      ...checkRunPayload,
    });
    checkRunId = checkRes.data.id;
    await redis.expire(idempotencyKey, CORRELATION_TTL);
  }

  // Fetch diff from GitHub
  const rawDiff = await fetchDiff(octokit as any, {
    type: trigger.type,
    owner: trigger.owner,
    repo: trigger.repo,
    commitHash: trigger.commitHash,
    branch: trigger.branch,
    prNumber: trigger.prNumber,
  });

  if (!rawDiff.trim()) {
    logger.warn({ repo: trigger.repo, commit: trigger.commitHash }, "Empty diff, skipping");
    return;
  }

  // Parse diff into structured payload
  const diffFiles = parseDiff(rawDiff);

  // Create Scan in DB
  const scan = await db.scan.create({
    data: {
      projectId: project.id,
      orgId: trigger.orgId,
      commitHash: trigger.commitHash,
      branch: trigger.branch,
      author: trigger.author,
      status: "pending",
      triggerType: "webhook",
      triggerMeta: {
        installationId: trigger.installationId,
        owner: trigger.owner,
        repo: trigger.repo,
        prNumber: trigger.prNumber ?? null,
        checkRunId: checkRunId ?? null,
      },
    },
  });

  // Store correlation for results consumer
  if (checkRunId) {
    const key = correlationKey(scan.id);
    await redis.hset(key, {
      checkRunId: String(checkRunId),
      installationId: String(trigger.installationId),
      owner: trigger.owner,
      repo: repoName,
      commitHash: trigger.commitHash,
    });
    await redis.expire(key, CORRELATION_TTL);
  }

  // Publish to sentinel.diffs — agents pick this up
  await publishBus.publish("sentinel.diffs", {
    scanId: scan.id,
    payload: {
      projectId: project.id,
      commitHash: trigger.commitHash,
      branch: trigger.branch,
      author: trigger.author,
      timestamp: new Date().toISOString(),
      files: diffFiles.map((f) => ({
        path: f.path,
        language: detectLanguage(f.path),
        hunks: f.hunks,
        aiScore: 0,
      })),
      scanConfig: {
        securityLevel: "standard" as const,
        licensePolicy: "",
        qualityThreshold: 0.7,
      },
    },
    submittedAt: new Date().toISOString(),
  });

  logger.info({
    scanId: scan.id,
    repo: trigger.repo,
    commit: trigger.commitHash,
    checkRunId,
    files: diffFiles.length,
  }, "Scan triggered from webhook");
}
