import crypto from "node:crypto";
import Fastify from "fastify";
import { Redis } from "ioredis";
import { getDb, disconnectDb, withTenant, initEncryption } from "@sentinel/db";
import { EventBus, getDlqDepth, readDlq } from "@sentinel/events";
import { AuditLog } from "@sentinel/audit";
import { verifyCertificate } from "@sentinel/assessor";
import { withCorrelationId, registry, httpRequestDuration, dlqDepthGauge, initTracing, shutdownTracing, sseConnectionsGauge } from "@sentinel/telemetry";
import { configureGitHubApp } from "@sentinel/github";
import {
  BUILT_IN_FRAMEWORKS,
  FRAMEWORK_MAP,
  scoreFramework,
  computeEvidenceHash,
  verifyEvidenceChain,
  VALID_REPORT_TYPES,
  EvidenceService,
  type FindingInput,
} from "@sentinel/compliance";
import { createAuthHook } from "./middleware/auth.js";
import { buildScanRoutes } from "./routes/scans.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { buildWebhookRoutes } from "./routes/notification-endpoints.js";
import { buildApprovalRoutes } from "./routes/approvals.js";
import { buildGapAnalysisRoutes } from "./routes/gap-analysis.js";
import { buildRemediationRoutes } from "./routes/remediations.js";
import { buildAIMetricsRoutes } from "./routes/ai-metrics.js";
import { buildRiskTrendRoutes } from "./routes/risk-trends.js";
import { buildDecisionTraceRoutes } from "./routes/decision-traces.js";
import { buildIPAttributionRoutes } from "./routes/ip-attribution.js";
import { buildBAARoutes } from "./routes/baa.js";
import { buildAttestationRoutes } from "./routes/attestations.js";
import { buildNotificationRuleRoutes } from "./routes/notification-rules.js";
import { buildReportScheduleRoutes } from "./routes/report-schedules.js";
import { HttpWebhookAdapter, SseManager } from "@sentinel/notifications";
import { randomUUID } from "node:crypto";
import { createScanStore, createAuditEventStore } from "./stores.js";
import { registerSecurityPlugins } from "./plugins/security.js";
import { registerApiKeyRoutes } from "./routes/api-keys.js";
import { registerSsoConfigRoutes } from "./routes/sso-config.js";
import { registerDiscoveryRoutes } from "./routes/auth-discovery.js";
import { registerSamlMetadataRoute } from "./routes/saml-metadata.js";
import { registerOrgMembershipRoutes } from "./routes/org-memberships.js";
import { registerScimRoutes } from "./routes/scim.js";
import { registerEncryptionAdminRoutes } from "./routes/encryption-admin.js";
import { registerDomainRoutes } from "./routes/domain-verification.js";
import { registerMetricsRoute } from "./metrics.js";
import { registerJitRoutes } from "./routes/jit-provision.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerAuditEventRoutes } from "./routes/audit-events.js";
import { registerOrgSettingsRoutes } from "./routes/org-settings.js";
import { registerVcsWebhookRoutes } from "./routes/vcs-webhooks.js";
import { registerVcsInstallationRoutes } from "./routes/vcs-installations.js";
import { VcsProviderRegistry, GitHubProvider, GitLabProvider, BitbucketProvider, AzureDevOpsProvider } from "@sentinel/vcs";
import { DekCache, EnvelopeEncryption, LocalKmsProvider } from "@sentinel/security";

// Module-level DEK cache for encryption — shared with crypto-shred handler for eviction
let dekCache: DekCache | undefined;

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT && process.env.NODE_ENV !== "test") {
  initTracing({ serviceName: "sentinel-api" });
}

const app = Fastify({
  logger: {
    name: "sentinel-api",
    level: process.env.LOG_LEVEL ?? "info",
    formatters: { level: (label: string) => ({ level: label }) },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers['x-sentinel-signature']",
        "req.headers['x-sentinel-api-key']",
        "body.secret",
        "body.password",
      ],
      censor: "[REDACTED]",
    },
  },
});

// --- Infrastructure ---
const db = getDb();
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const eventBus = new EventBus(redis);
const auditLog = new AuditLog(createAuditEventStore(db));

// --- Auth middleware ---
const authHook = createAuthHook({
  getOrgSecret: async (_apiKey) => {
    return process.env.SENTINEL_SECRET ?? null;
  },
  resolveDbRole: async (userId: string, orgId: string) => {
    try {
      const membership = await db.orgMembership.findUnique({
        where: { orgId_userId: { orgId, userId } },
      });
      return membership?.role ?? null;
    } catch {
      return null; // Fail-open: fall back to header role
    }
  },
  updateApiKeyLastUsed: (prefix) => {
    getDb().apiKey.updateMany({
      where: { keyPrefix: prefix },
      data: { lastUsedAt: new Date() },
    }).catch(() => {}); // Fire-and-forget
  },
});

// --- Scan route handlers ---
const scanRoutes = buildScanRoutes({
  scanStore: createScanStore(db),
  eventBus,
  auditLog,
});

// --- Webhook endpoint route handlers ---
const webhookRoutes = buildWebhookRoutes({ db });

// --- Notification rule route handlers ---
const ruleRoutes = buildNotificationRuleRoutes({ db });

// --- Approval route handlers ---
const approvalRoutes = buildApprovalRoutes({ db });
const gapRoutes = buildGapAnalysisRoutes({ db });
const remediationRoutes = buildRemediationRoutes({ db });
const baaRoutes = buildBAARoutes({ db });
const attestationRoutes = buildAttestationRoutes({ db });
const aiMetricsRoutes = buildAIMetricsRoutes({ db });
const riskTrendRoutes = buildRiskTrendRoutes({ db });
const decisionTraceRoutes = buildDecisionTraceRoutes({ db });
const ipAttributionRoutes = buildIPAttributionRoutes({ db, secret: process.env.SENTINEL_SECRET! });
const reportScheduleRoutes = buildReportScheduleRoutes({ db, eventBus });

// --- Evidence upload service (stub S3 presigner until real provider is configured) ---
const stubS3Presigner = {
  getPresignedUploadUrl: async (key: string, _contentType: string) => ({
    url: `${process.env.S3_ENDPOINT ?? "https://s3.amazonaws.com"}/${key}?presigned=true`,
    key,
  }),
  getPresignedDownloadUrl: async (key: string) =>
    `${process.env.S3_ENDPOINT ?? "https://s3.amazonaws.com"}/${key}?presigned=true`,
};
const evidenceService = new EvidenceService(db, stubS3Presigner);

const sseManager = new SseManager();

// --- Security plugins ---
await registerSecurityPlugins(app, { redis });

// --- GitHub App configuration ---
if (process.env.GITHUB_APP_ID && process.env.GITHUB_PRIVATE_KEY) {
  configureGitHubApp({
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_PRIVATE_KEY,
  });
}

// Register webhook routes (no HMAC auth — uses GitHub signature verification)
const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
if (webhookSecret) {
  registerWebhookRoutes(app, { eventBus, webhookSecret, db });
}

// --- VCS installation management routes ---
registerVcsInstallationRoutes(app, { db });

// --- Multi-VCS webhook routes ---
const vcsRegistry = new VcsProviderRegistry();
if (process.env.VCS_GITHUB_ENABLED === "true" && process.env.GITHUB_APP_ID && process.env.GITHUB_PRIVATE_KEY) {
  vcsRegistry.register(new GitHubProvider({ appId: process.env.GITHUB_APP_ID, privateKey: process.env.GITHUB_PRIVATE_KEY }));
}
if (process.env.VCS_GITLAB_ENABLED === "true" && process.env.GITLAB_TOKEN) {
  vcsRegistry.register(new GitLabProvider({ token: process.env.GITLAB_TOKEN, host: process.env.GITLAB_URL }));
}
if (process.env.VCS_BITBUCKET_ENABLED === "true" && process.env.BITBUCKET_WORKSPACE && process.env.BITBUCKET_USERNAME && process.env.BITBUCKET_APP_PASSWORD) {
  vcsRegistry.register(new BitbucketProvider({ workspace: process.env.BITBUCKET_WORKSPACE, username: process.env.BITBUCKET_USERNAME, appPassword: process.env.BITBUCKET_APP_PASSWORD }));
}
if (process.env.VCS_AZURE_DEVOPS_ENABLED === "true" && process.env.AZURE_DEVOPS_ORG_URL && process.env.AZURE_DEVOPS_PROJECT && process.env.AZURE_DEVOPS_PAT) {
  vcsRegistry.register(new AzureDevOpsProvider({ organizationUrl: process.env.AZURE_DEVOPS_ORG_URL, project: process.env.AZURE_DEVOPS_PROJECT, pat: process.env.AZURE_DEVOPS_PAT }));
}
if (vcsRegistry.list().length > 0) {
  registerVcsWebhookRoutes(app, { registry: vcsRegistry, eventBus, db });
}

// --- Observability hooks ---
app.addHook("onRequest", async (request) => {
  (request as any).correlationId = crypto.randomUUID();
  (request as any).startTime = performance.now();
  request.log = withCorrelationId(request.log as any, (request as any).correlationId) as any;
});

