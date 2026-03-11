// tests/e2e/helpers/invariant-checker.ts
import type { Scan } from "../services/scan-service.js";
import type { Finding } from "../services/finding-service.js";
import type { Certificate } from "../services/certificate-service.js";

export interface PipelineState {
  scan: Scan;
  findings: Finding[];
  certificate: Certificate | null;
}

export interface InvariantResult {
  name: string;
  passed: boolean;
  detail?: string;
}

type Invariant = (state: PipelineState) => InvariantResult;

const invariants: Invariant[] = [
  // 1. All findings reference the scan
  (state) => {
    const bad = state.findings.filter((f) => f.scanId !== state.scan.id);
    return {
      name: "findings_reference_scan",
      passed: bad.length === 0,
      detail: bad.length > 0 ? `${bad.length} findings reference wrong scan` : undefined,
    };
  },
  // 2. Scan status is "completed" when certificate exists
  (state) => ({
    name: "completed_scan_has_certificate",
    passed: state.scan.status !== "completed" || state.certificate != null,
    detail: state.scan.status === "completed" && !state.certificate ? "Scan completed but no certificate" : undefined,
  }),
  // 3. Certificate risk score is non-negative
  (state) => ({
    name: "certificate_risk_score_valid",
    passed: state.certificate == null || (state.certificate.riskScore >= 0 && state.certificate.riskScore <= 100),
    detail: state.certificate ? `riskScore=${state.certificate.riskScore}` : undefined,
  }),
  // 4. No findings have empty agentName
  (state) => {
    const bad = state.findings.filter((f) => !f.agentName);
    return {
      name: "findings_have_agent_name",
      passed: bad.length === 0,
      detail: bad.length > 0 ? `${bad.length} findings missing agentName` : undefined,
    };
  },
  // 5. Finding severities are valid values
  (state) => {
    const valid = new Set(["critical", "high", "medium", "low", "info"]);
    const bad = state.findings.filter((f) => !valid.has(f.severity));
    return {
      name: "findings_have_valid_severity",
      passed: bad.length === 0,
      detail: bad.length > 0 ? `${bad.length} findings with invalid severity` : undefined,
    };
  },
  // 6. Certificate issued after scan started
  (state) => ({
    name: "certificate_after_scan_start",
    passed: state.certificate == null || new Date(state.certificate.issuedAt) >= new Date(state.scan.startedAt),
  }),
];

export function checkInvariants(state: PipelineState): InvariantResult[] {
  return invariants.map((inv) => inv(state));
}

export function assertAllInvariantsHold(state: PipelineState): void {
  const results = checkInvariants(state);
  const failures = results.filter((r) => !r.passed);
  if (failures.length > 0) {
    const msg = failures.map((f) => `  - ${f.name}: ${f.detail ?? "FAILED"}`).join("\n");
    throw new Error(`Pipeline invariant violations:\n${msg}`);
  }
}
