import { createHmac, timingSafeEqual } from "node:crypto";

export type VerifyResult =
  | { valid: true }
  | { valid: false; reason: "invalid_format" | "request_expired" | "signature_mismatch" };

const SIGNATURE_PATTERN = /^t=(\d+),sig=([a-f0-9]{64})$/;
const MAX_AGE_SECONDS = 300; // 5 minutes

/**
 * Signs a request body with HMAC-SHA256.
 * Returns a signature string in the format: t=<timestamp>,sig=<hex_digest>
 */
export function signRequest(body: string, secret: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const mac = createHmac("sha256", secret)
    .update(`${ts}.${body}`)
    .digest("hex");
  return `t=${ts},sig=${mac}`;
}

/**
 * Verifies an HMAC-SHA256 request signature.
 * Checks format, timestamp freshness (5-min window), and signature validity
 * using constant-time comparison.
 */
export function verifyRequest(signature: string, body: string, secret: string): VerifyResult {
  const match = SIGNATURE_PATTERN.exec(signature);
  if (!match) {
    return { valid: false, reason: "invalid_format" };
  }

  const ts = Number(match[1]);
  const sig = match[2];

  const now = Math.floor(Date.now() / 1000);
  if (now - ts > MAX_AGE_SECONDS) {
    return { valid: false, reason: "request_expired" };
  }

  const expected = createHmac("sha256", secret)
    .update(`${ts}.${body}`)
    .digest("hex");

  const sigBuffer = Buffer.from(sig, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, reason: "signature_mismatch" };
  }

  return { valid: true };
}
