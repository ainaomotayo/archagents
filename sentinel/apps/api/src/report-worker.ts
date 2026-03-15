import { createHash } from "node:crypto";
import { Redis } from "ioredis";
import { EventBus, withRetry } from "@sentinel/events";
import { getDb, disconnectDb } from "@sentinel/db";
import { createLogger, initTracing, shutdownTracing } from "@sentinel/telemetry";
import { isArchiveEnabled, archiveToS3, getArchiveConfig } from "@sentinel/security";
import { createWorkerHealthServer } from "./worker-metrics.js";
import {
  computeEvidenceHash,
  generateNistProfilePdf,
  generateHipaaAssessmentPdf,
  computeGapAnalysis,
  FRAMEWORK_MAP,
  createDefaultRegistry,
  getDefaultBranding,
  type NistProfileData,
  type HipaaAssessmentData,
} from "@sentinel/compliance";
import { renderReport } from "./report-renderer.js";
import { createReportStorage } from "./report-storage-factory.js";

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  initTracing({ serviceName: "report-worker" });
}

const logger = createLogger({ name: "report-worker" });
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const eventBus = new EventBus(redis);
const db = getDb();
const registry = createDefaultRegistry();
const storage = createReportStorage();
const statusRedis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

function publishStatus(reportId: string, status: string, extra?: Record<string, unknown>) {
  statusRedis.publish(`report:${reportId}:status`, JSON.stringify({ status, ...extra })).catch(() => {});
}

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

