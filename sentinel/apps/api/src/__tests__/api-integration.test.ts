import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { signRequest } from "@sentinel/auth";

const SECRET = "integration-test-secret";

// ── In-memory data ──────────────────────────────────────────────────────────
const scans = [
  {
    id: "scan-1",
    projectId: "proj-1",
    orgId: "default",
    status: "completed",
    commitHash: "abc123",
    branch: "main",
    startedAt: new Date(),
    certificate: null,
    findings: [],
    agentResults: [],
    _count: { findings: 0 },
  },
];

const findings = [
  {
    id: "find-1",
    severity: "high",
    category: "xss",
    createdAt: new Date(),
    scan: { projectId: "proj-1" },
  },
];

const certificates = [
  {
    id: "cert-1",
    scanId: "scan-1",
    orgId: "default",
    status: "provisional_pass",
    riskScore: 0,
    verdict: { pass: true },
    issuedAt: new Date(),
    revokedAt: null,
    revocationReason: null,
    scan: { commitHash: "abc123", branch: "main" },
  },
];

const projects = [
  {
    id: "proj-1",
    name: "test-project",
    createdAt: new Date(),
    _count: { scans: 1 },
    scans: [],
  },
];

const policies = [
  {
    id: "pol-1",
    name: "default-policy",
    rules: {},
    version: 1,
    createdAt: new Date(),
  },
];

const auditEvents = [
  {
    id: "evt-1",
    orgId: "default",
    action: "scan.started",
    timestamp: new Date(),
  },
];

// ── Helper to build a Prisma-like model mock ────────────────────────────────
function makeModel<T extends Record<string, unknown>>(
  items: T[],
  orderKey = "createdAt" as string,
) {
  return {
    findMany: vi.fn(async (opts?: any) => {
      let result = [...items];
      if (opts?.where) {
        result = result.filter((item) => {
          for (const [k, v] of Object.entries(opts.where)) {
            if ((item as any)[k] !== v) return false;
          }
          return true;
        });
      }
      const skip = opts?.skip ?? 0;
      const take = opts?.take ?? result.length;
      return result.slice(skip, skip + take);
    }),
    findUnique: vi.fn(async (opts: any) => {
      return items.find((i) => (i as any).id === opts.where.id) ?? null;
    }),
    findFirst: vi.fn(async () => items[0] ?? null),
    count: vi.fn(async (opts?: any) => {
      if (!opts?.where) return items.length;
      return items.filter((item) => {
        for (const [k, v] of Object.entries(opts.where)) {
          if ((item as any)[k] !== v) return false;
        }
        return true;
      }).length;
    }),
    create: vi.fn(async (opts: any) => ({
      id: `new-${Date.now()}`,
      ...opts.data,
    })),
    update: vi.fn(async (opts: any) => ({
      ...(items.find((i) => (i as any).id === opts.where.id) ?? {}),
      ...opts.data,
    })),
    delete: vi.fn(async () => ({})),
  };
}

// ── Mocks ───────────────────────────────────────────────────────────────────

// @sentinel/db
vi.mock("@sentinel/db", () => {
  const scanModel = makeModel(scans, "startedAt");
  const findingModel = makeModel(findings);
  const certificateModel = makeModel(certificates, "issuedAt");
  const projectModel = makeModel(projects);
  const policyModel = makeModel(policies);
  const auditEventModel = makeModel(auditEvents, "timestamp");

  const tenant = {
    scan: scanModel,
    finding: findingModel,
    certificate: certificateModel,
    project: projectModel,
    policy: policyModel,
    auditEvent: auditEventModel,
  };

  return {
    getDb: () => tenant,
    disconnectDb: vi.fn(),
    withTenant: vi.fn(async (_db: any, _orgId: string, fn: any) => fn(tenant)),
  };
});

// @sentinel/events
vi.mock("@sentinel/events", () => ({
  EventBus: vi.fn().mockImplementation(() => ({
    publish: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
  })),
  getDlqDepth: vi.fn(async () => 0),
  readDlq: vi.fn(async () => []),
}));

// @sentinel/audit
vi.mock("@sentinel/audit", () => ({
  AuditLog: vi.fn().mockImplementation(() => ({
    append: vi.fn(async () => {}),
  })),
}));

// @sentinel/telemetry
// Fastify 5 expects `logger` to be a plain config object (not a pino instance).
// Returning { level: "silent" } satisfies Fastify's logger-factory validation.
vi.mock("@sentinel/telemetry", () => {
  const noopLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: "silent",
  };
  return {
    createLogger: vi.fn(() => ({ level: "silent" })),
    withCorrelationId: vi.fn(() => noopLogger),
    registry: { metrics: vi.fn(async () => "# HELP test\n") },
    httpRequestDuration: { observe: vi.fn() },
    dlqDepthGauge: { set: vi.fn() },
  };
});

// @sentinel/github
vi.mock("@sentinel/github", () => ({
  configureGitHubApp: vi.fn(),
}));

