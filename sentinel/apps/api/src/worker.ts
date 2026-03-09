import { Redis } from "ioredis";
import { EventBus } from "@sentinel/events";
import { Assessor } from "@sentinel/assessor";
import { getDb, disconnectDb } from "@sentinel/db";
import {
  createLogger,
  findingsTotal,
  agentResultsTotal,
  pendingScansGauge,
  scanDuration,
} from "@sentinel/telemetry";
import { createAssessmentStore } from "./stores.js";

const logger = createLogger({ name: "sentinel-worker" });

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const eventBus = new EventBus(redis);
const db = getDb();
const assessor = new Assessor();
const store = createAssessmentStore(db);

const EXPECTED_AGENTS = ["security", "ip-license", "dependency", "ai-detector", "quality", "policy"];
const AGENT_TIMEOUT_MS = parseInt(process.env.AGENT_TIMEOUT_MS ?? "30000", 10);

interface PendingScan {
  findings: any[];
  agents: Set<string>;
  timer: ReturnType<typeof setTimeout>;
  startedAt: number;
}

const pendingScans = new Map<string, PendingScan>();

async function handleFinding(_id: string, data: Record<string, unknown>) {
  const { scanId, agentName, findings, agentResult } = data as any;

  let pending = pendingScans.get(scanId);
  if (!pending) {
    pending = {
      findings: [],
      agents: new Set(),
      timer: setTimeout(() => finalizeScan(scanId, true), AGENT_TIMEOUT_MS),
      startedAt: performance.now(),
    };
    pendingScans.set(scanId, pending);
    pendingScansGauge.set(pendingScans.size);
  }

  pending.findings.push({ scanId, agentName, findings, agentResult });
  pending.agents.add(agentName);

  // Track per-finding metrics
  if (Array.isArray(findings)) {
    for (const f of findings) {
      findingsTotal.inc({ severity: f.severity ?? "unknown", agent: agentName });
    }
  }
  agentResultsTotal.inc({ agent: agentName, status: "received" });

  logger.info({ scanId, agentName, findingsCount: Array.isArray(findings) ? findings.length : 0 }, "Agent finding received");

  if (EXPECTED_AGENTS.every((a) => pending!.agents.has(a))) {
    clearTimeout(pending.timer);
    await finalizeScan(scanId, false);
  }
}

async function finalizeScan(scanId: string, hasTimeouts: boolean) {
  const pending = pendingScans.get(scanId);
  if (!pending) return;
  pendingScans.delete(scanId);
  pendingScansGauge.set(pendingScans.size);

  const scan = await db.scan.findUnique({ where: { id: scanId } });
  if (!scan) {
    logger.error({ scanId }, "Scan not found, skipping assessment");
    return;
  }

  try {
    const assessment = assessor.assess({
      scanId,
      projectId: scan.projectId,
      commitHash: scan.commitHash,
      findingEvents: pending.findings,
      hasTimeouts,
      orgSecret: process.env.SENTINEL_SECRET!,
    });

    await assessor.persist(store, assessment, scanId, scan.orgId);

    await eventBus.publish("sentinel.results", {
      scanId,
      status: assessment.status,
      riskScore: assessment.riskScore,
      certificateId: assessment.certificate?.id,
    });

    const durationSec = (performance.now() - pending.startedAt) / 1000;
    scanDuration.observe({ status: assessment.status }, durationSec);

    logger.info({ scanId, status: assessment.status, riskScore: assessment.riskScore, durationSec }, "Scan assessed");
  } catch (err) {
    logger.error({ scanId, err }, "Failed to assess scan");
    await db.scan.update({
      where: { id: scanId },
      data: { status: "failed", completedAt: new Date() },
    });
  }
}

// Graceful shutdown
const shutdown = async () => {
  logger.info("Assessor worker shutting down...");
  for (const [scanId, pending] of pendingScans) {
    clearTimeout(pending.timer);
    await finalizeScan(scanId, true);
  }
  await eventBus.disconnect();
  await disconnectDb();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start consuming
eventBus.subscribe(
  "sentinel.findings",
  "assessors",
  `assessor-${process.pid}`,
  handleFinding,
);

logger.info("Assessor worker started, consuming sentinel.findings...");
