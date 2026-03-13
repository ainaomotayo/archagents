import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { signRequest } from "@sentinel/auth";

const SECRET = "remediation-test-secret";

// ── In-memory data ──────────────────────────────────────────────────────────

const remediationItems = [
  {
    id: "rem-1",
    orgId: "default",
    frameworkSlug: "hipaa",
    controlCode: "TS-1.4",
    title: "Fix encryption gap",
    description: "Encrypt data at rest",
    status: "open",
    priority: "high",
    itemType: "compliance",
    parentId: null,
    externalRef: null,
    dueDate: null,
    assignedTo: null,
    linkedFindingIds: [],
    findingId: null,
    priorityScore: 30,
    createdBy: "user-1",
    completedAt: null,
    completedBy: null,
    evidenceNotes: null,
    createdAt: new Date(),
    children: [{ id: "child-1", status: "open" }],
  },
  {
    id: "rem-completed",
    orgId: "default",
    frameworkSlug: "soc2",
    controlCode: "CC-1",
    title: "Completed item",
    description: "Already done",
    status: "completed",
    priority: "medium",
    itemType: "compliance",
    parentId: null,
    externalRef: null,
    dueDate: new Date("2026-03-01"),
    assignedTo: null,
    linkedFindingIds: [],
    findingId: null,
    priorityScore: 10,
    createdBy: "user-1",
    completedAt: new Date("2026-02-28"),
    completedBy: "user-1",
    evidenceNotes: null,
    createdAt: new Date("2026-02-01"),
    children: [],
  },
  {
    id: "rem-linked",
    orgId: "default",
    frameworkSlug: "hipaa",
    controlCode: "TS-2.1",
    title: "Already linked item",
    description: "Has external ref",
    status: "in_progress",
    priority: "high",
    itemType: "compliance",
    parentId: null,
    externalRef: "jira:PROJ-100",
    dueDate: null,
    assignedTo: null,
    linkedFindingIds: [],
    findingId: null,
    priorityScore: 30,
    createdBy: "user-1",
    completedAt: null,
    completedBy: null,
    evidenceNotes: null,
    createdAt: new Date(),
    children: [],
  },
];

