/**
 * SENTINEL Dashboard — Mock Data
 *
 * Realistic sample data used while the API is not yet available.
 * Every object conforms to the types defined in ./types.ts.
 */

import type {
  ApprovalGate,
  ApprovalStats,
  Certificate,
  Finding,
  FindingCountByCategory,
  OverviewStats,
  Project,
  Scan,
} from "./types";

// ── Overview ──────────────────────────────────────────────────────────

export const MOCK_OVERVIEW_STATS: OverviewStats = {
  totalScans: 142,
  activeRevocations: 3,
  openFindings: 27,
  passRate: 84,
};

// ── Projects ──────────────────────────────────────────────────────────

export const MOCK_PROJECTS: Project[] = [
  {
    id: "proj-001",
    name: "sentinel-core",
    repoUrl: "https://github.com/acme/sentinel-core",
    lastScanDate: "2026-03-08T14:30:00Z",
    lastScanStatus: "pass",
    findingCount: 3,
    scanCount: 48,
  },
  {
    id: "proj-002",
    name: "payment-service",
    repoUrl: "https://github.com/acme/payment-service",
    lastScanDate: "2026-03-07T09:15:00Z",
    lastScanStatus: "fail",
    findingCount: 12,
    scanCount: 31,
  },
  {
    id: "proj-003",
    name: "auth-gateway",
    repoUrl: "https://github.com/acme/auth-gateway",
    lastScanDate: "2026-03-06T18:45:00Z",
    lastScanStatus: "provisional",
    findingCount: 7,
    scanCount: 22,
  },
  {
    id: "proj-004",
    name: "data-pipeline",
    repoUrl: "https://github.com/acme/data-pipeline",
    lastScanDate: "2026-03-05T11:00:00Z",
    lastScanStatus: "pass",
    findingCount: 0,
    scanCount: 15,
  },
  {
    id: "proj-005",
    name: "ml-inference",
    repoUrl: "https://github.com/acme/ml-inference",
    lastScanDate: null,
    lastScanStatus: null,
    findingCount: 0,
    scanCount: 0,
  },
];

// ── Scans ─────────────────────────────────────────────────────────────

export const MOCK_SCANS: Scan[] = [
  {
    id: "scan-101",
    projectId: "proj-001",
    commit: "a1b2c3d",
    branch: "main",
    status: "pass",
    riskScore: 12,
    findingCount: 0,
    date: "2026-03-08T14:30:00Z",
  },
  {
    id: "scan-102",
    projectId: "proj-002",
    commit: "e4f5g6h",
    branch: "feat/checkout",
    status: "fail",
    riskScore: 78,
    findingCount: 5,
    date: "2026-03-07T09:15:00Z",
  },
  {
    id: "scan-103",
    projectId: "proj-003",
    commit: "i7j8k9l",
    branch: "main",
    status: "provisional",
    riskScore: 45,
    findingCount: 3,
    date: "2026-03-06T18:45:00Z",
  },
  {
    id: "scan-104",
    projectId: "proj-001",
    commit: "m0n1o2p",
    branch: "fix/auth-bug",
    status: "pass",
    riskScore: 8,
    findingCount: 0,
    date: "2026-03-05T10:00:00Z",
  },
  {
    id: "scan-105",
    projectId: "proj-004",
    commit: "q3r4s5t",
    branch: "main",
    status: "pass",
    riskScore: 5,
    findingCount: 0,
    date: "2026-03-05T11:00:00Z",
  },
  {
    id: "scan-106",
    projectId: "proj-002",
    commit: "u6v7w8x",
    branch: "main",
    status: "pass",
    riskScore: 22,
    findingCount: 2,
    date: "2026-03-04T16:30:00Z",
  },
  {
    id: "scan-107",
    projectId: "proj-003",
    commit: "y9z0a1b",
    branch: "feat/oauth",
    status: "fail",
    riskScore: 65,
    findingCount: 4,
    date: "2026-03-03T12:00:00Z",
  },
];

