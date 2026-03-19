import { writeFileSync } from "fs";
import { signRequest } from "@sentinel/auth";
import type {
  AssessmentStatus,
  ComplianceAssessment,
  Finding,
  FindingType,
  SentinelDiffPayload,
} from "@sentinel/shared";
import { parseDiff } from "../git/diff.js";
import { detectCiEnvironment, type CiEnvironment } from "../ci-providers/index.js";
import { pollWithBackoff } from "../poll.js";
import { formatGitLabSast } from "../formatters/gitlab-sast.js";

// ── Options & types ────────────────────────────────────────────────

export interface CiOptions {
  apiUrl: string;
  apiKey: string;
  secret: string;
  timeout: number;
  json: boolean;
  sarif: boolean;
  gitlabSast: boolean;
  stream: boolean;
  failOn: string;
  output?: string;
  /** Allow injecting a custom fetch for testing. */
  fetchFn?: typeof globalThis.fetch;
  /** Allow injecting stdin content for testing. */
  stdinContent?: string;
}

export interface PollResult {
  status: AssessmentStatus | "pending" | "scanning";
  assessment?: ComplianceAssessment;
}

// ── Exit codes ─────────────────────────────────────────────────────

export const EXIT_PASS = 0;
export const EXIT_FAIL = 1;
export const EXIT_ERROR = 2;
export const EXIT_PROVISIONAL = 3;

export function exitCodeFromStatus(status: AssessmentStatus): number {
  switch (status) {
    case "full_pass":
      return EXIT_PASS;
    case "fail":
    case "revoked":
      return EXIT_FAIL;
    case "provisional_pass":
    case "partial":
      return EXIT_PROVISIONAL;
    default:
      return EXIT_ERROR;
  }
}

// ── Stdin helper ───────────────────────────────────────────────────

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// ── Submit scan ────────────────────────────────────────────────────

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const langMap: Record<string, string> = {
    py: "python", js: "javascript", ts: "typescript", tsx: "typescript",
    jsx: "javascript", go: "go", rs: "rust", java: "java", rb: "ruby",
    cs: "csharp", cpp: "cpp", c: "c", swift: "swift", kt: "kotlin",
  };
  return langMap[ext] ?? "unknown";
}

function buildPayload(rawDiff: string, env: CiEnvironment): SentinelDiffPayload {
  const diffFiles = parseDiff(rawDiff);
  return {
    projectId: process.env.SENTINEL_PROJECT_ID ?? "default",
    commitHash: process.env.SENTINEL_COMMIT_HASH ?? env.commitSha,
    branch: process.env.SENTINEL_BRANCH ?? env.branch,
    author: process.env.SENTINEL_AUTHOR ?? env.actor,
    timestamp: new Date().toISOString(),
    files: diffFiles.map((f) => ({
      path: f.path,
      language: detectLanguage(f.path),
      hunks: f.hunks,
      aiScore: 0,
    })),
    scanConfig: {
      securityLevel: (process.env.SENTINEL_SECURITY_LEVEL as any) ?? "standard",
      licensePolicy: process.env.SENTINEL_LICENSE_POLICY ?? "",
      qualityThreshold: parseFloat(process.env.SENTINEL_QUALITY_THRESHOLD ?? "0.7"),
    },
  };
}

async function submitScan(
  diff: string,
  env: CiEnvironment,
  options: Pick<CiOptions, "apiUrl" | "apiKey" | "secret" | "fetchFn">,
): Promise<string> {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const payload = buildPayload(diff, env);
  const body = JSON.stringify(payload);
  const signature = signRequest(body, options.secret);

  const res = await fetchFn(`${options.apiUrl}/v1/scans`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sentinel-Signature": signature,
      "X-Sentinel-API-Key": options.apiKey || "cli",
      "X-Sentinel-Role": "service",
            ...(process.env.SENTINEL_ORG_ID ? { "X-Sentinel-Org-Id": process.env.SENTINEL_ORG_ID } : {}),
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API error: ${res.status} ${res.statusText} ${text}`);
  }

  const data = (await res.json()) as { scanId: string };
  return data.scanId;
}

// ── Poll for result ────────────────────────────────────────────────

export async function pollForResult(
  scanId: string,
  options: Pick<CiOptions, "apiUrl" | "timeout" | "secret" | "fetchFn">,
): Promise<PollResult> {
  const fetchFn = options.fetchFn ?? globalThis.fetch;

  return pollWithBackoff<PollResult>(
    async () => {
      const signature = signRequest("", options.secret);
      const res = await fetchFn(
        `${options.apiUrl}/v1/scans/${scanId}/poll`,
        {
          headers: {
            "X-Sentinel-Signature": signature,
            "X-Sentinel-API-Key": "cli",
            "X-Sentinel-Role": "service",
            ...(process.env.SENTINEL_ORG_ID ? { "X-Sentinel-Org-Id": process.env.SENTINEL_ORG_ID } : {}),
          },
        },
      );

      if (!res.ok) {
        throw new Error(`Poll error: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as PollResult;
      const done = data.status !== "pending" && data.status !== "scanning";
      return { done, value: data };
    },
    {
      initialDelayMs: 1000,
      maxDelayMs: 16_000,
      maxJitterMs: 500,
      timeoutMs: options.timeout * 1000,
    },
  );
}

