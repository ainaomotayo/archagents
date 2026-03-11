// tests/e2e/services/certificate-service.ts
import { createHmac } from "node:crypto";
import { E2EApiClient } from "./api-client.js";

export interface CertificateVerdict {
  status: "pass" | "provisional" | "fail";
  riskScore: number;
  categories?: Record<string, "pass" | "warn" | "fail">;
}

export interface Certificate {
  id: string;
  scanId: string;
  orgId: string;
  status: string;
  riskScore: number;
  verdict: CertificateVerdict;
  scanMetadata: Record<string, unknown>;
  compliance: Record<string, unknown>;
  signature: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revocationReason: string | null;
}

export class CertificateService extends E2EApiClient {
  async getCertificate(scanId: string): Promise<Certificate | null> {
    const result = await this.request<{ certificates: Certificate[]; total: number }>(
      "GET",
      `/v1/certificates?scanId=${scanId}`,
    );
    return result.certificates[0] ?? null;
  }

  verifyCertificateSignature(cert: Certificate, secret: string): boolean {
    // Server signs JSON.stringify(cert.verdict) — match that logic
    const expected = createHmac("sha256", secret)
      .update(JSON.stringify(cert.verdict))
      .digest("hex");
    return expected === cert.signature;
  }
}
