import http from "node:http";
import { createHash } from "node:crypto";
import { Redis } from "ioredis";
import { EventBus, withRetry } from "@sentinel/events";
import { getDb, disconnectDb } from "@sentinel/db";
import { createLogger, initTracing, shutdownTracing } from "@sentinel/telemetry";
import { isArchiveEnabled, archiveToS3, getArchiveConfig } from "@sentinel/security";
import { computeEvidenceHash } from "@sentinel/compliance";

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  initTracing({ serviceName: "report-worker" });
}

const logger = createLogger({ name: "report-worker" });
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const eventBus = new EventBus(redis);
const db = getDb();

async function appendEvidence(orgId: string, type: string, data: unknown, scanId?: string) {
  const lastRecord = await db.evidenceRecord.findFirst({
    where: { orgId },
    orderBy: { createdAt: "desc" },
  });
  const prevHash = lastRecord?.hash ?? null;
  const hash = computeEvidenceHash(data, prevHash);
  await db.evidenceRecord.create({
    data: { orgId, scanId, type, data: data as any, hash, prevHash },
  });
}

async function handleReportRequest(_id: string, data: Record<string, unknown>) {
  const { reportId, orgId, type, frameworkId, parameters } = data as any;
  logger.info({ reportId, type }, "Processing report request");

  try {
    await db.report.update({ where: { id: reportId }, data: { status: "generating" } });

    // For now, generate a JSON report (React-PDF templates added in a later task)
    const reportData = { type, frameworkId, parameters, generatedAt: new Date().toISOString() };
    const reportJson = JSON.stringify(reportData);
    const fileHash = createHash("sha256").update(reportJson).digest("hex");

    let fileUrl: string | undefined;
    if (isArchiveEnabled()) {
      const config = getArchiveConfig();
      const key = `${orgId}/reports/${reportId}.json`;
      await archiveToS3(config, orgId, key, reportJson);
      fileUrl = `s3://${config.bucket}/${config.prefix}/${key}`;
    }

    await db.report.update({
      where: { id: reportId },
      data: { status: "completed", fileUrl, fileHash, completedAt: new Date() },
    });

    await appendEvidence(orgId as string, "report_generated", {
      reportId, type, fileHash,
    });

    await eventBus.publish("sentinel.notifications", {
      id: `evt-${reportId}-ready`,
      orgId,
      topic: "compliance.report_ready",
      payload: { reportId, type, fileUrl: fileUrl ?? null },
      timestamp: new Date().toISOString(),
    });

    logger.info({ reportId, fileHash }, "Report completed");
  } catch (err) {
    logger.error({ reportId, err }, "Failed to generate report");
    await db.report.update({ where: { id: reportId }, data: { status: "failed" } });
  }
}

async function handleEvidenceEvent(_id: string, data: Record<string, unknown>) {
  const { orgId, type, scanId, eventData } = data as any;
  await appendEvidence(orgId, type, eventData, scanId);
  logger.info({ orgId, type }, "Evidence record appended");
}

// Health server
const healthPort = parseInt(process.env.REPORT_WORKER_PORT ?? "9094", 10);
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
logger.info({ port: healthPort }, "Report worker health server listening");

// Graceful shutdown
const shutdown = async () => {
  healthServer.close();
  logger.info("Report worker shutting down...");
  await eventBus.disconnect();
  await shutdownTracing();
  await disconnectDb();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Consumers
const wrappedReportHandler = withRetry(redis, "sentinel.reports", handleReportRequest, {
  maxRetries: 3,
  baseDelayMs: 2000,
});

const wrappedEvidenceHandler = withRetry(redis, "sentinel.evidence", handleEvidenceEvent, {
  maxRetries: 3,
  baseDelayMs: 1000,
});

const reportBus = new EventBus(new Redis(process.env.REDIS_URL ?? "redis://localhost:6379"));

eventBus.subscribe("sentinel.reports", "report-workers", `report-${process.pid}`, wrappedReportHandler);
reportBus.subscribe("sentinel.evidence", "evidence-workers", `evidence-${process.pid}`, wrappedEvidenceHandler);

logger.info("Report worker started — consuming sentinel.reports + sentinel.evidence");