// ── Formatting ─────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  security: "Security",
  license: "License",
  quality: "Quality",
  policy: "Policy",
  dependency: "Dependency",
};

function statusLabel(status: AssessmentStatus): string {
  switch (status) {
    case "full_pass":
      return "PASS";
    case "provisional_pass":
      return "PROVISIONAL PASS";
    case "fail":
      return "FAIL";
    case "revoked":
      return "REVOKED";
    case "partial":
      return "PARTIAL";
    default:
      return String(status).toUpperCase();
  }
}

export function formatSummary(assessment: ComplianceAssessment): string {
  const lines: string[] = [];
  lines.push("SENTINEL Scan Report");
  lines.push("====================");
  lines.push(`Status: ${statusLabel(assessment.status)}`);
  lines.push(`Risk Score: ${assessment.riskScore}/100`);
  lines.push("");
  lines.push("Categories:");

  for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
    const cat = assessment.categories[key as keyof typeof assessment.categories];
    if (!cat) continue;
    const total =
      cat.findings.critical + cat.findings.high + cat.findings.medium + cat.findings.low;
    const icon = cat.status === "pass" ? "pass" : cat.status === "warn" ? "warn" : "FAIL";
    lines.push(`  ${label}: ${icon} (${total} finding${total !== 1 ? "s" : ""})`);
  }

  if (assessment.certificate) {
    lines.push("");
    lines.push(`Certificate: ${assessment.certificate.id}`);
    lines.push(`  Verdict: ${assessment.certificate.verdict.status.toUpperCase()}`);
    lines.push(`  Expires: ${assessment.certificate.expiresAt}`);
  }

  return lines.join("\n");
}

// ── SARIF output ───────────────────────────────────────────────────

function sarifLevel(severity: string): string {
  switch (severity) {
    case "critical":
    case "high":
      return "error";
    case "medium":
      return "warning";
    case "low":
    case "info":
      return "note";
    default:
      return "none";
  }
}

function findingMessage(f: Finding): string {
  switch (f.type) {
    case "security":
      return `${f.title}: ${f.description}`;
    case "license":
      return `License issue (${f.findingType}): ${f.licenseDetected ?? "unknown"}`;
    case "quality":
      return `Quality: ${f.metric} — ${f.detail}`;
    case "policy":
      return `Policy violation (${f.policyName}): ${f.violation}`;
    case "dependency":
      return `Dependency (${f.findingType}): ${f.package} — ${f.detail}`;
    case "ai-detection":
      return `AI-detected code (${Math.round(f.aiProbability * 100)}% probability)`;
    default:
      return "Unknown finding";
  }
}

export function formatSarif(findings: Finding[]): object {
  return {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "SENTINEL",
            version: "0.1.0",
            informationUri: "https://sentinel.archagents.dev",
          },
        },
        results: findings.map((f) => ({
          ruleId: `sentinel/${f.type}`,
          level: sarifLevel(f.severity),
          message: { text: findingMessage(f) },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: f.file },
                region: {
                  startLine: f.lineStart,
                  endLine: f.lineEnd,
                },
              },
            },
          ],
        })),
      },
    ],
  };
}

// ── Main entry ─────────────────────────────────────────────────────

export async function runCi(options: CiOptions): Promise<number> {
  try {
    // 1. Detect CI environment
    const env = detectCiEnvironment();

    // 2. Read diff from stdin
    const diff = options.stdinContent ?? (await readStdin());
    if (!diff.trim()) {
      console.error("Error: no diff provided on stdin");
      return EXIT_ERROR;
    }

    // 3. Submit scan
    const scanId = await submitScan(diff, env, options);

    // 4. Poll for result
    const result = await pollForResult(scanId, options);

    if (!result.assessment) {
      console.error(`Error: scan completed with status '${result.status}' but no assessment`);
      return EXIT_ERROR;
    }

    // 5. Output
    let outputContent: string;
    if (options.sarif) {
      outputContent = JSON.stringify(formatSarif(result.assessment.findings), null, 2);
    } else if (options.json) {
      outputContent = JSON.stringify(result.assessment, null, 2);
    } else {
      outputContent = formatSummary(result.assessment);
    }

    if (options.output) {
      writeFileSync(options.output, outputContent);
    } else {
      console.log(outputContent);
    }

    // 6. Write GitLab SAST report when requested or auto-detected
    if (options.gitlabSast || env.provider === "gitlab") {
      const sastReport = formatGitLabSast(result.assessment.findings);
      writeFileSync("gl-sast-report.json", JSON.stringify(sastReport, null, 2));
    }

    // 7. Check fail-on severity threshold
    if (options.failOn) {
      const thresholds = options.failOn.split(",").map((s) => s.trim().toLowerCase());
      const hasBlockingFinding = result.assessment.findings.some((f) =>
        thresholds.includes(f.severity),
      );
      if (hasBlockingFinding) return EXIT_FAIL;
    }

    return exitCodeFromStatus(result.assessment.status);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    return EXIT_ERROR;
  }
}