// ── Findings ──────────────────────────────────────────────────────────

export const MOCK_FINDINGS: Finding[] = [
  {
    id: "find-201",
    projectId: "proj-002",
    scanId: "scan-102",
    title: "Hard-coded API key in configuration",
    description:
      "A production API key was found embedded directly in the source code. This credential could be extracted by anyone with access to the repository.",
    severity: "critical",
    confidence: 95,
    status: "open",
    category: "secret-detection",
    filePath: "src/config/payments.ts",
    lineStart: 14,
    lineEnd: 14,
    codeSnippet:
      'const API_KEY = "sk_live_4eC39HqLyjWDarjtT1zdp7dc"; // TODO: move to env',
    remediation:
      "Move the API key to an environment variable and rotate the exposed key immediately. Use a secrets manager for production credentials.",
    createdAt: "2026-03-07T09:15:00Z",
    agentName: "",
  },
  {
    id: "find-202",
    projectId: "proj-002",
    scanId: "scan-102",
    title: "SQL injection vulnerability in query builder",
    description:
      "User input is concatenated directly into an SQL query string without parameterization, allowing potential SQL injection attacks.",
    severity: "high",
    confidence: 88,
    status: "open",
    category: "security",
    filePath: "src/db/queries.ts",
    lineStart: 42,
    lineEnd: 45,
    codeSnippet:
      "const query = `SELECT * FROM orders WHERE user_id = '${userId}' AND status = '${status}'`;",
    remediation:
      "Use parameterized queries or a query builder that automatically escapes user input. Never concatenate user input into SQL strings.",
    createdAt: "2026-03-07T09:15:00Z",
    agentName: "",
  },
  {
    id: "find-203",
    projectId: "proj-003",
    scanId: "scan-103",
    title: "Weak password hashing algorithm",
    description:
      "The authentication module uses MD5 for password hashing, which is cryptographically broken and unsuitable for password storage.",
    severity: "high",
    confidence: 92,
    status: "open",
    category: "security",
    filePath: "src/auth/password.ts",
    lineStart: 8,
    lineEnd: 10,
    codeSnippet:
      'import { createHash } from "crypto";\nconst hash = createHash("md5").update(password).digest("hex");',
    remediation:
      "Replace MD5 with bcrypt, scrypt, or Argon2 for password hashing. These algorithms are designed for password storage and include salt and work factor parameters.",
    createdAt: "2026-03-06T18:45:00Z",
    agentName: "",
  },
  {
    id: "find-204",
    projectId: "proj-002",
    scanId: "scan-102",
    title: "Missing rate limiting on authentication endpoint",
    description:
      "The login endpoint does not implement rate limiting, making it vulnerable to brute-force attacks.",
    severity: "medium",
    confidence: 75,
    status: "open",
    category: "security",
    filePath: "src/routes/auth.ts",
    lineStart: 22,
    lineEnd: 30,
    codeSnippet:
      'app.post("/login", async (req, res) => {\n  const { email, password } = req.body;\n  // No rate limiting\n  const user = await authenticate(email, password);\n});',
    remediation:
      "Add rate limiting middleware (e.g., express-rate-limit) to the authentication endpoint. Limit to 5-10 attempts per minute per IP address.",
    createdAt: "2026-03-07T09:15:00Z",
    agentName: "",
  },
  {
    id: "find-205",
    projectId: "proj-003",
    scanId: "scan-103",
    title: "AI-generated code detected without review marker",
    description:
      "A block of code appears to be AI-generated based on pattern analysis but lacks the required review marker comment.",
    severity: "low",
    confidence: 68,
    status: "open",
    category: "ai-detection",
    filePath: "src/utils/transform.ts",
    lineStart: 55,
    lineEnd: 78,
    codeSnippet:
      "// Complex transformation function\nfunction transformData(input: Record<string, unknown>): TransformedResult {\n  ...\n}",
    remediation:
      "Add a review marker comment (// @ai-reviewed) after manual review of the AI-generated code block to indicate it has been verified by a human.",
    createdAt: "2026-03-06T18:45:00Z",
    agentName: "",
  },
  {
    id: "find-206",
    projectId: "proj-001",
    scanId: "scan-101",
    title: "Overly permissive CORS configuration",
    description:
      'The CORS configuration allows all origins ("*") which could enable cross-origin attacks.',
    severity: "medium",
    confidence: 82,
    status: "suppressed",
    category: "security",
    filePath: "src/server.ts",
    lineStart: 12,
    lineEnd: 14,
    codeSnippet:
      'app.use(cors({ origin: "*" })); // Allow all origins for development',
    remediation:
      "Restrict CORS to specific trusted origins. Use environment-specific configuration to allow broader access only in development.",
    createdAt: "2026-03-08T14:30:00Z",
    agentName: "",
  },
  {
    id: "find-207",
    projectId: "proj-002",
    scanId: "scan-106",
    title: "Deprecated dependency with known vulnerability",
    description:
      "The project uses lodash@4.17.15 which has a known prototype pollution vulnerability (CVE-2020-28500).",
    severity: "medium",
    confidence: 99,
    status: "resolved",
    category: "dependency",
    filePath: "package.json",
    lineStart: 18,
    lineEnd: 18,
    codeSnippet: '"lodash": "4.17.15"',
    remediation:
      "Update lodash to version 4.17.21 or later which includes the security fix.",
    createdAt: "2026-03-04T16:30:00Z",
    agentName: "",
  },
];