// ── Helper to build a Prisma-like model mock ────────────────────────────────
function makeModel<T extends Record<string, unknown>>(items: T[]) {
  return {
    findMany: vi.fn(async (opts?: any) => {
      let result = [...items];
      if (opts?.where) {
        result = result.filter((item) => {
          for (const [k, v] of Object.entries(opts.where)) {
            if (v && typeof v === "object" && "in" in (v as any)) {
              if (!(v as any).in.includes((item as any)[k])) return false;
            } else if (v && typeof v === "object" && "lt" in (v as any)) {
              if (!((item as any)[k] && (item as any)[k] < (v as any).lt)) return false;
            } else if (v && typeof v === "object" && "not" in (v as any)) {
              if ((item as any)[k] === (v as any).not) return false;
            } else {
              if ((item as any)[k] !== v) return false;
            }
          }
          return true;
        });
      }
      return result;
    }),
    findUnique: vi.fn(async (opts: any) => {
      return items.find((i) => (i as any).id === opts.where.id) ?? null;
    }),
    findFirst: vi.fn(async () => items[0] ?? null),
    count: vi.fn(async (opts?: any) => {
      if (!opts?.where) return items.length;
      let result = [...items];
      result = result.filter((item) => {
        for (const [k, v] of Object.entries(opts.where)) {
          if (v && typeof v === "object" && "in" in (v as any)) {
            if (!(v as any).in.includes((item as any)[k])) return false;
          } else if (v && typeof v === "object" && "lt" in (v as any)) {
            if (!((item as any)[k] && (item as any)[k] < (v as any).lt)) return false;
          } else if (v && typeof v === "object" && "not" in (v as any)) {
            if ((item as any)[k] === (v as any).not) return false;
          } else {
            if ((item as any)[k] !== v) return false;
          }
        }
        return true;
      });
      return result.length;
    }),
    create: vi.fn(async (opts: any) => ({
      id: `new-${Date.now()}`,
      ...opts.data,
    })),
    update: vi.fn(async (opts: any) => {
      const existing = items.find((i) => (i as any).id === opts.where.id);
      return { ...(existing ?? {}), ...opts.data };
    }),
    delete: vi.fn(async () => ({})),
    upsert: vi.fn(async (opts: any) => ({ id: `upsert-${Date.now()}`, ...opts.create, ...opts.update })),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
}

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("@sentinel/db", () => {
  const remediationItemModel = makeModel(remediationItems as any[]);

  const tenant: Record<string, any> = {
    remediationItem: remediationItemModel,
    // Stubs for models accessed during server boot
    scan: makeModel([]),
    finding: makeModel([]),
    certificate: makeModel([]),
    project: makeModel([]),
    policy: makeModel([]),
    policyVersion: makeModel([]),
    auditEvent: makeModel([]),
    complianceFramework: makeModel([]),
    complianceControl: makeModel([]),
    complianceControlOverride: makeModel([]),
    complianceAssessment: makeModel([]),
    complianceSnapshot: makeModel([]),
    evidenceRecord: makeModel([]),
    report: makeModel([]),
    controlAttestation: makeModel([]),
    attestationHistory: makeModel([]),
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

vi.mock("@sentinel/events", () => ({
  EventBus: vi.fn().mockImplementation(() => ({
    publish: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
  })),
  getDlqDepth: vi.fn(async () => 0),
  readDlq: vi.fn(async () => []),
}));

vi.mock("@sentinel/audit", () => ({
  AuditLog: vi.fn().mockImplementation(() => ({
    append: vi.fn(async () => {}),
  })),
}));

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

vi.mock("@sentinel/github", () => ({
  configureGitHubApp: vi.fn(),
}));

vi.mock("@sentinel/assessor", () => ({
  verifyCertificate: vi.fn(() => true),
}));

vi.mock("ioredis", () => ({
  Redis: vi.fn().mockImplementation(() => ({
    disconnect: vi.fn(),
    quit: vi.fn(),
  })),
}));

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

describe("Remediation API routes", () => {
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

  // 1. GET /v1/compliance/remediations/stats returns correct shape
  it("GET /v1/compliance/remediations/stats returns stats with correct shape (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/compliance/remediations/stats",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty("open");
    expect(body).toHaveProperty("inProgress");
    expect(body).toHaveProperty("overdue");
    expect(body).toHaveProperty("completed");
    expect(body).toHaveProperty("acceptedRisk");
    expect(body).toHaveProperty("avgResolutionDays");
    expect(body).toHaveProperty("slaCompliance");
    expect(typeof body.open).toBe("number");
    expect(typeof body.slaCompliance).toBe("number");
  });

  // 2. GET /v1/compliance/remediations/:id returns item with children
  it("GET /v1/compliance/remediations/:id returns item with children (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/compliance/remediations/rem-1",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty("id", "rem-1");
    expect(body).toHaveProperty("children");
    expect(Array.isArray(body.children)).toBe(true);
    expect(body.children.length).toBeGreaterThanOrEqual(1);
  });

  // 3. GET /v1/compliance/remediations/:id returns 404 for non-existent
  it("GET /v1/compliance/remediations/:id returns 404 for non-existent item", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/compliance/remediations/nonexistent-id",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("not found");
  });

  // 4. POST /v1/compliance/remediations/:id/link-external stores externalRef
  it("POST /v1/compliance/remediations/:id/link-external stores externalRef (200)", async () => {
    const payload = JSON.stringify({ provider: "jira", externalRef: "jira:PROJ-123" });
    const res = await app.inject({
      method: "POST",
      url: "/v1/compliance/remediations/rem-1/link-external",
      headers: {
        ...signedHeaders(payload),
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty("externalRef", "jira:PROJ-123");
  });

  // 5. POST /v1/compliance/remediations/:id/link-external returns 409 for already-linked
  it("POST /v1/compliance/remediations/:id/link-external returns 409 for already-linked item", async () => {
    const payload = JSON.stringify({ provider: "jira", externalRef: "jira:PROJ-999" });
    const res = await app.inject({
      method: "POST",
      url: "/v1/compliance/remediations/rem-linked/link-external",
      headers: {
        ...signedHeaders(payload),
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("already linked");
  });

  // 6. PATCH /v1/compliance/remediations/:id returns 409 for invalid transition
  it("PATCH /v1/compliance/remediations/:id returns 409 for invalid status transition", async () => {
    const payload = JSON.stringify({ status: "open" });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/compliance/remediations/rem-completed",
      headers: {
        ...signedHeaders(payload),
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("transition");
  });
});