async function assembleAndGeneratePdf(orgId: string, type: string, frameworkId: string, parameters: any): Promise<Buffer> {
  const slug = frameworkId ?? (type === "nist_profile" ? "nist-ai-rmf" : "hipaa");
  const framework = FRAMEWORK_MAP.get(slug);
  if (!framework) throw new Error(`Unknown framework: ${slug}`);

  const findings = await db.finding.findMany({
    where: { scan: { orgId } },
    orderBy: { createdAt: "desc" },
  });

  const attestationsRaw = await db.controlAttestation.findMany({
    where: { orgId, frameworkSlug: slug, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  const attestations: Record<string, any> = {};
  for (const a of attestationsRaw) attestations[a.controlCode] = a;

  const remediationsRaw = await db.remediationItem.findMany({ where: { orgId, frameworkSlug: slug } });
  const remediations: Record<string, any> = {};
  for (const r of remediationsRaw) if (r.controlCode) remediations[r.controlCode] = r;

  const analysis = computeGapAnalysis(framework, findings, attestations, remediations);
  const now = new Date().toISOString();
  const orgName = parameters?.orgName ?? orgId;

  // Attestation summary
  const allAttestations = await db.controlAttestation.findMany({ where: { orgId, frameworkSlug: slug } });
  const attested = allAttestations.filter((a: any) => !a.revokedAt && a.expiresAt > new Date()).length;
  const expired = allAttestations.filter((a: any) => !a.revokedAt && a.expiresAt <= new Date()).length;
  const attestationSummary = {
    total: framework.controls.length,
    attested,
    expired,
    unattested: framework.controls.length - attested - expired,
  };

  if (type === "nist_profile") {
    const functionNames = ["Govern", "Map", "Measure", "Manage"];
    const functionScores = functionNames.map((fn) => {
      const prefix = fn === "Govern" ? "GV" : fn === "Map" ? "MP" : fn === "Measure" ? "MS" : "MG";
      const fnControls = framework.controls.filter((c) => c.code.startsWith(prefix + "-"));
      const scores = fnControls.map((c) => {
        const att = attestations[c.code] ?? null;
        const scored = analysis.gaps.find((g) => g.controlCode === c.code);
        return scored ? scored.currentScore : 1.0;
      });
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 1.0;
      return { function: fn, score: avg, categoryCount: fnControls.length };
    });

    const data: NistProfileData = {
      orgName,
      generatedAt: now,
      frameworkVersion: "NIST AI RMF 1.0",
      overallScore: analysis.overallScore,
      functionScores,
      gaps: analysis.gaps.map((g) => ({ controlCode: g.controlCode, controlName: g.controlName, severity: g.severity, gapType: g.gapType })),
      attestationSummary,
    };
    return generateNistProfilePdf(data);
  }

  // hipaa_assessment
  const safeguardNames = [
    { name: "Administrative Safeguards", prefix: "AS" },
    { name: "Physical Safeguards", prefix: "PS" },
    { name: "Technical Safeguards", prefix: "TS" },
  ];
  const safeguardScores = safeguardNames.map((sg) => {
    const sgControls = framework.controls.filter((c) => c.code.startsWith(sg.prefix + "-"));
    const scores = sgControls.map((c) => {
      const gap = analysis.gaps.find((g) => g.controlCode === c.code);
      return gap ? gap.currentScore : 1.0;
    });
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 1.0;
    return { safeguard: sg.name, score: avg, specCount: sgControls.length };
  });

  const baaCount = await db.businessAssociateAgreement.count({ where: { orgId, status: "active" } });

  const data: HipaaAssessmentData = {
    orgName,
    generatedAt: now,
    frameworkVersion: "HIPAA Security Rule",
    overallScore: analysis.overallScore,
    safeguardScores,
    gaps: analysis.gaps.map((g) => ({
      controlCode: g.controlCode, controlName: g.controlName,
      severity: g.severity, gapType: g.gapType, regulatoryStatus: g.regulatoryStatus,
    })),
    attestationSummary,
    baaCount,
  };
  return generateHipaaAssessmentPdf(data);
}

async function handleReportRequest(_id: string, data: Record<string, unknown>) {
  const { reportId, orgId, type, frameworkId, parameters, delivery } = data as any;
  logger.info({ reportId, type }, "Processing report request");

  try {
    await db.report.update({ where: { id: reportId }, data: { status: "generating" } });
    publishStatus(reportId, "rendering");

    // Get org name for branding
    const org = await db.organization.findUnique({ where: { id: orgId } });
    const branding = getDefaultBranding(org?.name ?? orgId);

    let reportBuffer: Buffer | undefined;
    let fileSize: number | undefined;
    let pageCount: number | undefined;

    // Data gathering + rendering
    if (type === "nist_profile" || type === "hipaa_assessment") {
      // Use existing data assembly for framework reports
      reportBuffer = await assembleAndGeneratePdf(orgId as string, type, frameworkId, parameters);
      fileSize = reportBuffer.length;
      // Simple page count heuristic
      const pdfStr = reportBuffer.toString("latin1");
      pageCount = Math.max(1, (pdfStr.match(/\/Type\s*\/Page[^s]/g) || []).length);
    } else if (registry.has(type)) {
      // Use registry render for other types (data comes from parameters)
      const result = await renderReport(registry, type, parameters ?? {}, branding);
      reportBuffer = result.buffer;
      fileSize = result.fileSize;
      pageCount = result.pageCount;
    }

    const reportMeta = { type, frameworkId, parameters, generatedAt: new Date().toISOString() };
    const reportString = reportBuffer ? reportBuffer.toString("base64") : JSON.stringify(reportMeta);
    const fileHash = createHash("sha256").update(reportString).digest("hex");

    // Upload to report storage (new pipeline)
    let storageKey: string | undefined;
    if (reportBuffer) {
      publishStatus(reportId, "uploading");
      storageKey = `reports/${orgId}/${reportId}.pdf`;
      await storage.upload(storageKey, reportBuffer, "application/pdf");
    }

    // Also archive to S3 if legacy archive is enabled
    let fileUrl: string | undefined;
    if (isArchiveEnabled()) {
      const config = getArchiveConfig();
      const fileExt = reportBuffer ? "pdf" : "json";
      const key = `${orgId}/reports/${reportId}.${fileExt}`;
      await archiveToS3(config, orgId, key, reportString);
      fileUrl = `s3://${config.bucket}/${config.prefix}/${key}`;
    }

    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days

    await db.report.update({
      where: { id: reportId },
      data: {
        status: "completed",
        fileUrl,
        fileHash,
        fileSize,
        pageCount,
        storageKey,
        expiresAt,
        completedAt: new Date(),
      },
    });

    publishStatus(reportId, "completed", { storageKey, fileSize, pageCount });

    await appendEvidence(orgId as string, "report_generated", {
      reportId, type, fileHash, fileSize, pageCount,
    });

    await eventBus.publish("sentinel.notifications", {
      id: `evt-${reportId}-ready`,
      orgId,
      topic: "compliance.report_ready",
      payload: { reportId, type, fileUrl: fileUrl ?? null, storageKey, fileSize, delivery },
      timestamp: new Date().toISOString(),
    });

    logger.info({ reportId, fileHash, fileSize, pageCount }, "Report completed");
  } catch (err) {
    logger.error({ reportId, err }, "Failed to generate report");
    const errorMsg = err instanceof Error ? err.message : String(err);
    await db.report.update({
      where: { id: reportId },
      data: { status: "failed", error: errorMsg },
    });
    publishStatus(reportId, "failed", { error: errorMsg });
  }
}

async function handleEvidenceEvent(_id: string, data: Record<string, unknown>) {
  const { orgId, type, scanId, eventData } = data as any;
  await appendEvidence(orgId, type, eventData, scanId);
  logger.info({ orgId, type }, "Evidence record appended");
}

// Health server (also serves /metrics for Prometheus)
const healthPort = parseInt(process.env.REPORT_WORKER_PORT ?? "9094", 10);
const healthServer = createWorkerHealthServer(healthPort);
logger.info({ port: healthPort }, "Report worker health server listening");

// Graceful shutdown
const shutdown = async () => {
  healthServer.close();
  logger.info("Report worker shutting down...");
  statusRedis.disconnect();
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
