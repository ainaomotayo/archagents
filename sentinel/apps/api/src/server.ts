import crypto from "node:crypto";
import Fastify from "fastify";
import { Redis } from "ioredis";
import { getDb, disconnectDb, withTenant } from "@sentinel/db";
import { EventBus, getDlqDepth, readDlq } from "@sentinel/events";
import { AuditLog } from "@sentinel/audit";
import { verifyCertificate } from "@sentinel/assessor";
import { withCorrelationId, registry, httpRequestDuration, dlqDepthGauge, initTracing, shutdownTracing } from "@sentinel/telemetry";
import { configureGitHubApp } from "@sentinel/github";
import {
  BUILT_IN_FRAMEWORKS,
  FRAMEWORK_MAP,
  scoreFramework,
  computeEvidenceHash,
  verifyEvidenceChain,
  VALID_REPORT_TYPES,
  type FindingInput,
} from "@sentinel/compliance";
import { createAuthHook } from "./middleware/auth.js";
import { buildScanRoutes } from "./routes/scans.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { buildWebhookRoutes } from "./routes/notification-endpoints.js";
import { buildNotificationRuleRoutes } from "./routes/notification-rules.js";
import { HttpWebhookAdapter } from "@sentinel/notifications";
import { createScanStore, createAuditEventStore } from "./stores.js";
import { registerSecurityPlugins } from "./plugins/security.js";

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

// --- Findings ---
app.get("/v1/findings", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { limit = "50", offset = "0", severity, category } = request.query as any;
  return withTenant(db, orgId, async (tx) => {
    const where: any = {};
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
    }
    return updated;
  });
});

// --- Certificates ---
app.get("/v1/certificates", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { limit = "50", offset = "0" } = request.query as any;
  return withTenant(db, orgId, async (tx) => {
    const [certificates, total] = await Promise.all([
      tx.certificate.findMany({
        take: Number(limit),
        skip: Number(offset),
        orderBy: { issuedAt: "desc" },
        include: { scan: { select: { commitHash: true, branch: true } } },
      }),
      tx.certificate.count(),
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
  const result = scoreFramework(fw.controls, inputs);
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

// --- Start ---
const port = parseInt(process.env.PORT ?? "8080", 10);
if (process.env.NODE_ENV !== "test") {
  app.listen({ port, host: "0.0.0.0" }).then(() => {
    app.log.info(`SENTINEL API listening on :${port}`);
  });
}

export { app };