// ── Certificates ──────────────────────────────────────────────────────

export const MOCK_CERTIFICATES: Certificate[] = [
  {
    id: "cert-301",
    projectId: "proj-001",
    scanId: "scan-101",
    commit: "a1b2c3d",
    branch: "main",
    status: "active",
    riskScore: 12,
    issuedAt: "2026-03-08T14:35:00Z",
    expiresAt: "2026-04-08T14:35:00Z",
    revokedAt: null,
  },
  {
    id: "cert-302",
    projectId: "proj-004",
    scanId: "scan-105",
    commit: "q3r4s5t",
    branch: "main",
    status: "active",
    riskScore: 5,
    issuedAt: "2026-03-05T11:05:00Z",
    expiresAt: "2026-04-05T11:05:00Z",
    revokedAt: null,
  },
  {
    id: "cert-303",
    projectId: "proj-002",
    scanId: "scan-106",
    commit: "u6v7w8x",
    branch: "main",
    status: "revoked",
    riskScore: 22,
    issuedAt: "2026-03-04T16:35:00Z",
    expiresAt: "2026-04-04T16:35:00Z",
    revokedAt: "2026-03-07T09:20:00Z",
  },
  {
    id: "cert-304",
    projectId: "proj-001",
    scanId: "scan-104",
    commit: "m0n1o2p",
    branch: "fix/auth-bug",
    status: "active",
    riskScore: 8,
    issuedAt: "2026-03-05T10:05:00Z",
    expiresAt: "2026-04-05T10:05:00Z",
    revokedAt: null,
  },
  {
    id: "cert-305",
    projectId: "proj-003",
    scanId: "scan-107",
    commit: "y9z0a1b",
    branch: "feat/oauth",
    status: "expired",
    riskScore: 65,
    issuedAt: "2026-02-01T12:00:00Z",
    expiresAt: "2026-03-01T12:00:00Z",
    revokedAt: null,
  },
];

// ── Finding count by category (for project detail) ────────────────────

export const MOCK_FINDING_COUNTS_BY_CATEGORY: FindingCountByCategory[] = [
  { category: "security", count: 14 },
  { category: "secret-detection", count: 5 },
  { category: "ai-detection", count: 4 },
  { category: "dependency", count: 3 },
  { category: "compliance", count: 1 },
];

// ── Policies ──────────────────────────────────────────────────────────

