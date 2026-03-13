/**
 * VCS Bridge Service — generalized multi-provider bridge that replaces the
 * GitHub-only github-bridge.ts.  Consumes sentinel.scan-triggers and
 * sentinel.results Redis streams, dispatching to the correct VCS provider
 * via a VcsProviderRegistry.
 */
import http from "node:http";
import { Redis } from "ioredis";
import { EventBus, withRetry } from "@sentinel/events";
import { getDb, disconnectDb } from "@sentinel/db";
import type { PrismaClient } from "@sentinel/db";
import type { Finding } from "@sentinel/shared";
import { parseDiff } from "@sentinel/shared";
import { handleVcsResult } from "./vcs/results-consumer.js";
import type { VcsResultEvent } from "./vcs/results-consumer.js";
import { createLogger, initTracing, shutdownTracing } from "@sentinel/telemetry";
import {
  VcsProviderRegistry,
  GitHubProvider,
  GitLabProvider,
  BitbucketProvider,
  AzureDevOpsProvider,
  VcsRateLimiter,
} from "@sentinel/vcs";
import type {
  VcsProvider,
  VcsProviderType,
  VcsScanTrigger,
  VcsStatusReport,
} from "@sentinel/vcs";

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  initTracing({ serviceName: "vcs-bridge" });
}

const logger = createLogger({ name: "vcs-bridge" });

// ---------------------------------------------------------------------------
// Provider registration
// ---------------------------------------------------------------------------

const registry = new VcsProviderRegistry();

if (process.env.VCS_GITHUB_ENABLED === "true") {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_PRIVATE_KEY;
  if (!appId || !privateKey) {
    logger.error("VCS_GITHUB_ENABLED=true but GITHUB_APP_ID / GITHUB_PRIVATE_KEY missing");
    process.exit(1);
  }
  registry.register(new GitHubProvider({ appId, privateKey }));
  logger.info("Registered GitHub provider");
}

if (process.env.VCS_GITLAB_ENABLED === "true") {
  const token = process.env.GITLAB_TOKEN;
  if (!token) {
    logger.error("VCS_GITLAB_ENABLED=true but GITLAB_TOKEN missing");
    process.exit(1);
  }
  registry.register(
    new GitLabProvider({
      token,
      host: process.env.GITLAB_URL ?? "https://gitlab.com",
    }),
  );
  logger.info("Registered GitLab provider");
}

if (process.env.VCS_BITBUCKET_ENABLED === "true") {
  const workspace = process.env.BITBUCKET_WORKSPACE;
  const username = process.env.BITBUCKET_USERNAME;
  const appPassword = process.env.BITBUCKET_APP_PASSWORD;
  if (!workspace || !username || !appPassword) {
    logger.error(
      "VCS_BITBUCKET_ENABLED=true but BITBUCKET_WORKSPACE / BITBUCKET_USERNAME / BITBUCKET_APP_PASSWORD missing",
    );
    process.exit(1);
  }
  registry.register(new BitbucketProvider({ workspace, username, appPassword }));
  logger.info("Registered Bitbucket provider");
}

if (process.env.VCS_AZURE_DEVOPS_ENABLED === "true") {
  const organizationUrl = process.env.AZURE_DEVOPS_ORG_URL;
  const project = process.env.AZURE_DEVOPS_PROJECT;
  const pat = process.env.AZURE_DEVOPS_PAT;
  if (!organizationUrl || !project || !pat) {
    logger.error(
      "VCS_AZURE_DEVOPS_ENABLED=true but AZURE_DEVOPS_ORG_URL / AZURE_DEVOPS_PROJECT / AZURE_DEVOPS_PAT missing",
    );
    process.exit(1);
  }
  registry.register(new AzureDevOpsProvider({ organizationUrl, project, pat }));
  logger.info("Registered Azure DevOps provider");
}

const enabledProviders = registry.list();
if (enabledProviders.length === 0) {
  logger.error(
    "No VCS providers enabled. Set at least one of VCS_GITHUB_ENABLED, VCS_GITLAB_ENABLED, VCS_BITBUCKET_ENABLED, VCS_AZURE_DEVOPS_ENABLED=true",
  );
  process.exit(1);
}
logger.info({ providers: enabledProviders }, "VCS bridge starting");

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const redis = new Redis(redisUrl);
const db = getDb();

const triggerBus = new EventBus(new Redis(redisUrl));
const resultsBus = new EventBus(new Redis(redisUrl));
const publishBus = new EventBus(new Redis(redisUrl));

