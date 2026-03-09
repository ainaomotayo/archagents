import { describe, it, expect } from "vitest";
import type {
  ApiScanResponse,
  ApiPollResponse,
  ApiErrorResponse,
  ApiHealthResponse,
  ApiFinding,
  ApiFindingsResponse,
  ApiCertificate,
  ApiCertificatesResponse,
  ApiCertificateRevokeResponse,
  ApiPolicy,
  ApiPoliciesResponse,
  ApiAuditEvent,
  ApiAuditResponse,
  PaginatedResponse,
} from "./openapi-types.js";

describe("ApiScanResponse", () => {
  it("matches expected shape", () => {
    const response: ApiScanResponse = {
      scanId: "scan-123",
      status: "pending",
      pollUrl: "/v1/scans/scan-123/poll",
    };
    expect(response.scanId).toBe("scan-123");
    expect(response.status).toBe("pending");
    expect(response.pollUrl).toContain("/poll");
  });
});

describe("ApiPollResponse", () => {
  it("supports pending status without assessment", () => {
    const response: ApiPollResponse = { status: "pending" };
    expect(response.status).toBe("pending");
    expect(response.assessment).toBeUndefined();
  });

  it("supports completed status with assessment", () => {
    const response: ApiPollResponse = {
      status: "completed",
      assessment: {
        status: "full_pass",
        riskScore: 15,
        findingCount: 3,
        certificateId: "cert-abc",
      },
    };
    expect(response.status).toBe("completed");
    expect(response.assessment?.riskScore).toBe(15);
    expect(response.assessment?.certificateId).toBe("cert-abc");
  });

  it("allows all valid status values", () => {
    const statuses: ApiPollResponse["status"][] = [
      "pending",
      "scanning",
      "completed",
      "failed",
    ];
    for (const s of statuses) {
      const r: ApiPollResponse = { status: s };
      expect(r.status).toBe(s);
    }
  });
});

describe("ApiErrorResponse", () => {
  it("matches expected shape", () => {
    const response: ApiErrorResponse = {
      error: "Unauthorized",
      code: "AUTH_FAILED",
    };
    expect(response.error).toBe("Unauthorized");
    expect(response.code).toBe("AUTH_FAILED");
    expect(response.details).toBeUndefined();
  });

  it("supports optional details", () => {
    const response: ApiErrorResponse = {
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: { field: "projectId", message: "Required" },
    };
    expect(response.details).toBeDefined();
  });
});

describe("ApiHealthResponse", () => {
  it("matches expected shape", () => {
    const response: ApiHealthResponse = {
      status: "ok",
      version: "1.0.0",
      uptime: 3600,
    };
    expect(response.status).toBe("ok");
    expect(response.version).toBe("1.0.0");
    expect(response.uptime).toBe(3600);
  });

  it("supports degraded status", () => {
    const response: ApiHealthResponse = {
      status: "degraded",
      version: "1.0.0",
      uptime: 100,
    };
    expect(response.status).toBe("degraded");
  });
});

describe("ApiFinding", () => {
  it("matches expected shape for security finding", () => {
    const finding: ApiFinding = {
      type: "security",
      file: "src/auth.ts",
      lineStart: 10,
      lineEnd: 15,
      severity: "high",
      confidence: "high",
      title: "SQL Injection",
      description: "Unsanitized input in query",
      cweId: "CWE-89",
    };
    expect(finding.type).toBe("security");
    expect(finding.severity).toBe("high");
    expect(finding.cweId).toBe("CWE-89");
  });

  it("supports all finding types", () => {
    const types: ApiFinding["type"][] = [
      "security",
      "license",
      "quality",
      "policy",
      "dependency",
      "ai-detection",
    ];
    for (const t of types) {
      const f: ApiFinding = {
        type: t,
        file: "test.ts",
        lineStart: 1,
        lineEnd: 1,
        severity: "low",
        confidence: "medium",
      };
      expect(f.type).toBe(t);
    }
  });
});

describe("ApiFindingsResponse", () => {
  it("has pagination fields", () => {
    const response: ApiFindingsResponse = {
      findings: [],
      total: 0,
      limit: 50,
      offset: 0,
    };
    expect(response.total).toBe(0);
    expect(response.limit).toBe(50);
  });
});

describe("ApiCertificate", () => {
  it("matches expected shape", () => {
    const cert: ApiCertificate = {
      id: "cert-123",
      version: "1.0",
      subject: {
        projectId: "proj-1",
        repository: "org/repo",
        commitHash: "abc123",
        branch: "main",
        author: "dev@example.com",
        timestamp: "2026-03-09T00:00:00Z",
      },
      verdict: {
        status: "pass",
        riskScore: 10,
        categories: { security: "pass", license: "pass" },
      },
      scanMetadata: {
        agents: [
          {
            name: "security-agent",
            version: "1.0.0",
            rulesetVersion: "2026.1",
            rulesetHash: "sha256:abc",
            status: "completed",
            findingCount: 0,
            durationMs: 500,
          },
        ],
        environmentHash: "sha256:env",
        totalDurationMs: 1500,
        scanLevel: "standard",
      },
      signature: "hmac-sha256:...",
      issuedAt: "2026-03-09T00:00:00Z",
      expiresAt: "2026-04-09T00:00:00Z",
    };
    expect(cert.version).toBe("1.0");
    expect(cert.verdict.status).toBe("pass");
    expect(cert.scanMetadata.agents).toHaveLength(1);
  });
});

describe("ApiCertificateRevokeResponse", () => {
  it("matches expected shape", () => {
    const response: ApiCertificateRevokeResponse = {
      id: "cert-123",
      status: "revoked",
      revokedAt: "2026-03-09T12:00:00Z",
    };
    expect(response.status).toBe("revoked");
  });
});

describe("ApiPolicy", () => {
  it("matches expected shape", () => {
    const policy: ApiPolicy = {
      id: "pol-1",
      name: "Block Critical CVEs",
      type: "security",
      enabled: true,
      rules: [{ field: "severity", operator: "eq", value: "critical" }],
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-03-09T00:00:00Z",
    };
    expect(policy.type).toBe("security");
    expect(policy.rules).toHaveLength(1);
    expect(policy.rules[0].operator).toBe("eq");
  });
});

describe("ApiAuditEvent", () => {
  it("matches expected shape", () => {
    const event: ApiAuditEvent = {
      id: "evt-1",
      timestamp: "2026-03-09T00:00:00Z",
      actor: { type: "api", id: "cli", name: "SENTINEL CLI" },
      action: "scan.started",
      resource: { type: "scan", id: "scan-1" },
      detail: { commitHash: "abc123" },
      eventHash: "sha256:hash",
    };
    expect(event.actor.type).toBe("api");
    expect(event.resource.type).toBe("scan");
  });
});

describe("PaginatedResponse generic", () => {
  it("works with arbitrary item types", () => {
    const response: PaginatedResponse<{ id: string }> = {
      items: [{ id: "1" }, { id: "2" }],
      total: 2,
      limit: 50,
      offset: 0,
    };
    expect(response.items).toHaveLength(2);
    expect(response.total).toBe(2);
  });
});
