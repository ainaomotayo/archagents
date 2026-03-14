import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { signRequest } from "@sentinel/auth";

const SECRET = "policy-tree-test-secret";

// ── In-memory data ──────────────────────────────────────────────────────────
const scans: any[] = [];
const findings: any[] = [];
const certificates: any[] = [];
const projects: any[] = [];

const policies = [
  {
    id: "pol-tree-1",
    name: "tree-policy",
    rules: [],
    format: "tree",
    treeRules: {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        { id: "c1", type: "condition", conditionType: "severity", config: { severities: ["high", "critical"] } },
        { id: "a1", type: "action", actionType: "block", config: { reason: "high severity" } },
      ],
    },
    version: 1,
    createdAt: new Date(),
    deletedAt: null,
  },
];

const auditEvents: any[] = [];

// ── Helper to build a Prisma-like model mock ────────────────────────────────
function makeModel<T extends Record<string, unknown>>(items: T[]) {
  return {
    findMany: vi.fn(async (opts?: any) => {
      let result = [...items];
      if (opts?.where) {
        result = result.filter((item) => {
          for (const [k, v] of Object.entries(opts.where)) {
            if (k === "deletedAt" && v === null) {
              if ((item as any).deletedAt !== null && (item as any).deletedAt !== undefined) return false;
              continue;
            }
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
    findFirst: vi.fn(async (opts?: any) => {
      if (!opts?.where) return items[0] ?? null;
      return items.find((item) => {
        for (const [k, v] of Object.entries(opts.where)) {
          if (k === "deletedAt" && v === null) {
            if ((item as any).deletedAt !== null && (item as any).deletedAt !== undefined) return false;
            continue;
          }
          if ((item as any)[k] !== v) return false;
        }
        return true;
      }) ?? null;
    }),
    count: vi.fn(async () => items.length),
    create: vi.fn(async (opts: any) => ({
      id: `new-${Date.now()}`,
      version: 1,
      ...opts.data,
    })),
    update: vi.fn(async (opts: any) => ({
      ...(items.find((i) => (i as any).id === opts.where.id) ?? {}),
      ...opts.data,
      version: 2,
    })),
    delete: vi.fn(async () => ({})),
  };
}

// ── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("@sentinel/db", () => {
  const scanModel = makeModel(scans);
  const findingModel = makeModel(findings);
  const certificateModel = makeModel(certificates);
  const projectModel = makeModel(projects);
  const policyModel = makeModel(policies);
  const policyVersionModel = makeModel([] as any[]);
  const auditEventModel = makeModel(auditEvents);

  const tenant = {
    scan: scanModel,
    finding: findingModel,
    certificate: certificateModel,
    project: projectModel,
    policy: policyModel,
    policyVersion: policyVersionModel,
    auditEvent: auditEventModel,
  };

  return {
    getDb: () => tenant,
    disconnectDb: vi.fn(),
    withTenant: vi.fn(async (_db: any, _orgId: string, fn: any) => fn(tenant)),
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

describe("Policy tree API", () => {
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

  // Test 1: POST /v1/policies with format:tree and valid tree
  it("POST /v1/policies with format:tree and valid tree returns 201", async () => {
    const bodyObj = {
      name: "tree-test-policy",
      format: "tree",
      treeRules: {
        id: "root",
        type: "group",
        operator: "AND",
        children: [
          { id: "c1", type: "condition", conditionType: "severity", config: { severities: ["high"] } },
          { id: "a1", type: "action", actionType: "block", config: {} },
        ],
      },
    };
    const payload = JSON.stringify(bodyObj);
    const res = await app.inject({
      method: "POST",
      url: "/v1/policies",
      headers: {
        ...signedHeaders(payload, "admin"),
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.format).toBe("tree");
    expect(body.treeRules).toBeDefined();
  });

  // Test 2: POST /v1/policies with format:tree and invalid tree (no actions)
  it("POST /v1/policies with format:tree and invalid tree returns 400 with issues", async () => {
    const bodyObj = {
      name: "invalid-tree-policy",
      format: "tree",
      treeRules: {
        id: "root",
        type: "group",
        operator: "AND",
        children: [
          { id: "c1", type: "condition", conditionType: "severity", config: { severities: ["high"] } },
        ],
      },
    };
    const payload = JSON.stringify(bodyObj);
    const res = await app.inject({
      method: "POST",
      url: "/v1/policies",
      headers: {
        ...signedHeaders(payload, "admin"),
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.issues).toBeDefined();
    expect(body.issues.length).toBeGreaterThan(0);
    expect(body.issues.some((i: any) => i.level === "error")).toBe(true);
  });

  // Test 3: POST /v1/policies/simulate with valid tree and input
  it("POST /v1/policies/simulate with valid tree and input returns SimulationResult with trace", async () => {
    const bodyObj = {
      tree: {
        id: "root",
        type: "group",
        operator: "AND",
        children: [
          { id: "c1", type: "condition", conditionType: "severity", config: { severities: ["high", "critical"] } },
          { id: "a1", type: "action", actionType: "block", config: {} },
        ],
      },
      input: { severity: "low" },
    };
    const payload = JSON.stringify(bodyObj);
    const res = await app.inject({
      method: "POST",
      url: "/v1/policies/simulate",
      headers: {
        ...signedHeaders(payload, "admin"),
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty("match");
    expect(body).toHaveProperty("trace");
    expect(Array.isArray(body.trace)).toBe(true);
    expect(body.match).toBe(false);
  });

  // Test 4: POST /v1/policies/compile-yaml with valid tree
  it("POST /v1/policies/compile-yaml with valid tree returns yaml string", async () => {
    const bodyObj = {
      tree: {
        id: "root",
        type: "group",
        operator: "AND",
        children: [
          { id: "c1", type: "condition", conditionType: "severity", config: { severities: ["high"] } },
          { id: "a1", type: "action", actionType: "block", config: {} },
        ],
      },
    };
    const payload = JSON.stringify(bodyObj);
    const res = await app.inject({
      method: "POST",
      url: "/v1/policies/compile-yaml",
      headers: {
        ...signedHeaders(payload, "admin"),
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.valid).toBe(true);
    expect(typeof body.yaml).toBe("string");
    expect(body.yaml).toContain("AND:");
  });

  // Test 5: POST /v1/policies with format:yaml (backward compat)
  it("POST /v1/policies with format:yaml works as before", async () => {
    const bodyObj = { name: "yaml-policy", rules: [{ field: "severity", operator: "gte", value: "high" }] };
    const payload = JSON.stringify(bodyObj);
    const res = await app.inject({
      method: "POST",
      url: "/v1/policies",
      headers: {
        ...signedHeaders(payload, "admin"),
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.format).toBe("yaml");
  });

  // Test 6: GET /v1/policies/:id returns format and treeRules fields
  it("GET /v1/policies/:id returns format and treeRules fields", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/policies/pol-tree-1",
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.format).toBe("tree");
    expect(body.treeRules).toBeDefined();
    expect(body.treeRules.type).toBe("group");
  });

  // Test 7: PUT /v1/policies/:id with format:tree updates treeRules
  it("PUT /v1/policies/:id with format:tree updates treeRules", async () => {
    const bodyObj = {
      name: "updated-tree-policy",
      format: "tree",
      treeRules: {
        id: "root",
        type: "group",
        operator: "OR",
        children: [
          { id: "c2", type: "condition", conditionType: "category", config: { categories: ["xss"] } },
          { id: "a2", type: "action", actionType: "warn", config: {} },
        ],
      },
    };
    const payload = JSON.stringify(bodyObj);
    const res = await app.inject({
      method: "PUT",
      url: "/v1/policies/pol-tree-1",
      headers: {
        ...signedHeaders(payload, "admin"),
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.treeRules).toBeDefined();
    expect(body.format).toBe("tree");
  });

  // Test 8: POST /v1/policies/simulate with matching input has matchedActions populated
  it("POST /v1/policies/simulate with matching input has matchedActions populated", async () => {
    const bodyObj = {
      tree: {
        id: "root",
        type: "group",
        operator: "AND",
        children: [
          { id: "c1", type: "condition", conditionType: "severity", config: { severities: ["high", "critical"] } },
          { id: "a1", type: "action", actionType: "block", config: { reason: "blocked" } },
        ],
      },
      input: { severity: "high" },
    };
    const payload = JSON.stringify(bodyObj);
    const res = await app.inject({
      method: "POST",
      url: "/v1/policies/simulate",
      headers: {
        ...signedHeaders(payload, "admin"),
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.match).toBe(true);
    expect(body.matchedActions).toBeDefined();
    expect(body.matchedActions.length).toBeGreaterThan(0);
    expect(body.matchedActions[0].actionType).toBe("block");
  });

  // Test 9: POST /v1/policies/simulate without required fields returns 400
  it("POST /v1/policies/simulate without tree returns 400", async () => {
    const bodyObj = { input: { severity: "high" } };
    const payload = JSON.stringify(bodyObj);
    const res = await app.inject({
      method: "POST",
      url: "/v1/policies/simulate",
      headers: {
        ...signedHeaders(payload, "admin"),
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  // Test 10: POST /v1/policies/compile-yaml without tree returns 400
  it("POST /v1/policies/compile-yaml without tree returns 400", async () => {
    const bodyObj = {};
    const payload = JSON.stringify(bodyObj);
    const res = await app.inject({
      method: "POST",
      url: "/v1/policies/compile-yaml",
      headers: {
        ...signedHeaders(payload, "admin"),
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(400);
  });
});