app.addHook("onResponse", async (request, reply) => {
  const durationSec = (performance.now() - (request as any).startTime) / 1000;
  httpRequestDuration.observe(
    {
      method: request.method,
      route: request.routeOptions?.url ?? request.url,
      status_code: String(reply.statusCode),
    },
    durationSec,
  );
});

// --- Health (no auth, no rate limit) ---
app.get("/health", { config: { rateLimit: false } }, async () => ({
  status: "ok",
  version: "0.1.0",
  uptime: process.uptime(),
}));

// --- Metrics (no auth, no rate limit) ---
app.get("/metrics", { config: { rateLimit: false } }, async (_request, reply) => {
  const metrics = await registry.metrics();
  reply.type("text/plain").send(metrics);
});

// --- Scans ---
app.get("/v1/scans", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { limit = "50", offset = "0", status, projectId } = request.query as any;
  return withTenant(db, orgId, async (tx) => {
    const where: any = {};
    if (status) where.status = status;
    if (projectId) where.projectId = projectId;
    const [scans, total] = await Promise.all([
      tx.scan.findMany({
        where,
        take: Number(limit),
        skip: Number(offset),
        orderBy: { startedAt: "desc" },
        include: { certificate: true, _count: { select: { findings: true } } },
      }),
      tx.scan.count({ where }),
    ]);
    return { scans, total, limit: Number(limit), offset: Number(offset) };
  });
});

app.post("/v1/scans", { preHandler: authHook }, async (request, reply) => {
  const body = request.body as any;
  const orgId = (request as any).orgId ?? "default";
  const result = await scanRoutes.submitScan({ orgId, body });
  await eventBus.publish("sentinel.notifications", {
    id: `evt-${result.scanId}-submitted`,
    orgId,
    topic: "scan.submitted",
    payload: { scanId: result.scanId, projectId: body.projectId, commitHash: body.commitHash, branch: body.branch },
    timestamp: new Date().toISOString(),
  });
  reply.code(201).send(result);
});

app.get("/v1/scans/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, async (tx) => {
    const scan = await tx.scan.findUnique({
      where: { id },
      include: { findings: true, certificate: true, agentResults: true },
    });
    if (!scan) {
      reply.code(404).send({ error: "Scan not found" });
      return;
    }
    return scan;
  });
});

app.get("/v1/scans/:id/poll", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, async (tx) => {
    const scan = await tx.scan.findUnique({
      where: { id },
      include: { findings: true, certificate: true, agentResults: true },
    });
    if (!scan) {
      reply.code(404).send({ error: "Scan not found" });
      return;
    }
    return {
      status: scan.status,
      assessment: scan.status === "completed" ? scan : undefined,
    };
  });
});