const rateLimiter = new VcsRateLimiter(redis);
const CORRELATION_TTL = 86400; // 24 hours

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function correlationKey(providerType: string, scanId: string): string {
  return `scan:vcs:${providerType}:${scanId}`;
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

function repoUrlForProvider(provider: VcsProviderType, repo: string): string {
  switch (provider) {
    case "github":
      return `https://github.com/${repo}`;
    case "gitlab":
      return `https://gitlab.com/${repo}`;
    case "bitbucket":
      return `https://bitbucket.org/${repo}`;
    case "azure_devops":
      return `https://dev.azure.com/${repo}`;
    default:
      return repo;
  }
}

// ---------------------------------------------------------------------------
// Consumer 1: sentinel.scan-triggers
// ---------------------------------------------------------------------------

interface ScanTriggerData {
  provider: VcsProviderType;
  type: "push" | "pull_request" | "merge_request";
  installationId: string;
  repo: string;
  owner: string;
  commitHash: string;
  branch: string;
  author: string;
  prNumber?: number;
  projectId?: number;
  orgId: string;
  metadata?: Record<string, unknown>;
}

async function handleScanTrigger(
  data: ScanTriggerData,
  deps: { redis: Redis; db: PrismaClient; publishBus: EventBus },
): Promise<void> {
  const provider = registry.get(data.provider);
  if (!provider) {
    logger.warn({ provider: data.provider }, "No registered provider for trigger, skipping");
    return;
  }

  const trigger: VcsScanTrigger = {
    provider: data.provider,
    type: data.type,
    installationId: data.installationId,
    repo: data.repo,
    owner: data.owner,
    commitHash: data.commitHash,
    branch: data.branch,
    author: data.author,
    prNumber: data.prNumber,
    projectId: data.projectId,
    metadata: data.metadata,
  };

  // Resolve or auto-create project
  const repoUrl = repoUrlForProvider(data.provider, data.repo);
  let project = await deps.db.project.findFirst({
    where: { repoUrl, orgId: data.orgId },
  });
  if (!project) {
    project = await deps.db.project.create({
      data: { name: data.repo, repoUrl, orgId: data.orgId },
    });
    logger.info({ repo: data.repo, projectId: project.id }, "Auto-created project");
  }

  // Idempotency check
  const idempotencyKey = `scan:trigger:${data.commitHash}:${data.prNumber ?? "push"}`;
  const isNew = await deps.redis.hsetnx(idempotencyKey, "status", "processing");
  if (!isNew) {
    logger.info({ commit: data.commitHash, prNumber: data.prNumber }, "Duplicate trigger, skipping");
    return;
  }
  await deps.redis.expire(idempotencyKey, CORRELATION_TTL);

  // Rate limit check before calling provider API
  const allowed = await rateLimiter.check(data.provider, data.installationId);
  if (!allowed) {
    logger.warn({ provider: data.provider, installationId: data.installationId }, "Rate limit exceeded, skipping");
    return;
  }

  // Fetch diff via the provider
  const diffResult = await provider.fetchDiff(trigger);

  // Parse diff
  const diffFiles = parseDiff(diffResult.rawDiff);

  // Create Scan in DB
  const scan = await deps.db.scan.create({
    data: {
      projectId: project.id,
      orgId: data.orgId,
      commitHash: data.commitHash,
      branch: data.branch,
      author: data.author,
      status: "pending",
      triggerType: "webhook",
      triggerMeta: {
        provider: data.provider,
        installationId: data.installationId,
        owner: data.owner,
        repo: data.repo,
        prNumber: data.prNumber ?? null,
      },
    },
  });

  if (!diffResult.rawDiff.trim()) {
    logger.warn({ repo: data.repo, commit: data.commitHash }, "Empty diff, skipping");
    return;
  }

  // Store correlation for results consumer
  const corrKey = correlationKey(data.provider, scan.id);
  await deps.redis.hset(corrKey, {
    provider: data.provider,
    installationId: data.installationId,
    owner: data.owner,
    repo: data.repo,
    commitHash: data.commitHash,
    prNumber: String(data.prNumber ?? ""),
    projectId: String(project.id),
  });
  await deps.redis.expire(corrKey, CORRELATION_TTL);

  // Publish to sentinel.diffs for agents
  await deps.publishBus.publish("sentinel.diffs", {
    scanId: scan.id,
    payload: {
      projectId: project.id,
      commitHash: data.commitHash,
      branch: data.branch,
      author: data.author,
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
    provider: data.provider,
    repo: data.repo,
    commit: data.commitHash,
    files: diffFiles.length,
  }, "Scan triggered from webhook");
}

// ---------------------------------------------------------------------------
// Consumer 2: sentinel.results — delegates to standalone results-consumer module
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Wire up consumers
// ---------------------------------------------------------------------------

const triggerHandler = withRetry(redis, "sentinel.scan-triggers", async (_id, data) => {
  await handleScanTrigger(data as unknown as ScanTriggerData, { redis, db, publishBus });
}, { maxRetries: 3, baseDelayMs: 2000 });

triggerBus.subscribe(
  "sentinel.scan-triggers",
  "vcs-bridge",
  `vcs-triggers-${process.pid}`,
  triggerHandler,
);
logger.info("Consuming sentinel.scan-triggers...");

const resultsHandler = withRetry(redis, "sentinel.results", async (_id, data) => {
  await handleVcsResult(data as unknown as VcsResultEvent, { redis, db, registry });
}, { maxRetries: 3, baseDelayMs: 2000 });

// Use same consumer group as github-bridge ("github-bridge") so only one processes
// each message. When migrating, stop github-bridge and deploy vcs-bridge instead.
resultsBus.subscribe(
  "sentinel.results",
  "github-bridge",
  `vcs-results-${process.pid}`,
  resultsHandler,
);
logger.info("Consuming sentinel.results...");

// ---------------------------------------------------------------------------
// Health server
// ---------------------------------------------------------------------------

const healthPort = parseInt(process.env.VCS_BRIDGE_PORT ?? "9093", 10);
const healthServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        uptime: process.uptime(),
        providers: registry.list(),
      }),
    );
  } else {
    res.writeHead(404);
    res.end();
  }
});
healthServer.listen(healthPort);
logger.info({ port: healthPort }, "Health server listening");

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

const shutdown = async () => {
  logger.info("VCS bridge shutting down...");
  healthServer.close();
  await triggerBus.disconnect();
  await resultsBus.disconnect();
  await publishBus.disconnect();
  await redis.disconnect();
  await shutdownTracing();
  await disconnectDb();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

logger.info("VCS bridge started");