export interface MockPolicy {
  id: string;
  name: string;
  enabled: boolean;
  ruleCount: number;
  updatedAt: string;
  yaml: string;
}

export const MOCK_POLICIES: MockPolicy[] = [
  {
    id: "policy-001",
    name: "Default Security Policy",
    enabled: true,
    ruleCount: 4,
    updatedAt: "2026-03-08T10:00:00Z",
    yaml: `version: "1.0"
rules:
  - id: secret-detection
    severity: critical
    enabled: true
    description: "Detect hard-coded secrets and API keys"
    threshold: 0

  - id: ai-code-review
    severity: high
    enabled: true
    description: "Flag AI-generated code without review markers"
    threshold: 5

  - id: dependency-audit
    severity: medium
    enabled: true
    description: "Check for vulnerable dependencies"
    threshold: 10

  - id: pii-scanner
    severity: high
    enabled: true
    description: "Identify PII exposure in source code"
    threshold: 0
`,
  },
  {
    id: "policy-002",
    name: "Strict Compliance Policy",
    enabled: true,
    ruleCount: 6,
    updatedAt: "2026-03-06T14:30:00Z",
    yaml: `version: "1.0"
rules:
  - id: secret-detection
    severity: critical
    enabled: true
    threshold: 0

  - id: ai-code-review
    severity: critical
    enabled: true
    threshold: 0

  - id: dependency-audit
    severity: high
    enabled: true
    threshold: 0

  - id: pii-scanner
    severity: critical
    enabled: true
    threshold: 0

  - id: license-check
    severity: high
    enabled: true
    threshold: 0

  - id: code-quality
    severity: medium
    enabled: true
    threshold: 5
`,
  },
  {
    id: "policy-003",
    name: "Development (Relaxed)",
    enabled: false,
    ruleCount: 2,
    updatedAt: "2026-02-20T09:00:00Z",
    yaml: `version: "1.0"
rules:
  - id: secret-detection
    severity: high
    enabled: true
    threshold: 0

  - id: dependency-audit
    severity: medium
    enabled: true
    threshold: 20
`,
  },
];

// ── Audit Log ─────────────────────────────────────────────────────────

export interface MockAuditEvent {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  resource: string;
  details: string;
}

export const MOCK_AUDIT_LOG: MockAuditEvent[] = [
  {
    id: "audit-001",
    timestamp: "2026-03-08T14:35:00Z",
    action: "certificate",
    actor: "system",
    resource: "cert-301",
    details: "Certificate issued for sentinel-core (main @ a1b2c3d)",
  },
  {
    id: "audit-002",
    timestamp: "2026-03-08T14:30:00Z",
    action: "scan",
    actor: "ci-pipeline",
    resource: "scan-101",
    details: "Scan completed — PASS (risk score: 12)",
  },
  {
    id: "audit-003",
    timestamp: "2026-03-07T09:20:00Z",
    action: "revocation",
    actor: "admin@acme.com",
    resource: "cert-303",
    details: "Certificate revoked due to critical finding in payment-service",
  },
  {
    id: "audit-004",
    timestamp: "2026-03-07T09:15:00Z",
    action: "scan",
    actor: "ci-pipeline",
    resource: "scan-102",
    details: "Scan completed — FAIL (risk score: 78, 5 findings)",
  },
  {
    id: "audit-005",
    timestamp: "2026-03-07T09:15:00Z",
    action: "finding",
    actor: "system",
    resource: "find-201",
    details: "Critical finding: Hard-coded API key in payment-service",
  },
  {
    id: "audit-006",
    timestamp: "2026-03-06T18:45:00Z",
    action: "scan",
    actor: "ci-pipeline",
    resource: "scan-103",
    details: "Scan completed — PROVISIONAL (risk score: 45)",
  },
  {
    id: "audit-007",
    timestamp: "2026-03-06T15:00:00Z",
    action: "policy",
    actor: "admin@acme.com",
    resource: "policy-002",
    details: "Policy 'Strict Compliance Policy' updated — 6 rules",
  },
  {
    id: "audit-008",
    timestamp: "2026-03-05T11:05:00Z",
    action: "certificate",
    actor: "system",
    resource: "cert-302",
    details: "Certificate issued for data-pipeline (main @ q3r4s5t)",
  },
  {
    id: "audit-009",
    timestamp: "2026-03-05T10:00:00Z",
    action: "scan",
    actor: "ci-pipeline",
    resource: "scan-104",
    details: "Scan completed — PASS (risk score: 8)",
  },
  {
    id: "audit-010",
    timestamp: "2026-03-04T16:30:00Z",
    action: "scan",
    actor: "ci-pipeline",
    resource: "scan-106",
    details: "Scan completed — PASS (risk score: 22, 2 findings)",
  },
];

