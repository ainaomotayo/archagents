/**
 * SENTINEL Dashboard — Mock Data
 *
 * Realistic sample data used while the API is not yet available.
 * Every object conforms to the types defined in ./types.ts.
 */

import type {
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