// --- SBOM Export ---
app.get("/v1/scans/:id/sbom", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, async (tx) => {
    const scan = await tx.scan.findUnique({
      where: { id },
      include: { findings: true, project: true },
    });
    if (!scan) {
      reply.code(404).send({ error: "Scan not found" });
      return;
    }
    if (scan.status !== "completed") {
      reply.code(409).send({ error: "Scan not yet completed" });
      return;
    }

    // Build CycloneDX 1.5 SBOM from persisted findings
    const components = (scan.findings as any[])
      .filter((f: any) => f.category === "copyleft-risk" || f.type === "license")
      .map((f: any) => {
        const extra = (f.metadata ?? f) as Record<string, unknown>;
        return {
          type: "library",
          name: extra.sourceMatch ? String(extra.sourceMatch).split("/").pop() : f.title,
          version: extra.packageVersion ?? extra.registryVersion ?? "unknown",
          licenses: extra.licenseDetected
            ? [{ license: { id: String(extra.licenseDetected) } }]
            : [],
          purl: extra.ecosystem && extra.sourceMatch
            ? `pkg:${String(extra.ecosystem).toLowerCase()}/${String(extra.sourceMatch).split("/").pop()}`
            : undefined,
        };
      });

    // Deduplicate by name+version
    const seen = new Set<string>();
    const deduped = components.filter((c: any) => {
      const key = `${c.name}@${c.version}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Fetch evidence chain for this scan
    const evidenceRecords = await tx.evidenceRecord.findMany({
      where: { scanId: id },
      orderBy: { createdAt: "asc" },
    });

    const sbom = {
      bomFormat: "CycloneDX",
      specVersion: "1.5",
      version: 1,
      metadata: {
        timestamp: new Date().toISOString(),
        component: {
          type: "application",
          name: (scan.project as any)?.name ?? "unknown",
          version: scan.commitHash ?? "unknown",
        },
        properties: [
          { name: "sentinel:scanId", value: id },
          { name: "sentinel:commitHash", value: scan.commitHash ?? "" },
          { name: "sentinel:evidenceChainLength", value: String(evidenceRecords.length) },
        ],
      },
      components: deduped,
    };

    reply.header("Content-Type", "application/vnd.cyclonedx+json");
    return sbom;
  });
});

// --- Findings ---
app.get("/v1/findings", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { limit = "50", offset = "0", severity, category, scanId } = request.query as any;
  return withTenant(db, orgId, async (tx) => {
    const where: any = {};
    if (severity) where.severity = severity;
    if (category) where.category = category;
    if (scanId) where.scanId = scanId;
    const [findings, total] = await Promise.all([
      tx.finding.findMany({
        where,
        take: Number(limit),
        skip: Number(offset),
        orderBy: { createdAt: "desc" },
        include: { scan: { select: { projectId: true } } },
      }),
      tx.finding.count({ where }),
    ]);
    return { findings, total, limit: Number(limit), offset: Number(offset) };
  });
});

app.get("/v1/findings/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, async (tx) => {
    const finding = await tx.finding.findUnique({ where: { id }, include: { scan: { select: { projectId: true } } } });
    if (!finding) {
      reply.code(404).send({ error: "Finding not found" });
      return;
    }
    return finding;
  });
});

app.patch("/v1/findings/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const body = request.body as any;
  return withTenant(db, orgId, async (tx) => {
    const finding = await tx.finding.findUnique({ where: { id } });
    if (!finding) {
      reply.code(404).send({ error: "Finding not found" });
      return;
    }
    const data: any = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.suppressed === true) {
      data.suppressed = true;
      data.suppressedBy = body.suppressedBy ?? null;
      data.suppressedAt = new Date();
    } else if (body.suppressed === false) {
      data.suppressed = false;
      data.suppressedBy = null;
      data.suppressedAt = null;
    }
    const updated = await tx.finding.update({ where: { id }, data });
    if (body.suppressed === true) {
      await eventBus.publish("sentinel.evidence", {
        orgId,
        type: "finding_suppressed",
        eventData: {
          findingId: id,
          suppressedBy: body.suppressedBy ?? null,
          severity: finding.severity,
          category: finding.category,
        },
      });
      await eventBus.publish("sentinel.notifications", {
        id: `evt-${id}-suppressed`,
        orgId,
        topic: "finding.suppressed",
        payload: { findingId: id, suppressedBy: body.suppressedBy ?? null, severity: finding.severity },
        timestamp: new Date().toISOString(),
      });
    }
    return updated;
  });
});

// --- Certificates ---
app.get("/v1/certificates", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { limit = "50", offset = "0", scanId } = request.query as any;
  return withTenant(db, orgId, async (tx) => {
    const where: any = {};
    if (scanId) where.scanId = scanId;
    const [certificates, total] = await Promise.all([
      tx.certificate.findMany({
        where,
        take: Number(limit),
        skip: Number(offset),
        orderBy: { issuedAt: "desc" },
        include: { scan: { select: { commitHash: true, branch: true } } },
      }),
      tx.certificate.count({ where }),
    ]);
    return { certificates, total, limit: Number(limit), offset: Number(offset) };
  });
});

app.get("/v1/certificates/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, async (tx) => {
    const cert = await tx.certificate.findUnique({ where: { id }, include: { scan: { select: { commitHash: true, branch: true } } } });
    if (!cert) {
      reply.code(404).send({ error: "Certificate not found" });
      return;
    }
    return cert;
  });
});

app.post("/v1/certificates/:id/verify", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, async (tx) => {
    const cert = await tx.certificate.findUnique({ where: { id } });
    if (!cert) {
      reply.code(404).send({ error: "Certificate not found" });
      return;
    }
    const valid = verifyCertificate(
      JSON.stringify(cert.verdict),
      process.env.SENTINEL_SECRET!,
    );
    return { valid, certificateId: id };
  });
});

app.post("/v1/certificates/:id/revoke", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const { reason } = (request.body as any) ?? {};
  const orgId = (request as any).orgId ?? "default";

  if (!reason || typeof reason !== "string") {
    reply.code(400).send({ error: "reason is required" });
    return;
  }

  return withTenant(db, orgId, async (tx) => {
    const cert = await tx.certificate.findUnique({ where: { id } });
    if (!cert) {
      reply.code(404).send({ error: "Certificate not found" });
      return;
    }

    if (cert.revokedAt) {
      reply.code(409).send({ error: "Certificate already revoked" });
      return;
    }

    const now = new Date();
    await tx.certificate.update({
      where: { id },
      data: {
        revokedAt: now,
        revocationReason: reason,
      },
    });

    await auditLog.append(orgId, {
      actor: { type: "api", id: "cli", name: "SENTINEL CLI" },
      action: "certificate.revoked",
      resource: { type: "certificate", id },
      detail: { reason },
    });

    await eventBus.publish("sentinel.evidence", {
      orgId,
      type: "certificate_revoked",
      eventData: { certificateId: id, reason },
    });
    await eventBus.publish("sentinel.notifications", {
      id: `evt-${id}-revoked`,
      orgId,
      topic: "certificate.revoked",
      payload: { certificateId: id, reason },
      timestamp: new Date().toISOString(),
    });

    return { id, status: "revoked", revokedAt: now.toISOString() };
  });
});

// --- Projects ---
app.get("/v1/projects", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  return withTenant(db, orgId, async (tx) => {
    return tx.project.findMany({
      include: { _count: { select: { scans: true } } },
      orderBy: { createdAt: "desc" },
    });
  });
});

app.get("/v1/projects/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, async (tx) => {
    const project = await tx.project.findUnique({
      where: { id },
      include: {
        _count: { select: { scans: true } },
        scans: { take: 10, orderBy: { startedAt: "desc" }, include: { certificate: true, _count: { select: { findings: true } } } },
      },
    });
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }
    return project;
  });
});

app.get("/v1/projects/:id/findings", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const { limit = "50", offset = "0", severity, category } = request.query as any;
  return withTenant(db, orgId, async (tx) => {
    const where: any = { scan: { projectId: id } };
    if (severity) where.severity = severity;
    if (category) where.category = category;
    const [findings, total] = await Promise.all([
      tx.finding.findMany({
        where,
        take: Number(limit),
        skip: Number(offset),
        orderBy: { createdAt: "desc" },
        include: { scan: { select: { projectId: true } } },
      }),
      tx.finding.count({ where }),
    ]);
    return { findings, total, limit: Number(limit), offset: Number(offset) };
  });
});

// --- Policies ---
const policyBodySchema = {
  type: "object",
  required: ["name", "rules"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 255 },
    rules: { type: "array", items: { type: "object" } },
    projectId: { type: "string", format: "uuid" },
  },
  additionalProperties: false,
} as const;

app.get("/v1/policies", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  return withTenant(db, orgId, async (tx) => {
    return tx.policy.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" } });
  });
});

app.get("/v1/policies/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, async (tx) => {
    const policy = await tx.policy.findFirst({ where: { id, deletedAt: null } });
    if (!policy) {
      reply.code(404).send({ error: "Policy not found" });
      return;
    }
    return policy;
  });
});

app.post("/v1/policies", { preHandler: authHook, schema: { body: policyBodySchema } }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const body = request.body as any;
  const policy = await withTenant(db, orgId, async (tx) => {
    return tx.policy.create({ data: body });
  });
  const role = (request as any).role ?? "unknown";
  try {
    await db.policyVersion.create({
      data: {
        policyId: policy.id,
        version: policy.version,
        name: policy.name,
        rules: policy.rules as any,
        changedBy: role,
        changeType: "created",
      },
    });
  } catch (err) {
    request.log.error({ err }, "Failed to create policy version snapshot");
  }
  try {
    await auditLog.append(orgId, {
      actor: { type: "api", id: role, name: "API" },
      action: "policy.created",
      resource: { type: "policy", id: policy.id },
      detail: { name: policy.name, version: policy.version },
    });
  } catch (err) {
    request.log.error({ err }, "Failed to append audit log");
  }
  await eventBus.publish("sentinel.evidence", {
    orgId,
    type: "policy_changed",
    eventData: { policyId: policy.id, changeType: "created", name: policy.name, version: policy.version },
  });
  await eventBus.publish("sentinel.notifications", {
    id: `evt-${policy.id}-created`,
    orgId,
    topic: "policy.created",
    payload: { policyId: policy.id, name: policy.name, version: policy.version },
    timestamp: new Date().toISOString(),
  });
  reply.code(201).send(policy);
});

app.put("/v1/policies/:id", { preHandler: authHook, schema: { body: policyBodySchema } }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const body = request.body as any;
  return withTenant(db, orgId, async (tx) => {
    const existing = await tx.policy.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      reply.code(404).send({ error: "Policy not found" });
      return;
    }
    const updated = await tx.policy.update({
      where: { id },
      data: { name: body.name, rules: body.rules, version: { increment: 1 } },
    });
    const role = (request as any).role ?? "unknown";
    try {
      await tx.policyVersion.create({
        data: {
          policyId: id,
          version: updated.version,
          name: updated.name,
          rules: updated.rules as any,
          changedBy: role,
          changeType: "updated",
        },
      });
    } catch (err) {
      request.log.error({ err }, "Failed to create policy version snapshot");
    }
    try {
      await auditLog.append(orgId, {
        actor: { type: "api", id: role, name: "API" },
        action: "policy.updated",
        resource: { type: "policy", id },
        detail: { name: updated.name, version: updated.version },
      });
    } catch (err) {
      request.log.error({ err }, "Failed to append audit log");
    }
    await eventBus.publish("sentinel.evidence", {
      orgId,
      type: "policy_changed",
      eventData: { policyId: id, changeType: "updated", name: updated.name, version: updated.version },
    });
    await eventBus.publish("sentinel.notifications", {
      id: `evt-${id}-updated`,
      orgId,
      topic: "policy.updated",
      payload: { policyId: id, name: updated.name, version: updated.version },
      timestamp: new Date().toISOString(),
    });
    return updated;
  });
});

app.delete("/v1/policies/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const role = (request as any).role ?? "unknown";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, async (tx) => {
    const existing = await tx.policy.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      reply.code(404).send({ error: "Policy not found" });
      return;
    }
    await tx.policy.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    try {
      await tx.policyVersion.create({
        data: {
          policyId: id,
          version: existing.version,
          name: existing.name,
          rules: existing.rules as any,
          changedBy: role,
          changeType: "deleted",
        },
      });
    } catch (err) {
      request.log.error({ err }, "Failed to create policy version snapshot");
    }
    try {
      await auditLog.append(orgId, {
        actor: { type: "api", id: role, name: "API" },
        action: "policy.deleted",
        resource: { type: "policy", id },
        detail: { name: existing.name },
      });
    } catch (err) {
      request.log.error({ err }, "Failed to append audit log");
    }
    await eventBus.publish("sentinel.evidence", {
      orgId,
      type: "policy_changed",
      eventData: { policyId: id, changeType: "deleted", name: existing.name },
    });
    await eventBus.publish("sentinel.notifications", {
      id: `evt-${id}-deleted`,
      orgId,
      topic: "policy.deleted",
      payload: { policyId: id, name: existing.name },
      timestamp: new Date().toISOString(),
    });
    reply.code(204).send();
  });
});

app.get("/v1/policies/:id/versions", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, async (tx) => {
    const versions = await tx.policyVersion.findMany({
      where: { policyId: id },
      orderBy: { version: "desc" },
    });
    return { versions };
  });
});

// --- Audit log ---
app.get("/v1/audit", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { limit = "50", offset = "0" } = request.query as any;
  return withTenant(db, orgId, async (tx) => {
    const [events, total] = await Promise.all([
      tx.auditEvent.findMany({
        take: Number(limit),
        skip: Number(offset),
        orderBy: { timestamp: "desc" },
      }),
      tx.auditEvent.count(),
    ]);
    return { events, total, limit: Number(limit), offset: Number(offset) };
  });
});

// --- Approval Policies ---
app.post("/v1/approval-policies", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const userId = (request as any).userId ?? "unknown";
  try {
    const result = await withTenant(db, orgId, () => approvalRoutes.createPolicy(orgId, request.body));
    await auditLog.append(orgId, {
      actor: { type: "user", id: userId, name: userId },
      action: "approval_policy.create",
      resource: { type: "approval_policy", id: result.id },
      detail: { name: (request.body as any)?.name, strategyType: (request.body as any)?.strategyType },
    });
    await eventBus.publish("sentinel.notifications", {
      id: `evt-policy-${result.id}-created`,
      orgId,
      topic: "approval_policy.created",
      payload: { policyId: result.id, name: result.name },
      timestamp: new Date().toISOString(),
    });
    reply.code(201).send(result);
  } catch (err: any) {
    reply.code(400).send({ error: err.message });
  }
});

app.get("/v1/approval-policies", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  try {
    return await withTenant(db, orgId, () => approvalRoutes.listPolicies(orgId));
  } catch (err: any) {
    reply.code(500).send({ error: "Failed to list policies" });
  }
});

app.patch("/v1/approval-policies/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const userId = (request as any).userId ?? "unknown";
  const { id } = request.params as { id: string };
  try {
    const result = await withTenant(db, orgId, () => approvalRoutes.updatePolicy(orgId, id, request.body));
    await auditLog.append(orgId, {
      actor: { type: "user", id: userId, name: userId },
      action: "approval_policy.update",
      resource: { type: "approval_policy", id },
      detail: request.body as Record<string, unknown>,
    });
    await eventBus.publish("sentinel.notifications", {
      id: `evt-policy-${id}-updated`,
      orgId,
      topic: "approval_policy.updated",
      payload: { policyId: id },
      timestamp: new Date().toISOString(),
    });
    return result;
  } catch (err: any) {
    reply.code(400).send({ error: err.message });
  }
});

app.delete("/v1/approval-policies/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const userId = (request as any).userId ?? "unknown";
  const { id } = request.params as { id: string };
  try {
    const result = await withTenant(db, orgId, () => approvalRoutes.deletePolicy(orgId, id));
    await auditLog.append(orgId, {
      actor: { type: "user", id: userId, name: userId },
      action: "approval_policy.delete",
      resource: { type: "approval_policy", id },
      detail: {},
    });
    await eventBus.publish("sentinel.notifications", {
      id: `evt-policy-${id}-deleted`,
      orgId,
      topic: "approval_policy.deleted",
      payload: { policyId: id },
      timestamp: new Date().toISOString(),
    });
    return result;
  } catch (err: any) {
    reply.code(400).send({ error: err.message });
  }
});

// --- Approval Gates ---
app.get("/v1/approvals", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { limit = "50", offset = "0" } = request.query as any;
  try {
    return await withTenant(db, orgId, () =>
      approvalRoutes.listPendingGates(orgId, { limit: Number(limit), offset: Number(offset) }),
    );
  } catch (err: any) {
    reply.code(500).send({ error: "Failed to list approval gates" });
  }
});

app.get("/v1/approvals/stats", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  try {
    return await withTenant(db, orgId, () => approvalRoutes.getStats(orgId));
  } catch (err: any) {
    reply.code(500).send({ error: "Failed to get approval stats" });
  }
});

app.get("/v1/approvals/stream", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const clientId = randomUUID();
  const client = {
    id: clientId,
    orgId,
    topics: ["gate.created", "gate.decided", "gate.escalated", "gate.expired", "gate.reassigned",
             "approval.approved", "approval.rejected", "approval.reassigned"],
    write: (data: string) => {
      try { reply.raw.write(data); return true; } catch { return false; }
    },
    close: () => {
      try { reply.raw.end(); } catch {}
    },
  };

  sseManager.register(client);
  sseConnectionsGauge.inc({ org_id: orgId });

  const heartbeat = setInterval(() => {
    try { reply.raw.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 30_000);

  request.raw.on("close", () => {
    clearInterval(heartbeat);
    sseManager.unregister(clientId, orgId);
    sseConnectionsGauge.dec({ org_id: orgId });
  });
});

app.get("/v1/approvals/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  try {
    return await withTenant(db, orgId, async () => {
      const gate = await approvalRoutes.getGate(orgId, id);
      if (!gate) { reply.code(404).send({ error: "Approval gate not found" }); return; }
      return gate;
    });
  } catch (err: any) {
    reply.code(500).send({ error: "Failed to get approval gate" });
  }
});

app.post("/v1/approvals/:id/decide", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const { decision, justification } = request.body as any;
  const decidedBy = (request as any).userId ?? "unknown";

  if (!decision || !["approve", "reject"].includes(decision)) {
    reply.code(400).send({ error: "decision must be 'approve' or 'reject'" });
    return;
  }
  if (!justification || typeof justification !== "string" || justification.trim().length < 10) {
    reply.code(400).send({ error: "justification must be at least 10 characters" });
    return;
  }

  try {
    const result = await withTenant(db, orgId, () =>
      approvalRoutes.submitDecision(orgId, id, { decision, justification, decidedBy }),
    );
    await eventBus.publish("sentinel.approvals", { type: "gate.decided", gateId: id, decision, scanId: result.scanId, orgId });
    await eventBus.publish("sentinel.notifications", {
      id: `evt-${id}-${decision}`,
      orgId,
      topic: `approval.${decision === "approve" ? "approved" : "rejected"}`,
      payload: { gateId: id, decision, scanId: result.scanId, decidedBy },
      timestamp: new Date().toISOString(),
    });

    await auditLog.append(orgId, {
      actor: { type: "user", id: decidedBy, name: decidedBy },
      action: `approval.${decision}`,
      resource: { type: "approval_gate", id },
      detail: { scanId: result.scanId, justification, gateType: result.gateType },
    });

    await eventBus.publish("sentinel.evidence", {
      orgId,
      type: "approval_decision",
      scanId: result.scanId,
      eventData: { gateId: id, decision, decidedBy, justification },
    });

    return result;
  } catch (err: any) {
    const msg = err.message ?? "";
    if (msg.includes("not found")) {
      reply.code(404).send({ error: msg });
    } else if (msg.includes("Cannot decide") || msg.includes("Cannot ")) {
      reply.code(409).send({ error: msg });
    } else {
      reply.code(400).send({ error: msg });
    }
  }
});

app.post("/v1/approvals/:id/reassign", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const decidedBy = (request as any).userId ?? "unknown";
  try {
    const result = await withTenant(db, orgId, () =>
      approvalRoutes.reassignGate(orgId, id, request.body as any),
    );

    const { assignedTo, assignedRole } = request.body as any;
    await auditLog.append(orgId, {
      actor: { type: "user", id: decidedBy, name: decidedBy },
      action: "approval.reassign",
      resource: { type: "approval_gate", id },
      detail: { assignedTo, assignedRole },
    });

    await eventBus.publish("sentinel.notifications", {
      id: `evt-${id}-reassigned`,
      orgId,
      topic: "approval.reassigned",
      payload: { gateId: id, assignedTo, assignedRole, reassignedBy: decidedBy },
      timestamp: new Date().toISOString(),
    });

    return result;
  } catch (err: any) {
    const msg = err.message ?? "";
    if (msg.includes("not found")) {
      reply.code(404).send({ error: msg });
    } else if (msg.includes("terminal")) {
      reply.code(409).send({ error: msg });
    } else {
      reply.code(400).send({ error: msg });
    }
  }
});

// --- Fingerprint Corpus Admin ---
app.get("/v1/admin/fingerprints/stats", { preHandler: authHook }, async () => {
  const [total, byEcosystem] = await Promise.all([
    db.ossFingerprint.count(),
    db.ossFingerprint.groupBy({ by: ["ecosystem"], _count: true }),
  ]);
  return {
    total,
    byEcosystem: byEcosystem.map((e) => ({ ecosystem: e.ecosystem, count: e._count })),
  };
});

app.post("/v1/admin/fingerprints/seed", { preHandler: authHook }, async (request, reply) => {
  const body = request.body as { fingerprints: Array<Record<string, unknown>> };
  if (!body?.fingerprints?.length) {
    reply.code(400).send({ error: "Request body must include fingerprints array" });
    return;
  }
  const created = await db.ossFingerprint.createMany({
    data: body.fingerprints.map((fp) => ({
      hash: String(fp.hash),
      sourceUrl: String(fp.source_url ?? fp.sourceUrl ?? ""),
      packageName: String(fp.package_name ?? fp.packageName ?? ""),
      packageVersion: fp.package_version ?? fp.packageVersion ?? null,
      ecosystem: String(fp.ecosystem ?? ""),
      spdxLicense: fp.spdx_license ?? fp.spdxLicense ?? null,
      filePath: fp.file_path ?? fp.filePath ?? null,
      lineStart: fp.line_start ?? fp.lineStart ?? null,
      lineEnd: fp.line_end ?? fp.lineEnd ?? null,
    })) as any,
    skipDuplicates: true,
  });
  return { inserted: created.count, total: await db.ossFingerprint.count() };
});

// --- DLQ monitoring ---
app.get("/v1/admin/dlq", { preHandler: authHook }, async () => {
  const depth = await getDlqDepth(redis, "sentinel.findings.dlq");
  dlqDepthGauge.set(depth);
  const messages = await readDlq(redis, "sentinel.findings.dlq");
  return { depth, messages };
});

// --- Compliance ---

app.get("/v1/compliance/frameworks", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const custom = await withTenant(db, orgId, async (tx) => {
    return tx.complianceFramework.findMany({ where: { orgId }, include: { controls: true } });
  });
  const builtIn = BUILT_IN_FRAMEWORKS.map((f) => ({ ...f, id: f.slug, orgId: null, createdAt: null }));
  return [...builtIn, ...custom];
});

app.get("/v1/compliance/frameworks/:id", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const builtIn = FRAMEWORK_MAP.get(id);
  if (builtIn) return { ...builtIn, id: builtIn.slug, orgId: null };
  const orgId = (request as any).orgId ?? "default";
  const custom = await withTenant(db, orgId, async (tx) => {
    return tx.complianceFramework.findUnique({ where: { id }, include: { controls: true } });
  });
  if (!custom) { reply.code(404).send({ error: "Framework not found" }); return; }
  return custom;
});

app.post("/v1/compliance/frameworks", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { slug, name, version, controls } = request.body as any;
  if (FRAMEWORK_MAP.has(slug)) { reply.code(409).send({ error: "Cannot create framework with built-in slug" }); return; }
  const framework = await db.complianceFramework.create({
    data: { orgId, slug, name, version, controls: { create: controls } },
    include: { controls: true },
  });
  reply.code(201).send(framework);
});

app.put("/v1/compliance/frameworks/:id", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const fw = await db.complianceFramework.findUnique({ where: { id } });
  if (!fw) { reply.code(404).send({ error: "Framework not found" }); return; }
  if (!fw.orgId) { reply.code(403).send({ error: "Cannot modify built-in framework" }); return; }
  const { name, version } = request.body as any;
  const updated = await db.complianceFramework.update({ where: { id }, data: { name, version } });
  return updated;
});

app.delete("/v1/compliance/frameworks/:id", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const fw = await db.complianceFramework.findUnique({ where: { id } });
  if (!fw) { reply.code(404).send({ error: "Framework not found" }); return; }
  if (!fw.orgId) { reply.code(403).send({ error: "Cannot delete built-in framework" }); return; }
  await db.complianceFramework.delete({ where: { id } });
  reply.code(204).send();
});

app.post("/v1/compliance/controls/:id/override", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id: controlId } = request.params as { id: string };
  const { matchRules, weight, enabled } = request.body as any;
  const override = await db.complianceControlOverride.upsert({
    where: { orgId_controlId: { orgId, controlId } },
    update: { matchRules, weight, enabled },
    create: { orgId, controlId, matchRules, weight, enabled },
  });
  reply.code(200).send(override);
});

app.delete("/v1/compliance/controls/:id/override", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id: controlId } = request.params as { id: string };
  await db.complianceControlOverride.deleteMany({ where: { orgId, controlId } });
  reply.code(204).send();
});

app.get("/v1/compliance/assess/:frameworkId", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { frameworkId } = request.params as { frameworkId: string };
  const fw = FRAMEWORK_MAP.get(frameworkId);
  if (!fw) { reply.code(404).send({ error: "Framework not found" }); return; }
  const findings = await withTenant(db, orgId, async (tx) => {
    return tx.finding.findMany({ where: { suppressed: false }, orderBy: { createdAt: "desc" }, take: 5000 });
  });
  const inputs: FindingInput[] = findings.map((f: any) => ({
    id: f.id, agentName: f.agentName, severity: f.severity, category: f.category, suppressed: f.suppressed,
  }));
  // Fetch attestations for attestation-aware scoring (NIST/HIPAA hybrid controls)
  const attestationsRaw = await withTenant(db, orgId, async (tx) => {
    return tx.controlAttestation.findMany({
      where: { orgId, frameworkSlug: frameworkId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
  });
  const attestations: Record<string, any> = {};
  for (const a of attestationsRaw) attestations[a.controlCode] = a;
  const result = scoreFramework(fw.controls, inputs, attestations);
  return { frameworkSlug: frameworkId, ...result };
});

app.get("/v1/compliance/scores", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const assessments = await withTenant(db, orgId, async (tx) => {
    return tx.complianceAssessment.findMany({ orderBy: { assessedAt: "desc" }, distinct: ["frameworkId"], take: 50 });
  });
  return assessments;
});

app.get("/v1/compliance/trends/:frameworkId", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { frameworkId } = request.params as { frameworkId: string };
  const snapshots = await withTenant(db, orgId, async (tx) => {
    return tx.complianceSnapshot.findMany({
      where: { frameworkId },
      orderBy: { date: "desc" },
      take: 90,
    });
  });
  return snapshots;
});

// --- Gap Analysis ---
app.get("/v1/compliance/gaps/:frameworkSlug/export", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { frameworkSlug } = request.params as { frameworkSlug: string };
  const { format } = request.query as { format?: string };
  try {
    const result = await withTenant(db, orgId, () =>
      gapRoutes.exportGaps(orgId, frameworkSlug, (format === "csv" ? "csv" : "json") as any),
    );
    if (result.contentType === "text/csv") {
      reply.header("Content-Type", "text/csv");
      reply.header("Content-Disposition", `attachment; filename="${frameworkSlug}-gaps.csv"`);
      return result.data;
    }
    return result.data;
  } catch (err: any) { reply.code(400).send({ error: err.message }); }
});

app.get("/v1/compliance/gaps/:frameworkSlug", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { frameworkSlug } = request.params as { frameworkSlug: string };
  return withTenant(db, orgId, () => gapRoutes.computeGaps(orgId, frameworkSlug));
});

app.get("/v1/compliance/dashboard", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  return withTenant(db, orgId, () => gapRoutes.getDashboard(orgId));
});

// --- Remediations ---
app.post("/v1/compliance/remediations", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const userId = (request as any).userId ?? "unknown";
  const body = request.body as any;
  if (!body.title || typeof body.title !== "string" || body.title.length > 500) {
    return reply.status(400).send({ error: "Title is required and must be at most 500 characters" });
  }
  if (!body.description || typeof body.description !== "string" || body.description.length > 5000) {
    return reply.status(400).send({ error: "Description is required and must be at most 5000 characters" });
  }
  if (body.evidenceNotes && typeof body.evidenceNotes === "string" && body.evidenceNotes.length > 10000) {
    return reply.status(400).send({ error: "Evidence notes must be at most 10000 characters" });
  }
  try {
    const result = await withTenant(db, orgId, () => remediationRoutes.create(orgId, { ...request.body as any, createdBy: userId }));
    await eventBus.publish("sentinel.notifications", {
      id: `evt-${result.id}-created`,
      orgId,
      topic: "remediation.created",
      payload: { remediationId: result.id, title: result.title, status: result.status },
      timestamp: new Date().toISOString(),
    });
    await auditLog.append(orgId, {
      actor: { type: "user", id: userId, name: userId },
      action: "remediation.create",
      resource: { type: "remediation_item", id: result.id },
      detail: { title: result.title, itemType: result.itemType },
    });
    reply.code(201).send(result);
  } catch (err: any) {
    const msg = err.message ?? "";
    if (msg.includes("not found")) { reply.code(404).send({ error: msg }); }
    else if (msg.includes("depth") || msg.includes("compliance-type")) { reply.code(400).send({ error: msg }); }
    else { reply.code(400).send({ error: msg }); }
  }
});

app.get("/v1/compliance/remediations", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { framework, status } = request.query as { framework?: string; status?: string };
  return withTenant(db, orgId, () => remediationRoutes.list(orgId, { frameworkSlug: framework, status }));
});

app.get("/v1/compliance/remediations/stats", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  return withTenant(db, orgId, () => remediationRoutes.getStats(orgId));
});

app.get("/v1/compliance/remediations/overdue", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  return withTenant(db, orgId, () => remediationRoutes.getOverdue(orgId));
});

app.get("/v1/compliance/remediations/stream", { preHandler: authHook }, async (request, reply) => {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  reply.raw.write("data: {\"type\":\"connected\"}\n\n");
  const interval = setInterval(() => {
    reply.raw.write(": heartbeat\n\n");
  }, 30000);
  request.raw.on("close", () => {
    clearInterval(interval);
    reply.raw.end();
  });
});

// --- Charts ---
const { ChartsService } = await import("@sentinel/compliance");
const chartsService = new ChartsService(db);

app.get("/v1/compliance/remediations/charts/burndown", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { scope, scopeValue, days } = request.query as any;
  return withTenant(db, orgId, () => chartsService.getBurndown(orgId, { scope, scopeValue, days: days ? parseInt(days) : undefined }));
});

app.get("/v1/compliance/remediations/charts/velocity", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { days } = request.query as any;
  return withTenant(db, orgId, () => chartsService.getVelocity(orgId, { days: days ? parseInt(days) : undefined }));
});

app.get("/v1/compliance/remediations/charts/aging", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  return withTenant(db, orgId, () => chartsService.getAging(orgId));
});

app.get("/v1/compliance/remediations/charts/sla", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { days } = request.query as any;
  return withTenant(db, orgId, () => chartsService.getSlaCompliance(orgId, { days: days ? parseInt(days) : undefined }));
});

app.get("/v1/compliance/remediations/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const result = await withTenant(db, orgId, () => remediationRoutes.getById(orgId, id));
  if (!result) { reply.code(404).send({ error: "Remediation item not found" }); return; }
  return result;
});

app.patch("/v1/compliance/remediations/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const userId = (request as any).userId ?? "unknown";
  const body = request.body as any;
  if (body.evidenceNotes && typeof body.evidenceNotes === "string" && body.evidenceNotes.length > 10000) {
    return reply.status(400).send({ error: "Evidence notes must be at most 10000 characters" });
  }
  try {
    const result = await withTenant(db, orgId, () => remediationRoutes.update(orgId, id, { ...request.body as any, completedBy: userId }));
    const topic = result.status === "completed" || result.status === "accepted_risk" ? "remediation.completed" : "remediation.updated";
    await eventBus.publish("sentinel.notifications", {
      id: `evt-${id}-${topic}`,
      orgId,
      topic,
      payload: { remediationId: id, status: result.status },
      timestamp: new Date().toISOString(),
    });
    await auditLog.append(orgId, {
      actor: { type: "user", id: userId, name: userId },
      action: "remediation.update",
      resource: { type: "remediation_item", id },
      detail: { status: result.status },
    });
    return result;
  } catch (err: any) {
    const msg = err.message ?? "";
    if (msg.includes("not found")) { reply.code(404).send({ error: msg }); }
    else if (msg.includes("transition")) { reply.code(409).send({ error: msg }); }
    else { reply.code(400).send({ error: msg }); }
  }
});

app.post("/v1/compliance/remediations/:id/link-external", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const { provider, externalRef } = request.body as { provider: string; externalRef: string };
  const userId = (request as any).userId ?? "unknown";
  try {
    const result = await withTenant(db, orgId, () => remediationRoutes.linkExternal(orgId, id, externalRef));
    await eventBus.publish("sentinel.notifications", {
      id: `evt-${id}-linked`,
      orgId,
      topic: "remediation.linked",
      payload: { remediationId: id, externalRef, linkedBy: userId },
      timestamp: new Date().toISOString(),
    });
    await auditLog.append(orgId, {
      actor: { type: "user", id: userId, name: userId },
      action: "remediation.link_external",
      resource: { type: "remediation_item", id },
      detail: { externalRef, provider },
    });
    return result;
  } catch (err: any) {
    const msg = err.message ?? "";
    if (msg.includes("not found")) { reply.code(404).send({ error: msg }); }
    else if (msg.includes("already linked")) { reply.code(409).send({ error: msg }); }
    else { reply.code(400).send({ error: msg }); }
  }
});

// --- Evidence Upload ---
app.post("/v1/compliance/remediations/:id/evidence/presign", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const userId = (request as any).userId ?? "unknown";
  const { fileName, fileSize, mimeType } = request.body as { fileName: string; fileSize: number; mimeType: string };
  try {
    const result = await withTenant(db, orgId, () => evidenceService.requestUpload(orgId, id, fileName, fileSize, mimeType, userId));
    return result;
  } catch (err: any) {
    const msg = err.message ?? "";
    if (msg.includes("not found")) { reply.code(404).send({ error: msg }); }
    else if (msg.includes("25MB")) { reply.code(413).send({ error: msg }); }
    else if (msg.includes("not allowed")) { reply.code(415).send({ error: msg }); }
    else { reply.code(400).send({ error: msg }); }
  }
});

app.post("/v1/compliance/remediations/:id/evidence/confirm", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const userId = (request as any).userId ?? "unknown";
  const { s3Key, fileName, fileSize, mimeType } = request.body as any;
  const result = await withTenant(db, orgId, () => evidenceService.confirmUpload(orgId, id, s3Key, fileName, fileSize, mimeType, userId)) as any;
  await eventBus.publish("sentinel.notifications", {
    id: `evt-${result.id}-evidence`,
    orgId,
    topic: "remediation.evidence",
    payload: { remediationId: id, evidenceId: result.id, fileName, action: "uploaded" },
    timestamp: new Date().toISOString(),
  });
  reply.code(201).send(result);
});

app.get("/v1/compliance/remediations/:id/evidence", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, () => evidenceService.list(orgId, id));
});

app.get("/v1/compliance/remediations/:id/evidence/:eid/url", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { eid } = request.params as { eid: string };
  try {
    const url = await withTenant(db, orgId, () => evidenceService.getDownloadUrl(orgId, eid));
    return { url };
  } catch (err: any) {
    reply.code(404).send({ error: err.message });
  }
});

app.delete("/v1/compliance/remediations/:id/evidence/:eid", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id, eid } = request.params as { id: string; eid: string };
  const userId = (request as any).userId ?? "unknown";
  try {
    await withTenant(db, orgId, () => evidenceService.delete(orgId, eid));
    await auditLog.append(orgId, {
      actor: { type: "user", id: userId, name: userId },
      action: "remediation.evidence_deleted",
      resource: { type: "evidence_attachment", id: eid },
      detail: { remediationId: id },
    });
    reply.code(204).send();
  } catch (err: any) {
    reply.code(404).send({ error: err.message });
  }
});

// --- Auto-Fix ---
app.post("/v1/compliance/remediations/:id/auto-fix", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const userId = (request as any).userId ?? "unknown";
  try {
    const { AutoFixService } = await import("@sentinel/compliance");
    const stubGitHub = {
      createBranch: async () => "branch",
      commitFile: async () => "sha",
      createPullRequest: async () => ({ html_url: "https://github.com/stub", number: 0 }),
    };
    const autoFixService = new AutoFixService(db, stubGitHub, eventBus);
    const result = await withTenant(db, orgId, () => autoFixService.triggerAutoFix(orgId, id, userId));
    await eventBus.publish("sentinel.notifications", { type: "remediation.auto_fix", orgId, itemId: id, prUrl: result.prUrl });
    return result;
  } catch (err: any) {
    const msg = err.message ?? "";
    if (msg.includes("not found")) { reply.code(404).send({ error: msg }); }
    else if (msg.includes("No linked finding") || msg.includes("No auto-fix")) { reply.code(422).send({ error: msg }); }
    else { reply.code(400).send({ error: msg }); }
  }
});

app.get("/v1/compliance/remediations/:id/auto-fix/status", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const item = await withTenant(db, orgId, () => db.remediationItem.findUnique({ where: { id } }));
  if (!item || item.orgId !== orgId) { reply.code(404).send({ error: "Remediation item not found" }); return; }
  return { externalRef: item.externalRef, hasAutoFix: !!item.externalRef?.startsWith("github:") };
});

// --- Integration Webhooks (Two-Way Sync) ---
app.post("/webhooks/jira", { config: { rateLimit: false } }, async (request, reply) => {
  const { SyncHandler } = await import("@sentinel/compliance");
  const syncHandler = new SyncHandler(db, eventBus);
  const orgId = (request.query as any).orgId ?? "default";
  try {
    const result = await syncHandler.handleJiraWebhook(request.body, orgId);
    if (result?.itemId) {
      await eventBus.publish("sentinel.notifications", { type: "remediation.synced", orgId, itemId: result.itemId, source: "jira" });
    }
    return result;
  } catch (err: any) {
    reply.code(400).send({ error: err.message });
  }
});

app.post("/webhooks/integration/github", { config: { rateLimit: false } }, async (request, reply) => {
  const { SyncHandler } = await import("@sentinel/compliance");
  const syncHandler = new SyncHandler(db, eventBus);
  const orgId = (request.query as any).orgId ?? "default";
  try {
    const result = await syncHandler.handleGitHubWebhook(request.body, orgId);
    if (result?.itemId) {
      await eventBus.publish("sentinel.notifications", { type: "remediation.synced", orgId, itemId: result.itemId, source: "github" });
    }
    return result;
  } catch (err: any) {
    reply.code(400).send({ error: err.message });
  }
});

// --- Workflow Config ---
app.get("/v1/compliance/workflow-config", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  return withTenant(db, orgId, async () => {
    const config = await db.workflowConfig.findUnique({ where: { orgId } });
    return config ?? { skipStages: [] };
  });
});

app.put("/v1/compliance/workflow-config", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const userId = (request as any).userId ?? "unknown";
  const { skipStages } = request.body as { skipStages: string[] };

  // Validate skip stages
  const { WorkflowFSM } = await import("@sentinel/compliance");
  try {
    new WorkflowFSM(skipStages); // validates
  } catch (err: any) {
    reply.code(400).send({ error: err.message });
    return;
  }

  const config = await withTenant(db, orgId, () =>
    db.workflowConfig.upsert({
      where: { orgId },
      create: { orgId, skipStages },
      update: { skipStages },
    })
  );

  await auditLog.append(orgId, {
    actor: { type: "user", id: userId, name: userId },
    action: "workflow.config_updated",
    resource: { type: "workflow_config", id: config.id },
    detail: { skipStages },
  });

  return config;
});

// --- BAA ---
app.post("/v1/compliance/baa", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  try {
    const result = await withTenant(db, orgId, () => baaRoutes.register(orgId, request.body));
    reply.code(201).send(result);
  } catch (err: any) { reply.code(400).send({ error: err.message }); }
});

app.get("/v1/compliance/baa", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  return withTenant(db, orgId, () => baaRoutes.list(orgId));
});

app.get("/v1/compliance/baa/expiring", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { days } = request.query as { days?: string };
  return withTenant(db, orgId, () => baaRoutes.getExpiring(orgId, days ? parseInt(days) : 30));
});

app.patch("/v1/compliance/baa/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  try {
    const result = await withTenant(db, orgId, () => baaRoutes.update(orgId, id, request.body));
    return result;
  } catch (err: any) { reply.code(400).send({ error: err.message }); }
});

app.delete("/v1/compliance/baa/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  try {
    const result = await withTenant(db, orgId, () => baaRoutes.terminate(orgId, id));
    return result;
  } catch (err: any) { reply.code(400).send({ error: err.message }); }
});

// --- Attestation routes ---
app.post("/v1/compliance/attestations", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  try {
    const result = await withTenant(db, orgId, () => attestationRoutes.createAttestation(orgId, request.body));
    reply.code(201).send(result);
  } catch (err: any) {
    reply.code(400).send({ error: err.message });
  }
});

app.get("/v1/compliance/attestations", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { framework } = request.query as { framework?: string };
  return withTenant(db, orgId, () => attestationRoutes.listAttestations(orgId, framework));
});

app.get("/v1/compliance/attestations/expiring", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { days } = request.query as { days?: string };
  return withTenant(db, orgId, () => attestationRoutes.getExpiringAttestations(orgId, days ? parseInt(days) : 14));
});

app.get("/v1/compliance/attestations/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, async () => {
    const att = await attestationRoutes.getAttestation(orgId, id);
    if (!att) { reply.code(404).send({ error: "Attestation not found" }); return; }
    return att;
  });
});

app.delete("/v1/compliance/attestations/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const userId = (request as any).userId ?? "unknown";
  const { reason } = request.body as { reason: string };
  try {
    const result = await withTenant(db, orgId, () => attestationRoutes.revokeAttestation(orgId, id, reason, userId));
    return result;
  } catch (err: any) {
    reply.code(400).send({ error: err.message });
  }
});

app.post("/v1/compliance/attestations/:id/renew", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const userId = (request as any).userId ?? "unknown";
  try {
    const result = await withTenant(db, orgId, () => attestationRoutes.renewAttestation(orgId, id, userId));
    return result;
  } catch (err: any) {
    reply.code(400).send({ error: err.message });
  }
});

// --- Evidence ---
app.get("/v1/evidence", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { limit = "50", offset = "0" } = request.query as any;
  return withTenant(db, orgId, async (tx) => {
    const [records, total] = await Promise.all([
      tx.evidenceRecord.findMany({ take: Number(limit), skip: Number(offset), orderBy: { createdAt: "desc" } }),
      tx.evidenceRecord.count(),
    ]);
    return { records, total, limit: Number(limit), offset: Number(offset) };
  });
});

app.get("/v1/evidence/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const record = await withTenant(db, orgId, async (tx) => {
    return tx.evidenceRecord.findUnique({ where: { id } });
  });
  if (!record) { reply.code(404).send({ error: "Evidence record not found" }); return; }
  return record;
});

app.get("/v1/evidence/verify", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const records = await withTenant(db, orgId, async (tx) => {
    return tx.evidenceRecord.findMany({ orderBy: { createdAt: "asc" } });
  });
  const chain = records.map((r: any) => ({ data: r.data, hash: r.hash, prevHash: r.prevHash }));
  const result = verifyEvidenceChain(chain);
  return { ...result, totalRecords: records.length };
});

// --- Reports ---
app.post("/v1/reports", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { type, frameworkId, parameters } = request.body as any;
  if (!VALID_REPORT_TYPES.includes(type)) {
    reply.code(400).send({ error: `Invalid report type. Must be one of: ${VALID_REPORT_TYPES.join(", ")}` });
    return;
  }
  const report = await db.report.create({
    data: { orgId, type, frameworkId, parameters: parameters ?? {}, requestedBy: "api" },
  });
  await eventBus.publish("sentinel.reports", { reportId: report.id, orgId, type, frameworkId, parameters });
  reply.code(202).send(report);
});

app.get("/v1/reports", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { limit = "50", offset = "0" } = request.query as any;
  return withTenant(db, orgId, async (tx) => {
    const [reports, total] = await Promise.all([
      tx.report.findMany({ take: Number(limit), skip: Number(offset), orderBy: { createdAt: "desc" } }),
      tx.report.count(),
    ]);
    return { reports, total, limit: Number(limit), offset: Number(offset) };
  });
});

app.get("/v1/reports/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const report = await withTenant(db, orgId, async (tx) => {
    return tx.report.findUnique({ where: { id } });
  });
  if (!report) { reply.code(404).send({ error: "Report not found" }); return; }
  return report;
});

// --- Report Schedules ---
app.get("/v1/report-schedules", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { limit = "50", offset = "0" } = request.query as any;
  const result = await reportScheduleRoutes.list(orgId, { limit: Number(limit), offset: Number(offset) });
  return result;
});

app.get("/v1/report-schedules/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const schedule = await reportScheduleRoutes.get(orgId, id);
  if (!schedule) { reply.code(404).send({ error: "Schedule not found" }); return; }
  return schedule;
});

app.post("/v1/report-schedules", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const role = (request as any).role ?? "unknown";
  if (!["admin", "manager", "service"].includes(role)) {
    reply.code(403).send({ error: "Admin or manager role required" }); return;
  }
  try {
    const schedule = await reportScheduleRoutes.create(orgId, request.body as any, (request as any).userId ?? role);
    reply.code(201).send(schedule);
  } catch (err: any) {
    reply.code(400).send({ error: err.message });
  }
});

app.put("/v1/report-schedules/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const role = (request as any).role ?? "unknown";
  if (!["admin", "manager", "service"].includes(role)) {
    reply.code(403).send({ error: "Admin or manager role required" }); return;
  }
  const { id } = request.params as { id: string };
  try {
    const schedule = await reportScheduleRoutes.update(orgId, id, request.body as any);
    return schedule;
  } catch (err: any) {
    reply.code(err.message.includes("not found") ? 404 : 400).send({ error: err.message });
  }
});

app.delete("/v1/report-schedules/:id", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const role = (request as any).role ?? "unknown";
  if (!["admin", "manager", "service"].includes(role)) {
    reply.code(403).send({ error: "Admin or manager role required" }); return;
  }
  const { id } = request.params as { id: string };
  try {
    await reportScheduleRoutes.remove(orgId, id);
    reply.code(204).send();
  } catch (err: any) {
    reply.code(404).send({ error: err.message });
  }
});

app.post("/v1/report-schedules/:id/trigger", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const role = (request as any).role ?? "unknown";
  if (!["admin", "manager", "service"].includes(role)) {
    reply.code(403).send({ error: "Admin or manager role required" }); return;
  }
  const { id } = request.params as { id: string };
  try {
    const result = await reportScheduleRoutes.trigger(orgId, id);
    return result;
  } catch (err: any) {
    reply.code(404).send({ error: err.message });
  }
});

// --- Webhooks ---
app.post("/v1/webhooks", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const role = (request as any).role ?? "unknown";
  const result = await webhookRoutes.createEndpoint({ orgId, body: request.body as any, createdBy: role });
  reply.code(201).send(result);
});

app.get("/v1/webhooks", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { limit = "50", offset = "0" } = request.query as any;
  return webhookRoutes.listEndpoints({ orgId, limit: Number(limit), offset: Number(offset) });
});

app.get("/v1/webhooks/:id", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const ep = await webhookRoutes.getEndpoint(id);
  if (!ep) { reply.code(404).send({ error: "Webhook endpoint not found" }); return; }
  return ep;
});

app.put("/v1/webhooks/:id", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const ep = await webhookRoutes.getEndpoint(id);
  if (!ep) { reply.code(404).send({ error: "Webhook endpoint not found" }); return; }
  const body = request.body as Record<string, unknown>;
  return webhookRoutes.updateEndpoint(id, body);
});

app.delete("/v1/webhooks/:id", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const ep = await webhookRoutes.getEndpoint(id);
  if (!ep) { reply.code(404).send({ error: "Webhook endpoint not found" }); return; }
  await webhookRoutes.deleteEndpoint(id);
  reply.code(204).send();
});

app.get("/v1/webhooks/:id/deliveries", { preHandler: authHook }, async (request) => {
  const { id } = request.params as { id: string };
  const { limit = "50", offset = "0" } = request.query as any;
  return webhookRoutes.getDeliveries({ endpointId: id, limit: Number(limit), offset: Number(offset) });
});

// --- Webhook test endpoint ---
app.post("/v1/webhooks/:id/test", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const ep = await webhookRoutes.getEndpoint(id);
  if (!ep) { reply.code(404).send({ error: "Webhook endpoint not found" }); return; }
  const adapter = new HttpWebhookAdapter();
  const testEvent = {
    id: `test-${Date.now()}`,
    orgId: ep.orgId,
    topic: "system.test",
    payload: { message: "Test webhook from SENTINEL", endpointId: id },
    timestamp: new Date().toISOString(),
  };
  const result = await adapter.deliver(ep, testEvent);
  return { ...result, event: testEvent };
});

// --- Notification rules ---
app.post("/v1/notifications/rules", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const role = (request as any).role ?? "unknown";
  const result = await ruleRoutes.createRule({ orgId, body: request.body as any, createdBy: role });
  reply.code(201).send(result);
});

app.get("/v1/notifications/rules", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  return ruleRoutes.listRules(orgId);
});

app.delete("/v1/notifications/rules/:id", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  await ruleRoutes.deleteRule(id);
  reply.code(204).send();
});

// --- SSE Event Stream ---
app.get("/v1/events/stream", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { topics = "scan.*,finding.*" } = request.query as { topics?: string };
  const topicList = topics.split(",").map((t: string) => t.trim()).filter(Boolean);

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const clientId = randomUUID();
  const client = {
    id: clientId,
    orgId,
    topics: topicList,
    write: (data: string) => {
      try { reply.raw.write(data); return true; } catch { return false; }
    },
    close: () => {
      try { reply.raw.end(); } catch { /* already closed */ }
    },
  };

  sseManager.register(client);
  sseConnectionsGauge.inc({ org_id: orgId });

  const heartbeat = setInterval(() => {
    try { reply.raw.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 30_000);

  request.raw.on("close", () => {
    clearInterval(heartbeat);
    sseManager.unregister(clientId, orgId);
    sseConnectionsGauge.dec({ org_id: orgId });
  });
});

// --- P10: SSO + Encryption routes ---
registerApiKeyRoutes(app, authHook);
registerSsoConfigRoutes(app, authHook);
registerDiscoveryRoutes(app);  // Public, no auth
registerSamlMetadataRoute(app);  // Public, no auth
registerOrgMembershipRoutes(app, authHook);
registerScimRoutes(app);  // Uses own SCIM auth
registerJitRoutes(app);  // Public, called by NextAuth signIn callback
registerSessionRoutes(app);  // Public, called by NextAuth jwt callback + signIn event
registerAuditEventRoutes(app, auditLog);  // Public, called by NextAuth audit emitter
registerOrgSettingsRoutes(app, authHook);  // Org settings (session policy, etc.)
// --- Encryption wiring ---
dekCache = new DekCache();
const kms = new LocalKmsProvider();
const envelope = new EnvelopeEncryption(kms, dekCache);

// Wire key loader: loads wrapped DEK from DB for a given org+purpose
envelope.setKeyLoader(async (orgId, purpose) => {
  const record = await db.encryptionKey.findFirst({
    where: { orgId, purpose, active: true },
    orderBy: { version: "desc" },
  });
  if (!record) return null;
  return { wrappedDek: Buffer.from(record.wrappedDek), kekId: record.kekId };
});

// Wire key provisioner: persists newly generated DEK to DB
envelope.setKeyProvisioner(async (orgId, purpose, wrappedDek, kekId) => {
  await db.encryptionKey.create({
    data: { orgId, purpose, wrappedDek: new Uint8Array(wrappedDek), kekId, kekProvider: kms.name },
  });
});

envelope.setDefaultKekId("default");

// Activate encryption middleware on Prisma client
initEncryption(envelope);

registerEncryptionAdminRoutes(app, authHook, dekCache);
registerDomainRoutes(app, authHook);

// ── AI Metrics ─────────────────────────────────────────
app.get("/v1/ai-metrics/stats", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  return withTenant(db, orgId, () => aiMetricsRoutes.getStats(orgId));
});

app.get("/v1/ai-metrics/trend", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { days, projectId } = request.query as any;
  return withTenant(db, orgId, () =>
    aiMetricsRoutes.getTrend(orgId, { days: days ? Number(days) : undefined, projectId: projectId || undefined }),
  );
});

app.get("/v1/ai-metrics/tools", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { projectId } = request.query as any;
  return withTenant(db, orgId, () => aiMetricsRoutes.getTools(orgId, { projectId: projectId || undefined }));
});

app.get("/v1/ai-metrics/projects", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { limit, sortBy } = request.query as any;
  return withTenant(db, orgId, () => aiMetricsRoutes.getProjects(orgId, { limit: limit ? Number(limit) : undefined, sortBy: sortBy || undefined }));
});

app.get("/v1/ai-metrics/projects/compare", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { projectIds, days } = request.query as any;
  if (!projectIds) return reply.code(400).send({ error: "projectIds required" });
  const ids = Array.isArray(projectIds) ? projectIds : projectIds.split(",");
  try {
    return await withTenant(db, orgId, () => aiMetricsRoutes.compareProjects(orgId, ids, days ? Number(days) : undefined));
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

app.get("/v1/ai-metrics/compliance", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  return withTenant(db, orgId, () => aiMetricsRoutes.getCompliance(orgId));
});

app.get("/v1/ai-metrics/alerts", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  return withTenant(db, orgId, () => aiMetricsRoutes.getAlerts(orgId));
});

app.get("/v1/ai-metrics/config", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  return withTenant(db, orgId, () => aiMetricsRoutes.getConfig(orgId));
});

app.put("/v1/ai-metrics/config", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const userId = (request as any).userId ?? "unknown";
  try {
    const result = await withTenant(db, orgId, () => aiMetricsRoutes.updateConfig(orgId, request.body));
    await auditLog.append(orgId, {
      actor: { type: "user", id: userId, name: userId },
      action: "ai_metrics_config.update",
      resource: { type: "ai_metrics_config", id: orgId },
      detail: request.body as any,
    });
    return result;
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// ── Risk Trends ────────────────────────────────────────
app.get("/v1/risk-trends", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { days = "90" } = request.query as any;
  const parsedDays = parseInt(days, 10);
  return withTenant(db, orgId, () =>
    riskTrendRoutes.getTrends(orgId, { days: Number.isNaN(parsedDays) ? undefined : parsedDays }),
  );
});

// ── Decision Traces ────────────────────────────────────────
app.get("/v1/findings/:id/trace", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, () => decisionTraceRoutes.getByFinding(id));
});

app.get("/v1/scans/:id/traces", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, () => decisionTraceRoutes.getByScan(id));
});

// ── IP Attribution ────────────────────────────────────────
app.get("/v1/scans/:id/ip-attribution", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, () => ipAttributionRoutes.getByScan(id));
});

app.get("/v1/scans/:id/ip-attribution/document", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, () => ipAttributionRoutes.getDocument(id));
});

app.get("/v1/scans/:id/ip-attribution/verify", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, () => ipAttributionRoutes.verify(id));
});

app.get("/v1/scans/:id/ip-attribution/files", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, () => ipAttributionRoutes.getAttributions(id));
});

app.get("/v1/scans/:id/ip-attribution/files/:file", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { id, file } = request.params as { id: string; file: string };
  return withTenant(db, orgId, () => ipAttributionRoutes.getFileEvidence(id, decodeURIComponent(file)));
});

app.get("/v1/scans/:id/ip-attribution/export/spdx", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, () => ipAttributionRoutes.downloadSpdx(id));
});

app.get("/v1/scans/:id/ip-attribution/export/cyclonedx", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, () => ipAttributionRoutes.downloadCycloneDx(id));
});

app.get("/v1/scans/:id/ip-attribution/export/pdf", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  const result = await withTenant(db, orgId, () => ipAttributionRoutes.downloadPdf(id));
  if (result.error) return result;
  reply.header("Content-Type", "application/pdf");
  reply.header("Content-Disposition", `attachment; filename="ip-attribution-${id}.pdf"`);
  return reply.send(result.content);
});

app.get("/v1/ip-attribution/tools", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  return withTenant(db, orgId, () => ipAttributionRoutes.getOrgToolBreakdown(orgId));
});

app.get("/v1/ip-attribution/files/:file/history", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { file } = request.params as { file: string };
  return withTenant(db, orgId, () => ipAttributionRoutes.getFileHistory(orgId, decodeURIComponent(file)));
});

app.get("/v1/ip-attribution/ai-trend", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { days = "90" } = request.query as any;
  return withTenant(db, orgId, () => ipAttributionRoutes.getOrgAiTrend(orgId, parseInt(days, 10)));
});

app.post("/v1/scans/:id/ip-attribution/generate", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { id } = request.params as { id: string };
  return withTenant(db, orgId, () => ipAttributionRoutes.generate(id, orgId));
});

// --- Graceful shutdown ---
const shutdown = async () => {
  app.log.info("Shutting down...");
  await app.close();
  await eventBus.disconnect();
  if (process.env.NODE_ENV !== "test") await shutdownTracing();
  await disconnectDb();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// ── Prometheus Metrics ────────────────────────────────
registerMetricsRoute(app);

// --- Start ---
const port = parseInt(process.env.PORT ?? "8080", 10);
if (process.env.NODE_ENV !== "test") {
  app.listen({ port, host: "0.0.0.0" }).then(() => {
    app.log.info(`SENTINEL API listening on :${port}`);
  });
}

// Redis pub/sub for SSE fan-out from notification-worker
if (process.env.NODE_ENV !== "test" && typeof redis.duplicate === "function") {
  const redisSub = redis.duplicate();
  redisSub.subscribe("sentinel.events.fanout");
  redisSub.on("message", (_channel: string, message: string) => {
    try {
      const event = JSON.parse(message);
      sseManager.broadcast(event);
    } catch { /* ignore malformed messages */ }
  });
}

export { app, sseManager };
