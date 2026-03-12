import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { signRequest } from "@sentinel/auth";

const SECRET = "compliance-test-secret";

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
    agentName: "semgrep",
    suppressed: false,
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

const customFrameworks = [
  {
    id: "custom-fw-1",
    slug: "custom-fw",
    name: "Custom Framework",
    version: "1.0",
    orgId: "default",
    controls: [],
    createdAt: new Date(),
  },
];

const complianceAssessments = [
  {
    id: "assess-1",
    frameworkId: "soc2",
    orgId: "default",
    score: 0.85,
    verdict: "partially_compliant",
    controlScores: [],
    assessedAt: new Date(),
  },
];

const complianceSnapshots = [
  {
    id: "snap-1",
    frameworkId: "soc2",
    orgId: "default",
    score: 0.85,
    verdict: "partially_compliant",
    date: new Date(),
  },
];

const evidenceRecords = [
  {
    id: "ev-1",
    orgId: "default",
    type: "scan",
    data: { scanId: "scan-1" },
    hash: "abc123hash",
    prevHash: null,
    createdAt: new Date(),
  },
];

const reports = [
  {
    id: "rpt-1",
    orgId: "default",
    type: "compliance_summary",
    frameworkId: "soc2",
    status: "completed",
    parameters: {},
    requestedBy: "api",
    createdAt: new Date(),
  },
];

