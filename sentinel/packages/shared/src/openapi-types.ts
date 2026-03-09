/**
 * OpenAPI response types for the SENTINEL API.
 *
 * These types mirror the schemas defined in docs/api/openapi.yaml
 * and are used by both the API server and client libraries.
 */

// === Scan Responses ===

export interface ApiScanResponse {
  scanId: string;
  status: string;
  pollUrl: string;
}

export interface ApiPollResponse {
  status: "pending" | "scanning" | "completed" | "failed";
  assessment?: {
    status: string;
    riskScore: number;
    findingCount: number;
    certificateId?: string;
  };
}

// === Finding Responses ===

export interface ApiFinding {
  type:
    | "security"
    | "license"
    | "quality"
    | "policy"
    | "dependency"
    | "ai-detection";
  file: string;
  lineStart: number;
  lineEnd: number;
  severity: "critical" | "high" | "medium" | "low" | "info";
  confidence: "high" | "medium" | "low";
  title?: string;
  description?: string;
  remediation?: string;
  cweId?: string;
}

export interface ApiFindingsResponse {
  findings: ApiFinding[];
  total: number;
  limit: number;
  offset: number;
}

// === Certificate Responses ===

export interface ApiCertificate {
  id: string;
  version: "1.0";
  subject: {
    projectId: string;
    repository: string;
    commitHash: string;
    branch: string;
    author: string;
    timestamp: string;
  };
  verdict: {
    status: "pass" | "provisional" | "fail";
    riskScore: number;
    categories: Record<string, "pass" | "warn" | "fail">;
  };
  scanMetadata: {
    agents: Array<{
      name: string;
      version: string;
      rulesetVersion: string;
      rulesetHash: string;
      status: "completed" | "error" | "timeout";
      findingCount: number;
      durationMs: number;
    }>;
    environmentHash: string;
    totalDurationMs: number;
    scanLevel: "standard" | "strict" | "audit";
  };
  compliance?: {
    euAiAct?: {
      riskCategory: string;
      documentationComplete: boolean;
      humanOversightVerified: boolean;
    };
    soc2?: { controlsMapped: string[] };
    iso27001?: { controlsMapped: string[] };
  };
  signature: string;
  issuedAt: string;
  expiresAt: string;
}

export interface ApiCertificatesResponse {
  certificates: ApiCertificate[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiCertificateRevokeResponse {
  id: string;
  status: "revoked";
  revokedAt: string;
}

// === Policy Responses ===

export interface ApiPolicy {
  id: string;
  name: string;
  type: "security" | "license" | "quality" | "dependency" | "ai-usage";
  enabled: boolean;
  rules: Array<{
    field: string;
    operator:
      | "eq"
      | "neq"
      | "gt"
      | "lt"
      | "gte"
      | "lte"
      | "contains"
      | "not_contains";
    value: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface ApiPoliciesResponse {
  policies: ApiPolicy[];
  total: number;
  limit: number;
  offset: number;
}

// === Audit Responses ===

export interface ApiAuditEvent {
  id: string;
  timestamp: string;
  actor: {
    type: "system" | "user" | "agent" | "api";
    id: string;
    name: string;
    ip?: string;
  };
  action: string;
  resource: {
    type: "scan" | "certificate" | "finding" | "policy" | "project";
    id: string;
  };
  detail: Record<string, unknown>;
  previousEventHash?: string;
  eventHash: string;
}

export interface ApiAuditResponse {
  events: ApiAuditEvent[];
  total: number;
  limit: number;
  offset: number;
}

// === Health & Error Responses ===

export interface ApiHealthResponse {
  status: "ok" | "degraded";
  version: string;
  uptime: number;
}

export interface ApiErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

// === Paginated Response Helper ===

export interface PaginatedResponse<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
}