// @sentinel/assessor
vi.mock("@sentinel/assessor", () => ({
  verifyCertificate: vi.fn(() => true),
}));

// ioredis
vi.mock("ioredis", () => ({
  Redis: vi.fn().mockImplementation(() => ({
    disconnect: vi.fn(),
    quit: vi.fn(),
  })),
}));

// @fastify/rate-limit — disable rate limiting in tests
vi.mock("@fastify/rate-limit", () => ({
  default: vi.fn(async () => {}),
}));

// ── Test setup ──────────────────────────────────────────────────────────────
/**
 * Build auth headers with a valid HMAC signature.
 *
 * The auth middleware serialises the body via:
 *   typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? "")
 *
 * For GET requests, body is empty string (null/undefined → "").
 * For GET requests, body is empty string. For POST/PUT/PATCH with a JSON
 * payload, body is the JSON-stringified request body.
 *
 * `body` here must match whatever the middleware will compute.
 */
function signedHeaders(body = "", role = "admin"): Record<string, string> {
  return {
    "x-sentinel-signature": signRequest(body, SECRET),
    "x-sentinel-api-key": "test-client",
    "x-sentinel-role": role,
  };
}

let app: any;

describe("API integration", () => {
  beforeAll(async () => {
    process.env.SENTINEL_SECRET = SECRET;
    process.env.NODE_ENV = "test";
    const server = await import("../server.js");
    app = server.app;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Health & metrics ────────────────────────────────────────────────────
  it("GET /health returns 200 with status ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe("ok");
  });

  it("GET /metrics returns 200 text/plain", async () => {
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
  });

  // ── Auth enforcement ──────────────────────────────────────────────────
  it("rejects request without signature (401)", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/scans" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects request with invalid signature (401)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/scans",
      headers: {
        "x-sentinel-signature": "t=0,sig=0000000000000000000000000000000000000000000000000000000000000000",
        "x-sentinel-api-key": "test-client",
        "x-sentinel-role": "admin",
      },
    });
    expect(res.statusCode).toBe(401);
  });

  // ── RBAC ──────────────────────────────────────────────────────────────
  it("rejects viewer accessing admin endpoint /v1/admin/dlq (403)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/dlq",
      headers: signedHeaders("", "viewer"),
    });
    expect(res.statusCode).toBe(403);
  });

  // ── Scans ─────────────────────────────────────────────────────────────
  it("GET /v1/scans returns scan list with proper shape", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/scans",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty("scans");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("limit");
    expect(body).toHaveProperty("offset");
    expect(Array.isArray(body.scans)).toBe(true);
  });

  it("GET /v1/scans supports pagination params", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/scans?limit=10&offset=0",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(0);
  });

  it("GET /v1/scans/:id returns 200 for existing scan", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/scans/scan-1",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
  });

  it("GET /v1/scans/:id returns 404 for missing scan", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/scans/nonexistent",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });

  // ── Findings ──────────────────────────────────────────────────────────
  it("GET /v1/findings returns finding list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/findings",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty("findings");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("limit");
    expect(body).toHaveProperty("offset");
  });

  // ── Certificates ──────────────────────────────────────────────────────
  it("GET /v1/certificates returns certificate list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/certificates",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty("certificates");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("limit");
    expect(body).toHaveProperty("offset");
  });

  // ── Projects ──────────────────────────────────────────────────────────
  it("GET /v1/projects returns project list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/projects",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
  });

  // ── Policies ──────────────────────────────────────────────────────────
  it("GET /v1/policies returns policy list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/policies",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
  });

  it("POST /v1/policies creates policy (admin) returns 201", async () => {
    const bodyObj = { name: "new-policy", rules: {} };
    const payload = JSON.stringify(bodyObj);
    // Fastify parses JSON, then auth middleware does JSON.stringify(parsedBody)
    const signBody = JSON.stringify(bodyObj);
    const res = await app.inject({
      method: "POST",
      url: "/v1/policies",
      headers: {
        ...signedHeaders(signBody, "admin"),
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(201);
  });

  it("POST /v1/policies rejected for viewer (403)", async () => {
    const bodyObj = { name: "new-policy", rules: {} };
    const payload = JSON.stringify(bodyObj);
    const signBody = JSON.stringify(bodyObj);
    const res = await app.inject({
      method: "POST",
      url: "/v1/policies",
      headers: {
        ...signedHeaders(signBody, "viewer"),
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(403);
  });

  // ── Audit ─────────────────────────────────────────────────────────────
  it("GET /v1/audit requires admin or manager — developer gets 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/audit",
      headers: signedHeaders("", "developer"),
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET /v1/audit allowed for admin (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/audit",
      headers: signedHeaders("", "admin"),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty("events");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("limit");
    expect(body).toHaveProperty("offset");
  });

  // ── Unknown route ─────────────────────────────────────────────────────
  it("unknown route returns 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/nonexistent",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });
});
