// tests/e2e/helpers/assertions.ts
import { expect } from "vitest";
import type { Scan } from "../services/scan-service.js";
import type { Finding } from "../services/finding-service.js";
import type { Certificate } from "../services/certificate-service.js";
import { assertAllInvariantsHold } from "./invariant-checker.js";

const VALID_SEVERITIES = new Set(["critical", "high", "medium", "low", "info"]);

export function expectValidCertificate(cert: Certificate | null): asserts cert is Certificate {
  expect(cert).not.toBeNull();
  expect(cert!.scanId).toBeTruthy();
  expect(cert!.status).toBeTruthy();
  expect(typeof cert!.riskScore).toBe("number");
  expect(cert!.riskScore).toBeGreaterThanOrEqual(0);
  expect(cert!.riskScore).toBeLessThanOrEqual(100);
  expect(cert!.signature).toBeTruthy();
  expect(cert!.issuedAt).toBeTruthy();
}

export function expectFindingsFromAgent(findings: Finding[], agentName: string): void {
  const agentFindings = findings.filter((f) => f.agentName === agentName);
  expect(agentFindings.length).toBeGreaterThan(0);
  for (const f of agentFindings) {
    expect(VALID_SEVERITIES.has(f.severity)).toBe(true);
    expect(f.scanId).toBeTruthy();
  }
}

export function expectPipelineComplete(scan: Scan, findings: Finding[], certificate: Certificate | null): void {
  expect(scan.status).toBe("completed");
  expectValidCertificate(certificate);
  assertAllInvariantsHold({ scan, findings, certificate });
}

export async function expectRBACDenied(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    expect.fail("Expected RBAC denial (403) but request succeeded");
  } catch (err) {
    // Must be 401 (auth failure) or 403 (forbidden) — not 500 or other errors
    const msg = (err as Error).message;
    expect(msg).toMatch(/\b(401|403)\b/);
  }
}

export function expectScanIsolation(
  scanA: { scanId: string; findings: Finding[] },
  scanB: { scanId: string; findings: Finding[] },
): void {
  for (const f of scanA.findings) {
    expect(f.scanId).toBe(scanA.scanId);
  }
  for (const f of scanB.findings) {
    expect(f.scanId).toBe(scanB.scanId);
  }
  expect(scanA.scanId).not.toBe(scanB.scanId);
}
