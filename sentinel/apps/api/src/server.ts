import crypto from "node:crypto";
import Fastify from "fastify";
import { Redis } from "ioredis";
import { getDb, disconnectDb } from "@sentinel/db";
import { EventBus } from "@sentinel/events";
import { AuditLog } from "@sentinel/audit";
import { verifyCertificate } from "@sentinel/assessor";
import { createLogger, withCorrelationId, registry, httpRequestDuration } from "@sentinel/telemetry";
import { createAuthHook } from "./middleware/auth.js";
import { buildScanRoutes } from "./routes/scans.js";
import { createScanStore, createAuditEventStore } from "./stores.js";
import { registerSecurityPlugins } from "./plugins/security.js";

const app = Fastify({ logger: createLogger({ name: "sentinel-api" }) });

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

// --- Security plugins ---
await registerSecurityPlugins(app, { redis });

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
app.post("/v1/scans", { preHandler: authHook }, async (request, reply) => {
  const body = request.body as any;
  const orgId = (request as any).orgId ?? "default";
  const result = await scanRoutes.submitScan({ orgId, body });
  reply.code(201).send(result);
});

app.get("/v1/scans/:id", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const scan = await scanRoutes.getScan(id);
  if (!scan) {
    reply.code(404).send({ error: "Scan not found" });
    return;
  }
  return scan;
});

app.get("/v1/scans/:id/poll", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const scan = await scanRoutes.getScan(id) as any;
  if (!scan) {
    reply.code(404).send({ error: "Scan not found" });
    return;
  }
  return {
    status: scan.status,
    assessment: scan.status === "completed" ? scan : undefined,
  };
});

// --- Findings ---
app.get("/v1/findings", { preHandler: authHook }, async (request) => {
  const { limit = "50", offset = "0", severity, category } = request.query as any;
  const where: any = {};
  if (severity) where.severity = severity;
  if (category) where.category = category;
  const [findings, total] = await Promise.all([
    db.finding.findMany({
      where,
      take: Number(limit),
      skip: Number(offset),
      orderBy: { createdAt: "desc" },
    }),
    db.finding.count({ where }),
  ]);
  return { findings, total, limit: Number(limit), offset: Number(offset) };
});

app.get("/v1/findings/:id", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const finding = await db.finding.findUnique({ where: { id } });
  if (!finding) {
    reply.code(404).send({ error: "Finding not found" });
    return;
  }
  return finding;
});

// --- Certificates ---
app.get("/v1/certificates", { preHandler: authHook }, async (request) => {
  const { limit = "50", offset = "0" } = request.query as any;
  const [certificates, total] = await Promise.all([
    db.certificate.findMany({
      take: Number(limit),
      skip: Number(offset),
      orderBy: { issuedAt: "desc" },
    }),
    db.certificate.count(),
  ]);
  return { certificates, total, limit: Number(limit), offset: Number(offset) };
});

app.get("/v1/certificates/:id", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const cert = await db.certificate.findUnique({ where: { id } });
  if (!cert) {
    reply.code(404).send({ error: "Certificate not found" });
    return;
  }
  return cert;
});

app.post("/v1/certificates/:id/verify", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const cert = await db.certificate.findUnique({ where: { id } });
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

// --- Projects ---
app.get("/v1/projects", { preHandler: authHook }, async () => {
  return db.project.findMany({
    include: { _count: { select: { scans: true } } },
    orderBy: { createdAt: "desc" },
  });
});

app.get("/v1/projects/:id", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const project = await db.project.findUnique({
    where: { id },
    include: {
      _count: { select: { scans: true } },
      scans: { take: 10, orderBy: { startedAt: "desc" }, include: { certificate: true } },
    },
  });
  if (!project) {
    reply.code(404).send({ error: "Project not found" });
    return;
  }
  return project;
});

// --- Policies ---
app.get("/v1/policies", { preHandler: authHook }, async () => {
  return db.policy.findMany({ orderBy: { createdAt: "desc" } });
});

app.post("/v1/policies", { preHandler: authHook }, async (request, reply) => {
  const body = request.body as any;
  const policy = await db.policy.create({ data: body });
  reply.code(201).send(policy);
});

// --- Audit log ---
app.get("/v1/audit", { preHandler: authHook }, async (request) => {
  const { limit = "50", offset = "0" } = request.query as any;
  const [events, total] = await Promise.all([
    db.auditEvent.findMany({
      take: Number(limit),
      skip: Number(offset),
      orderBy: { timestamp: "desc" },
    }),
    db.auditEvent.count(),
  ]);
  return { events, total, limit: Number(limit), offset: Number(offset) };
});

// --- Graceful shutdown ---
const shutdown = async () => {
  app.log.info("Shutting down...");
  await app.close();
  await eventBus.disconnect();
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
