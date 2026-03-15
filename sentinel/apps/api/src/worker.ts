import { Redis } from "ioredis";
import { EventBus, withRetry } from "@sentinel/events";
import { Assessor } from "@sentinel/assessor";
import { getDb, disconnectDb } from "@sentinel/db";
import {
  createLogger,
  findingsTotal,
  agentResultsTotal,
  pendingScansGauge,
  scanDuration,
  initTracing,
  shutdownTracing,
} from "@sentinel/telemetry";
import { isArchiveEnabled, archiveToS3, getArchiveConfig } from "@sentinel/security";
import { AIMetricsService, enrichTracesForScan } from "@sentinel/compliance";
import http from "node:http";
import { createAssessmentStore } from "./stores.js";

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  initTracing({ serviceName: "sentinel-worker" });
}

const logger = createLogger({ name: "sentinel-worker" });

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const eventBus = new EventBus(redis);
const db = getDb();
const assessor = new Assessor();
const store = createAssessmentStore(db);

// Only agents that are actually deployed. Additional agents can be added here
// as they come online — the worker will wait for all listed agents or timeout.
const EXPECTED_AGENTS = (process.env.EXPECTED_AGENTS ?? "security,dependency,ip-license")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
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

    // Post-persist hook: enrich AI decision traces with pre-declared metadata
    try {
      const enriched = await enrichTracesForScan(
        db,
        scanId,
        scan.metadata,
        process.env as Record<string, string | undefined>,
      );
      if (enriched > 0) {
        logger.info({ scanId, enriched }, "Decision traces enriched with declared metadata");
      }
    } catch (enrichErr) {
      logger.error({ scanId, err: enrichErr }, "Failed to enrich decision traces (non-fatal)");
    }

    // --- Approval gate check ---
    const { shouldCreateApprovalGate } = await import("./approval-gate.js");
    const requirement = await shouldCreateApprovalGate({
      orgId: scan.orgId,
      scanId,
      projectId: scan.projectId,
      riskScore: assessment.riskScore,
      findings: assessment.findings,
      branch: scan.branch ?? "",
      db,
    });

    if (requirement) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + requirement.slaHours * 60 * 60 * 1000);
      const escalatesAt = new Date(now.getTime() + requirement.escalateAfterHours * 60 * 60 * 1000);

      await db.approvalGate.create({
        data: {
          orgId: scan.orgId,
          scanId,
          projectId: scan.projectId,
          policyId: requirement.policyId,
          status: requirement.autoBlock ? "rejected" : "pending",
          gateType: requirement.gateType,
          triggerCriteria: requirement.triggerCriteria as any,
          priority: requirement.priority,
          assignedRole: requirement.assigneeRole,
          requestedBy: "system",
          expiresAt,
          escalatesAt,
          expiryAction: requirement.expiryAction,
        },
      });

      await db.scan.update({
        where: { id: scanId },
        data: {
          approvalStatus: requirement.autoBlock ? "rejected" : "pending_approval",
          status: "completed",
          completedAt: new Date(),
        },
      });

      await eventBus.publish("sentinel.approvals", {
        type: requirement.autoBlock ? "gate.auto_blocked" : "gate.created",
        scanId,
        orgId: scan.orgId,
        gateType: requirement.gateType,
        priority: requirement.priority,
        assignedRole: requirement.assigneeRole,
        policyName: requirement.policyName,
      });

      await eventBus.publish("sentinel.notifications", {
        id: `evt-${scanId}-approval-requested`,
        orgId: scan.orgId,
        topic: requirement.autoBlock ? "approval.rejected" : "approval.requested",
        payload: {
          scanId,
          gateType: requirement.gateType,
          riskScore: assessment.riskScore,
          assignedRole: requirement.assigneeRole,
          policyName: requirement.policyName,
        },
        timestamp: new Date().toISOString(),
      });

      const durationSec = (performance.now() - pending.startedAt) / 1000;
      scanDuration.observe({ status: requirement.autoBlock ? "rejected" : "pending_approval" }, durationSec);
      logger.info({
        scanId,
        gateType: requirement.gateType,
        autoBlock: requirement.autoBlock,
        riskScore: assessment.riskScore,
      }, "Approval gate created — certificate issuance deferred");

      return; // Skip certificate issuance — approval-worker will handle it
    }
    // --- End approval gate check ---

    if (isArchiveEnabled() && assessment.certificate) {
      try {
        await archiveToS3(
          getArchiveConfig(),
          scan.orgId,
          assessment.certificate.id,
          JSON.stringify(assessment.certificate),
        );
        logger.info({ scanId, certificateId: assessment.certificate.id }, "Certificate archived to cloud storage");
      } catch (archiveErr) {
        logger.error({ scanId, err: archiveErr }, "Failed to archive certificate to cloud storage");
        // Don't fail the scan — archival is best-effort
      }
    }

    await eventBus.publish("sentinel.results", {
      scanId,
      status: assessment.status,
      riskScore: assessment.riskScore,
      certificateId: assessment.certificate?.id,
    });

    // Publish evidence events for compliance audit trail
    await eventBus.publish("sentinel.evidence", {
      orgId: scan.orgId,
      type: "scan_completed",
      scanId,
      eventData: {
        status: assessment.status,
        riskScore: assessment.riskScore,
        findingsCount: pending.findings.reduce(
          (sum, f) => sum + (Array.isArray(f.findings) ? f.findings.length : 0),
          0,
        ),
      },
    });

    // Forward agent-level provenance chains to the evidence stream
    for (const agentResult of pending.findings) {
      const extra = agentResult.extra ?? agentResult.agentResult?.extra;
      if (extra?.evidenceChain) {
        await eventBus.publish("sentinel.evidence", {
          orgId: scan.orgId,
          type: "provenance_chain",
          scanId,
          eventData: extra.evidenceChain,
        });
      }
    }

    if (assessment.certificate) {
      await eventBus.publish("sentinel.evidence", {
        orgId: scan.orgId,
        type: "certificate_issued",
        scanId,
        eventData: {
          certificateId: assessment.certificate.id,
          status: assessment.certificate.verdict?.status ?? assessment.status,
        },
      });
      await eventBus.publish("sentinel.notifications", {
        id: `evt-${assessment.certificate.id}-issued`,
        orgId: scan.orgId,
        topic: "certificate.issued",
        payload: { certificateId: assessment.certificate.id, scanId, verdict: assessment.status, riskScore: assessment.riskScore },
        timestamp: new Date().toISOString(),
      });
    }

    const allFindings = pending.findings.flatMap((f) => Array.isArray(f.findings) ? f.findings : []);

    await eventBus.publish("sentinel.notifications", {
      id: `evt-${scanId}-completed`,
      orgId: scan.orgId,
      topic: "scan.completed",
      payload: { scanId, riskScore: assessment.riskScore, verdict: assessment.status, findingCount: allFindings.length },
      timestamp: new Date().toISOString(),
    });

    // Post-scan hook: incrementally upsert today's AI metrics snapshot
    try {
      const aiMetrics = new AIMetricsService(db);
      await aiMetrics.generateDailySnapshot(scan.orgId, new Date());
      logger.info({ scanId, orgId: scan.orgId }, "AI metrics snapshot updated post-scan");
    } catch (aiErr) {
      logger.error({ scanId, err: aiErr }, "Failed to update AI metrics post-scan (non-fatal)");
    }

    for (const finding of allFindings) {
      await eventBus.publish("sentinel.notifications", {
        id: `evt-${finding.id}-created`,
        orgId: scan.orgId,
        topic: "finding.created",
        payload: { findingId: finding.id, severity: finding.severity, category: finding.category, agentName: finding.agentName, file: finding.file },
        timestamp: new Date().toISOString(),
      });
    }

    // After processing findings, notify for critical ones
    for (const finding of allFindings.filter((f: any) => f.severity === "critical")) {
      await eventBus.publish("sentinel.notifications", {
        id: `evt-${finding.id}-critical`,
        orgId: scan.orgId,
        topic: "finding.critical",
        payload: { findingId: finding.id, severity: "critical", category: finding.category, agentName: finding.agentName, file: finding.file },
        timestamp: new Date().toISOString(),
      });
    }

    const durationSec = (performance.now() - pending.startedAt) / 1000;
    scanDuration.observe({ status: assessment.status }, durationSec);

    logger.info({ scanId, status: assessment.status, riskScore: assessment.riskScore, durationSec }, "Scan assessed");
  } catch (err) {
    logger.error({ scanId, err }, "Failed to assess scan");
    await db.scan.update({
      where: { id: scanId },
      data: { status: "failed", completedAt: new Date() },
    });
    await eventBus.publish("sentinel.notifications", {
      id: `evt-${scanId}-failed`,
      orgId: scan.orgId,
      topic: "scan.failed",
      payload: { scanId, error: String(err) },
      timestamp: new Date().toISOString(),
    });
  }
}

const healthPort = parseInt(process.env.WORKER_HEALTH_PORT ?? "9092", 10);
const healthServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
healthServer.listen(healthPort);
logger.info({ port: healthPort }, "Worker health server listening");

// Graceful shutdown
const shutdown = async () => {
  healthServer.close();
  logger.info("Assessor worker shutting down...");
  for (const [scanId, pending] of pendingScans) {
    clearTimeout(pending.timer);
    await finalizeScan(scanId, true);
  }
  await eventBus.disconnect();
  await shutdownTracing();
  await disconnectDb();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Wrap handler with retry + DLQ logic
const wrappedHandler = withRetry(redis, "sentinel.findings", handleFinding, {
  maxRetries: 3,
  baseDelayMs: 1000,
});

// Start consuming
eventBus.subscribe(
  "sentinel.findings",
  "assessors",
  `assessor-${process.pid}`,
  wrappedHandler,
);

logger.info("Assessor worker started, consuming sentinel.findings...");
