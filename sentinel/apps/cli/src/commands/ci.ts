import { signRequest } from "@sentinel/auth";
import type {
  AssessmentStatus,
  ComplianceAssessment,
  Finding,
  FindingType,
} from "@sentinel/shared";

// ── Options & types ────────────────────────────────────────────────

export interface CiOptions {
  apiUrl: string;
  apiKey: string;
  secret: string;
  timeout: number;
  json: boolean;
  sarif: boolean;
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

async function submitScan(
  diff: string,
  options: Pick<CiOptions, "apiUrl" | "apiKey" | "secret" | "fetchFn">,
): Promise<string> {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const body = JSON.stringify({ diff });
  const signature = signRequest(body, options.secret);

  const res = await fetchFn(`${options.apiUrl}/v1/scans`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
      "X-Sentinel-Signature": signature,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
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
  const deadline = Date.now() + options.timeout * 1000;
  const POLL_INTERVAL_MS = 2000;

  while (Date.now() < deadline) {
    const signature = signRequest(scanId, options.secret);
    const res = await fetchFn(
      `${options.apiUrl}/v1/scans/${scanId}/poll`,
      {
        headers: {
          "X-Sentinel-Signature": signature,
        },
      },
    );

    if (!res.ok) {
      throw new Error(`Poll error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as PollResult;

    if (data.status !== "pending" && data.status !== "scanning") {
      return data;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Scan timed out after ${options.timeout}s`);
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
    // 1. Read diff from stdin
    const diff = options.stdinContent ?? (await readStdin());
    if (!diff.trim()) {
      console.error("Error: no diff provided on stdin");
      return EXIT_ERROR;
    }

    // 2. Submit scan
    const scanId = await submitScan(diff, options);

    // 3. Poll for result
    const result = await pollForResult(scanId, options);

    if (!result.assessment) {
      console.error(`Error: scan completed with status '${result.status}' but no assessment`);
      return EXIT_ERROR;
    }

    // 4. Output
    if (options.sarif) {
      console.log(JSON.stringify(formatSarif(result.assessment.findings), null, 2));
    } else if (options.json) {
      console.log(JSON.stringify(result.assessment, null, 2));
    } else {
      console.log(formatSummary(result.assessment));
    }

    return exitCodeFromStatus(result.assessment.status);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    return EXIT_ERROR;
  }
}
