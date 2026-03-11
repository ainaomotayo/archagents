// tests/e2e/services/certificate-service.ts
import { createHmac } from "node:crypto";
import { E2EApiClient } from "./api-client.js";

export interface Certificate {
  id: string;
  scanId: string;
  orgId: string;
  status: string;
  riskScore: number;
  verdict: Record<string, unknown>;
  signature: string;
  issuedAt: string;
  expiresAt: string;
}

export class CertificateService extends E2EApiClient {
  async getCertificate(scanId: string): Promise<Certificate> {
    return this.request("GET", `/v1/certificates?scanId=${scanId}`);
  }

  verifyCertificateSignature(cert: Certificate, secret: string): boolean {
    const payload = { ...cert, signature: "" };
    const expected = createHmac("sha256", secret)
      .update(JSON.stringify(payload))
      .digest("hex");
    return expected === cert.signature;
  }
}