// ── Webhooks ──────────────────────────────────────────────────────────

export interface MockWebhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  lastTriggered: string | null;
}

export const MOCK_WEBHOOKS: MockWebhook[] = [
  {
    id: "wh-001",
    name: "Slack — #security-alerts",
    url: "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
    events: ["scan.failed", "finding.created", "certificate.revoked"],
    enabled: true,
    lastTriggered: "2026-03-07T09:15:00Z",
  },
  {
    id: "wh-002",
    name: "PagerDuty — On-Call",
    url: "https://events.pagerduty.com/integration/abc123/enqueue",
    events: ["finding.created"],
    enabled: true,
    lastTriggered: "2026-03-07T09:15:00Z",
  },
  {
    id: "wh-003",
    name: "Jira — Ticket Creation",
    url: "https://acme.atlassian.net/rest/webhooks/1.0/webhook",
    events: ["scan.completed", "certificate.issued"],
    enabled: false,
    lastTriggered: null,
  },
];

// ── Approvals ─────────────────────────────────────────────────────────

export const MOCK_APPROVAL_STATS: ApprovalStats = {
  pending: 5,
  escalated: 2,
  decidedToday: 8,
  avgDecisionTimeHours: 4.2,
  expiringSoon: 1,
};

export const MOCK_APPROVAL_GATES: ApprovalGate[] = [
  {
    id: "gate-001",
    scanId: "scan-001",
    projectId: "proj-001",
    projectName: "sentinel-api",
    status: "escalated",
    gateType: "risk_threshold",
    triggerCriteria: { riskScore: 72, threshold: { autoPassBelow: 30, autoBlockAbove: 70 } },
    priority: 90,
    assignedRole: "admin",
    assignedTo: null,
    requestedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    requestedBy: "system",
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    escalatesAt: null,
    expiryAction: "reject",
    decidedAt: null,
    scan: { commitHash: "a1b2c3d", branch: "feature/auth-refactor", riskScore: 72, findingCount: 5 },
    decisions: [],
  },
  {
    id: "gate-002",
    scanId: "scan-002",
    projectId: "proj-002",
    projectName: "sentinel-dashboard",
    status: "escalated",
    gateType: "category_block",
    triggerCriteria: { categories: ["copyleft-risk"], severities: ["critical"] },
    priority: 90,
    assignedRole: "admin",
    assignedTo: null,
    requestedAt: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
    requestedBy: "system",
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    escalatesAt: null,
    expiryAction: "reject",
    decidedAt: null,
    scan: { commitHash: "e4f5g6h", branch: "main", riskScore: 85, findingCount: 2 },
    decisions: [],
  },
  {
    id: "gate-003",
    scanId: "scan-003",
    projectId: "proj-001",
    projectName: "sentinel-api",
    status: "pending",
    gateType: "risk_threshold",
    triggerCriteria: { riskScore: 55, threshold: { autoPassBelow: 30, autoBlockAbove: 70 } },
    priority: 55,
    assignedRole: "manager",
    assignedTo: null,
    requestedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    requestedBy: "system",
    expiresAt: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(),
    escalatesAt: new Date(Date.now() + 42 * 60 * 60 * 1000).toISOString(),
    expiryAction: "reject",
    decidedAt: null,
    scan: { commitHash: "i7j8k9l", branch: "feature/payments", riskScore: 55, findingCount: 3 },
    decisions: [],
  },
  {
    id: "gate-004",
    scanId: "scan-004",
    projectId: "proj-003",
    projectName: "sentinel-agents",
    status: "pending",
    gateType: "license_review",
    triggerCriteria: { licenses: ["GPL-3.0"] },
    priority: 50,
    assignedRole: "manager",
    assignedTo: null,
    requestedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    requestedBy: "system",
    expiresAt: new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString(),
    escalatesAt: new Date(Date.now() + 46 * 60 * 60 * 1000).toISOString(),
    expiryAction: "reject",
    decidedAt: null,
    scan: { commitHash: "m0n1o2p", branch: "feature/new-dep", riskScore: 40, findingCount: 1 },
    decisions: [],
  },
  {
    id: "gate-005",
    scanId: "scan-005",
    projectId: "proj-002",
    projectName: "sentinel-dashboard",
    status: "pending",
    gateType: "always_review",
    triggerCriteria: { branches: ["main"] },
    priority: 30,
    assignedRole: "manager",
    assignedTo: null,
    requestedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    requestedBy: "system",
    expiresAt: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
    escalatesAt: new Date(Date.now() + 47 * 60 * 60 * 1000).toISOString(),
    expiryAction: "approve",
    decidedAt: null,
    scan: { commitHash: "q3r4s5t", branch: "main", riskScore: 15, findingCount: 0 },
    decisions: [],
  },
  {
    id: "gate-006",
    scanId: "scan-006",
    projectId: "proj-001",
    projectName: "sentinel-api",
    status: "approved",
    gateType: "risk_threshold",
    triggerCriteria: { riskScore: 45 },
    priority: 45,
    assignedRole: "manager",
    assignedTo: null,
    requestedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    requestedBy: "system",
    expiresAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    escalatesAt: null,
    expiryAction: "reject",
    decidedAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    scan: { commitHash: "u6v7w8x", branch: "feature/caching", riskScore: 45, findingCount: 2 },
    decisions: [{
      id: "dec-001",
      decidedBy: "jane@company.com",
      decision: "approve",
      justification: "Risk is acceptable — caching layer is internal only with no user-facing exposure.",
      decidedAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    }],
  },
  {
    id: "gate-007",
    scanId: "scan-007",
    projectId: "proj-003",
    projectName: "sentinel-agents",
    status: "approved",
    gateType: "category_block",
    triggerCriteria: { categories: ["copyleft-risk"] },
    priority: 60,
    assignedRole: "manager",
    assignedTo: null,
    requestedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    requestedBy: "system",
    expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    escalatesAt: null,
    expiryAction: "reject",
    decidedAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    scan: { commitHash: "y9z0a1b", branch: "feature/license-fix", riskScore: 60, findingCount: 1 },
    decisions: [{
      id: "dec-002",
      decidedBy: "bob@company.com",
      decision: "approve",
      justification: "GPL dependency replaced with MIT-licensed alternative in the follow-up commit.",
      decidedAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    }],
  },
  {
    id: "gate-008",
    scanId: "scan-008",
    projectId: "proj-002",
    projectName: "sentinel-dashboard",
    status: "rejected",
    gateType: "risk_threshold",
    triggerCriteria: { riskScore: 68 },
    priority: 68,
    assignedRole: "manager",
    assignedTo: null,
    requestedAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    requestedBy: "system",
    expiresAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    escalatesAt: null,
    expiryAction: "reject",
    decidedAt: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
    scan: { commitHash: "c2d3e4f", branch: "feature/unsafe-eval", riskScore: 68, findingCount: 4 },
    decisions: [{
      id: "dec-003",
      decidedBy: "jane@company.com",
      decision: "reject",
      justification: "Critical XSS vulnerability via eval() in user-supplied template. Must be remediated before merge.",
      decidedAt: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
    }],
  },
];
