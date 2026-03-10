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

  // Idempotency: skip if this commit+PR was already processed
  const idempotencyKey = `scan:trigger:${trigger.commitHash}:${trigger.prNumber ?? "push"}`;
  const isNew = await redis.hsetnx(idempotencyKey, "status", "processing");
  if (!isNew) {
    logger.info({ commit: trigger.commitHash, prNumber: trigger.prNumber }, "Duplicate trigger, skipping");
    return;
  }
  await redis.expire(idempotencyKey, CORRELATION_TTL);

  // Fetch diff from GitHub
  const rawDiff = await fetchDiff(octokit as any, {
    type: trigger.type,
    owner: trigger.owner,
    repo: trigger.repo,
    commitHash: trigger.commitHash,
    branch: trigger.branch,
    prNumber: trigger.prNumber,
  });

  // Parse diff into structured payload
  const diffFiles = parseDiff(rawDiff);

  // Create Scan in DB first (need scanId for Check Run summary)
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
      },
    },
  });

  // Create "in_progress" Check Run (after scan so we have real scanId)
  let checkRunId: number | undefined;
  const checkRunPayload = buildCheckRunCreate(scan.id, trigger.commitHash);
  try {
    const checkRes = await octokit.rest.checks.create({
      owner: trigger.owner,
      repo: repoName,
      ...checkRunPayload,
    });
    checkRunId = checkRes.data.id;
  } catch (err) {
    // Non-fatal: scan still runs, just no Check Run on PR
    logger.error({ scanId: scan.id, err }, "Failed to create Check Run");
  }

  if (!rawDiff.trim()) {
    // Complete the Check Run as neutral before bailing
    if (checkRunId) {
      try {
        await octokit.rest.checks.update({
          owner: trigger.owner,
          repo: repoName,
          check_run_id: checkRunId,
          status: "completed",
          conclusion: "neutral",
          output: { title: "SENTINEL: No changes to scan", summary: "The diff was empty." },
        });
      } catch { /* best-effort */ }
    }
    logger.warn({ repo: trigger.repo, commit: trigger.commitHash }, "Empty diff, skipping");
    return;
  }

  // Store correlation for results consumer + update scan with checkRunId
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

    // Update triggerMeta with the checkRunId
    await db.scan.update({
      where: { id: scan.id },
      data: {
        triggerMeta: {
          installationId: trigger.installationId,
          owner: trigger.owner,
          repo: trigger.repo,
          prNumber: trigger.prNumber ?? null,
          checkRunId,
        },
      },
    });
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
