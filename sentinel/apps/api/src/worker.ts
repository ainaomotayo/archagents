import { Redis } from "ioredis";
import { EventBus } from "@sentinel/events";
import { Assessor } from "@sentinel/assessor";
import { getDb, disconnectDb } from "@sentinel/db";
import { createAssessmentStore } from "./stores.js";

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
    };
    pendingScans.set(scanId, pending);
  }

  pending.findings.push({ scanId, agentName, findings, agentResult });
  pending.agents.add(agentName);

  if (EXPECTED_AGENTS.every((a) => pending!.agents.has(a))) {
    clearTimeout(pending.timer);
    await finalizeScan(scanId, false);
  }
}

async function finalizeScan(scanId: string, hasTimeouts: boolean) {
  const pending = pendingScans.get(scanId);
  if (!pending) return;
  pendingScans.delete(scanId);

  const scan = await db.scan.findUnique({ where: { id: scanId } });
  if (!scan) {
    console.error(`Scan ${scanId} not found, skipping assessment`);
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

    console.log(`Scan ${scanId} assessed: ${assessment.status} (score: ${assessment.riskScore})`);
  } catch (err) {
    console.error(`Failed to assess scan ${scanId}:`, err);
    await db.scan.update({
      where: { id: scanId },
      data: { status: "failed", completedAt: new Date() },
    });
  }
}

// Graceful shutdown
const shutdown = async () => {
  console.log("Assessor worker shutting down...");
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

console.log("Assessor worker started, consuming sentinel.findings...");