// ── Helper to build a Prisma-like model mock ────────────────────────────────
function makeModel<T extends Record<string, unknown>>(
  items: T[],
  _orderKey = "createdAt" as string,
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
    upsert: vi.fn(async (opts: any) => ({
      id: `upsert-${Date.now()}`,
      ...opts.create,
      ...opts.update,
    })),
    deleteMany: vi.fn(async () => ({ count: 0 })),
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
  const policyVersionModel = makeModel([] as any[], "changedAt");
  const auditEventModel = makeModel(auditEvents, "timestamp");
  const complianceFrameworkModel = makeModel(customFrameworks);
  const complianceControlModel = makeModel([] as any[]);
  const complianceControlOverrideModel = makeModel([] as any[]);
  const complianceAssessmentModel = makeModel(complianceAssessments);
  const complianceSnapshotModel = makeModel(complianceSnapshots);
  const evidenceRecordModel = makeModel(evidenceRecords);
  const reportModel = makeModel(reports);
  const controlAttestationModel = makeModel([] as any[]);
  const attestationHistoryModel = makeModel([] as any[]);

  const tenant = {
    scan: scanModel,
    finding: findingModel,
    certificate: certificateModel,
    project: projectModel,
    policy: policyModel,
    policyVersion: policyVersionModel,
    auditEvent: auditEventModel,
    complianceFramework: complianceFrameworkModel,
    complianceControl: complianceControlModel,
    complianceControlOverride: complianceControlOverrideModel,
    complianceAssessment: complianceAssessmentModel,
    complianceSnapshot: complianceSnapshotModel,
    evidenceRecord: evidenceRecordModel,
    report: reportModel,
    controlAttestation: controlAttestationModel,
    attestationHistory: attestationHistoryModel,
  };

  return {
    getDb: () => tenant,
    disconnectDb: vi.fn(),
    withTenant: vi.fn(async (_db: any, _orgId: string, fn: any) => fn(tenant)),
    initEncryption: vi.fn(),
    setCurrentOrgId: vi.fn(),
    PrismaClient: vi.fn(),
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
function signedHeaders(body = "", role = "admin"): Record<string, string> {
  return {
    "x-sentinel-signature": signRequest(body, SECRET),
    "x-sentinel-api-key": "test-client",
    "x-sentinel-role": role,
  };
}

let app: any;

describe("Compliance API integration", () => {
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

  // ── 1. GET /v1/compliance/frameworks — returns built-in + custom ──────
  it("GET /v1/compliance/frameworks returns built-in + custom frameworks (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/compliance/frameworks",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    // 9 built-in + custom frameworks from mock
    expect(body.length).toBeGreaterThanOrEqual(9);
    // Built-in frameworks have orgId: null
    const builtIn = body.filter((f: any) => f.orgId === null);
    expect(builtIn.length).toBe(9);
  });

  // ── 2. GET /v1/compliance/frameworks/soc2 — returns built-in (200) ────
  it("GET /v1/compliance/frameworks/soc2 returns a built-in framework (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/compliance/frameworks/soc2",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.slug).toBe("soc2");
    expect(body.orgId).toBeNull();
  });

  // ── 3. GET /v1/compliance/frameworks/nonexistent — 404 ────────────────
  it("GET /v1/compliance/frameworks/nonexistent returns 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/compliance/frameworks/nonexistent",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.error).toContain("not found");
  });

  // ── 4. POST /v1/compliance/frameworks — creates custom framework (201)
  it("POST /v1/compliance/frameworks creates custom framework (201)", async () => {
    const bodyObj = {
      slug: "my-custom",
      name: "My Custom Framework",
      version: "1.0",
      controls: [{ code: "CC-1", title: "Test Control", matchRules: [], weight: 1 }],
    };
    const payload = JSON.stringify(bodyObj);
    const res = await app.inject({
      method: "POST",
      url: "/v1/compliance/frameworks",
      headers: {
        ...signedHeaders(payload, "admin"),
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty("id");
  });

  // ── 5. POST /v1/compliance/frameworks with built-in slug — 409 ────────
  it("POST /v1/compliance/frameworks with built-in slug rejects with 409", async () => {
    const bodyObj = {
      slug: "soc2",
      name: "Duplicate SOC2",
      version: "1.0",
      controls: [],
    };
    const payload = JSON.stringify(bodyObj);
    const res = await app.inject({
      method: "POST",
      url: "/v1/compliance/frameworks",
      headers: {
        ...signedHeaders(payload, "admin"),
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.payload);
    expect(body.error).toContain("built-in");
  });

  // ── 6. PUT /v1/compliance/frameworks/:id on built-in — 403 ───────────
  it("PUT /v1/compliance/frameworks/:id on built-in rejects with 403", async () => {
    // The server calls db.complianceFramework.findUnique — make it return a built-in record
    const { getDb } = await import("@sentinel/db");
    const db = (getDb as any)();
    const originalFindUnique = db.complianceFramework.findUnique;
    db.complianceFramework.findUnique.mockImplementationOnce(async () => ({
      id: "builtin-soc2",
      orgId: null,
      slug: "soc2",
      name: "SOC 2",
    }));

    const bodyObj = { name: "Modified SOC2", version: "2.0" };
    const payload = JSON.stringify(bodyObj);
    const res = await app.inject({
      method: "PUT",
      url: "/v1/compliance/frameworks/builtin-soc2",
      headers: {
        ...signedHeaders(payload, "admin"),
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toContain("built-in");
  });

  // ── 7. DELETE /v1/compliance/frameworks/:id on built-in — 403 ─────────
  it("DELETE /v1/compliance/frameworks/:id on built-in rejects with 403", async () => {
    const { getDb } = await import("@sentinel/db");
    const db = (getDb as any)();
    db.complianceFramework.findUnique.mockImplementationOnce(async () => ({
      id: "builtin-soc2",
      orgId: null,
      slug: "soc2",
      name: "SOC 2",
    }));

    const res = await app.inject({
      method: "DELETE",
      url: "/v1/compliance/frameworks/builtin-soc2",
      headers: signedHeaders("", "admin"),
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toContain("built-in");
  });

  // ── 8. GET /v1/compliance/assess/soc2 — runs live scoring (200) ───────
  it("GET /v1/compliance/assess/soc2 runs live scoring (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/compliance/assess/soc2",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty("frameworkSlug", "soc2");
    expect(body).toHaveProperty("score");
    expect(body).toHaveProperty("verdict");
    expect(body).toHaveProperty("controlScores");
    expect(typeof body.score).toBe("number");
  });

  // ── 9. GET /v1/compliance/scores — returns latest assessments (200) ───
  it("GET /v1/compliance/scores returns latest assessments (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/compliance/scores",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0]).toHaveProperty("frameworkId");
    expect(body[0]).toHaveProperty("score");
  });

  // ── 10. GET /v1/compliance/trends/soc2 — returns snapshots (200) ──────
  it("GET /v1/compliance/trends/soc2 returns snapshots (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/compliance/trends/soc2",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
  });

  // ── 11. GET /v1/evidence — returns paginated records (200) ────────────
  it("GET /v1/evidence returns paginated records (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/evidence",
      headers: signedHeaders("", "admin"),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty("records");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("limit");
    expect(body).toHaveProperty("offset");
    expect(Array.isArray(body.records)).toBe(true);
  });

  // ── 12. GET /v1/evidence/verify — returns chain verification (200) ────
  it("GET /v1/evidence/verify returns chain verification (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/evidence/verify",
      headers: signedHeaders("", "admin"),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty("valid");
    expect(body).toHaveProperty("totalRecords");
    expect(typeof body.valid).toBe("boolean");
    expect(typeof body.totalRecords).toBe("number");
  });

  // ── 13. POST /v1/reports — creates pending report (202) ──────────────
  it("POST /v1/reports creates pending report (202)", async () => {
    const bodyObj = {
      type: "compliance_summary",
      frameworkId: "soc2",
      parameters: { includeControls: true },
    };
    const payload = JSON.stringify(bodyObj);
    const res = await app.inject({
      method: "POST",
      url: "/v1/reports",
      headers: {
        ...signedHeaders(payload, "admin"),
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("type", "compliance_summary");
  });

  // ── 14. GET /v1/reports/:id — returns report (200) ────────────────────
  it("GET /v1/reports/:id returns report (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/reports/rpt-1",
      headers: signedHeaders("", "admin"),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.id).toBe("rpt-1");
    expect(body).toHaveProperty("type");
    expect(body).toHaveProperty("frameworkId");
  });

  it("POST /v1/reports accepts nist_profile type (202)", async () => {
    const bodyObj = { type: "nist_profile", frameworkId: "nist-ai-rmf", parameters: {} };
    const payload = JSON.stringify(bodyObj);
    const res = await app.inject({
      method: "POST",
      url: "/v1/reports",
      headers: { ...signedHeaders(payload, "admin"), "content-type": "application/json" },
      payload,
    });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.payload)).toHaveProperty("type", "nist_profile");
  });

  it("POST /v1/reports accepts hipaa_assessment type (202)", async () => {
    const bodyObj = { type: "hipaa_assessment", frameworkId: "hipaa", parameters: {} };
    const payload = JSON.stringify(bodyObj);
    const res = await app.inject({
      method: "POST",
      url: "/v1/reports",
      headers: { ...signedHeaders(payload, "admin"), "content-type": "application/json" },
      payload,
    });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.payload)).toHaveProperty("type", "hipaa_assessment");
  });

  // ── 15. GET /v1/reports — returns paginated reports (200) ─────────────
  it("GET /v1/reports returns paginated reports (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/reports",
      headers: signedHeaders("", "admin"),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty("reports");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("limit");
    expect(body).toHaveProperty("offset");
    expect(Array.isArray(body.reports)).toBe(true);
  });
});
